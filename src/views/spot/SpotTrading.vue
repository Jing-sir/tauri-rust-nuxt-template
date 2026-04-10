<script setup lang="ts">
import TradingHeader from '~/views/spot/components/TradingHeader.vue';
import MarketList from '~/views/spot/components/MarketList.vue';
import ChartPanel from '~/views/spot/components/ChartPanel.vue';
import TradeOrderBook from '~/views/spot/components/OrderBook.vue';
import TradeList from '~/views/spot/components/TradeList.vue';
import MarketMoves from '~/views/spot/components/MarketMoves.vue';
import OrderForm from '~/views/spot/components/OrderForm.vue';
import OrdersPanel from '~/views/spot/components/OrdersPanel.vue';
import { useAssets } from '@/composables/useAssets';
import { useBinanceDepthStream } from '@/composables/useBinanceDepthStream';
import type { MarketQuoteComputed, MarketQuoteInput } from '@/composables/useMarketEngineWorker';
import { useMarketScanner } from '@/composables/useMarketScanner';
import { useOrders } from '@/composables/useOrders';
import { useSpotMarkets } from '@/composables/useSpotMarkets';
import { useBinanceTradeStream } from '@/composables/useBinanceTradeStream';
import type { BinanceInterval } from '~/composables/useBinanceKlineStream';
import type { PairItem, TradeHistoryItem, TradeItem } from '~~/types/spotTypes';

const {
    pairs,
    searchQuery,
    selectedPair,
    selectedPairMeta,
    chartSymbol,
} = useSpotMarkets();

const chartInterval = shallowRef<BinanceInterval>('15m');
const chartIntervals: Array<{ label: string; value: BinanceInterval }> = [
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '1h', value: '1h' },
];

const indicatorOptions = shallowRef(['MA', 'EMA', 'BOLL']);
const activeIndicator = shallowRef('MA');
const chartView = shallowRef<'kline' | 'depth'>('kline');

const depthLevel = shallowRef<10 | 20>(20);
const depthSpeed = shallowRef<'100ms' | '1000ms'>('100ms');
const showDepthVolume = shallowRef(true);
const depthLimit = computed(() => {
    // depth 图未激活时，不必长期维护 500/1000 档，降低引擎与传输负担。
    if (chartView.value !== 'depth') {
        return 100;
    }
    return depthLevel.value === 20 ? 1000 : 500;
});
const { bids: depthBuyList, asks: depthSellList } = useBinanceDepthStream({
    symbol: chartSymbol,
    // 深度图优先保证盘口正确性：使用 diff + snapshot 全量链路。
    // 若快照链路异常，useBinanceDepthStream 内部会自动降级到 partial。
    mode: 'diff',
    level: depthLevel,
    limit: depthLimit,
    speed: depthSpeed,
    engine: 'wasm-worker',
});

const { lastPrice: tradeLastPrice, side: tradeSide, lastQty: tradeLastQty, lastTradeTimeMs } = useBinanceTradeStream({
    symbol: chartSymbol,
    // “最新成交”展示使用聚合成交，频率更接近交易终端常见面板。
    streamType: 'aggTrade',
});

