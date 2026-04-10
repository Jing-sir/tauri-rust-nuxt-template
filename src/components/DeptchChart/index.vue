<script setup lang="ts">
import { useColorMode } from '#imports';
import type { ECharts } from 'echarts/core';
import { useDepthChartHover } from './hooks/useDepthChartHover';
import { useDepthChartMarket } from './hooks/useDepthChartMarket';
import type { DepthPointInput } from './hooks/useDepthChartMarket';
import type { LatestSeries } from './hooks/depthChartTypes';
import { resolveCssVarColor, withUnit } from './hooks/depthChartUtils';
import { useEchartsModule } from './hooks/useEchartsModule';
import { useDepthChartSeries } from './hooks/useDepthChartSeries';
import { useDepthChartOptions } from './hooks/useDepthChartOptions';
import { THEME_FALLBACKS } from '@/utils/themeTokens';

/**
 * Depth Chart component (Binance/OKX-like interaction).
 *
 * Responsibilities:
 * - Wire streams/props -> market stats -> render series
 * - Wire hover interaction overlay (two symmetric dashed lines + two tooltips)
 * - Wire zoom -> adaptive resampling density (fewer points zoomed out, more points zoomed in)
 *
 * Non-goals:
 * - ECharts tooltip is intentionally not used; we render custom tooltips.
 *
 * 为什么不用 ECharts 自带 tooltip/axisPointer:
 * - Binance/OKX 的深度图 hover 是 “以 mid 为中心对称”的双虚线 + 双 tooltip 交互
 * - 需要 tooltip 跟随两条虚线移动，并且在重叠时做避让
 * - 因此这里用 DOM overlay 来画虚线和 tooltip，坐标换算交给 convertToPixel/convertFromPixel
 */
interface Props {
    buyList?: DepthPointInput[];
    sellList?: DepthPointInput[];
    priceText?: string;
    numText?: string;
    decimal?: number;
    priceUnit?: string;
    sizeUnit?: string;
    chartHeight?: number;
    smoothing?: number;
    initialDepthMax?: number;
    level?: 10 | 20;
    speed?: '100ms' | '1000ms';
    showVolume?: boolean;
    depthText?: string;
    speedText?: string;
    volumeText?: string;
    bidText?: string;
    askText?: string;
    spreadText?: string;
    totalText?: string;
    lineColor?: string;
    downColor?: string;
    upColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
    buyList: () => [],
    sellList: () => [],
    priceText: 'Price',
    numText: 'Size',
    decimal: 2,
    priceUnit: '',
    sizeUnit: '',
    chartHeight: 320,
    smoothing: 0.12,
    initialDepthMax: 8,
    level: 10,
    speed: '100ms',
    showVolume: true,
    depthText: 'Depth',
    speedText: 'Speed',
    volumeText: 'Volume',
    bidText: 'Bid',
    askText: 'Ask',
    spreadText: 'Spread',
    totalText: 'Total',
    lineColor: '',
    downColor: '',
    upColor: '',
});

const emit = defineEmits<{
    (event: 'update:level', value: 10 | 20): void;
    (event: 'update:speed', value: '100ms' | '1000ms'): void;
    (event: 'update:showVolume', value: boolean): void;
}>();

const colorMode = useColorMode();
const containerRef = shallowRef<HTMLDivElement | null>(null);
const chartInstance = shallowRef<ECharts | null>(null);
const resizeObserver = shallowRef<ResizeObserver | null>(null);

// Render scheduling:
// - renderHandle: rAF handle for rendering
// - throttleHandle: setTimeout handle used to enforce minimal interval (speed option)
// 说明:
// - depth 数据更新频率很高，直接在每次更新都 setOption 容易卡顿
// - 这里用 “最小间隔 + rAF 合并” 的方式，把多次 reactive 变更合并成一帧内的一次渲染
let renderHandle: number | null = null,
    throttleHandle: number | null = null,
    lastRenderAt = 0,
    pendingFullUpdate = false,
    // wheel zoom state (declared here to satisfy `one-var` lint rule)
    wheelRaf: number | null = null,
    wheelAcc = 0;

