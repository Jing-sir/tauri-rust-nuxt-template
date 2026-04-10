import { useNuxtApp } from '#imports';

export type KlineTimeframe = '1m' | '5m' | '15m' | '1h';

export interface KlineTickInput {
    ts: number;
    price: number;
    qty?: number;
    volume?: number;
    turnover?: number;
}

export interface KlineBarInput {
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    turnover?: number;
}

export interface KlineBar {
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    turnover: number;
    sma: number | null;
    ema: number | null;
    rsi: number | null;
    macd: number | null;
    macd_signal: number | null;
    macd_hist: number | null;
}

export interface MarketQuoteInput {
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
}

export interface MarketQuoteComputed {
    symbol: string;
    last: number;
    prev_close: number;
    high: number;
    low: number;
    volume: number;
    turnover: number;
    change_pct: number;
    amplitude_pct: number;
    spread: number;
    spread_pct: number;
    anomaly_score: number;
}

export interface ScannerFilterInput {
    field: string;
    op: string;
    value: number;
    value2?: number;
}

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

const DEFAULT_MAX_BARS = 2000;

class MarketEngineWorkerClient {
    private readonly worker: Worker;
    private readonly pending = new Map<
        number,
        {
            resolve: (value: unknown) => void;
            reject: (error: Error) => void;
        }
    >();

    private requestId = 0;
    private queue = Promise.resolve();
    private readyPromise: Promise<void> | null = null;

    private readonly onMessage = (event: MessageEvent<WorkerResponse>) => {
        const payload = event.data;
        const pending = this.pending.get(payload.id);
        if (!pending) {
            return;
        }
        this.pending.delete(payload.id);
        if (payload.ok) {
            pending.resolve(payload.data);
            return;
        }
        pending.reject(new Error(payload.error ?? 'Worker request failed.'));
    };

    private readonly onError = () => {
        for (const pending of this.pending.values()) {
            pending.reject(new Error('Market engine worker crashed.'));
        }
        this.pending.clear();
    };

    constructor() {
        this.worker = new Worker(new URL('../workers/marketKlineWasm.worker.ts', import.meta.url), {
            type: 'module',
        });
        this.worker.addEventListener('message', this.onMessage);
        this.worker.addEventListener('error', this.onError);
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const next = this.queue.then(task, task);
        this.queue = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    private request(type: WorkerRequestType, payload: Partial<WorkerRequest> = {}) {
        const id = ++this.requestId;
        const message: WorkerRequest = {
            id,
            type,
            ...payload,
        };

        return new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, {
                resolve,
                reject,
            });
            this.worker.postMessage(message);
        });
    }

    async ensureReady(maxBars: number) {
        if (!this.readyPromise) {
            this.readyPromise = this.enqueue(async () => {
                await this.request('init', { maxBars });
            });
        }
        await this.readyPromise;
    }

    async klineApplyTick(tick: KlineTickInput) {
        await this.enqueue(async () => {
            await this.request('kline_apply_tick', { tick });
        });
    }

    async klineApplyTicks(ticks: KlineTickInput[]) {
        await this.enqueue(async () => {
            await this.request('kline_apply_ticks', { ticks });
        });
    }

    async klineApply1mBar(bar: KlineBarInput) {
        await this.enqueue(async () => {
            await this.request('kline_apply_1m_bar', { bar });
        });
    }

    async klineApply1mBarAndGetLatest(bar: KlineBarInput, timeframe: KlineTimeframe) {
        return this.enqueue(async () => this.request('kline_apply_1m_bar_and_get_latest', { bar, timeframe }));
    }

    async klineApply1mBars(bars: KlineBarInput[]) {
        await this.enqueue(async () => {
            await this.request('kline_apply_1m_bars', { bars });
        });
    }

    async klineGetBars(timeframe: KlineTimeframe, limit: number) {
        return this.enqueue(async () => this.request('kline_get_bars', { timeframe, limit }));
    }

    async klineGetLatest(timeframe: KlineTimeframe) {
        return this.enqueue(async () => this.request('kline_get_latest', { timeframe }));
    }

    async klineGetMultiLatest() {
        return this.enqueue(async () => this.request('kline_get_multi_latest'));
    }

    async klineClear() {
        await this.enqueue(async () => {
            await this.request('kline_clear');
        });
    }

    async scannerCompileFilters(filters: ScannerFilterInput[]) {
        const result = await this.enqueue(async () => this.request('scanner_compile_filters', { filters }));
        return Number(result) || 0;
    }

    async scannerScanQuotes(quotes: MarketQuoteInput[], topN: number) {
        return this.enqueue(async () => this.request('scanner_scan_quotes', { quotes, topN }));
    }

    async scannerFilterAndSort(
        quotes: MarketQuoteInput[],
        sortField: string,
        descending: boolean,
        limit: number,
    ) {
        return this.enqueue(async () =>
            this.request('scanner_filter_sort', {
                quotes,
                sortField,
                descending,
                limit,
            }),
        );
    }

    async scannerClearFilters() {
        await this.enqueue(async () => {
            await this.request('scanner_clear_filters');
        });
    }

    destroy() {
        this.worker.removeEventListener('message', this.onMessage);
        this.worker.removeEventListener('error', this.onError);

        void this.request('dispose').catch(() => undefined);
        this.worker.terminate();

        for (const pending of this.pending.values()) {
            pending.reject(new Error('Market engine worker disposed.'));
        }
        this.pending.clear();
    }
}

let singletonClient: MarketEngineWorkerClient | null = null,
    creatingClientPromise: Promise<MarketEngineWorkerClient> | null = null;

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

export async function getMarketEngineWorkerClient(maxBars?: number) {
    if (import.meta.server || typeof Worker === 'undefined') {
        throw new Error('Market engine worker is only available in browser runtime.');
    }

    const { $ensureWasmRuntime } = useNuxtApp();
    await $ensureWasmRuntime();

    const resolvedMaxBars = normalizeMaxBars(maxBars);

    if (singletonClient) {
        await singletonClient.ensureReady(resolvedMaxBars);
        return singletonClient;
    }

    if (!creatingClientPromise) {
        creatingClientPromise = (async () => {
            const client = new MarketEngineWorkerClient();
            await client.ensureReady(resolvedMaxBars);
            singletonClient = client;
            return client;
        })().catch((error) => {
            creatingClientPromise = null;
            throw error;
        });
    }

    return creatingClientPromise;
}