const latestPriceValue = computed<number | null>(() => {
    if (typeof tradeLastPrice.value === 'number') return tradeLastPrice.value;
    const fallback = selectedPairMeta.value?.price;
    if (!fallback) return null;
    const parsed = Number(fallback.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
});

const quoteCurrency = computed(() => selectedPairMeta.value?.quote ?? '');
const { assets, availableBalance } = useAssets(quoteCurrency);
const { openOrders, historyOrders, myTrades } = useOrders();

const latestTrades = shallowRef<TradeItem[]>([]);

const {
    topAnomaly,
    scan: scanMarketQuotes,
    filterAndSort: filterAndSortQuotes,
} = useMarketScanner({
    topN: 6,
});

const scannerSortedPairs = shallowRef<PairItem[]>([]);
let scannerTaskVersion = 0;
type ScannerMoveItem = {
    symbol: string;
    price: string;
    change: string;
    tone: 'up' | 'down';
};

const marketListPairs = computed(() =>
    scannerSortedPairs.value.length > 0 ? scannerSortedPairs.value : pairs.value,
);

const scannerMoves = computed<ScannerMoveItem[]>(() =>
    topAnomaly.value.slice(0, 3).map((item) => ({
        symbol: item.symbol,
        price: formatPairPrice(item.last),
        change: `${item.change_pct >= 0 ? '+' : ''}${item.change_pct.toFixed(2)}%`,
        tone: item.change_pct >= 0 ? 'up' : 'down',
    })),
);

function formatTradeTimeLabel(timeMs: number) {
    const date = new Date(timeMs);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

watch(
    [tradeLastPrice, tradeSide, tradeLastQty, lastTradeTimeMs],
    ([price, side, qty, timeMs]) => {
        if (typeof price !== 'number' || !Number.isFinite(price)) {
            return;
        }
        if (side !== 'buy' && side !== 'sell') {
            return;
        }

        // 高频深度流与成交列表解耦：成交列表仅由 trade stream 驱动，
        // 避免 depth 每次发布都带动 TradeList/OrdersPanel 重新计算。
        const normalizedQty = typeof qty === 'number' && Number.isFinite(qty) && qty > 0 ? qty : 0;
        const normalizedTime = typeof timeMs === 'number' && Number.isFinite(timeMs) ? timeMs : Date.now();
        const tradeId = `${normalizedTime}:${side}:${price}:${normalizedQty}`;
        if (latestTrades.value[0]?.id === tradeId) {
            return;
        }
        const nextTrade: TradeItem = {
            id: tradeId,
            side,
            price,
            amount: normalizedQty,
            time: formatTradeTimeLabel(normalizedTime),
        };

        latestTrades.value = [nextTrade, ...latestTrades.value].slice(0, 10);
    },
    { immediate: true },
);

watch(chartSymbol, () => {
    // 切换交易对时清空旧交易对的“最新成交”，避免视觉上持续叠加。
    latestTrades.value = [];
});

const orderSide = shallowRef<'buy' | 'sell'>('buy');
const orderType = shallowRef<'limit' | 'market' | 'stopLimit'>('limit');
const orderPrice = shallowRef('');
const orderAmount = shallowRef('');

const orderTotal = computed(() => {
    const price = Number(orderPrice.value);
    const amount = Number(orderAmount.value);
    if (!Number.isFinite(price) || !Number.isFinite(amount)) return '--';
    return (price * amount).toFixed(2);
});

const tradeHistory = computed<TradeHistoryItem[]>(() =>
    latestTrades.value.map((trade, index) => ({
        id: `T${index}`,
        pair: selectedPair.value,
        side: trade.side ?? 'buy',
        price: trade.price.toFixed(2),
        amount: trade.amount.toFixed(3),
        time: trade.time,
    })),
);

const ordersTab = shallowRef<'open' | 'orderHistory' | 'tradeHistory' | 'assets'>('open');

const handleSelectPercent = (percent: number) => {
    const value = (availableBalance.value * (percent / 100)).toFixed(2);
    orderAmount.value = value;
};

function parseNumberInput(value: string | number | null | undefined) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value !== 'string') {
        return 0;
    }
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseChangePercent(value: string | number | null | undefined) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value !== 'string') {
        return 0;
    }
    const normalized = value.replace('%', '').replace(',', '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseCompactVolume(value: string | number | null | undefined) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value !== 'string') {
        return 0;
    }

    const normalized = value.replace(/,/g, '').trim().toUpperCase();
    const match = normalized.match(/^(-?\d+(?:\.\d+)?)([KMBT]?)$/);
    if (!match) {
        return 0;
    }

    const numberPart = Number(match[1]);
    if (!Number.isFinite(numberPart)) {
        return 0;
    }

    const unit = match[2] ?? '';
    const unitMultiplier: Record<string, number> = {
        K: 1_000,
        M: 1_000_000,
        B: 1_000_000_000,
        T: 1_000_000_000_000,
    };
    return numberPart * (unitMultiplier[unit] ?? 1);
}

