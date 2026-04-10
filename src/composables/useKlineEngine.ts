import { computed, onBeforeUnmount, shallowRef, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import type { KlineBar, KlineBarInput, KlineTickInput, KlineTimeframe } from './useMarketEngineWorker';
import { getMarketEngineWorkerClient } from './useMarketEngineWorker';

export interface UseKlineEngineOptions {
    timeframe?: MaybeRefOrGetter<KlineTimeframe | undefined>;
    limit?: MaybeRefOrGetter<number | undefined>;
    maxBars?: MaybeRefOrGetter<number | undefined>;
    autoInit?: MaybeRefOrGetter<boolean | undefined>;
}

const DEFAULT_OPTIONS: {
    timeframe: KlineTimeframe;
    limit: number;
    maxBars: number;
    autoInit: boolean;
} = {
    timeframe: '15m',
    limit: 500,
    maxBars: 2000,
    autoInit: true,
};

export function useKlineEngine(options: UseKlineEngineOptions = {}) {
    const candles = shallowRef<KlineBar[]>([]);
    const latest = shallowRef<KlineBar | null>(null);
    const isReady = shallowRef(false);
    const isSyncing = shallowRef(false);
    const error = shallowRef<string | null>(null);

    let disposed = false,
        queue = Promise.resolve();

    const resolvedTimeframe = computed<KlineTimeframe>(() => {
        const source = options.timeframe ?? DEFAULT_OPTIONS.timeframe;
        const value = toValue(source);
        if (value === '1m' || value === '5m' || value === '15m' || value === '1h') {
            return value;
        }
        return DEFAULT_OPTIONS.timeframe;
    });

    const resolvedLimit = computed<number>(() => {
        const source = options.limit ?? DEFAULT_OPTIONS.limit;
        const value = Number(toValue(source));
        if (!Number.isFinite(value)) {
            return DEFAULT_OPTIONS.limit;
        }
        return Math.max(1, Math.floor(value));
    });

    const resolvedMaxBars = computed<number>(() => {
        const source = options.maxBars ?? DEFAULT_OPTIONS.maxBars;
        const value = Number(toValue(source));
        if (!Number.isFinite(value)) {
            return DEFAULT_OPTIONS.maxBars;
        }
        return Math.max(100, Math.floor(value));
    });

    const resolvedAutoInit = computed<boolean>(() => {
        const source = options.autoInit ?? DEFAULT_OPTIONS.autoInit;
        return toValue(source) !== false;
    });

    function enqueue<T>(task: () => Promise<T>): Promise<T> {
        const next = queue.then(task, task);
        queue = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    async function ensureClient() {
        return getMarketEngineWorkerClient(resolvedMaxBars.value);
    }

    function patchLatest(nextLatest: KlineBar) {
        const nextCandles = [...candles.value];
        const lastCandle = nextCandles[nextCandles.length - 1];
        if (lastCandle && lastCandle.ts === nextLatest.ts) {
            nextCandles[nextCandles.length - 1] = nextLatest;
        } else {
            nextCandles.push(nextLatest);
            if (nextCandles.length > resolvedLimit.value) {
                nextCandles.shift();
            }
        }
        candles.value = nextCandles;
        latest.value = nextLatest;
    }

    async function loadBars() {
        if (disposed) {
            return;
        }

        isSyncing.value = true;
        try {
            const client = await ensureClient();
            const payload = await client.klineGetBars(resolvedTimeframe.value, resolvedLimit.value);
            const bars = normalizeKlineBars(payload);
            candles.value = bars;
            latest.value = bars[bars.length - 1] ?? null;
            isReady.value = true;
            error.value = null;
        } catch (cause) {
            error.value = cause instanceof Error ? cause.message : String(cause);
        } finally {
            isSyncing.value = false;
        }
    }

    async function syncLatest() {
        if (disposed) {
            return;
        }

        isSyncing.value = true;
        try {
            const client = await ensureClient();
            const payload = await client.klineGetLatest(resolvedTimeframe.value);
            const bar = normalizeKlineBar(payload);
            if (bar) {
                patchLatest(bar);
                isReady.value = true;
            }
            error.value = null;
        } catch (cause) {
            error.value = cause instanceof Error ? cause.message : String(cause);
        } finally {
            isSyncing.value = false;
        }
    }

    async function init() {
        await enqueue(loadBars);
    }

    async function clear() {
        await enqueue(async () => {
            const client = await ensureClient();
            await client.klineClear();
            candles.value = [];
            latest.value = null;
            isReady.value = true;
        });
    }

    async function applyTick(tick: KlineTickInput) {
        await enqueue(async () => {
            const client = await ensureClient();
            await client.klineApplyTick(tick);
            await syncLatest();
        });
    }

    async function applyTicks(ticks: KlineTickInput[]) {
        await enqueue(async () => {
            const client = await ensureClient();
            await client.klineApplyTicks(ticks);
            await loadBars();
        });
    }

    async function apply1mBar(bar: KlineBarInput) {
        await enqueue(async () => {
            const client = await ensureClient();
            const payload = await client.klineApply1mBarAndGetLatest(bar, resolvedTimeframe.value);
            const latestBar = normalizeKlineBar(payload);
            if (latestBar) {
                patchLatest(latestBar);
                isReady.value = true;
            }
            error.value = null;
        });
    }

    async function apply1mBars(bars: KlineBarInput[]) {
        await enqueue(async () => {
            const client = await ensureClient();
            await client.klineApply1mBars(bars);
            await loadBars();
        });
    }

    async function refresh() {
        await enqueue(loadBars);
    }

    if (import.meta.client) {
        watch(
            [resolvedTimeframe, resolvedLimit],
            () => {
                if (!isReady.value || disposed) {
                    return;
                }
                void enqueue(loadBars);
            },
            { immediate: false },
        );

        if (resolvedAutoInit.value) {
            void init();
        }
    }

    onBeforeUnmount(() => {
        disposed = true;
    });

    return {
        candles,
        latest,
        timeframe: resolvedTimeframe,
        limit: resolvedLimit,
        isReady,
        isSyncing,
        error,
        init,
        refresh,
        clear,
        applyTick,
        applyTicks,
        apply1mBar,
        apply1mBars,
    };
}

function normalizeKlineBars(payload: unknown) {
    if (!Array.isArray(payload)) {
        return [];
    }

    const bars: KlineBar[] = [];
    for (const item of payload) {
        const bar = normalizeKlineBar(item);
        if (bar) {
            bars.push(bar);
        }
    }
    return bars;
}

function normalizeKlineBar(payload: unknown): KlineBar | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const data = payload as Record<string, unknown>;

    const ts = toFiniteNumber(data.ts);
    const open = toFiniteNumber(data.open);
    const high = toFiniteNumber(data.high);
    const low = toFiniteNumber(data.low);
    const close = toFiniteNumber(data.close);
    const volume = toFiniteNumber(data.volume);
    const turnover = toFiniteNumber(data.turnover);

    if (
        ts === null ||
        open === null ||
        high === null ||
        low === null ||
        close === null ||
        volume === null ||
        turnover === null
    ) {
        return null;
    }

    return {
        ts,
        open,
        high,
        low,
        close,
        volume,
        turnover,
        sma: toNullableFinite(data.sma),
        ema: toNullableFinite(data.ema),
        rsi: toNullableFinite(data.rsi),
        macd: toNullableFinite(data.macd),
        macd_signal: toNullableFinite(data.macd_signal),
        macd_hist: toNullableFinite(data.macd_hist),
    };
}

function toFiniteNumber(value: unknown) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return null;
    }
    return number;
}

function toNullableFinite(value: unknown) {
    if (value === null || value === undefined) {
        return null;
    }
    return toFiniteNumber(value);
}
