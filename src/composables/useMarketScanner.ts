import { computed, shallowRef, toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import type {
    MarketQuoteComputed,
    MarketQuoteInput,
    ScannerFilterInput,
} from './useMarketEngineWorker';
import { getMarketEngineWorkerClient } from './useMarketEngineWorker';

export interface UseMarketScannerOptions {
    maxBars?: MaybeRefOrGetter<number | undefined>;
    topN?: MaybeRefOrGetter<number | undefined>;
}

export interface MarketScanPayload {
    total: number;
    matched: number;
    items: MarketQuoteComputed[];
    top_change: MarketQuoteComputed[];
    top_turnover: MarketQuoteComputed[];
    top_anomaly: MarketQuoteComputed[];
}

const DEFAULT_OPTIONS = {
    maxBars: 2000,
    topN: 20,
};

export function useMarketScanner(options: UseMarketScannerOptions = {}) {
    const items = shallowRef<MarketQuoteComputed[]>([]);
    const topChange = shallowRef<MarketQuoteComputed[]>([]);
    const topTurnover = shallowRef<MarketQuoteComputed[]>([]);
    const topAnomaly = shallowRef<MarketQuoteComputed[]>([]);
    const total = shallowRef(0);
    const matched = shallowRef(0);
    const isReady = shallowRef(false);
    const isComputing = shallowRef(false);
    const error = shallowRef<string | null>(null);

    let queue = Promise.resolve();

    const resolvedMaxBars = computed(() => {
        const source = options.maxBars ?? DEFAULT_OPTIONS.maxBars;
        const value = Number(toValue(source));
        if (!Number.isFinite(value)) {
            return DEFAULT_OPTIONS.maxBars;
        }
        return Math.max(100, Math.floor(value));
    });

    const resolvedTopN = computed(() => {
        const source = options.topN ?? DEFAULT_OPTIONS.topN;
        const value = Number(toValue(source));
        if (!Number.isFinite(value)) {
            return DEFAULT_OPTIONS.topN;
        }
        return Math.max(1, Math.floor(value));
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
        const client = await getMarketEngineWorkerClient(resolvedMaxBars.value);
        isReady.value = true;
        return client;
    }

    async function compileFilters(filters: ScannerFilterInput[]) {
        return enqueue(async () => {
            isComputing.value = true;
            try {
                const client = await ensureClient();
                const count = await client.scannerCompileFilters(filters);
                error.value = null;
                return count;
            } catch (cause) {
                error.value = cause instanceof Error ? cause.message : String(cause);
                return 0;
            } finally {
                isComputing.value = false;
            }
        });
    }

    async function clearFilters() {
        await enqueue(async () => {
            isComputing.value = true;
            try {
                const client = await ensureClient();
                await client.scannerClearFilters();
                error.value = null;
            } catch (cause) {
                error.value = cause instanceof Error ? cause.message : String(cause);
            } finally {
                isComputing.value = false;
            }
        });
    }

    async function scan(quotes: MarketQuoteInput[], topN = resolvedTopN.value) {
        return enqueue(async () => {
            isComputing.value = true;
            try {
                const client = await ensureClient();
                const payload = await client.scannerScanQuotes(quotes, topN);
                const normalized = normalizeScanPayload(payload);

                total.value = normalized.total;
                matched.value = normalized.matched;
                items.value = normalized.items;
                topChange.value = normalized.top_change;
                topTurnover.value = normalized.top_turnover;
                topAnomaly.value = normalized.top_anomaly;
                error.value = null;

                return normalized;
            } catch (cause) {
                error.value = cause instanceof Error ? cause.message : String(cause);
                return normalizeScanPayload(null);
            } finally {
                isComputing.value = false;
            }
        });
    }

    async function filterAndSort(
        quotes: MarketQuoteInput[],
        sortField = 'change_pct',
        descending = true,
        limit = 100,
    ) {
        return enqueue(async () => {
            isComputing.value = true;
            try {
                const client = await ensureClient();
                const payload = await client.scannerFilterAndSort(quotes, sortField, descending, limit);
                const normalized = normalizeQuoteArray(payload);
                error.value = null;
                return normalized;
            } catch (cause) {
                error.value = cause instanceof Error ? cause.message : String(cause);
                return [] as MarketQuoteComputed[];
            } finally {
                isComputing.value = false;
            }
        });
    }

    return {
        items,
        topChange,
        topTurnover,
        topAnomaly,
        total,
        matched,
        isReady,
        isComputing,
        error,
        topN: resolvedTopN,
        compileFilters,
        clearFilters,
        scan,
        filterAndSort,
    };
}

function normalizeScanPayload(payload: unknown): MarketScanPayload {
    if (!payload || typeof payload !== 'object') {
        return {
            total: 0,
            matched: 0,
            items: [],
            top_change: [],
            top_turnover: [],
            top_anomaly: [],
        };
    }

    const data = payload as Record<string, unknown>;
    return {
        total: toPositiveInteger(data.total),
        matched: toPositiveInteger(data.matched),
        items: normalizeQuoteArray(data.items),
        top_change: normalizeQuoteArray(data.top_change),
        top_turnover: normalizeQuoteArray(data.top_turnover),
        top_anomaly: normalizeQuoteArray(data.top_anomaly),
    };
}

function normalizeQuoteArray(payload: unknown) {
    if (!Array.isArray(payload)) {
        return [] as MarketQuoteComputed[];
    }

    const rows: MarketQuoteComputed[] = [];
    for (const item of payload) {
        const quote = normalizeQuote(item);
        if (quote) {
            rows.push(quote);
        }
    }
    return rows;
}

function normalizeQuote(payload: unknown): MarketQuoteComputed | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const data = payload as Record<string, unknown>;

    const symbol = String(data.symbol ?? '');
    if (!symbol) {
        return null;
    }

    const last = toFiniteNumber(data.last);
    const prevClose = toFiniteNumber(data.prev_close);
    const high = toFiniteNumber(data.high);
    const low = toFiniteNumber(data.low);
    const volume = toFiniteNumber(data.volume);
    const turnover = toFiniteNumber(data.turnover);
    const changePct = toFiniteNumber(data.change_pct);
    const amplitudePct = toFiniteNumber(data.amplitude_pct);
    const spread = toFiniteNumber(data.spread);
    const spreadPct = toFiniteNumber(data.spread_pct);
    const anomalyScore = toFiniteNumber(data.anomaly_score);

    if (
        last === null ||
        prevClose === null ||
        high === null ||
        low === null ||
        volume === null ||
        turnover === null ||
        changePct === null ||
        amplitudePct === null ||
        spread === null ||
        spreadPct === null ||
        anomalyScore === null
    ) {
        return null;
    }

    return {
        symbol,
        last,
        prev_close: prevClose,
        high,
        low,
        volume,
        turnover,
        change_pct: changePct,
        amplitude_pct: amplitudePct,
        spread,
        spread_pct: spreadPct,
        anomaly_score: anomalyScore,
    };
}

function toFiniteNumber(value: unknown) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return null;
    }
    return number;
}

function toPositiveInteger(value: unknown) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
        return 0;
    }
    return Math.floor(number);
}