// Used to adapt point density to current container size.
// 宽度越大，允许显示更多点；宽度越小，自动聚合更多价位档位，避免曲线太密集。
const chartWidth = shallowRef<number>(0);

// Keep latest rendered series so hover tooltip queries match current visual series.
// 关键点:
// - series 会根据缩放/宽度做聚合抽稀（自适应密度）
// - hover tooltip 必须按 “当前渲染 series” 找最近档位，否则 tooltip 会对不上图形
const latestSeries = shallowRef<LatestSeries>({
    buy: [],
    sell: [],
});

// We keep this flag because hover logic supports both normalized and real-price x axis.
// Current implementation uses real-price x axis, but leaving this flag makes the hover hook reusable.
const normalizedAxisActive = shallowRef(false);

// `zoomSpan` is derived from ECharts dataZoom (end - start). Smaller = zoom in.
// zoomSpan 越小表示越放大:
// - zoom in: 点更多（更细粒度）
// - zoom out: 点更少（更粗粒度）
const zoomSpan = shallowRef<number | null>(null);

// Grid constants must match ECharts grid option so our overlay (dashed lines) stays inside plot area.
// 这些常量要和 ECharts grid 完全一致:
// - hover 虚线要限制在绘图区，不能超过图表高度（用户提过 bug）
const CHART_GRID_TOP = 24;
const CHART_GRID_BOTTOM = 24;
const CHART_GRID_LEFT = 6;
const CHART_GRID_RIGHT = 10;

const { ensureEcharts } = useEchartsModule();

const palette = computed(() => {
    const isDark = colorMode.value === 'dark';
    const mode = isDark ? 'dark' : 'light';

    return {
        text: isDark ? '#e2e8f0' : '#0f172a',
        axis: isDark ? '#94a3b8' : '#64748b',
        split: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.35)',
        line: isDark ? '#38bdf8' : '#0ea5e9',
        buy: isDark ? '#34d399' : '#10b981',
        sell: isDark ? '#fb7185' : '#f43f5e',
        // Mid separator should be a bit more prominent than other guide lines.
        midLine: isDark ? 'rgba(148, 163, 184, 0.55)' : 'rgba(100, 116, 139, 0.55)',
        // Mouse crosshair should be visible but not overpower the mid line.
        crosshair: isDark ? 'rgba(148, 163, 184, 0.55)' : 'rgba(51, 65, 85, 0.45)',
        // Tooltip surfaces are centralized in global theme tokens.
        // NOTE: DepthChart uses custom DOM tooltips (Tailwind classes) today,
        // but we keep these here for consistency with other charts.
        tooltipBg: resolveCssVarColor('var(--app-tooltip-bg)', THEME_FALLBACKS[mode].tooltipBg),
        tooltipBorder: resolveCssVarColor('var(--app-tooltip-border)', THEME_FALLBACKS[mode].tooltipBorder),
    };
});

// Hover marker colors should match series colors (support CSS var overrides via props).
const resolvedBuyColor = computed(() => resolveCssVarColor(props.upColor, palette.value.buy));
const resolvedSellColor = computed(() => resolveCssVarColor(props.downColor, palette.value.sell));

const levelOptions = [10, 20] as const;
const speedOptions = ['100ms', '1000ms'] as const;

const resolvedLevel = computed(() => (levelOptions.includes(props.level) ? props.level : 10));
const resolvedSpeed = computed(() => (speedOptions.includes(props.speed) ? props.speed : '100ms'));
const showVolume = computed(() => props.showVolume);
const smoothingFactor = computed(() => {
    const value = Number(props.smoothing);
    if (!Number.isFinite(value)) return 0.2;
    return Math.min(1, Math.max(0, value));
});
const renderInterval = computed(() => (resolvedSpeed.value === '1000ms' ? 500 : 200));
const initialDepthMax = computed(() => {
    const value = Number(props.initialDepthMax);
    if (!Number.isFinite(value) || value <= 0) return 8;
    return value;
});

