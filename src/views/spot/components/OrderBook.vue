<script setup lang="ts">
import type { BinanceDepthEntry } from '~/composables/useBinanceDepthStream';
import LatestPriceRow from './LatestPriceRow.vue';
import { dataThousands } from '@/filters/dataThousands';

type ViewMode = 'all' | 'buy' | 'sell';
type OrderBookSide = 'buy' | 'sell';
type RowChangeType = 'new' | 'up' | 'down';
type OrderBookRow = {
    price: number;
    amount: number;
    value: number;
};
type DisplayOrderBookRow = OrderBookRow | null;

const MAX_VISIBLE_ROWS = 17;
const FLASH_DURATION_MS = 240;

const props = defineProps<{
    sellOrders: BinanceDepthEntry[];
    buyOrders: BinanceDepthEntry[];
    latestPrice?: number | null;
    latestSide?: 'buy' | 'sell' | null;
    quoteCurrency?: string;
}>();

const { t } = useI18n();

const formatNumber = (value: number, fractionDigits = 2) => dataThousands(value.toFixed(fractionDigits));

function toFiniteNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSideEntries(rows: BinanceDepthEntry[]) {
    const next: BinanceDepthEntry[] = [];
    for (const row of rows) {
        const price = toFiniteNumber(row[0]);
        const amount = toFiniteNumber(row[1]);
        if (price === null || amount === null || price <= 0 || amount <= 0) {
            continue;
        }
        next.push([price, amount]);
    }
    return next;
}

function calcTickDigits(tick: number) {
    const text = String(tick);
    if (!text.includes('.')) {
        return 0;
    }
    return text.split('.')[1]?.length ?? 0;
}

function roundToTick(price: number, tick: number, side: OrderBookSide) {
    if (tick <= 0) {
        return price;
    }

    const scaled = price / tick;
    const bucket = side === 'buy' ? Math.floor(scaled) : Math.ceil(scaled);
    const digits = Math.min(10, calcTickDigits(tick) + 2);
    return Number((bucket * tick).toFixed(digits));
}

// 价位聚合：买盘按 floor，卖盘按 ceil，行为与交易所盘口聚合习惯一致。
function aggregateByTick(rows: BinanceDepthEntry[], side: OrderBookSide, tick: number) {
    if (tick <= 0) {
        return rows;
    }

    const bucketMap = new Map<number, number>();
    for (const [price, amount] of rows) {
        const bucketPrice = roundToTick(price, tick, side);
        bucketMap.set(bucketPrice, (bucketMap.get(bucketPrice) ?? 0) + amount);
    }

    return Array.from(bucketMap.entries())
        .sort((a, b) => (side === 'buy' ? b[0] - a[0] : a[0] - b[0]))
        .map(([price, amount]) => [price, amount] as BinanceDepthEntry);
}

function buildRows(rows: BinanceDepthEntry[]) {
    const result: OrderBookRow[] = [];
    for (const row of rows) {
        const price = toFiniteNumber(row[0]);
        const amount = toFiniteNumber(row[1]);
        if (price === null || amount === null) {
            continue;
        }
        result.push({
            price,
            amount,
            value: price * amount,
        });
    }
    return result;
}

function padRows(rows: OrderBookRow[], totalRows: number): DisplayOrderBookRow[] {
    if (rows.length >= totalRows) {
        return rows.slice(0, totalRows);
    }

    const padded: DisplayOrderBookRow[] = [...rows];
    while (padded.length < totalRows) {
        padded.push(null);
    }
    return padded;
}

function deriveTickOptions(referencePrice: number) {
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        return [0, 0.01, 0.1, 1];
    }
    if (referencePrice >= 100000) return [0, 1, 10, 100];
    if (referencePrice >= 10000) return [0, 0.1, 1, 10];
    if (referencePrice >= 1000) return [0, 0.01, 0.1, 1];
    if (referencePrice >= 100) return [0, 0.001, 0.01, 0.1];
    if (referencePrice >= 10) return [0, 0.0001, 0.001, 0.01];
    return [0, 0.00001, 0.0001, 0.001];
}

