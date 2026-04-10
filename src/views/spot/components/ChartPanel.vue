<script setup lang="ts">
import type { BinanceDepthEntry } from '~/composables/useBinanceDepthStream';
import type { BinanceInterval } from '~/composables/useBinanceKlineStream';
import StreamingChart from '~/views/home/StreamingChart.vue';
import DepthChart from '~/components/DepthChart.vue';

const props = defineProps<{
    chartView: 'kline' | 'depth';
    chartInterval: BinanceInterval;
    chartIntervals: Array<{ label: string; value: BinanceInterval }>;
    indicatorOptions: string[];
    activeIndicator: string;
    chartSymbol: string;
    latestPrice?: number | null;
    latestSide?: 'buy' | 'sell' | null;
    depthLevel: 10 | 20;
    depthSpeed: '100ms' | '1000ms';
    showDepthVolume: boolean;
    depthBuyList: BinanceDepthEntry[];
    depthSellList: BinanceDepthEntry[];
}>();

const emit = defineEmits<{
    'update:chartView': [value: 'kline' | 'depth'];
    'update:chartInterval': [value: BinanceInterval];
    'update:activeIndicator': [value: string];
    'update:depthLevel': [value: 10 | 20];
    'update:depthSpeed': [value: '100ms' | '1000ms'];
    'update:showDepthVolume': [value: boolean];
}>();

const { t } = useI18n();

const depthLevelModel = computed({
    get: () => props.depthLevel,
    set: (value) => emit('update:depthLevel', value),
});

const depthSpeedModel = computed({
    get: () => props.depthSpeed,
    set: (value) => emit('update:depthSpeed', value),
});

const showDepthVolumeModel = computed({
    get: () => props.showDepthVolume,
    set: (value) => emit('update:showDepthVolume', value),
});
</script>

<template>
    <div class="rounded-lg bg-white/90 shadow-sm dark:bg-slate-900/70">
        <div class="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
            <div>
                <p class="text-sm font-semibold text-slate-900 dark:text-white">
                    {{ t('K线图') }}
                </p>
                <p class="text-xs text-slate-400">
                    {{ t('时间周期') }}
                </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <div class="flex items-center gap-1 rounded-lg bg-white/80 px-1 py-1 text-xs dark:bg-slate-900/60">
                    <button
                        type="button"
                        class="rounded-md px-2 py-1 font-medium"
                        :class="
                            props.chartView === 'kline'
                                ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-white'
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        "
                        @click="emit('update:chartView', 'kline')"
                    >
                        {{ t('K线图') }}
                    </button>
                    <button
                        type="button"
                        class="rounded-md px-2 py-1 font-medium"
                        :class="
                            props.chartView === 'depth'
                                ? 'bg-slate-900/5 text-slate-900 dark:bg-white/5 dark:text-white'
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        "
                        @click="emit('update:chartView', 'depth')"
                    >
                        {{ t('深度图') }}
                    </button>
                </div>

                <div class="flex items-center gap-1 rounded-lg bg-white/80 px-1 py-1 text-xs dark:bg-slate-900/60">
                    <button
                        v-for="interval in props.chartIntervals"
                        :key="interval.value"
                        type="button"
                        class="rounded-md px-2 py-1 font-medium"
                        :class="
                            props.chartInterval === interval.value
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        "
                        @click="emit('update:chartInterval', interval.value)"
                    >
                        {{ interval.label }}
                    </button>
                </div>

                <div class="flex items-center gap-1 rounded-lg bg-white/80 px-1 py-1 text-xs dark:bg-slate-900/60">
                    <button
                        v-for="indicator in props.indicatorOptions"
                        :key="indicator"
                        type="button"
                        class="rounded-md px-2 py-1 font-medium"
                        :class="
                            props.activeIndicator === indicator
                                ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        "
                        @click="emit('update:activeIndicator', indicator)"
                    >
                        {{ indicator }}
                    </button>
                </div>
            </div>
        </div>

        <div class="h-[420px] w-full">
            <StreamingChart
                v-if="props.chartView === 'kline'"
                :symbol="props.chartSymbol"
                :interval="props.chartInterval"
                :max-candles="400"
                :latest-price="props.latestPrice"
                :latest-side="props.latestSide"
                class="h-full w-full rounded-b-lg"
            />
            <DepthChart
                v-else
                v-model:level="depthLevelModel"
                v-model:speed="depthSpeedModel"
                v-model:show-volume="showDepthVolumeModel"
                :buy-list="props.depthBuyList"
                :sell-list="props.depthSellList"
                :price-text="t('价格')"
                :num-text="t('数量')"
                :depth-text="t('深度档位')"
                :speed-text="t('推送速度')"
                :volume-text="t('成交量')"
                :bid-text="t('买盘')"
                :ask-text="t('卖盘')"
                :spread-text="t('点差')"
                :total-text="t('累计')"
                :decimal="2"
                price-unit="USDT"
                size-unit="BTC"
                :chart-height="420"
                class="h-full w-full rounded-b-lg"
            />
        </div>
    </div>
</template>
