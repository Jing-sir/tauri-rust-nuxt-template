import type { ComputedRef } from 'vue';
import type { EChartsCoreOption } from 'echarts/core';
import type { DepthSeriesItem } from './depthChartTypes';
import { toRgba, withUnit } from './depthChartUtils';

type XRange = { min: number; max: number };

type Palette = {
    text: string;
    axis: string;
    midLine: string;
};

export function useDepthChartOptions(options: {
    palette: ComputedRef<Palette>;
    decimal: ComputedRef<number>;
    grid: { top: number; bottom: number; left: number; right: number };
}) {
    const buildFiveTicks = (min: number, max: number) => {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        const range = max - min;
        if (!Number.isFinite(range) || range <= 0) return null;
        // Exactly 5 ticks, evenly distributed: min + i * (range/4), i=0..4
        const digits = Math.max(0, Math.min(12, Math.floor(options.decimal.value)));
        return [0, 1, 2, 3, 4].map((i) => {
            const raw = min + (range * i) / 4;
            // Round to the configured decimal to avoid 61999.999999-style artifacts.
            return Number(raw.toFixed(digits));
        });
    };

    /**
     * Build shared ECharts options for Depth Chart.
     *
     * Important design choice:
     * - xAxis uses **real price values** (not normalized). This keeps axis labels correct and intuitive.
     * - When we need a symmetric view around mid, we pass `xRange` = [mid - range, mid + range].
     */
    const buildBaseOptions = (params: {
        lineColor: string;
        priceUnit: string;
        sizeUnit: string;
        midPriceValue: number | null;
        buyScale: number | null;
        sellScale: number | null;
        xRange: XRange | null;
        yMax: number | null;
        yInterval: number | null;
    }): EChartsCoreOption => {
        const { lineColor, priceUnit, sizeUnit, xRange, yMax, yInterval } = params;
        const fixedTicks = xRange ? buildFiveTicks(xRange.min, xRange.max) : null;

        return {
            animation: false,
            backgroundColor: 'transparent',
            textStyle: {
                color: options.palette.value.text,
                fontFamily: 'inherit',
            },
            grid: {
                top: options.grid.top,
                bottom: options.grid.bottom,
                left: options.grid.left,
                right: options.grid.right,
                containLabel: true,
            },
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: 0,
                    // Keep points (we resample ourselves); do not let ECharts drop out-of-range points.
                    filterMode: 'none',
                    // 我们用组件自己的 wheel 缩放（保持 mid 居中 + 固定 5 个刻度），这里关闭 ECharts 默认缩放。
                    zoomOnMouseWheel: false,
                    moveOnMouseMove: false,
                    moveOnMouseWheel: false,
                },
                {
                    type: 'slider',
                    xAxisIndex: 0,
                    show: false,
                },
            ],
            xAxis: {
                type: 'value',
                boundaryGap: false,
                splitLine: { show: false },
                axisLine: { lineStyle: { color: lineColor } },
                // 不显示 tick（用户要求 mid 刻线不需要小横线；同时整体更像交易所 depth 图的简洁风格）
                axisTick: { show: false },
                axisLabel: {
                    // 需要固定显示 5 个刻度时，min/max 两端必须显示出来
                    // （否则会被 ECharts 默认策略隐藏）
                    showMinLabel: true,
                    showMaxLabel: true,
                    hideOverlap: false,
                    // 保证第一个/最后一个刻度完整显示在容器内（不被左右边界裁切）
                    alignMinLabel: 'left',
                    alignMaxLabel: 'right',
                    overflow: 'none',
                    // 固定 5 个刻度（min/max + 3 个均分点）。缩放时 xRange 变化，会触发重新计算。
                    customValues: fixedTicks ?? undefined,
                    color: options.palette.value.axis,
                    fontSize: 12,
                    // `val` is already a real price (because series x uses price).
                    formatter: (val: number | string) => {
                        const numeric = Number(val);
                        if (!Number.isFinite(numeric)) return '';
                        return withUnit(numeric, options.decimal.value, priceUnit);
                    },
                },
                // If xRange is provided, force symmetric view around mid; otherwise use series extent.
                min: xRange ? xRange.min : 'dataMin',
                max: xRange ? xRange.max : 'dataMax',
            },
            yAxis: {
                type: 'value',
                position: 'right',
                splitNumber: 4,
                interval: yInterval ?? undefined,
                min: 0,
                max: yMax ?? undefined,
                axisLine: { show: true, lineStyle: { color: lineColor } },
                axisTick: { inside: true },
                axisLabel: {
                    inside: true,
                    showMinLabel: false,
                    color: options.palette.value.axis,
                    fontSize: 11,
                    formatter: (val: number | string) => withUnit(Number(val), options.decimal.value, sizeUnit),
                },
                splitLine: { show: false },
            },
        };
    };

    /**
     * Build buy/sell series.
     *
     * Notes:
     * - `step: 'end'` matches the "orderbook depth" look.
     * - mid markLine is dashed and label hidden by design.
     * - markArea is used to tint buy vs sell regions.
     */
    const buildSeries = (params: {
        echarts: typeof import('echarts/core');
        buyData: DepthSeriesItem[];
        sellData: DepthSeriesItem[];
        midPriceValue: number | null;
        midAxisValue: number | null;
        buyColor: string;
        sellColor: string;
        xRange: XRange | null;
    }): EChartsCoreOption['series'] => {
        const { echarts, buyData, sellData, midPriceValue, midAxisValue, buyColor, sellColor, xRange } = params;

        return [
            {
                name: 'Buy',
                data: buyData,
                type: 'line',
                step: 'end',
                symbol: 'circle',
                showSymbol: false,
                symbolSize: 8,
                clip: true,
                itemStyle: { color: buyColor, borderColor: buyColor },
                lineStyle: { color: buyColor, width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: toRgba(buyColor, 0.4) },
                        { offset: 1, color: toRgba(buyColor, 0.05) },
                    ]),
                },
                markLine:
                    midPriceValue !== null && midAxisValue !== null
                        ? {
                            silent: true,
                            symbol: 'none',
                            lineStyle: {
                                color: options.palette.value.midLine,
                                width: 1.25,
                                type: 'dashed',
                            },
                            label: { show: false },
                            data: [{ xAxis: midAxisValue }],
                        }
                        : undefined,
                // 去掉“简便背景色”(左右区域底色)。交易所深度图通常只保留曲线 fill，不做额外区域着色。
                emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
            },
            {
                name: 'Sell',
                data: sellData,
                type: 'line',
                step: 'end',
                symbol: 'circle',
                showSymbol: false,
                symbolSize: 8,
                clip: true,
                itemStyle: { color: sellColor, borderColor: sellColor },
                lineStyle: { color: sellColor, width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: toRgba(sellColor, 0.4) },
                        { offset: 1, color: toRgba(sellColor, 0.05) },
                    ]),
                },
                // 去掉“简便背景色”(左右区域底色)。交易所深度图通常只保留曲线 fill，不做额外区域着色。
                emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
            },
        ];
    };

    return { buildBaseOptions, buildSeries };
}