function formatTick(tick: number) {
    if (tick === 0) {
        return t('全部');
    }
    return Number(tick.toPrecision(8)).toString();
}

const viewMode = shallowRef<ViewMode>('all');
const showSell = computed(() => viewMode.value !== 'buy');
const showBuy = computed(() => viewMode.value !== 'sell');
const selectedTick = shallowRef(0);

const normalizedSellOrders = computed(() => normalizeSideEntries(props.sellOrders));
const normalizedBuyOrders = computed(() => normalizeSideEntries(props.buyOrders));

const referencePrice = computed(() => {
    const latest = toFiniteNumber(props.latestPrice);
    if (latest !== null) {
        return latest;
    }
    const askPrice = toFiniteNumber(normalizedSellOrders.value[0]?.[0]);
    if (askPrice !== null) {
        return askPrice;
    }
    const bidPrice = toFiniteNumber(normalizedBuyOrders.value[0]?.[0]);
    if (bidPrice !== null) {
        return bidPrice;
    }
    return 0;
});

const tickOptions = computed(() => deriveTickOptions(referencePrice.value));

watch(
    tickOptions,
    (next) => {
        if (!next.includes(selectedTick.value)) {
            selectedTick.value = next[0] ?? 0;
        }
    },
    { immediate: true }
);

const sellRows = computed(() => {
    const aggregated = aggregateByTick(normalizedSellOrders.value, 'sell', selectedTick.value);
    return buildRows(aggregated.slice(0, MAX_VISIBLE_ROWS));
});

const buyRows = computed(() => {
    const aggregated = aggregateByTick(normalizedBuyOrders.value, 'buy', selectedTick.value);
    return buildRows(aggregated.slice(0, MAX_VISIBLE_ROWS));
});
const sellDisplayRows = computed(() => padRows(sellRows.value, MAX_VISIBLE_ROWS));
const buyDisplayRows = computed(() => padRows(buyRows.value, MAX_VISIBLE_ROWS));
const sideGridStyle = computed(() => ({
    gridTemplateRows: `repeat(${MAX_VISIBLE_ROWS}, minmax(0, 1fr))`,
}));

const sellFlashMap = shallowRef<Map<number, RowChangeType>>(new Map());
const buyFlashMap = shallowRef<Map<number, RowChangeType>>(new Map());
const prevSellAmountMap = shallowRef<Map<number, number>>(new Map());
const prevBuyAmountMap = shallowRef<Map<number, number>>(new Map());

let sellFlashTimer: ReturnType<typeof setTimeout> | null = null,
    buyFlashTimer: ReturnType<typeof setTimeout> | null = null;

function buildAmountMap(rows: OrderBookRow[]) {
    const amountMap = new Map<number, number>();
    for (const row of rows) {
        amountMap.set(row.price, row.amount);
    }
    return amountMap;
}

function computeRowChanges(nextRows: OrderBookRow[], prevAmountMap: Map<number, number>) {
    const nextAmountMap = buildAmountMap(nextRows);
    const changes = new Map<number, RowChangeType>();

    // 逐档位变化检测：同价位比较数量变化，并产出高亮信号。
    for (const [price, amount] of nextAmountMap) {
        const prevAmount = prevAmountMap.get(price);
        if (prevAmount === undefined) {
            changes.set(price, 'new');
            continue;
        }
        if (amount > prevAmount) {
            changes.set(price, 'up');
        } else if (amount < prevAmount) {
            changes.set(price, 'down');
        }
    }

    return {
        changes,
        nextAmountMap,
    };
}

