<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useColorMode, useI18n } from '#imports';
import type { BinanceInterval } from '~/composables/useBinanceKlineStream';
import { useBinanceKlineStream } from '~/composables/useBinanceKlineStream';
import { THEME_FALLBACKS } from '@/utils/themeTokens';

interface Props {
    symbol?: string
    interval?: BinanceInterval
    maxCandles?: number
    latestPrice?: number | null
    latestSide?: 'buy' | 'sell' | null
}

const props = withDefaults(defineProps<Props>(), {
    symbol: 'btcusdt',
    interval: '15m',
    maxCandles: 500,
    latestPrice: null,
    latestSide: null,
});

const colorMode = useColorMode();
const { locale, t } = useI18n();

const isDark = computed(() => colorMode.value === 'dark');

// K 线直接使用 JS stream，不再经过 WASM 聚合链路。
const { candles, latestCandle, lastPrice, isConnected } = useBinanceKlineStream({
    symbol: toRef(props, 'symbol'),
    interval: toRef(props, 'interval'),
    maxCandles: toRef(props, 'maxCandles'),
});

const tradingViewLocaleMap: Record<string, string> = {
    'en-US': 'en',
    'zh-CN': 'zh_CN',
    'ru-RU': 'ru',
    'ar-AE': 'ar',
};

const intervalMap: Record<BinanceInterval, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '1h': '60',
};

const normalizedSymbol = computed(() => props.symbol.toUpperCase());
const tradingViewSymbol = computed(() => `BINANCE:${normalizedSymbol.value}`);

const resolveCssVar = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    return value || fallback;
};

/**
 * 统一读取 theme tokens
 */
const themeTokens = computed(() => {
    const mode = isDark.value ? 'dark' : 'light';
    const fallback = THEME_FALLBACKS[mode];

    return {
        chartBg: resolveCssVar('--app-chart-bg', fallback.chartBg),
        pageBg: resolveCssVar('--app-page-bg', fallback.pageBg),
        pageFg: resolveCssVar('--app-page-fg', fallback.pageFg),
    };
});

const chartOptions = computed(() => ({
    autosize: true,
    symbol: tradingViewSymbol.value,
    interval: intervalMap[props.interval],
    timezone: 'Etc/UTC',
    theme: isDark.value ? 'dark' : 'light',
    style: '1',
    locale: tradingViewLocaleMap[locale.value] ?? 'en',

    backgroundColor: themeTokens.value.chartBg,
    toolbar_bg: themeTokens.value.pageBg,
    loading_screen: {
        backgroundColor: themeTokens.value.chartBg,
        foregroundColor: isDark.value ? '#e2e8f0' : '#0f172a',
    },
    gridColor: isDark.value ? '#1f2937' : '#cbd5f5',
    hide_side_toolbar: true,
    hide_top_toolbar: true,
    allow_symbol_change: false,
    container_id: `tv-${normalizedSymbol.value}`,
}));

const chartKey = computed(
    () =>
        `${chartOptions.value.symbol}-${chartOptions.value.theme}-${chartOptions.value.locale}-${themeTokens.value.pageBg}`,
);

const statusText = computed(() =>
    isConnected.value ? t('实时连接') : t('连接中'),
);

const showOverlay = computed(
    () => !isConnected.value && candles.value.length === 0,
);

const pricePanel = computed(() => {
    const displayPrice = (typeof props.latestPrice === 'number' ? props.latestPrice : null)
        ?? (typeof lastPrice.value === 'number' ? lastPrice.value : null)
        ?? latestCandle.value?.close
        ?? candles.value[candles.value.length - 1]?.close
        ?? null;

    if (displayPrice === null) {
        return null;
    }

    const basePrice = candles.value[0]?.close ?? null;
    const change = basePrice !== null ? displayPrice - basePrice : 0;
    const changePct = basePrice !== null && basePrice !== 0 ? (change / basePrice) * 100 : 0;

    return {
        price: displayPrice,
        side: props.latestSide,
        change,
        changePct,
    };
});
</script>

<template>
    <div class="relative h-full w-full chart-container">
        <Chart
            :key="chartKey"
            class="h-full w-full rounded-lg"
            :options="chartOptions"
        />

        <!-- price panel -->
        <div
            class="pointer-events-none absolute left-4 top-4 rounded-lg px-3 py-2 text-xs font-medium shadow"
            :style="{
                background: 'var(--app-tooltip-bg)',
                color: 'var(--app-page-fg)'
            }"
        >
            <p class="text-[10px] uppercase tracking-wide opacity-70">
                {{ normalizedSymbol }}

                <span
                    class="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[10px]"
                    :class="
                        isConnected
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-100'
                    "
                >
                    <span
                        class="block h-2 w-2 rounded-full"
                        :class="isConnected ? 'bg-emerald-500' : 'bg-amber-500'"
                    />
                    {{ statusText }}
                </span>
            </p>

            <div
                v-if="pricePanel"
                class="mt-1 text-base font-semibold leading-tight"
            >
                <span
                    :class="
                        pricePanel.side === 'buy'
                            ? 'text-emerald-500'
                            : pricePanel.side === 'sell'
                                ? 'text-rose-500'
                                : ''
                    "
                >
                    {{
                        pricePanel.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })
                    }}
                </span>

                <span
                    class="ml-2 text-xs font-medium"
                    :class="
                        pricePanel.change >= 0
                            ? 'text-emerald-500'
                            : 'text-rose-500'
                    "
                >
                    {{ pricePanel.change >= 0 ? '+' : '' }}
                    {{ pricePanel.change.toFixed(2) }}

                    ({{ pricePanel.changePct >= 0 ? '+' : '' }}
                    {{ pricePanel.changePct.toFixed(2) }}%)
                </span>
            </div>
        </div>

        <!-- overlay -->
        <div
            v-if="showOverlay"
            class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-sm font-medium"
            :style="{
                background: 'var(--app-chart-bg)',
                opacity: 0.7,
                color: 'var(--app-page-fg)'
            }"
        >
            {{ statusText }}
        </div>
    </div>
</template>
