<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useOrderBookRows } from './OrderBook/hooks/useOrderBookRows';
import type { OrderBookEntry, OrderBookRow } from './OrderBook/hooks/useOrderBookRows';

interface Props {
    /**
     * Order book data source. In this project it comes from `useBinanceDepthStream()`.
     *
     * Expected ordering:
     * - `buyList` (bids): best -> worse, price high -> low (descending)
     * - `sellList` (asks): best -> worse, price low -> high (ascending)
     */
    buyList?: OrderBookEntry[];
    sellList?: OrderBookEntry[];

    /** Rows per side (each side fixed N rows). */
    level?: 10 | 20;

    /** Whether to show Size column. */
    showVolume?: boolean;

    /** Center row price (Last/Mark). If omitted, it falls back to mid price from best bid/ask. */
    lastPrice?: number | null;

    priceText?: string;
    numText?: string;
    totalText?: string;
    levelsText?: string;
    bidText?: string;
    askText?: string;
    lastText?: string;
    decimal?: number;
    priceUnit?: string;
    sizeUnit?: string;
}

const props = withDefaults(defineProps<Props>(), {
    buyList: () => [],
    sellList: () => [],
    level: 10,
    showVolume: true,
    lastPrice: null,
    priceText: 'Price',
    numText: 'Size',
    totalText: 'Total',
    levelsText: 'Order book',
    bidText: 'Bid',
    askText: 'Ask',
    lastText: 'Last',
    decimal: 2,
    priceUnit: '',
    sizeUnit: '',
});

const emit = defineEmits<{
    /**
     * Click a price to fill trade input.
     * Parent decides how to apply it (e.g. bind to a form input).
     */
    (event: 'select-price', price: number): void;
}>();

// 盘口档位与显示成交量开关。
const resolvedLevel = computed(() => (props.level === 20 ? 20 : 10));
const showVolume = computed(() => props.showVolume !== false);
const rowGridClass = computed(() => (showVolume.value ? 'grid-cols-3' : 'grid-cols-2'));

