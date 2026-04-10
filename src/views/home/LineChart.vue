<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { useColorMode } from '#imports';
import type { ECharts, EChartsOption } from 'echarts';
import { THEME_FALLBACKS } from '@/utils/themeTokens';

    interface Props {
        labels?: string[];
        values?: number[];
    }

const props = withDefaults(defineProps<Props>(), {
    labels: () => ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '21:00', '22:30'],
    values: () => [42, 46, 44, 52, 48, 55, 51, 58, 54, 49],
});

const colorMode = useColorMode();
const containerRef = shallowRef<HTMLDivElement | null>(null);
const chartInstance = shallowRef<ECharts | null>(null);
const echartsModule = shallowRef<typeof import('echarts') | null>(null);
const resizeObserver = shallowRef<ResizeObserver | null>(null);

const resolveCssVar = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
};

const palette = computed(() => {
    const isDark = colorMode.value === 'dark';
    const mode = isDark ? 'dark' : 'light';

    return {
        text: isDark ? '#e2e8f0' : '#0f172a',
        axis: isDark ? '#94a3b8' : '#64748b',
        split: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.35)',
        line: isDark ? '#34d399' : '#10b981',
        areaTop: isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.28)',
        areaBottom: isDark ? 'rgba(15, 23, 42, 0.05)' : 'rgba(16, 185, 129, 0.02)',
        // Tooltip surfaces are centralized in CSS tokens for light/dark.
        tooltipBg: resolveCssVar('--app-tooltip-bg', THEME_FALLBACKS[mode].tooltipBg),
        tooltipBorder: resolveCssVar('--app-tooltip-border', THEME_FALLBACKS[mode].tooltipBorder),
    };
});

const buildOptions = (echarts: typeof import('echarts')): EChartsOption => ({
    backgroundColor: 'transparent',
    textStyle: {
        color: palette.value.text,
        fontFamily: 'inherit',
    },
    grid: {
        left: 8,
        right: 18,
        top: 24,
        bottom: 24,
        containLabel: true,
    },
    tooltip: {
        trigger: 'axis',
        backgroundColor: palette.value.tooltipBg,
        borderColor: palette.value.tooltipBorder,
        borderWidth: 1,
        textStyle: {
            color: palette.value.text,
            fontSize: 12,
        },
        axisPointer: {
            type: 'line',
            lineStyle: {
                color: palette.value.line,
                width: 1,
                type: 'dashed',
            },
        },
    },
    xAxis: {
        type: 'category',
        data: props.labels,
        boundaryGap: false,
        axisLine: {
            lineStyle: { color: palette.value.axis },
        },
        axisTick: { show: false },
        axisLabel: {
            color: palette.value.axis,
            fontSize: 11,
            margin: 12,
        },
    },
    yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
            color: palette.value.axis,
            fontSize: 11,
        },
        splitLine: {
            lineStyle: { color: palette.value.split },
        },
    },
    series: [
        {
            name: 'Latency',
            type: 'line',
            data: props.values,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
                color: palette.value.line,
                width: 3,
            },
            itemStyle: {
                color: palette.value.line,
                borderColor: palette.value.line,
            },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: palette.value.areaTop },
                    { offset: 1, color: palette.value.areaBottom },
                ]),
            },
            emphasis: { focus: 'series' },
        },
    ],
});

const renderChart = async () => {
    if (!containerRef.value) {
        return;
    }

    if (!echartsModule.value) {
        echartsModule.value = await import('echarts');
    }

    if (!chartInstance.value) {
        chartInstance.value = echartsModule.value.init(containerRef.value, undefined, {
            renderer: 'canvas',
        });
    }

    chartInstance.value.setOption(buildOptions(echartsModule.value), true);
};

onMounted(() => {
    void renderChart();

    if (containerRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver.value = new ResizeObserver(() => {
            chartInstance.value?.resize();
        });
        resizeObserver.value.observe(containerRef.value);
    }
});

watch(
    [() => props.labels, () => props.values, () => colorMode.value],
    () => {
        void renderChart();
    },
    { deep: true }
);

onBeforeUnmount(() => {
    resizeObserver.value?.disconnect();
    resizeObserver.value = null;
    chartInstance.value?.dispose();
    chartInstance.value = null;
});
</script>

<template>
    <div ref="containerRef" class="h-full w-full" />
</template>
