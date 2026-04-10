<script setup lang="ts">
const { t } = useI18n();

type Exchange = 'Binance';

type SpotPair = {
    symbol: string;
    base: string;
    quote: string;
    exchange: Exchange;
    last: number;
    changePct24h: number;
    volume24h: number;
};

const query = shallowRef('');
const exchange = shallowRef<'ALL' | Exchange>('ALL');
const quote = shallowRef<'ALL' | 'USDT' | 'USD' | 'BTC' | 'ETH'>('USDT');

const exchangeOptions = computed(() => [
    { label: t('全部'), value: 'ALL' },
    { label: 'Binance', value: 'Binance' },
]);

const quoteOptions = computed(() => [
    { label: t('全部'), value: 'ALL' },
    { label: 'USDT', value: 'USDT' },
    { label: 'USD', value: 'USD' },
    { label: 'BTC', value: 'BTC' },
    { label: 'ETH', value: 'ETH' },
]);

// Seed data for UI scaffolding; later replace with API/WebSocket feeds.
const pairs = shallowRef<SpotPair[]>([
    { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', exchange: 'Binance', last: 68234.12, changePct24h: 1.28, volume24h: 28134 },
    { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', exchange: 'Binance', last: 3542.51, changePct24h: -0.62, volume24h: 192340 },
    { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', exchange: 'Binance', last: 168.32, changePct24h: 3.91, volume24h: 914233 },
    { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', exchange: 'Binance', last: 612.43, changePct24h: -1.05, volume24h: 58321 },
    { symbol: 'XRP/USDT', base: 'XRP', quote: 'USDT', exchange: 'Binance', last: 0.6214, changePct24h: 0.14, volume24h: 28412312 },
]);

function normalizeQuery(value: string) {
    return value.trim().toUpperCase();
}

const visiblePairs = computed(() => {
    const q = normalizeQuery(query.value);
    return pairs.value
        .filter((item) => (exchange.value === 'ALL' ? true : item.exchange === exchange.value))
        .filter((item) => (quote.value === 'ALL' ? true : item.quote === quote.value))
        .filter((item) => (!q ? true : item.symbol.includes(q) || item.base.includes(q) || item.quote.includes(q)));
});

const emptyHint = computed(() => {
    if (!pairs.value.length) return t('暂无交易对数据');
    return t('未找到匹配的交易对');
});
</script>

<template>
    <div class="space-y-10 py-6">
        <section class="space-y-3">
            <div class="flex flex-wrap items-center gap-3">
                <UBadge color="primary" variant="soft">
                    {{ t('Spot Search') }}
                </UBadge>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ t('搜索现货交易对（不含下单交易）') }}
                </p>
            </div>

            <h1 class="text-2xl font-semibold text-slate-900 dark:text-white sm:text-3xl">
                {{ t('现货目录') }}
            </h1>

            <p class="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {{ t('按交易所与计价币筛选并搜索交易对，后续接入实时行情与深度数据。') }}
            </p>
        </section>

        <UCard class="border border-white/60 bg-white/80 dark:border-slate-900 dark:bg-slate-900/60">
            <template #header>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {{ t('筛选与搜索') }}
                        </p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                            {{ t('先用静态数据占位，后续接 WebSocket 实时更新。') }}
                        </p>
                    </div>

                    <div class="flex flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row sm:justify-end">
                        <UInput
                            v-model="query"
                            icon="i-heroicons-magnifying-glass-20-solid"
                            :placeholder="t('搜索交易对，例如 BTC/USDT')"
                            size="sm"
                            class="sm:w-64"
                        />
                        <USelect
                            v-model="exchange"
                            :items="exchangeOptions"
                            size="sm"
                            class="sm:w-40"
                        />
                        <USelect
                            v-model="quote"
                            :items="quoteOptions"
                            size="sm"
                            class="sm:w-32"
                        />
                    </div>
                </div>
            </template>

            <div class="space-y-3">
                <div class="hidden grid-cols-4 gap-3 px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:grid">
                    <div>{{ t('交易对') }}</div>
                    <div class="text-right">{{ t('现货目录列最新价') }}</div>
                    <div class="text-right">{{ t('24h') }}</div>
                    <div class="text-right">{{ t('成交量') }}</div>
                </div>

                <div class="divide-y divide-slate-100/80 rounded-lg border border-slate-200/60 dark:divide-slate-800/60 dark:border-slate-800/60">
                    <div
                        v-for="item in visiblePairs"
                        :key="`${item.exchange}-${item.symbol}`"
                        class="grid grid-cols-2 gap-3 px-3 py-3 text-sm sm:grid-cols-4 sm:items-center"
                    >
                        <div class="min-w-0">
                            <p class="truncate font-semibold text-slate-900 dark:text-white">
                                {{ item.symbol }}
                            </p>
                            <p class="text-xs text-slate-500 dark:text-slate-400">
                                {{ item.exchange }}
                            </p>
                        </div>

                        <div class="text-right tabular-nums text-slate-900 dark:text-white">
                            {{ item.last.toLocaleString(undefined, { maximumFractionDigits: 8 }) }}
                        </div>

                        <div
                            class="text-right tabular-nums"
                            :class="item.changePct24h >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
                        >
                            {{ item.changePct24h >= 0 ? '+' : '' }}{{ item.changePct24h.toFixed(2) }}%
                        </div>

                        <div class="col-span-2 text-right tabular-nums text-slate-600 dark:text-slate-300 sm:col-span-1">
                            {{ item.volume24h.toLocaleString() }}
                        </div>
                    </div>

                    <div v-if="!visiblePairs.length" class="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        {{ emptyHint }}
                    </div>
                </div>
            </div>
        </UCard>
    </div>
</template>