function scheduleFlashCleanup(side: OrderBookSide) {
    if (side === 'sell') {
        if (sellFlashTimer) {
            clearTimeout(sellFlashTimer);
        }
        sellFlashTimer = setTimeout(() => {
            sellFlashMap.value = new Map();
        }, FLASH_DURATION_MS);
        return;
    }

    if (buyFlashTimer) {
        clearTimeout(buyFlashTimer);
    }
    buyFlashTimer = setTimeout(() => {
        buyFlashMap.value = new Map();
    }, FLASH_DURATION_MS);
}

function rowFlashClass(side: OrderBookSide, price: number) {
    const change = (side === 'sell' ? sellFlashMap.value : buyFlashMap.value).get(price);
    if (!change) {
        return '';
    }
    if (change === 'new') {
        return 'bg-slate-500/10 dark:bg-slate-400/10';
    }
    if (side === 'sell') {
        return change === 'up' ? 'bg-rose-500/12 dark:bg-rose-400/12' : 'bg-emerald-500/12 dark:bg-emerald-400/12';
    }
    return change === 'up' ? 'bg-emerald-500/12 dark:bg-emerald-400/12' : 'bg-rose-500/12 dark:bg-rose-400/12';
}

watch(
    sellRows,
    (rows) => {
        if (prevSellAmountMap.value.size === 0) {
            prevSellAmountMap.value = buildAmountMap(rows);
            sellFlashMap.value = new Map();
            return;
        }

        const { changes, nextAmountMap } = computeRowChanges(rows, prevSellAmountMap.value);
        prevSellAmountMap.value = nextAmountMap;
        sellFlashMap.value = changes;

        if (changes.size > 0) {
            scheduleFlashCleanup('sell');
        }
    },
    { flush: 'post' }
);

watch(
    buyRows,
    (rows) => {
        if (prevBuyAmountMap.value.size === 0) {
            prevBuyAmountMap.value = buildAmountMap(rows);
            buyFlashMap.value = new Map();
            return;
        }

        const { changes, nextAmountMap } = computeRowChanges(rows, prevBuyAmountMap.value);
        prevBuyAmountMap.value = nextAmountMap;
        buyFlashMap.value = changes;

        if (changes.size > 0) {
            scheduleFlashCleanup('buy');
        }
    },
    { flush: 'post' }
);

onBeforeUnmount(() => {
    if (sellFlashTimer) {
        clearTimeout(sellFlashTimer);
    }
    if (buyFlashTimer) {
        clearTimeout(buyFlashTimer);
    }
});

// 买卖盘对比条数据统计
const buyTotal = computed(() => {
    return buyRows.value.reduce((sum, row) => sum + row.amount, 0);
});

