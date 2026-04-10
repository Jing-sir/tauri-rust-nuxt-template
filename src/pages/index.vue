<script setup lang="ts">
import DepthChart from '~/components/DepthChart.vue';
import OrderBook from '~/components/OrderBook.vue';
import LineChart from '~/views/home/LineChart.vue';
import StreamingChart from '~/views/home/StreamingChart.vue';
import { useBinanceDepthStream } from '@/composables/useBinanceDepthStream';
const { t } = useI18n();

const chartSymbol = 'btcusdt';
const chartInterval = '15m';
const chartMaxCandles = 400;
const lineLabels = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '21:00', '22:30'];
const lineValues = [42, 46, 44, 52, 48, 55, 51, 58, 54, 49];
const chartPair = computed(() => chartSymbol.toUpperCase().replace('USDT', '/USDT'));
const depthLevel = shallowRef<10 | 20>(10);
const depthSpeed = shallowRef<'100ms' | '1000ms'>('100ms');
const showDepthVolume = shallowRef(true);
const depthLimit = computed(() => (depthLevel.value === 20 ? 1000 : 500));
const { bids: depthBuyList, asks: depthSellList } = useBinanceDepthStream({
    symbol: chartSymbol,
    mode: 'diff',
    limit: depthLimit,
    speed: depthSpeed,
    engine: 'wasm-worker',
});

const stats = computed(() => [
    { label: t('链路延迟'), value: '< 50ms' },
    { label: t('支持资产'), value: '120+' },
    { label: t('告警成功率'), value: '99.95%' },
    { label: t('监控时段'), value: '24/7' },
]);

const metrics = computed(() => [
    {
        title: t('多市场流动性'),
        description: t('连接十余家主流交易所的 WebSocket，实时同轴推送高频报价数据。'),
    },
    {
        title: t('自定义告警'),
        description: t('通过可视化条件与 Nuxt 服务器任务组合，秒级触发风控策略。'),
    },
    {
        title: t('端到端安全'),
        description: t('提供 2FA、令牌隔离与审计日志，满足团队级别的安全要求。'),
    },
]);

const checklist = computed(() => [t('接入 TradingView Chart 组件，秒级渲染蜡烛图。'), t('SSR + 客户端缓存，保证接口往返低于 50ms。'), t('完整的 i18n 配置，支持多语种动态切换。'), t('color-mode 统一处理深浅色与系统偏好。')]);
</script>

<template>
    <div class="space-y-8 py-6">
        <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
                v-for="item in stats"
                :key="item.label"
                class="rounded-xl border border-slate-200/60 bg-white/80 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70"
            >
                <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {{ item.label }}
                </p>
                <p class="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                    {{ item.value }}
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {{ t('Binance 1 分钟级别数据') }}
                </p>
            </div>
        </section>

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <UCard class="border border-slate-200/60 bg-white/90 p-0 shadow-xl dark:border-slate-800/60 dark:bg-slate-900/70">
                <template #header>
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {{ t('BTC/USDT 实时行情') }}
                            </p>
                            <p class="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                                {{ chartPair }}
                            </p>
                            <p class="text-xs text-slate-400">
                                {{ t('Binance 1 分钟级别数据') }}
                            </p>
                        </div>

                        <div class="flex items-center gap-2">
                            <UBadge color="primary" variant="soft">
                                {{ chartPair }}
                            </UBadge>
                            <UButton color="primary" size="xs">
                                {{ t('创建工作区') }}
                            </UButton>
                        </div>
                    </div>
                </template>

                <div class="h-[420px] w-full">
                    <StreamingChart
                        :symbol="chartSymbol"
                        :interval="chartInterval"
                        :max-candles="chartMaxCandles"
                        class="h-full w-full rounded-b-xl"
                    />
                </div>
            </UCard>

            <UCard class="border border-slate-200/60 bg-white/90 p-0 shadow-xl dark:border-slate-800/60 dark:bg-slate-900/70">
                <template #header>
                    <div>
                        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {{ t('盘口') }}
                        </p>
                        <p class="text-sm font-medium text-slate-600 dark:text-slate-300">
                            {{ t('累计流动性快照') }}
                        </p>
                    </div>
                </template>

                <div class="w-full">
                    <OrderBook
                        :buy-list="depthBuyList"
                        :sell-list="depthSellList"
                        :level="depthLevel"
                        :show-volume="showDepthVolume"
                        :price-text="t('价格')"
                        :num-text="t('数量')"
                        :total-text="t('累计')"
                        :levels-text="t('盘口')"
                        :bid-text="t('买盘')"
                        :ask-text="t('卖盘')"
                        :decimal="2"
                        price-unit="USDT"
                        size-unit="BTC"
                    />
                </div>
            </UCard>
        </section>

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <UCard class="border border-slate-200/60 bg-white/90 p-0 shadow-xl dark:border-slate-800/60 dark:bg-slate-900/70">
                <template #header>
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {{ t('盘口深度') }}
                            </p>
                            <p class="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {{ t('累计流动性快照') }}
                            </p>
                        </div>

                        <UBadge color="primary" variant="soft">
                            {{ chartPair }}
                        </UBadge>
                    </div>
                </template>

                <div class="w-full">
                    <DepthChart
                        v-model:level="depthLevel"
                        v-model:speed="depthSpeed"
                        v-model:show-volume="showDepthVolume"
                        :buy-list="depthBuyList"
                        :sell-list="depthSellList"
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
                        :chart-height="320"
                        class="w-full rounded-b-xl"
                    />
                </div>
            </UCard>

            <div class="space-y-6">
                <UCard class="border border-slate-200/60 bg-white/90 dark:border-slate-800/60 dark:bg-slate-900/70">
                    <template #header>
                        <div>
                            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {{ t('首页指标标题') }}
                            </p>
                            <p class="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {{ t('首页指标副文') }}
                            </p>
                        </div>
                    </template>

                    <div class="space-y-3">
                        <div
                            v-for="metric in metrics"
                            :key="metric.title"
                            class="rounded-lg border border-slate-200/60 bg-white/80 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/60"
                        >
                            <p class="text-sm font-semibold text-slate-900 dark:text-white">
                                {{ metric.title }}
                            </p>
                            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {{ metric.description }}
                            </p>
                        </div>
                    </div>
                </UCard>

                <UCard class="border border-slate-200/60 bg-white/90 dark:border-slate-800/60 dark:bg-slate-900/70">
                    <template #header>
                        <div>
                            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {{ t('交付准备就绪') }}
                            </p>
                            <p class="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {{ t('首页清单副文') }}
                            </p>
                        </div>
                    </template>

                    <div class="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                        <div
                            v-for="item in checklist"
                            :key="item"
                            class="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white/80 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/60"
                        >
                            <UIcon name="i-heroicons-check-circle-20-solid" class="h-5 w-5 text-emerald-500" />
                            <span>{{ item }}</span>
                        </div>
                    </div>
                </UCard>
            </div>
        </section>

        <section>
            <UCard class="border border-slate-200/60 bg-white/90 p-0 shadow-xl dark:border-slate-800/60 dark:bg-slate-900/70">
                <template #header>
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {{ t('延迟趋势') }}
                            </p>
                            <p class="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {{ t('近 7 日响应中位数') }}
                            </p>
                        </div>

                        <UBadge color="primary" variant="soft"> 7D </UBadge>
                    </div>
                </template>

                <div class="h-[280px] w-full">
                    <LineChart :labels="lineLabels" :values="lineValues" class="h-full w-full rounded-b-xl" />
                </div>
            </UCard>
        </section>
    </div>
</template>
