import binanceOrderbookWasmUrl from 'binance-orderbook-wasm/binance_orderbook_wasm_bg.wasm?url';

type DepthWireEntry = [string, string];
type DepthBookPayload = {
    bids: DepthWireEntry[];
    asks: DepthWireEntry[];
};
type DepthNumericEntry = [number, number];
type DepthNumericPayload = {
    bids: DepthNumericEntry[];
    asks: DepthNumericEntry[];
};

type WorkerRequestType = 'init' | 'apply_snapshot' | 'apply_delta' | 'get_depth' | 'dispose';
type WorkerRequest = {
    id: number;
    type: WorkerRequestType;
    maxDepth?: number;
    mode?: 'wasm' | 'js';
    snapshot?: DepthBookPayload;
    delta?: DepthBookPayload;
    limit?: number;
};

type WorkerResponse = {
    id: number;
    ok: boolean;
    data?: unknown;
    error?: string;
};

type WasmModule = typeof import('binance-orderbook-wasm');

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let wasmModule: WasmModule | null = null,
    wasmBook: InstanceType<WasmModule['OrderBook']> | null = null,
    currentMode: 'wasm' | 'js' = 'wasm',
    maxDepth = 1000;

const bidsMap = new Map<number, number>();
const asksMap = new Map<number, number>();

function normalizeWireEntries(value: unknown): DepthWireEntry[] {
    if (!Array.isArray(value)) return [];
    const result: DepthWireEntry[] = [];
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) {
            continue;
        }
        const price = item[0];
        const qty = item[1];
        if (price === null || price === undefined || qty === null || qty === undefined) {
            continue;
        }
        result.push([String(price), String(qty)]);
    }
    return result;
}

function normalizeNumericEntries(value: unknown): DepthNumericEntry[] {
    if (!Array.isArray(value)) return [];
    const result: DepthNumericEntry[] = [];
    for (const item of value) {
        if (!Array.isArray(item) || item.length < 2) {
            continue;
        }
        const price = Number(item[0]);
        const qty = Number(item[1]);
        if (!Number.isFinite(price) || !Number.isFinite(qty)) {
            continue;
        }
        result.push([price, qty]);
    }
    return result;
}

function applySideUpdatesToMap(target: Map<number, number>, updates: DepthWireEntry[]) {
    for (const [priceRaw, qtyRaw] of updates) {
        const priceValue = Number(priceRaw);
        const qtyValue = Number(qtyRaw);
        if (!Number.isFinite(priceValue)) {
            continue;
        }
        if (!qtyValue) {
            target.delete(priceValue);
            continue;
        }
        target.set(priceValue, qtyValue);
    }
}

function clearAll() {
    bidsMap.clear();
    asksMap.clear();
}

function getDepthFromMap(limit: number): DepthNumericPayload {
    const bids = Array.from(bidsMap.entries())
        .sort((a, b) => b[0] - a[0])
        .slice(0, limit)
        .map(([price, qty]) => [price, qty] as DepthNumericEntry);

    const asks = Array.from(asksMap.entries())
        .sort((a, b) => a[0] - b[0])
        .slice(0, limit)
        .map(([price, qty]) => [price, qty] as DepthNumericEntry);

    return { bids, asks };
}

async function ensureWasmModule() {
    if (wasmModule) {
        return wasmModule;
    }

    wasmModule = await import('binance-orderbook-wasm');
    await wasmModule.default(binanceOrderbookWasmUrl);
    return wasmModule;
}

async function initEngine(mode: 'wasm' | 'js', depth: number) {
    maxDepth = depth;
    clearAll();

    if (mode === 'js') {
        currentMode = 'js';
        if (wasmBook && typeof wasmBook.free === 'function') {
            wasmBook.free();
        }
        wasmBook = null;
        return;
    }

    try {
        const module = await ensureWasmModule();
        if (wasmBook && typeof wasmBook.free === 'function') {
            wasmBook.free();
        }
        wasmBook = new module.OrderBook(maxDepth);
        currentMode = 'wasm';
    } catch (error) {
        currentMode = 'js';
        if (wasmBook && typeof wasmBook.free === 'function') {
            wasmBook.free();
        }
        wasmBook = null;
        throw error;
    }
}

function applySnapshot(snapshot: DepthBookPayload) {
    if (currentMode === 'wasm' && wasmBook) {
        wasmBook.apply_snapshot(snapshot);
        return;
    }

    clearAll();
    applySideUpdatesToMap(bidsMap, snapshot.bids);
    applySideUpdatesToMap(asksMap, snapshot.asks);
}

function applyDelta(delta: DepthBookPayload) {
    if (currentMode === 'wasm' && wasmBook) {
        wasmBook.apply_delta(delta);
        return;
    }

    applySideUpdatesToMap(bidsMap, delta.bids);
    applySideUpdatesToMap(asksMap, delta.asks);
}

function getDepth(limit: number) {
    if (currentMode === 'wasm' && wasmBook) {
        const payload = wasmBook.get_depth(limit) as {
            bids?: unknown;
            asks?: unknown;
        };
        return {
            bids: normalizeNumericEntries(payload?.bids),
            asks: normalizeNumericEntries(payload?.asks),
        };
    }

    return getDepthFromMap(limit);
}

function postSuccess(id: number, data?: unknown) {
    const response: WorkerResponse = {
        id,
        ok: true,
        data,
    };
    workerScope.postMessage(response);
}

function postError(id: number, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const response: WorkerResponse = {
        id,
        ok: false,
        error: message,
    };
    workerScope.postMessage(response);
}

workerScope.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
    const message = event.data;

    try {
        switch (message.type) {
        case 'init': {
            await initEngine(message.mode === 'js' ? 'js' : 'wasm', message.maxDepth ?? 1000);
            postSuccess(message.id);
            return;
        }
        case 'apply_snapshot': {
            applySnapshot({
                bids: normalizeWireEntries(message.snapshot?.bids),
                asks: normalizeWireEntries(message.snapshot?.asks),
            });
            postSuccess(message.id);
            return;
        }
        case 'apply_delta': {
            applyDelta({
                bids: normalizeWireEntries(message.delta?.bids),
                asks: normalizeWireEntries(message.delta?.asks),
            });
            postSuccess(message.id);
            return;
        }
        case 'get_depth': {
            const depth = getDepth(message.limit ?? 100);
            postSuccess(message.id, depth);
            return;
        }
        case 'dispose': {
            clearAll();
            if (wasmBook && typeof wasmBook.free === 'function') {
                wasmBook.free();
            }
            wasmBook = null;
            postSuccess(message.id);
            return;
        }
        default: {
            postError(message.id, new Error(`Unsupported request type: ${message.type as string}`));
        }
        }
    } catch (error) {
        postError(message.id, error);
    }
});

export {};