function formatCompactVolume(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
        return '0';
    }

    if (value >= 1_000_000_000_000) {
        return `${(value / 1_000_000_000_000).toFixed(2)}T`;
    }
    if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(2)}K`;
    }
    return value.toFixed(2);
}

function formatPairPrice(value: number) {
    if (!Number.isFinite(value)) {
        return '0';
    }
    if (value >= 1000) {
        return value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }
    if (value >= 1) {
        return value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        });
    }
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
    });
}

function buildMarketQuote(pair: PairItem): MarketQuoteInput | null {
    const last = parseNumberInput(pair.price);
    if (last <= 0) {
        return null;
    }

    const changePct = parseChangePercent(pair.change);
    const denominator = 1 + changePct / 100;
    const prevClose = Math.abs(denominator) <= 1e-6 ? last : last / denominator;

    const amplitudePct = Math.max(Math.abs(changePct) * 1.3, 0.4);
    const high = Math.max(last, prevClose * (1 + amplitudePct / 200));
    const low = Math.max(0, Math.min(last, prevClose * (1 - amplitudePct / 200)));

    const volume = parseCompactVolume(pair.volume);
    const turnover = volume * last;
    const spreadPct = Math.max(0.02, Math.min(0.25, Math.abs(changePct) * 0.04 + 0.02));
    const bid = last * (1 - spreadPct / 200);
    const ask = last * (1 + spreadPct / 200);

    return {
        symbol: pair.symbol,
        last,
        prevClose,
        high,
        low,
        volume,
        turnover,
        bid,
        ask,
    };
}

function quoteToPairItem(quote: MarketQuoteComputed, fallbackMap: Map<string, PairItem>) {
    const fallback = fallbackMap.get(quote.symbol);
    const normalizedSymbol = quote.symbol || fallback?.symbol || 'UNKNOWN/USDT';
    const [baseRaw, quoteRaw = 'USDT'] = normalizedSymbol.split('/');
    const base = baseRaw || fallback?.base || normalizedSymbol;
    const quoteAsset = quoteRaw || fallback?.quote || 'USDT';
    return {
        symbol: normalizedSymbol,
        base: fallback?.base ?? base,
        quote: fallback?.quote ?? quoteAsset,
        price: formatPairPrice(quote.last),
        change: `${quote.change_pct >= 0 ? '+' : ''}${quote.change_pct.toFixed(2)}%`,
        volume: formatCompactVolume(quote.volume),
        tone: quote.change_pct >= 0 ? 'up' as const : 'down' as const,
    };
}

async function refreshMarketScanner() {
    const taskId = ++scannerTaskVersion;
    const quotes = pairs.value
        .map(buildMarketQuote)
        .filter((item): item is MarketQuoteInput => item !== null);

    if (!quotes.length) {
        scannerSortedPairs.value = [];
        return;
    }

    await scanMarketQuotes(quotes, 6);
    const sortedQuotes = await filterAndSortQuotes(quotes, 'change_pct', true, quotes.length);

    if (taskId !== scannerTaskVersion) {
        return;
    }

    const fallbackMap = new Map(pairs.value.map((item) => [item.symbol, item] as const));
    scannerSortedPairs.value = sortedQuotes.map((quote) => quoteToPairItem(quote, fallbackMap));
}

if (import.meta.client) {
    watch(
        pairs,
        () => {
            void refreshMarketScanner();
        },
        { immediate: true, deep: true },
    );
}
</script>

<template>
    <div class="flex h-full min-h-0 flex-col gap-2">
        <section class="grid min-h-0 flex-1 items-stretch gap-2 lg:grid-cols-[320px_minmax(0,1fr)_280px]">
            <div class="flex h-full min-h-0 flex-col gap-2">
                <TradeOrderBook
                    :sell-orders="depthSellList"
                    :buy-orders="depthBuyList"
                    :latest-price="latestPriceValue"
                    :latest-side="tradeSide"
                    :quote-currency="quoteCurrency"
                    class="min-h-0 flex-1"
                />
            </div>

            <div class="flex h-full min-h-0 flex-col gap-2">
                <TradingHeader :pair="selectedPairMeta" />
                <ChartPanel
                    :chart-view="chartView"
                    :chart-interval="chartInterval"
                    :chart-intervals="chartIntervals"
                    :indicator-options="indicatorOptions"
                    :active-indicator="activeIndicator"
                    :chart-symbol="chartSymbol"
                    :latest-price="latestPriceValue"
                    :latest-side="tradeSide"
                    :depth-level="depthLevel"
                    :depth-speed="depthSpeed"
                    :show-depth-volume="showDepthVolume"
                    :depth-buy-list="depthBuyList"
                    :depth-sell-list="depthSellList"
                    @update:chart-view="chartView = $event"
                    @update:chart-interval="chartInterval = $event"
                    @update:active-indicator="activeIndicator = $event"
                    @update:depth-level="depthLevel = $event"
                    @update:depth-speed="depthSpeed = $event"
                    @update:show-depth-volume="showDepthVolume = $event"
                />
                <OrderForm
                    :order-type="orderType"
                    :order-side="orderSide"
                    :price="orderPrice"
                    :amount="orderAmount"
                    :total="orderTotal"
                    @update:order-type="orderType = $event"
                    @update:order-side="orderSide = $event"
                    @update:price="orderPrice = $event"
                    @update:amount="orderAmount = $event"
                    @select-percent="handleSelectPercent"
                />
            </div>

            <div class="flex h-full min-h-0 flex-col gap-2">
                <MarketList
                    :pairs="marketListPairs"
                    :selected-pair="selectedPair"
                    :search-query="searchQuery"
                    list-max-height-class="max-h-[220px]"
                    @update:search-query="searchQuery = $event"
                    @select-pair="selectedPair = $event"
                />
                <TradeList :latest-trades="latestTrades" :my-trades="myTrades" />
                <MarketMoves :items="scannerMoves" />
            </div>
        </section>

        <section class="min-h-0">
            <OrdersPanel
                :active-tab="ordersTab"
                :open-orders="openOrders"
                :order-history="historyOrders"
                :trade-history="tradeHistory"
                :assets="assets"
                @update:active-tab="ordersTab = $event"
            />
        </section>
    </div>
</template>