// 数值格式化：价格/数量/累计统一走同一套逻辑。
const formatNumber = (value: number, fractionDigits = 0) =>
    new Intl.NumberFormat(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(value);

const withUnit = (value: number, fractionDigits: number, unit: string) => {
    const formatted = formatNumber(value, fractionDigits);
    return unit ? `${formatted} ${unit}` : formatted;
};

const formatPrice = (value: number) => withUnit(value, props.decimal ?? 0, props.priceUnit ?? '');
const formatSize = (value: number) => withUnit(value, props.decimal ?? 0, props.sizeUnit ?? '');
const formatTotal = (value: number) => withUnit(value, props.decimal ?? 0, props.sizeUnit ?? '');
const formatPlainPrice = (value: number) => formatNumber(value, props.decimal ?? 0);

/**
 * Display ordering requirements:
 * - Asks (top): price decreasing (high -> low)
 * - Bids (bottom): price increasing (low -> high)
 */
const { bidSlots, askSlots } = useOrderBookRows(
    () => props.buyList,
    () => props.sellList,
    { rows: resolvedLevel }
);

function toFiniteNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

const bestBid = computed(() => toFiniteNumber(props.buyList?.[0]?.[0]));
const bestAsk = computed(() => toFiniteNumber(props.sellList?.[0]?.[0]));

const midPrice = computed(() => {
    const bid = bestBid.value;
    const ask = bestAsk.value;
    if (bid === null && ask === null) return null;
    if (bid === null) return ask;
    if (ask === null) return bid;
    return (bid + ask) / 2;
});

const centerPrice = computed(() => toFiniteNumber(props.lastPrice) ?? midPrice.value);

type PriceMove = 'up' | 'down' | 'flat';

const priceMove = shallowRef<PriceMove>('flat');
const priceMoveTick = shallowRef(0);

const centerPriceFactor = computed(() => {
    const digits = Math.max(0, Math.min(12, props.decimal ?? 0));
    return 10 ** digits;
});

function roundToCenterDigits(value: number) {
    const factor = centerPriceFactor.value;
    return Math.round(value * factor) / factor;
}

watch(centerPrice, (next, prev) => {
    if (next === null || prev === null) {
        priceMove.value = 'flat';
        return;
    }

    const nextRounded = roundToCenterDigits(next);
    const prevRounded = roundToCenterDigits(prev);
    const nextMove: PriceMove = nextRounded > prevRounded ? 'up' : nextRounded < prevRounded ? 'down' : 'flat';

    priceMove.value = nextMove;
    if (nextMove !== 'flat') priceMoveTick.value += 1;
});

const centerToneClass = computed(() => {
    if (centerPrice.value === null) return 'text-slate-900 dark:text-white';
    if (priceMove.value === 'up') return 'text-emerald-600 dark:text-emerald-400';
    if (priceMove.value === 'down') return 'text-rose-600 dark:text-rose-400';
    return 'text-slate-900 dark:text-white';
});

const centerMetaToneClass = computed(() => {
    if (centerPrice.value === null) return 'text-slate-500 dark:text-slate-400';
    if (priceMove.value === 'up') return 'text-emerald-600/80 dark:text-emerald-400/80';
    if (priceMove.value === 'down') return 'text-rose-600/80 dark:text-rose-400/80';
    return 'text-slate-500 dark:text-slate-400';
});

const centerMoveSymbol = computed(() => {
    if (centerPrice.value === null) return '';
    if (priceMove.value === 'up') return '▲';
    if (priceMove.value === 'down') return '▼';
    return '';
});

function handleSelectPrice(row: OrderBookRow) {
    emit('select-price', row.price);
}

// 买卖盘对比条数据统计
const buyTotal = computed(() => {
    return props.buyList.slice(0, resolvedLevel.value).reduce((sum, [, size]) => {
        const num = toFiniteNumber(size);
        return sum + (num ?? 0);
    }, 0);
});

const sellTotal = computed(() => {
    return props.sellList.slice(0, resolvedLevel.value).reduce((sum, [, size]) => {
        const num = toFiniteNumber(size);
        return sum + (num ?? 0);
    }, 0);
});

const totalVolume = computed(() => buyTotal.value + sellTotal.value);

const buyRatio = computed(() => {
    if (totalVolume.value === 0) return 0;
    return (buyTotal.value / totalVolume.value) * 100;
});

const sellRatio = computed(() => {
    if (totalVolume.value === 0) return 0;
    return (sellTotal.value / totalVolume.value) * 100;
});
</script>

<template>
    <div class="w-full">
        <div class="flex items-center justify-between px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            <span class="font-medium text-slate-600 dark:text-slate-300">
                {{ props.levelsText }}
            </span>
            <span class="text-slate-400">{{ resolvedLevel }}</span>
        </div>

        <div class="rounded-lg border border-slate-200/60 bg-white/70 dark:border-slate-800/60 dark:bg-slate-900/60">
            <div
                class="flex items-center justify-between px-3 py-2 text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
                <span class="text-slate-400">{{ props.priceText }}</span>
                <span v-if="showVolume" class="text-right text-slate-400">{{ props.numText }}</span>
                <span class="text-right text-slate-400">{{ props.totalText }}</span>
            </div>

            <!-- Asks -->
            <div class="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                <div
                    v-for="slot in askSlots"
                    :key="slot.kind === 'row' ? `ask-${slot.value.price}` : slot.key"
                    class="group relative overflow-hidden px-3 py-1 text-[11px] text-slate-600 dark:text-slate-300"
                >
                    <template v-if="slot.kind === 'row'">
                        <div class="contents">
                            <div
                                class="absolute inset-y-0 right-0 transition-[width] duration-200 ease-out"
                                :style="{
                                    width: `${slot.value.depthPct}%`,
                                    background: 'linear-gradient(270deg, rgba(244,63,94,0.18), rgba(244,63,94,0.04))',
                                }"
                            />
                            <div :class="['relative z-10 grid items-center gap-3 tabular-nums', rowGridClass]">
                                <button
                                    type="button"
                                    class="truncate text-left text-rose-500 hover:underline"
                                    @click="handleSelectPrice(slot.value)"
                                >
                                    {{ formatPrice(slot.value.price) }}
                                </button>
                                <div v-if="showVolume" class="truncate text-right text-slate-400">
                                    {{ formatSize(slot.value.size) }}
                                </div>
                                <div class="truncate text-right">
                                    {{ formatTotal(slot.value.total) }}
                                </div>
                            </div>
                        </div>
                    </template>
                    <template v-else>
                        <div class="h-[18px]" />
                    </template>
                    <div
                        class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    >
                        <div class="absolute inset-0 bg-slate-950/[0.02] dark:bg-white/[0.03]" />
                    </div>
                </div>
            </div>

            <!-- Center price -->
            <div
                class="flex items-center justify-between gap-3 border-y border-slate-200/60 bg-slate-50/70 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/40"
            >
                <div :class="['text-[11px] font-medium transition-colors', centerMetaToneClass]">
                    {{ props.lastText }}
                </div>
                <div class="flex items-baseline gap-2 tabular-nums">
                    <div class="flex items-baseline gap-1">
                        <span
                            :key="priceMoveTick"
                            :class="[
                                'w-3 text-center text-[11px] font-semibold leading-none transition-colors',
                                centerToneClass,
                                centerMoveSymbol ? 'ob-price-indicator' : '',
                            ]"
                            aria-hidden="true"
                        >
                            {{ centerMoveSymbol }}
                        </span>
                        <div :class="['text-sm font-semibold transition-colors', centerToneClass]">
                            {{ centerPrice === null ? '--' : formatPlainPrice(centerPrice) }}
                        </div>
                    </div>
                    <div :class="['text-[11px] transition-colors', centerMetaToneClass]">
                        {{ props.priceUnit }}
                    </div>
                </div>
            </div>

            <!-- Bids -->
            <div class="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                <div
                    v-for="slot in bidSlots"
                    :key="slot.kind === 'row' ? `bid-${slot.value.price}` : slot.key"
                    class="group relative overflow-hidden px-3 py-1 text-[11px] text-slate-600 dark:text-slate-300"
                >
                    <template v-if="slot.kind === 'row'">
                        <div class="contents">
                            <div
                                class="absolute inset-y-0 right-0 transition-[width] duration-200 ease-out"
                                :style="{
                                    width: `${slot.value.depthPct}%`,
                                    background: 'linear-gradient(270deg, rgba(16,185,129,0.18), rgba(16,185,129,0.04))',
                                }"
                            />
                            <div :class="['relative z-10 grid items-center gap-3 tabular-nums', rowGridClass]">
                                <button
                                    type="button"
                                    class="truncate text-left text-emerald-500 hover:underline"
                                    @click="handleSelectPrice(slot.value)"
                                >
                                    {{ formatPrice(slot.value.price) }}
                                </button>
                                <div v-if="showVolume" class="truncate text-right text-slate-400">
                                    {{ formatSize(slot.value.size) }}
                                </div>
                                <div class="truncate text-right">
                                    {{ formatTotal(slot.value.total) }}
                                </div>
                            </div>
                        </div>
                    </template>
                    <template v-else>
                        <div class="h-[18px]" />
                    </template>
                    <div
                        class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    >
                        <div class="absolute inset-0 bg-slate-950/[0.02] dark:bg-white/[0.03]" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
@keyframes obPriceIndicatorPop {
    0% {
        transform: translateX(2px);
        opacity: 0.4;
    }
    100% {
        transform: translateX(0);
        opacity: 1;
    }
}

.ob-price-indicator {
    animation: obPriceIndicatorPop 160ms ease-out;
}
</style>
