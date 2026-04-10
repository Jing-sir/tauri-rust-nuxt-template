import binanceOrderbookWasmUrl from 'binance-orderbook-wasm/binance_orderbook_wasm_bg.wasm?url';

type KlineTimeframe = '1m' | '5m' | '15m' | '1h';

type KlineTickInput = {
    ts: number;
    price: number;
    qty?: number;
    volume?: number;
    turnover?: number;
};

type KlineBarInput = {
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    turnover?: number;
};

type MarketQuoteInput = {
    symbol: string;
    last: number;
    prevClose?: number;
    prev_close?: number;
    high: number;
    low: number;
    volume: number;
    turnover?: number;
    bid?: number;
    ask?: number;
};

type ScannerFilterInput = {
    field: string;
    op: string;
    value: number;
    value2?: number;
};

type WorkerRequestType =
    | 'init'
    | 'dispose'
    | 'kline_apply_tick'
    | 'kline_apply_ticks'
    | 'kline_apply_1m_bar'
    | 'kline_apply_1m_bar_and_get_latest'
    | 'kline_apply_1m_bars'
    | 'kline_get_bars'
    | 'kline_get_latest'
    | 'kline_get_multi_latest'
    | 'kline_clear'
    | 'scanner_compile_filters'
    | 'scanner_scan_quotes'
    | 'scanner_filter_sort'
    | 'scanner_clear_filters';

type WorkerRequest = {
    id: number;
    type: WorkerRequestType;
    maxBars?: number;
    timeframe?: KlineTimeframe;
    limit?: number;
    topN?: number;
    descending?: boolean;
    sortField?: string;
    tick?: KlineTickInput;
    ticks?: KlineTickInput[];
    bar?: KlineBarInput;
    bars?: KlineBarInput[];
    quotes?: MarketQuoteInput[];
    filters?: ScannerFilterInput[];
};

type WorkerResponse = {
    id: number;
    ok: boolean;
    data?: unknown;
    error?: string;
};

type WasmModule = typeof import('binance-orderbook-wasm');

const DEFAULT_MAX_BARS = 2000;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let wasmModule: WasmModule | null = null,
    klineEngine: InstanceType<WasmModule['KlineEngine']> | null = null,
    marketScanner: InstanceType<WasmModule['MarketScanner']> | null = null;

function postSuccess(id: number, data?: unknown) {
    const response: WorkerResponse = {
        id,
        ok: true,
        data,
    };
    workerScope.postMessage(response);
}

function postError(id: number, error: unknown) {
    const response: WorkerResponse = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
}

function normalizeMaxBars(value: number | undefined) {
    if (!Number.isFinite(value)) {
        return DEFAULT_MAX_BARS;
    }
    const bars = Math.floor(Number(value));
    if (bars <= 0) {
        return DEFAULT_MAX_BARS;
    }
    return bars;
}

async function ensureWasmModule() {
    if (wasmModule) {
        return wasmModule;
    }
    wasmModule = await import('binance-orderbook-wasm');
    await wasmModule.default(binanceOrderbookWasmUrl);
    return wasmModule;
}

function disposeEngines() {
    if (klineEngine && typeof klineEngine.free === 'function') {
        klineEngine.free();
    }
    if (marketScanner && typeof marketScanner.free === 'function') {
        marketScanner.free();
    }
    klineEngine = null;
    marketScanner = null;
}

async function initEngines(maxBars: number | undefined) {
    const module = await ensureWasmModule();
    disposeEngines();
    klineEngine = new module.KlineEngine(normalizeMaxBars(maxBars));
    marketScanner = new module.MarketScanner();
}

async function ensureReady() {
    if (!klineEngine || !marketScanner) {
        await initEngines(DEFAULT_MAX_BARS);
    }
}

workerScope.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
    const message = event.data;

    try {
        switch (message.type) {
        case 'init': {
            await initEngines(message.maxBars);
            postSuccess(message.id);
            return;
        }
        case 'dispose': {
            disposeEngines();
            postSuccess(message.id);
            return;
        }
        default:
            break;
        }

        await ensureReady();
        if (!klineEngine || !marketScanner) {
            throw new Error('WASM engines are not available.');
        }

        switch (message.type) {
        case 'kline_apply_tick': {
            klineEngine.apply_tick(message.tick ?? null);
            postSuccess(message.id);
            return;
        }
        case 'kline_apply_ticks': {
            klineEngine.apply_ticks(message.ticks ?? []);
            postSuccess(message.id);
            return;
        }
        case 'kline_apply_1m_bar': {
            klineEngine.apply_1m_bar(message.bar ?? null);
            postSuccess(message.id);
            return;
        }
        case 'kline_apply_1m_bar_and_get_latest': {
            klineEngine.apply_1m_bar(message.bar ?? null);
            const timeframe = message.timeframe ?? '1m';
            const data = klineEngine.get_latest(timeframe);
            postSuccess(message.id, data);
            return;
        }
        case 'kline_apply_1m_bars': {
            klineEngine.apply_1m_bars(message.bars ?? []);
            postSuccess(message.id);
            return;
        }
        case 'kline_get_bars': {
            const timeframe = message.timeframe ?? '1m';
            const limit = message.limit ?? 500;
            const data = klineEngine.get_bars(timeframe, limit);
            postSuccess(message.id, data);
            return;
        }
        case 'kline_get_latest': {
            const timeframe = message.timeframe ?? '1m';
            const data = klineEngine.get_latest(timeframe);
            postSuccess(message.id, data);
            return;
        }
        case 'kline_get_multi_latest': {
            const data = klineEngine.get_multi_latest();
            postSuccess(message.id, data);
            return;
        }
        case 'kline_clear': {
            klineEngine.clear();
            postSuccess(message.id);
            return;
        }
        case 'scanner_compile_filters': {
            const count = marketScanner.compile_filters(message.filters ?? []);
            postSuccess(message.id, count);
            return;
        }
        case 'scanner_scan_quotes': {
            const data = marketScanner.scan_quotes(message.quotes ?? [], message.topN ?? 20);
            postSuccess(message.id, data);
            return;
        }
        case 'scanner_filter_sort': {
            const data = marketScanner.filter_and_sort(
                message.quotes ?? [],
                message.sortField ?? 'change_pct',
                message.descending ?? true,
                message.limit ?? 100,
            );
            postSuccess(message.id, data);
            return;
        }
        case 'scanner_clear_filters': {
            marketScanner.clear_filters();
            postSuccess(message.id);
            return;
        }
        default: {
            throw new Error(`Unsupported request type: ${message.type as string}`);
        }
        }
    } catch (error) {
        postError(message.id, error);
    }
});

export {};