// ===== zoom (wheel) =====
// 我们自己维护一个 zoomSpan（可视窗口占完整窗口的百分比）。
// - 100: 全量视图
// - 越小: 越放大
// 这样可以同时满足:
// - mid 始终居中
// - x 轴固定 5 个刻度（由当前可视 xRange 决定）
const zoomSpanPct = shallowRef<number>(100);
watch(zoomSpanPct, (v) => {
    zoomSpan.value = v;
});

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const handleWheelZoom = (event: WheelEvent) => {
    // Ctrl/⌘ + 滚轮属于浏览器页面缩放手势，这里不触发图表缩放。
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        return;
    }

    // 只允许在图表区域缩放，阻止页面滚动
    event.preventDefault();
    wheelAcc += event.deltaY;
    if (wheelRaf !== null || typeof window === 'undefined') return;

    wheelRaf = window.requestAnimationFrame(() => {
        wheelRaf = null;
        const delta = wheelAcc;
        wheelAcc = 0;

        // trackpad deltaY 很小、鼠标滚轮 deltaY 很大，这里做一个“对数式”缩放因子更稳
        const step = Math.exp(Math.min(120, Math.max(-120, delta)) * 0.0025);
        const next = clampNumber(zoomSpanPct.value * step, 5, 100);

        if (Math.abs(next - zoomSpanPct.value) < 0.01) return;
        zoomSpanPct.value = next;
        scheduleRender(false);
    });
};

// ============ 市场统计与 mid 计算（hook） ============

const { parsedData, bestBid, bestAsk, midPrice, spread, spreadPct } = useDepthChartMarket({
    buyList: computed(() => props.buyList),
    sellList: computed(() => props.sellList),
});

/**
 * Base "desired density" driven by pixel width.
 * Actual density still depends on zoomSpan (see useDepthChartSeries).
 */
const baseBinsPerSide = computed(() => {
    // Roughly keep a point every ~10-14px per side, clamped.
    const width = chartWidth.value || containerRef.value?.getBoundingClientRect().width || 0;
    const points = Math.round(width / 24) * 3; // ~ width/8 total points -> /16 per side; scaled a bit
    return Math.min(140, Math.max(50, points));
});

// Build series and yMax with adaptive resampling density.
const { computeRenderData, reset: resetSeries } = useDepthChartSeries({
    smoothingFactor,
    initialDepthMax,
    zoomSpan,
    baseBinsPerSide,
});

// ============ 优化：统一格式化函数 ============

const formatValue = (value: number | null | undefined, unit: string) => {
    if (value === null || value === undefined) return '--';
    return withUnit(value, props.decimal, unit);
};

const bestBidText = computed(() => formatValue(bestBid.value, props.priceUnit));
const bestAskText = computed(() => formatValue(bestAsk.value, props.priceUnit));
const spreadText = computed(() => formatValue(spread.value, props.priceUnit));
const spreadPctText = computed(() => {
    const pct = spreadPct.value;
    return pct === null ? '--' : `${pct.toFixed(2)}%`;
});

const hoverBidText = computed(() => formatValue(hoverInfo.value?.bidPrice, props.priceUnit));
const hoverAskText = computed(() => formatValue(hoverInfo.value?.askPrice, props.priceUnit));
const hoverSpreadText = computed(() => formatValue(hoverInfo.value?.spread, props.priceUnit));
const hoverBidTotalText = computed(() => formatValue(hoverInfo.value?.bidTotal, props.sizeUnit));
const hoverAskTotalText = computed(() => formatValue(hoverInfo.value?.askTotal, props.sizeUnit));
const hoverBidAmountText = computed(() => formatValue(hoverInfo.value?.bidAmount, props.sizeUnit));
const hoverAskAmountText = computed(() => formatValue(hoverInfo.value?.askAmount, props.sizeUnit));

