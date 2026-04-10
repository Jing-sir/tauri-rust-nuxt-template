import { onBeforeUnmount, shallowRef, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

export type OrderBookEntry = [number | string, number | string];

export type OrderBookRow = {
    price: number;
    size: number;
    total: number;
    depthPct: number;
};

type OrderBookRowSlot = { kind: 'row'; value: OrderBookRow } | { kind: 'empty'; key: string };

export type OrderBookSideSlots = OrderBookRowSlot[];

export interface UseOrderBookRowsOptions {
    rows: MaybeRefOrGetter<number | undefined>;
}

function toNumber(value: number | string) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function patchSlots(target: OrderBookSideSlots, next: OrderBookSideSlots) {
    target.length = next.length;
    for (let i = 0; i < next.length; i += 1) {
        const prev = target[i];
        const nextSlot = next[i]!;

        if (!prev) {
            target[i] = nextSlot;
            continue;
        }

        if (prev.kind !== nextSlot.kind) {
            target[i] = nextSlot;
            continue;
        }

        if (prev.kind === 'empty' && nextSlot.kind === 'empty') {
            if (prev.key !== nextSlot.key) {
                target[i] = nextSlot;
            }
            continue;
        }

        if (prev.kind === 'row' && nextSlot.kind === 'row') {
            const prevValue = prev.value;
            const nextValue = nextSlot.value;
            if (
                prevValue.price !== nextValue.price ||
                prevValue.size !== nextValue.size ||
                prevValue.total !== nextValue.total ||
                prevValue.depthPct !== nextValue.depthPct
            ) {
                target[i] = nextSlot;
            }
        }
    }
}

/**
 * Build a fixed-height (N rows) view-model for an order book side.
 *
 * Requirements mapping:
 * - Asks: display "top -> bottom" price decreasing (furthest -> near mid).
 * - Bids: display "top -> bottom" price increasing (furthest -> near mid).
 * - Total is cumulative depth from the "near mid" side moving outward.
 * - Updates are batched with `requestAnimationFrame` to handle high-frequency streams.
 * - Patch arrays in-place to reduce reactive churn and DOM work.
 */
export function useOrderBookRows(
    bids: MaybeRefOrGetter<OrderBookEntry[] | undefined>,
    asks: MaybeRefOrGetter<OrderBookEntry[] | undefined>,
    options: UseOrderBookRowsOptions
) {
    const bidSlots = shallowRef<OrderBookSideSlots>([]);
    const askSlots = shallowRef<OrderBookSideSlots>([]);
    const bidMaxTotal = shallowRef(0);
    const askMaxTotal = shallowRef(0);

    let rafId = 0,
        pending: { bids: OrderBookEntry[]; asks: OrderBookEntry[]; rows: number } | null = null;

    function buildSideSlots(input: OrderBookEntry[], rows: number, side: 'bid' | 'ask') {
        const slots: OrderBookSideSlots = [];
        const slice = input.slice(0, rows);

        // Binance depth stream already returns: bids sorted desc, asks sorted asc.
        // We rely on that to keep this hot-path cheap. If a different data source is used,
        // normalize it upstream (or adjust this hook).

        const totals: OrderBookRow[] = [];
        let cumulative = 0;

        for (const [priceRaw, sizeRaw] of slice) {
            const price = toNumber(priceRaw);
            const size = toNumber(sizeRaw);
            if (price === null || size === null) continue;
            cumulative += size;
            totals.push({ price, size, total: cumulative, depthPct: 0 });
        }

        const maxTotal = cumulative || 0;
        const display =
            side === 'ask'
                ? [...totals].reverse() // asks: show high -> low
                : [...totals].reverse(); // bids: show low -> high (input is high -> low)

        for (const row of display) {
            slots.push({
                kind: 'row',
                value: {
                    ...row,
                    depthPct: maxTotal ? (row.total / maxTotal) * 100 : 0,
                },
            });
        }

        while (slots.length < rows) {
            slots.push({ kind: 'empty', key: `${side}-empty-${slots.length}` });
        }

        return { slots, maxTotal };
    }

    function applyNext(nextBids: OrderBookEntry[], nextAsks: OrderBookEntry[], rows: number) {
        const { slots: nextBidSlots, maxTotal: nextBidMax } = buildSideSlots(nextBids, rows, 'bid');
        const { slots: nextAskSlots, maxTotal: nextAskMax } = buildSideSlots(nextAsks, rows, 'ask');

        bidMaxTotal.value = nextBidMax;
        askMaxTotal.value = nextAskMax;

        if (!bidSlots.value.length) {
            bidSlots.value = nextBidSlots;
        } else {
            patchSlots(bidSlots.value, nextBidSlots);
        }

        if (!askSlots.value.length) {
            askSlots.value = nextAskSlots;
        } else {
            patchSlots(askSlots.value, nextAskSlots);
        }
    }

    function schedule() {
        const nextRowsRaw = toValue(options.rows);
        const rows = Math.max(1, Math.min(50, typeof nextRowsRaw === 'number' ? nextRowsRaw : 10));
        pending = {
            bids: (toValue(bids) ?? []) as OrderBookEntry[],
            asks: (toValue(asks) ?? []) as OrderBookEntry[],
            rows,
        };

        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (!pending) return;
            const { bids: nextBids, asks: nextAsks, rows: nextRows } = pending;
            pending = null;
            applyNext(nextBids, nextAsks, nextRows);
        });
    }

    watch(() => [toValue(bids), toValue(asks), toValue(options.rows)] as const, schedule, { immediate: true });

    onBeforeUnmount(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        pending = null;
    });

    return {
        bidSlots,
        askSlots,
        bidMaxTotal,
        askMaxTotal,
    };
}