const sellTotal = computed(() => {
    return sellRows.value.reduce((sum, row) => sum + row.amount, 0);
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
    <div class="flex h-full min-h-0 flex-col rounded-lg bg-white/90 shadow-sm dark:bg-slate-900/70">
        <div class="flex items-center justify-between px-2 py-2">
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <button
                    type="button"
                    class="rounded-md px-2 py-1"
                    :class="viewMode === 'all' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                    @click="viewMode = 'all'"
                >
                    {{ t('买卖盘') }}
                </button>
                <button
                    type="button"
                    class="rounded-md px-2 py-1"
                    :class="viewMode === 'buy' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                    @click="viewMode = 'buy'"
                >
                    {{ t('买盘') }}
                </button>
                <button
                    type="button"
                    class="rounded-md px-2 py-1"
                    :class="viewMode === 'sell' ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                    @click="viewMode = 'sell'"
                >
                    {{ t('卖盘') }}
                </button>
            </div>
            <span class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ t('订单簿') }}
            </span>
        </div>
        <div class="flex items-center justify-between px-2 pb-2">
            <span class="text-[11px] text-slate-400">
                {{ t('深度档位') }}
            </span>
            <div class="flex items-center gap-1">
                <button
                    v-for="tick in tickOptions"
                    :key="`tick-${tick}`"
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[11px] tabular-nums text-slate-500 transition-colors"
                    :class="
                        selectedTick === tick
                            ? 'bg-slate-900/8 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                            : 'hover:bg-slate-900/5 dark:hover:bg-white/6'
                    "
                    @click="selectedTick = tick"
                >
                    {{ formatTick(tick) }}
                </button>
            </div>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 text-xs">
            <div class="grid grid-cols-3 text-[11px] text-slate-400">
                <span>{{ t('价格') }}</span>
                <span class="text-right">{{ t('数量') }}</span>
                <span class="text-right">{{ t('成交额') }}</span>
            </div>

            <div class="flex min-h-0 flex-1 flex-col gap-2">
                <div v-if="showSell" class="flex min-h-0 flex-1 flex-col">
                    <div class="flex h-full min-h-0 flex-1 overflow-hidden">
                        <div class="grid h-full min-h-0 w-full" :style="sideGridStyle">
                            <div
                                v-for="(row, index) in sellDisplayRows"
                                :key="row ? `sell-${row.price}` : `sell-empty-${index}`"
                                :class="[
                                    'grid h-full min-h-0 grid-cols-3 items-center text-slate-600 transition-colors duration-200 dark:text-slate-300',
                                    row ? rowFlashClass('sell', row.price) : '',
                                ]"
                            >
                                <template v-if="row">
                                    <span class="text-rose-500">{{ formatNumber(row.price, 2) }}</span>
                                    <span class="text-right">{{ formatNumber(row.amount, 3) }}</span>
                                    <span class="text-right text-slate-400">{{ formatNumber(row.value, 2) }}</span>
                                </template>
                                <template v-else>
                                    <span>&nbsp;</span>
                                    <span>&nbsp;</span>
                                    <span>&nbsp;</span>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>

                <LatestPriceRow
                    :price="props.latestPrice"
                    :side="props.latestSide"
                    :quote-currency="props.quoteCurrency"
                />

                <div v-if="showBuy" class="flex min-h-0 flex-1 flex-col">
                    <div class="flex h-full min-h-0 flex-1 overflow-hidden">
                        <div class="grid h-full min-h-0 w-full" :style="sideGridStyle">
                            <div
                                v-for="(row, index) in buyDisplayRows"
                                :key="row ? `buy-${row.price}` : `buy-empty-${index}`"
                                :class="[
                                    'grid h-full min-h-0 grid-cols-3 items-center text-slate-600 transition-colors duration-200 dark:text-slate-300',
                                    row ? rowFlashClass('buy', row.price) : '',
                                ]"
                            >
                                <template v-if="row">
                                    <span class="text-emerald-500">{{ formatNumber(row.price, 2) }}</span>
                                    <span class="text-right">{{ formatNumber(row.amount, 3) }}</span>
                                    <span class="text-right text-slate-400">{{ formatNumber(row.value, 2) }}</span>
                                </template>
                                <template v-else>
                                    <span>&nbsp;</span>
                                    <span>&nbsp;</span>
                                    <span>&nbsp;</span>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 买卖盘对比条 -->
            <div class="border-t border-gray-200 px-2 py-2 dark:border-gray-800">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-medium tabular-nums text-green-600 dark:text-green-400">
                        B {{ buyRatio.toFixed(1) }}%
                    </span>
                    <div class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div class="flex h-full">
                            <div
                                class="bg-green-500 transition-all duration-300 ease-out dark:bg-green-400"
                                :style="{ width: `${buyRatio}%` }"
                            />
                            <div
                                class="bg-red-500 transition-all duration-300 ease-out dark:bg-red-400"
                                :style="{ width: `${sellRatio}%` }"
                            />
                        </div>
                    </div>
                    <span class="text-xs font-medium tabular-nums text-red-600 dark:text-red-400">
                        {{ sellRatio.toFixed(1) }}% S
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