const chartHeight = computed(() => props.chartHeight);

// Hover logic draws symmetric dashed lines around mid and positions tooltips.
// hover 行为要点（复刻 Binance/OKX）:
// - 不画鼠标所在位置的竖直 crosshair
// - 以 mid 为中心，计算鼠标到 mid 的水平距离 distance
// - 在 mid 左右画两条关于 mid 对称的虚线，并分别展示 bid/ask 最近档位信息
const {
    hoverActive,
    hoverBidXClamped,
    hoverAskXClamped,
    hoverTooltipLayout,
    hoverLineTop,
    hoverLineHeight,
    hoverInfo,
    hoverBidPointPx,
    hoverAskPointPx,
    hoverMaskLayout,
    hoverMouseXInGrid,
    midLineXInGrid,
    handlePointerMove,
    handlePointerLeave,
    syncGridRectFromChart,
    syncHoverInfoFromSeries,
    dispose: disposeHover,
} = useDepthChartHover({
    containerRef,
    chartInstance,
    latestSeries,
    midPrice,
    normalizedAxisActive,
    chartHeight,
    gridTop: CHART_GRID_TOP,
    gridBottom: CHART_GRID_BOTTOM,
});

const hoverMaskBase = computed(() => {
    const layout = hoverMaskLayout.value;
    if (!layout) return null;
    const plotWidth = Math.max(1, layout.xMax - layout.xMin);

    const greenScale = Math.min(1, Math.max(0, layout.greenWidth / plotWidth));
    const redScale = Math.min(1, Math.max(0, layout.redWidth / plotWidth));

    return { left: layout.xMin, plotWidth, greenScale, redScale };
});

// ============ 控制函数 ============

const setLevel = (value: 10 | 20) => {
    if (value !== resolvedLevel.value) {
        emit('update:level', value);
    }
};

const setSpeed = (value: '100ms' | '1000ms') => {
    if (value !== resolvedSpeed.value) {
        emit('update:speed', value);
    }
};

const toggleVolume = () => {
    emit('update:showVolume', !showVolume.value);
};

const { buildBaseOptions, buildSeries } = useDepthChartOptions({
    palette: computed(() => ({
        text: palette.value.text,
        axis: palette.value.axis,
        midLine: palette.value.midLine,
    })),
    decimal: computed(() => props.decimal),
    grid: { top: CHART_GRID_TOP, bottom: CHART_GRID_BOTTOM, left: CHART_GRID_LEFT, right: CHART_GRID_RIGHT },
});

// ============ 图表渲染 ============

const renderChart = async (fullUpdate = false) => {
    if (!containerRef.value) return;

    // Ensure ECharts runtime is loaded and chart instance is created once.
    const echarts = await ensureEcharts();
    if (!chartInstance.value) {
        chartInstance.value = echarts.init(containerRef.value, undefined, {
            renderer: 'canvas',
        });
    }

    const { buy, sell, stats } = parsedData.value;
    const midPriceValue = midPrice.value;
    const renderData = computeRenderData({
        buy,
        sell,
        midPriceValue,
        buyMin: stats.buyMin,
        sellMax: stats.sellMax,
    });

    // 注意:
    // - latestSeries 给 hover tooltip 用（查最近档位）
    // - 这里存 buyData/sellData（真实 price + amount + cumulative）
    // - displaySeries 是“补边/补 mid 锚点”的展示数据（amount=0），不应该用来算 tooltip 档位
    latestSeries.value = { buy: renderData.buyData, sell: renderData.sellData };

    const lineColor = resolveCssVarColor(props.lineColor, palette.value.line);
    const buyColor = resolveCssVarColor(props.upColor, palette.value.buy);
    const sellColor = resolveCssVarColor(props.downColor, palette.value.sell);

    normalizedAxisActive.value = renderData.hasNormalizedAxis;

    const { priceUnit } = props;
    const { sizeUnit } = props;

    if (fullUpdate) {
        // Full update: replace options entirely (theme / units / grid changes).
        // 一般在这些场景触发 full update:
        // - 主题切换/颜色变化
        // - 单位/小数位变化（axisLabel formatter 变化）
        // - 高度变化（grid/overlay 需要重新同步）
        chartInstance.value.setOption(
            {
                ...buildBaseOptions({
                    lineColor,
                    priceUnit,
                    sizeUnit,
                    midPriceValue,
                    buyScale: renderData.buyScale,
                    sellScale: renderData.sellScale,
                    xRange: renderData.xRange,
                    yMax: renderData.yMax,
                    yInterval: renderData.yInterval,
                }),
                series: buildSeries({
                    echarts,
                    buyData: renderData.displaySeries.buy,
                    sellData: renderData.displaySeries.sell,
                    midPriceValue,
                    midAxisValue: renderData.midAxisValue,
                    buyColor,
                    sellColor,
                    xRange: renderData.xRange,
                }),
            },
            true
        );
        syncGridRectFromChart();
        syncHoverInfoFromSeries();
        return;
    }

    // Partial update: keep option object stable, only replace series/yAxis/xAxis range.
    // 高频更新走 partial update:
    // - 避免每次都重建完整 option
    // - 只更新 series + yAxis.max + xAxis range，性能更稳
    chartInstance.value.setOption(
        {
            yAxis: { max: renderData.yMax ?? undefined, interval: renderData.yInterval ?? undefined },
            xAxis: {
                min: renderData.xRange ? renderData.xRange.min : undefined,
                max: renderData.xRange ? renderData.xRange.max : undefined,
            },
            series: buildSeries({
                echarts,
                buyData: renderData.displaySeries.buy,
                sellData: renderData.displaySeries.sell,
                midPriceValue,
                midAxisValue: renderData.midAxisValue,
                buyColor,
                sellColor,
                xRange: renderData.xRange,
            }),
        },
        {
            notMerge: false,
            replaceMerge: ['series'],
            lazyUpdate: true,
        }
    );
    syncGridRectFromChart();
    syncHoverInfoFromSeries();
};

/**
 * Render scheduler:
 * - Applies a minimal interval based on speed option (100ms vs 1000ms).
 * - Uses rAF for coalescing multiple reactive changes into a single render.
 */
const scheduleRender = (fullUpdate: boolean) => {
    if (typeof window === 'undefined') return;
    if (fullUpdate) {
        pendingFullUpdate = true;
    }

    if (renderHandle !== null || throttleHandle !== null) {
        return;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - lastRenderAt;
    const wait = Math.max(0, renderInterval.value - elapsed);

    if (wait > 0) {
        throttleHandle = window.setTimeout(() => {
            throttleHandle = null;
            renderHandle = window.requestAnimationFrame(async () => {
                renderHandle = null;
                lastRenderAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
                const shouldFull = pendingFullUpdate;
                pendingFullUpdate = false;
                await renderChart(shouldFull);
            });
        }, wait);
        return;
    }

    renderHandle = window.requestAnimationFrame(async () => {
        renderHandle = null;
        lastRenderAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const shouldFull = pendingFullUpdate;
        pendingFullUpdate = false;
        await renderChart(shouldFull);
    });
};

// 说明:
// - 之前用 ECharts dataZoom 来做缩放，但很难保证 x 轴固定 5 个刻度
// - 现在改为组件 wheel 缩放: 只更新 zoomSpanPct，然后用 xRange(min/max) 控制当前可视窗口

// ============ 生命周期 ============

onMounted(() => {
    scheduleRender(true);

    if (containerRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver.value = new ResizeObserver(() => {
            chartInstance.value?.resize();
            syncGridRectFromChart();
            // 记录最新宽度用于 “自适应点密度” 计算（baseBinsPerSide）。
            const width = containerRef.value?.getBoundingClientRect().width;
            chartWidth.value = typeof width === 'number' && Number.isFinite(width) ? width : 0;
        });
        resizeObserver.value.observe(containerRef.value);
        const { width } = containerRef.value.getBoundingClientRect();
        chartWidth.value = typeof width === 'number' && Number.isFinite(width) ? width : 0;
    }

    // Wheel zoom:
    // - Use capture phase so we still get the event even if ECharts stops bubbling.
    // - Use passive:false so preventDefault() actually blocks page scroll.
    if (containerRef.value && typeof window !== 'undefined') {
        containerRef.value.addEventListener('wheel', handleWheelZoom, {
            capture: true,
            passive: false,
        });
    }
});

// 优化：合并 watch 监听
watch(
    [() => props.buyList, () => props.sellList],
    () => {
        if (!chartInstance.value) return;
        // 深度数据更新走轻量渲染（series/yMax/xRange）。
        scheduleRender(false);
    },
    { deep: false }
);

watch(
    [
        () => props.decimal,
        () => props.priceUnit,
        () => props.sizeUnit,
        () => props.chartHeight,
        () => props.smoothing,
        () => props.initialDepthMax,
        () => props.lineColor,
        () => props.upColor,
        () => props.downColor,
        () => colorMode.value,
    ],
    () => {
        if (!chartInstance.value) return;
        // 这些属性会影响 formatter/颜色/布局，走 full update 更安全。
        scheduleRender(true);
    },
    { deep: false }
);

onBeforeUnmount(() => {
    if (renderHandle !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(renderHandle);
        renderHandle = null;
    }
    if (throttleHandle !== null && typeof window !== 'undefined') {
        window.clearTimeout(throttleHandle);
        throttleHandle = null;
    }
    if (wheelRaf !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(wheelRaf);
        wheelRaf = null;
    }
    if (containerRef.value && typeof window !== 'undefined') {
        containerRef.value.removeEventListener('wheel', handleWheelZoom, true);
    }
    disposeHover();
    resetSeries();
    resizeObserver.value?.disconnect();
    resizeObserver.value = null;
    chartInstance.value?.dispose();
    chartInstance.value = null;
});
</script>

<template>
    <div class="grid h-full w-full gap-3">
        <div class="relative h-full w-full px-2">
            <div class="flex flex-wrap items-start justify-between gap-3 pb-2">
                <div
                    class="pointer-events-none flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500 dark:text-slate-400"
                >
                    <span class="text-emerald-500">
                        {{ props.bidText }} {{ hoverActive ? hoverBidText : bestBidText }}
                    </span>
                    <span class="text-rose-500">
                        {{ props.askText }} {{ hoverActive ? hoverAskText : bestAskText }}
                    </span>
                    <span>
                        {{ props.spreadText }}
                        {{ hoverActive ? hoverSpreadText : spreadText }}
                        ({{ spreadPctText }})
                    </span>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span class="text-slate-400">{{ props.depthText }}</span>
                    <div
                        class="inline-flex overflow-hidden rounded-md border border-slate-200/60 dark:border-slate-700/60"
                    >
                        <button
                            v-for="option in levelOptions"
                            :key="option"
                            type="button"
                            class="px-2 py-1 text-[11px] font-medium transition"
                            :class="
                                option === resolvedLevel
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            "
                            :aria-pressed="option === resolvedLevel"
                            @click="setLevel(option)"
                        >
                            {{ option }}
                        </button>
                    </div>

                    <span class="text-slate-400">{{ props.speedText }}</span>
                    <div
                        class="inline-flex overflow-hidden rounded-md border border-slate-200/60 dark:border-slate-700/60"
                    >
                        <button
                            v-for="option in speedOptions"
                            :key="option"
                            type="button"
                            class="px-2 py-1 text-[11px] font-medium transition"
                            :class="
                                option === resolvedSpeed
                                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            "
                            :aria-pressed="option === resolvedSpeed"
                            @click="setSpeed(option)"
                        >
                            {{ option }}
                        </button>
                    </div>

                    <button
                        type="button"
                        class="rounded-md border border-slate-200/60 px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:text-slate-700 dark:border-slate-700/60 dark:text-slate-400 dark:hover:text-slate-200"
                        :class="showVolume ? 'bg-slate-900/5 dark:bg-white/5' : ''"
                        :aria-pressed="showVolume"
                        @click="toggleVolume"
                    >
                        {{ props.volumeText }}
                    </button>
                </div>
            </div>

            <div
                class="relative w-full"
                :style="{ height: `${props.chartHeight}px` }"
                @mousemove="handlePointerMove"
                @mouseleave="handlePointerLeave"
            >
                <div ref="containerRef" class="h-full w-full" />

                <!-- Binance-like hover highlight masks -->
                <div
                    v-if="hoverMaskBase"
                    class="pointer-events-none absolute z-10 rounded-[1px]"
                    :style="{
                        left: `${hoverMaskBase.left}px`,
                        top: `${hoverLineTop}px`,
                        height: `${hoverLineHeight}px`,
                        width: `${hoverMaskBase.plotWidth}px`,
                        backgroundImage:
                            'linear-gradient(90deg, rgba(16, 185, 129, 0.14) 0%, rgba(16, 185, 129, 0.10) 65%, rgba(16, 185, 129, 0) 100%)',
                        transformOrigin: 'left',
                        transform: `scaleX(${hoverMaskBase.greenScale})`,
                        transition: 'transform 110ms cubic-bezier(0.2, 0.0, 0.2, 1)',
                        willChange: 'transform',
                    }"
                />
                <div
                    v-if="hoverMaskBase"
                    class="pointer-events-none absolute z-10 rounded-[1px]"
                    :style="{
                        left: `${hoverMaskBase.left}px`,
                        top: `${hoverLineTop}px`,
                        height: `${hoverLineHeight}px`,
                        width: `${hoverMaskBase.plotWidth}px`,
                        backgroundImage:
                            'linear-gradient(90deg, rgba(244, 63, 94, 0) 0%, rgba(244, 63, 94, 0.10) 35%, rgba(244, 63, 94, 0.14) 100%)',
                        transformOrigin: 'right',
                        transform: `scaleX(${hoverMaskBase.redScale})`,
                        transition: 'transform 110ms cubic-bezier(0.2, 0.0, 0.2, 1)',
                        willChange: 'transform',
                    }"
                />

                <!-- Vertical crosshair at mouse price (Binance-like) -->
                <div
                    v-if="hoverMouseXInGrid !== null"
                    class="pointer-events-none absolute left-0 z-20 border-l"
                    :style="{
                        transform: `translateX(${hoverMouseXInGrid}px)`,
                        top: `${hoverLineTop}px`,
                        height: `${hoverLineHeight}px`,
                        borderColor: palette.crosshair ?? palette.midLine,
                        willChange: 'transform',
                    }"
                />

                <!-- Symmetric hover guide lines for bid/ask tooltips -->
                <div
                    v-if="hoverActive"
                    class="pointer-events-none absolute left-0 z-20 border-l"
                    :style="{
                        transform: `translateX(${hoverBidXClamped}px)`,
                        top: `${hoverLineTop}px`,
                        height: `${hoverLineHeight}px`,
                        borderColor: resolvedBuyColor,
                        opacity: 0.7,
                        willChange: 'transform',
                    }"
                />
                <div
                    v-if="hoverActive"
                    class="pointer-events-none absolute left-0 z-20 border-l"
                    :style="{
                        transform: `translateX(${hoverAskXClamped}px)`,
                        top: `${hoverLineTop}px`,
                        height: `${hoverLineHeight}px`,
                        borderColor: resolvedSellColor,
                        opacity: 0.7,
                        willChange: 'transform',
                    }"
                />

                <!-- Mid separator line stays constant regardless of hover -->
                <div
                    v-if="midLineXInGrid !== null"
                    class="pointer-events-none absolute left-0 border-l"
                    :style="{
                        transform: `translateX(${midLineXInGrid}px)`,
                        top: `${hoverLineTop}px`,
                        height: `${hoverLineHeight}px`,
                        borderColor: palette.midLine,
                        borderLeftWidth: '1.25px',
                        zIndex: 25,
                        willChange: 'transform',
                    }"
                />

                <!-- Hover points on buy/sell curves (Binance/OKX-like) -->
                <div
                    v-if="hoverActive && hoverBidPointPx"
                    class="pointer-events-none absolute z-30 h-2.5 w-2.5 rounded-full"
                    :style="{
                        left: `${hoverBidPointPx.x - 5}px`,
                        top: `${hoverBidPointPx.y - 5}px`,
                        backgroundColor: resolvedBuyColor,
                        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.18)',
                    }"
                />
                <div
                    v-if="hoverActive && hoverAskPointPx"
                    class="pointer-events-none absolute z-30 h-2.5 w-2.5 rounded-full"
                    :style="{
                        left: `${hoverAskPointPx.x - 5}px`,
                        top: `${hoverAskPointPx.y - 5}px`,
                        backgroundColor: resolvedSellColor,
                        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.18)',
                    }"
                />

                <!-- Bid tooltip -->
                <div
                    v-if="hoverActive"
                    class="pointer-events-none absolute z-30 min-w-[160px] rounded-md border border-emerald-200/70 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-lg backdrop-blur dark:border-emerald-900/60 dark:bg-slate-900/95 dark:text-slate-100"
                    :style="{ top: `${hoverTooltipLayout.bidTop}px`, left: `${hoverTooltipLayout.bidLeft}px` }"
                >
                    <div class="text-[10px] uppercase tracking-wide text-emerald-500">
                        {{ props.bidText }}
                    </div>

                    <div class="mt-1 flex items-center justify-between gap-2">
                        <span class="text-slate-500 dark:text-slate-400">
                            {{ props.priceText }}
                        </span>
                        <span class="tabular-nums text-emerald-500">
                            {{ hoverBidText }}
                        </span>
                    </div>

                    <div class="flex items-center justify-between gap-2">
                        <span class="text-slate-500 dark:text-slate-400">
                            {{ props.numText }}
                        </span>
                        <span class="tabular-nums">
                            {{ hoverBidAmountText }}
                        </span>
                    </div>

                    <div class="flex items-center justify-between gap-2">
                        <span class="text-slate-500 dark:text-slate-400">
                            {{ props.totalText }}
                        </span>
                        <span class="tabular-nums">
                            {{ hoverBidTotalText }}
                        </span>
                    </div>
                </div>

                <!-- Ask tooltip -->
                <div
                    v-if="hoverActive"
                    class="pointer-events-none absolute z-30 min-w-[160px] rounded-md border border-rose-200/70 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-lg backdrop-blur dark:border-rose-900/60 dark:bg-slate-900/95 dark:text-slate-100"
                    :style="{ top: `${hoverTooltipLayout.askTop}px`, left: `${hoverTooltipLayout.askLeft}px` }"
                >
                    <div class="text-[10px] uppercase tracking-wide text-rose-500">
                        {{ props.askText }}
                    </div>

                    <div class="mt-1 flex items-center justify-between gap-2">
                        <span class="text-slate-500 dark:text-slate-400">
                            {{ props.priceText }}
                        </span>
                        <span class="tabular-nums text-rose-500">
                            {{ hoverAskText }}
                        </span>
                    </div>

                    <div class="flex items-center justify-between gap-2">
                        <span class="text-slate-500 dark:text-slate-400">
                            {{ props.numText }}
                        </span>
                        <span class="tabular-nums">
                            {{ hoverAskAmountText }}
                        </span>
                    </div>

                    <div class="flex items-center justify-between gap-2">
                        <span class="text-slate-500 dark:text-slate-400">
                            {{ props.totalText }}
                        </span>
                        <span class="tabular-nums">
                            {{ hoverAskTotalText }}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
