import { computed, shallowRef } from 'vue';
import type { ComputedRef, ShallowRef } from 'vue';
import type { ECharts } from 'echarts/core';
import type { DepthSeriesItem, LatestSeries } from './depthChartTypes';

export type { DepthPoint, DepthSeriesItem, LatestSeries } from './depthChartTypes';

/**
 * 深度图悬停交互（类似币安/OKX）：
 *
 * 此处实现的功能要求：
 *
 * - 无鼠标位置垂直十字准星。
 * - 使用中间价作为中心轴：
 * 我们测量鼠标到屏幕中间价的距离（像素），然后绘制两条对称的虚线。
 *
 * - 两个工具提示：
 *
 * 左侧显示买价信息，右侧显示卖价信息。
 * - 工具提示跟随虚线移动，避免重叠。
 * - 使用 requestAnimationFrame 限制繁重的计算（每帧 1 个）。
 *
 * 实现细节：
 *
 * - 我们保留了 `latestSeries` 引用，以确保工具提示查询始终与渲染后的数据匹配
 * （在重采样/聚合之后）。
 * - 使用 ECharts 的 convertToPixel/convertFromPixel 函数，使其在缩放/平移时也能正常工作。
 */
export type HoverInfo = {
    bidPrice: number | null;
    bidTotal: number | null;
    bidAmount: number | null;
    askPrice: number | null;
    askTotal: number | null;
    askAmount: number | null;
    spread: number | null;
};

export type HoverPointPx = { x: number; y: number };

type GridRect = { x: number; y: number; width: number; height: number };

type PointerPosition = { x: number; y: number };

export function useDepthChartHover(options: {
    containerRef: ShallowRef<HTMLElement | null>;
    chartInstance: ShallowRef<ECharts | null>;
    latestSeries: ShallowRef<LatestSeries>;
    midPrice: ComputedRef<number | null>;
    normalizedAxisActive: ShallowRef<boolean>;
    chartHeight: ComputedRef<number>;
    gridTop: number;
    gridBottom: number;
}) {
    // Cache grid rect for clamping hover lines to the chart plotting area.
    const gridRect = shallowRef<GridRect | null>(null);

    // Hover line/tooltip state (screen coords + axis coords).
    const hoverY = shallowRef<number | null>(null);
    const hoverBidX = shallowRef<number | null>(null);
    const hoverAskX = shallowRef<number | null>(null);
    const hoverBidAxis = shallowRef<number | null>(null);
    const hoverAskAxis = shallowRef<number | null>(null);
    const hoverInfo = shallowRef<HoverInfo | null>(null);
    const hoverBidPointPx = shallowRef<HoverPointPx | null>(null);
    const hoverAskPointPx = shallowRef<HoverPointPx | null>(null);
    const hoverMouseXInGrid = shallowRef<number | null>(null);
    const hoverMidXInGrid = shallowRef<number | null>(null);
    const midLineXInGrid = shallowRef<number | null>(null);

    // RAF throttle bookkeeping.
    let hoverRaf: number | null = null,
        pendingPointer: PointerPosition | null = null;

    const hoverActive = computed(
        () => hoverBidX.value !== null && hoverAskX.value !== null && hoverY.value !== null && hoverInfo.value !== null
    );

    const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const asFiniteNumber = (value: unknown): number | null => {
        const numeric = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    };

    const clampX = (value: number | null) => {
        if (value === null) return 0;
        const el = options.containerRef.value;
        if (!el) return 0;
        if (!Number.isFinite(value)) return 0;
        const { width } = el.getBoundingClientRect();
        return Math.min(Math.max(value, 0), width);
    };

    const hoverBidXClamped = computed(() => clampX(hoverBidX.value));
    const hoverAskXClamped = computed(() => clampX(hoverAskX.value));

    const hoverYClamped = computed(() => {
        if (hoverY.value === null) return 0;
        const el = options.containerRef.value;
        if (!el) return 0;
        const { height } = el.getBoundingClientRect();
        return Math.min(Math.max(hoverY.value, 0), height);
    });

    const TOOLTIP_WIDTH = 176;
    const TOOLTIP_PADDING = 8;
    const TOOLTIP_OFFSET = 10;
    const TOOLTIP_GAP = 10;
    const TOOLTIP_HEIGHT_ESTIMATE = 86;
    const TOOLTIP_MIN_TOP = 6;

    const hoverTooltipLayout = computed(() => {
        const el = options.containerRef.value;
        const width = el ? el.getBoundingClientRect().width : 0;
        const height = el ? el.getBoundingClientRect().height : 0;
        const maxLeft = Math.max(TOOLTIP_PADDING, width - TOOLTIP_WIDTH - TOOLTIP_PADDING);
        const maxTop = Math.max(TOOLTIP_MIN_TOP, height - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_MIN_TOP);

        const baseTop = clampNumber(Math.max(hoverYClamped.value - 28, TOOLTIP_MIN_TOP), TOOLTIP_MIN_TOP, maxTop);

        let bidLeft = hoverBidXClamped.value - TOOLTIP_WIDTH - TOOLTIP_OFFSET,
            askLeft = hoverAskXClamped.value + TOOLTIP_OFFSET,
            bidTop = baseTop,
            askTop = baseTop;
        if (bidLeft < TOOLTIP_PADDING) bidLeft = hoverBidXClamped.value + TOOLTIP_OFFSET;

        if (askLeft > maxLeft) askLeft = hoverAskXClamped.value - TOOLTIP_WIDTH - TOOLTIP_OFFSET;

        bidLeft = clampNumber(bidLeft, TOOLTIP_PADDING, maxLeft);
        askLeft = clampNumber(askLeft, TOOLTIP_PADDING, maxLeft);

        // If the two tooltips would overlap horizontally, "stack" them vertically.
        const overlap =
            bidLeft < askLeft + TOOLTIP_WIDTH + TOOLTIP_GAP && askLeft < bidLeft + TOOLTIP_WIDTH + TOOLTIP_GAP;

        if (overlap) {
            const down = clampNumber(baseTop + TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_GAP, TOOLTIP_MIN_TOP, maxTop);
            const up = clampNumber(baseTop - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_GAP, TOOLTIP_MIN_TOP, maxTop);
            if (down !== baseTop) {
                askTop = down;
            } else if (up !== baseTop) {
                bidTop = up;
            }
        }

        return { bidLeft, askLeft, bidTop, askTop };
    });

    const hoverLineTop = computed(() => gridRect.value?.y ?? options.gridTop);
    const hoverLineHeight = computed(() => {
        if (gridRect.value) return gridRect.value.height;
        return Math.max(0, options.chartHeight.value - options.gridTop - options.gridBottom);
    });

    /**
     * Hover highlight masks (Binance-like):
     * - A vertical crosshair at mouse price (x).
     * - A green mask on the left (buy) region, a red mask on the right (sell) region.
     *
     * We keep these in pixel-space because they are pure UI overlays.
     */
    const hoverMaskLayout = computed(() => {
        const rect = gridRect.value;
        const midX = hoverMidXInGrid.value;
        const bidX = hoverBidX.value;
        const askX = hoverAskX.value;
        if (!rect || midX === null || bidX === null || askX === null) return null;
        const xMin = rect.x;
        const xMax = rect.x + rect.width;
        const mid = clampNumber(midX, xMin, xMax);

        // 强制执行：掩码不能越过中间线，也不能越过对称虚线。
        //
        // 视觉方向（类似币安）：
        // - 买入掩码从左边缘“增长”，止于买价虚线。
        // - 卖出掩码从右边缘“增长”，止于卖价虚线。
        //
        // 因此，高亮区域为：
        // - 绿色：[xMin, bidLineX]
        // - 红色：[askLineX, xMax]
        //
        // 两侧均受中间线限制，因此永远不会越过中间分隔线：
        // - 绿色掩码的右边缘为中间线
        // - 红色掩码的左边缘为中间线
        const greenRight = clampNumber(Math.min(bidX, mid), xMin, mid);
        const redLeft = clampNumber(Math.max(askX, mid), mid, xMax);

        return {
            xMin,
            xMax,
            mid,
            greenLeft: xMin,
            greenWidth: Math.max(0, greenRight - xMin),
            redLeft,
            redWidth: Math.max(0, xMax - redLeft),
        };
    });

    /**
     * For `step: 'end'` depth curve semantics, the value at x is the y of the last point with `price <= x`.
     * Series is sorted by price ascending.
     *
     * 用于 "hover 显示曲线上的点":
     * - 交易所深度图 hover 时，通常会在买卖曲线上各显示一个点
     * - 该点应该落在阶梯线的当前水平段上，而不是简单取 nearest 档位
     */
    const findStepEndItemAtOrBeforeX = (list: DepthSeriesItem[], x: number): DepthSeriesItem | null => {
        if (!list.length) return null;
        if (!Number.isFinite(x)) return null;

        let left = 0,
            right = list.length - 1,
            bestIdx = -1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const current = list[mid]!;
            if (current.value[0] <= x) {
                bestIdx = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        if (bestIdx < 0) return list[0]!;
        return list[bestIdx]!;
    };

    /**
     * Find nearest series point by x-axis value (binary search).
     * Series is sorted by price (x) ascending.
     */
    const findClosestPoint = (list: DepthSeriesItem[], axisValue: number): DepthSeriesItem | null => {
        if (!list.length) return null;

        let left = 0,
            right = list.length - 1,
            closest = list[0]!,
            minDelta = Math.abs(closest.value[0] - axisValue);

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const current = list[mid]!;
            const delta = Math.abs(current.value[0] - axisValue);

            if (delta < minDelta) {
                minDelta = delta;
                closest = current;
            }

            if (current.value[0] < axisValue) {
                left = mid + 1;
            } else if (current.value[0] > axisValue) {
                right = mid - 1;
            } else {
                return current;
            }
        }

        return closest;
    };

    /**
     * Refresh tooltip content based on current hover x-axis values.
     * bid tooltip uses nearest buy point; ask tooltip uses nearest sell point.
     */
    const updateHoverInfo = (bidAxisValue: number, askAxisValue: number) => {
        const buyPoint = findClosestPoint(options.latestSeries.value.buy, bidAxisValue);
        const sellPoint = findClosestPoint(options.latestSeries.value.sell, askAxisValue);

        if (!buyPoint || !sellPoint) {
            hoverInfo.value = null;
            return;
        }

        const bidPrice = buyPoint.price ?? null;
        const askPrice = sellPoint.price ?? null;
        const bidAmount = buyPoint.amount ?? null;
        const askAmount = sellPoint.amount ?? null;
        const bidTotal = buyPoint.value?.[1] ?? null;
        const askTotal = sellPoint.value?.[1] ?? null;

        hoverInfo.value = {
            bidPrice,
            askPrice,
            bidAmount,
            askAmount,
            bidTotal,
            askTotal,
            spread: bidPrice !== null && askPrice !== null ? askPrice - bidPrice : null,
        };
    };

    const clearHoverState = () => {
        hoverY.value = null;
        hoverBidX.value = null;
        hoverAskX.value = null;
        hoverBidAxis.value = null;
        hoverAskAxis.value = null;
        hoverInfo.value = null;
        hoverBidPointPx.value = null;
        hoverAskPointPx.value = null;
        hoverMouseXInGrid.value = null;
        hoverMidXInGrid.value = null;
    };

    const getGridRect = (chart: ECharts): GridRect | null => {
        try {
            // ECharts internal grid rect: this matches the plotting area, not the container.
            const grid = (chart as any).getModel?.().getComponent?.('grid', 0);
            const rect = grid?.coordinateSystem?.getRect?.();
            if (!rect) return null;
            if (![rect.x, rect.y, rect.width, rect.height].every((v: unknown) => Number.isFinite(v))) return null;
            return rect as GridRect;
        } catch {
            return null;
        }
    };

    const flushHover = () => {
        if (!pendingPointer) return;
        const chart = options.chartInstance.value;
        if (!chart) {
            clearHoverState();
            return;
        }

        const { x, y } = pendingPointer;
        try {
            const mid = options.midPrice.value;
            if (mid === null) {
                clearHoverState();
                return;
            }

            const midAxis = options.normalizedAxisActive.value ? 0 : mid;
            const midPixel = chart.convertToPixel({ gridIndex: 0 }, [midAxis, 0]);
            const midX = asFiniteNumber(Array.isArray(midPixel) ? midPixel[0] : midPixel);
            if (midX === null) {
                clearHoverState();
                return;
            }

            // Grid rect may change after resize/setOption; keep it hot for overlay clamping.
            const rect = gridRect.value ?? getGridRect(chart);
            gridRect.value = rect;
            const el = options.containerRef.value;
            const fallbackWidth = el ? el.getBoundingClientRect().width : 0;
            const fallbackHeight = el ? el.getBoundingClientRect().height : 0;
            const xMin = rect ? rect.x : 0;
            const xMax = rect ? rect.x + rect.width : fallbackWidth;
            const yMin = rect ? rect.y : 0;
            const yMax = rect ? rect.y + rect.height : fallbackHeight;

            const xInGrid = clampNumber(x, xMin, xMax);
            const yInGrid = clampNumber(y, yMin, yMax);

            // Keep mouse x in grid so UI overlay can render Binance-like crosshair + masks.
            hoverMouseXInGrid.value = xInGrid;
            const midXInGrid = clampNumber(midX, xMin, xMax);
            hoverMidXInGrid.value = midXInGrid;
            midLineXInGrid.value = midXInGrid;

            // Binance/OKX-like 交互核心:
            // 1) 不用 "鼠标 x" 作为 crosshair
            // 2) 先拿到鼠标到 mid 的水平距离 distance(px)
            // 3) 再用这个 distance 计算两条关于 mid 对称的虚线 x 坐标:
            //    bidLineX = midX - distancePx
            //    askLineX = midX + distancePx
            // 这样鼠标越接近 mid，两条虚线越靠近；鼠标越远，两条虚线越远。
            const distancePx = Math.abs(xInGrid - midX);
            const bidLineX = clampNumber(midX - distancePx, xMin, xMax);
            const askLineX = clampNumber(midX + distancePx, xMin, xMax);

            // 将像素坐标反解回 xAxis 值（真实价格）:
            // - 这样 tooltip 查最近档位时用的是价格空间，不受当前 zoom/pan 影响
            // - 如果未来切换成 normalized axis（以 mid 为 0），这里也能工作
            const bidResult = chart.convertFromPixel({ gridIndex: 0 }, [bidLineX, yInGrid]);
            const askResult = chart.convertFromPixel({ gridIndex: 0 }, [askLineX, yInGrid]);
            const bidAxis = asFiniteNumber(Array.isArray(bidResult) ? bidResult[0] : bidResult);
            const askAxis = asFiniteNumber(Array.isArray(askResult) ? askResult[0] : askResult);

            if (bidAxis === null || askAxis === null) {
                clearHoverState();
                return;
            }

            hoverY.value = y;
            hoverBidX.value = bidLineX;
            hoverAskX.value = askLineX;
            hoverBidAxis.value = bidAxis;
            hoverAskAxis.value = askAxis;
            updateHoverInfo(bidAxis, askAxis);

            // Hover points on curves:
            // - bid point is on buy curve at x = bidAxis
            // - ask point is on sell curve at x = askAxis
            // Use step-end semantics so the point is exactly on the drawn step line.
            const bidItem = findStepEndItemAtOrBeforeX(options.latestSeries.value.buy, bidAxis);
            const askItem = findStepEndItemAtOrBeforeX(options.latestSeries.value.sell, askAxis);

            const bidY = bidItem?.value?.[1] ?? null;
            const askY = askItem?.value?.[1] ?? null;

            if (bidY === null || askY === null) {
                hoverBidPointPx.value = null;
                hoverAskPointPx.value = null;
                return;
            }

            const bidPx = chart.convertToPixel({ gridIndex: 0 }, [bidAxis, bidY]);
            const askPx = chart.convertToPixel({ gridIndex: 0 }, [askAxis, askY]);

            const bidPointX = asFiniteNumber(Array.isArray(bidPx) ? bidPx[0] : bidPx);
            const bidPointY = asFiniteNumber(Array.isArray(bidPx) ? bidPx[1] : null);
            const askPointX = asFiniteNumber(Array.isArray(askPx) ? askPx[0] : askPx);
            const askPointY = asFiniteNumber(Array.isArray(askPx) ? askPx[1] : null);

            if (bidPointX === null || bidPointY === null || askPointX === null || askPointY === null) {
                hoverBidPointPx.value = null;
                hoverAskPointPx.value = null;
                return;
            }

            // Clamp points inside grid plotting area to avoid leaking outside chart.
            const clampedBidX = clampNumber(bidPointX, xMin, xMax);
            const clampedAskX = clampNumber(askPointX, xMin, xMax);
            const clampedBidY = clampNumber(bidPointY, yMin, yMax);
            const clampedAskY = clampNumber(askPointY, yMin, yMax);
            hoverBidPointPx.value = { x: clampedBidX, y: clampedBidY };
            hoverAskPointPx.value = { x: clampedAskX, y: clampedAskY };
        } catch {
            clearHoverState();
        }
    };

    const scheduleHover = () => {
        if (hoverRaf !== null || typeof window === 'undefined') return;
        // Compute once per animation frame.
        hoverRaf = window.requestAnimationFrame(() => {
            hoverRaf = null;
            flushHover();
        });
    };

    const handlePointerMove = (event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement | null;
        if (!target) {
            clearHoverState();
            return;
        }

        const bounds = target.getBoundingClientRect();
        // Store pointer in local container coordinates (not page coordinates).
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        pendingPointer = { x, y };
        scheduleHover();
    };

    const handlePointerLeave = () => {
        pendingPointer = null;
        if (hoverRaf !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(hoverRaf);
            hoverRaf = null;
        }
        clearHoverState();
    };

    const syncGridRectFromChart = () => {
        const chart = options.chartInstance.value;
        gridRect.value = chart ? getGridRect(chart) : null;
        if (!chart) {
            midLineXInGrid.value = null;
            return;
        }

        const mid = options.midPrice.value;
        if (mid === null) {
            midLineXInGrid.value = null;
            return;
        }

        const midAxis = options.normalizedAxisActive.value ? 0 : mid;
        const midPixel = chart.convertToPixel({ gridIndex: 0 }, [midAxis, 0]);
        const midX = asFiniteNumber(Array.isArray(midPixel) ? midPixel[0] : midPixel);
        if (midX === null) {
            midLineXInGrid.value = null;
            return;
        }

        const rect = gridRect.value ?? getGridRect(chart);
        gridRect.value = rect;
        const el = options.containerRef.value;
        const fallbackWidth = el ? el.getBoundingClientRect().width : 0;
        const xMin = rect ? rect.x : 0;
        const xMax = rect ? rect.x + rect.width : fallbackWidth;
        midLineXInGrid.value = clampNumber(midX, xMin, xMax);
    };

    /**
     * If the series changes while hovering (stream updates / resampling),
     * refresh hover state so:
     * - tooltips reflect the latest rendered series
     * - hover dots re-project to the new curve position
     * - symmetric guide lines stay consistent when mid/axis range changes
     */
    const syncHoverInfoFromSeries = () => {
        // When user is hovering inside chart, we still have the last pointer position.
        // Re-run the full hover computation so guide lines + dots follow changes.
        if (pendingPointer) {
            scheduleHover();
            return;
        }

        const bidAxis = hoverBidAxis.value;
        const askAxis = hoverAskAxis.value;
        if (bidAxis === null || askAxis === null) return;
        updateHoverInfo(bidAxis, askAxis);

        const chart = options.chartInstance.value;
        if (!chart) return;

        const rect = gridRect.value ?? getGridRect(chart);
        gridRect.value = rect;
        const el = options.containerRef.value;
        const fallbackWidth = el ? el.getBoundingClientRect().width : 0;
        const fallbackHeight = el ? el.getBoundingClientRect().height : 0;
        const xMin = rect ? rect.x : 0;
        const xMax = rect ? rect.x + rect.width : fallbackWidth;
        const yMin = rect ? rect.y : 0;
        const yMax = rect ? rect.y + rect.height : fallbackHeight;

        // Re-project guide line x positions from axis value (in case zoom/range changed).
        const bidLinePx = chart.convertToPixel({ gridIndex: 0 }, [bidAxis, 0]);
        const askLinePx = chart.convertToPixel({ gridIndex: 0 }, [askAxis, 0]);
        const bidLineX = asFiniteNumber(Array.isArray(bidLinePx) ? bidLinePx[0] : bidLinePx);
        const askLineX = asFiniteNumber(Array.isArray(askLinePx) ? askLinePx[0] : askLinePx);
        if (bidLineX !== null) hoverBidX.value = clampNumber(bidLineX, xMin, xMax);
        if (askLineX !== null) hoverAskX.value = clampNumber(askLineX, xMin, xMax);

        const bidItem = findStepEndItemAtOrBeforeX(options.latestSeries.value.buy, bidAxis);
        const askItem = findStepEndItemAtOrBeforeX(options.latestSeries.value.sell, askAxis);
        const bidY = bidItem?.value?.[1] ?? null;
        const askY = askItem?.value?.[1] ?? null;

        if (bidY === null || askY === null) {
            hoverBidPointPx.value = null;
            hoverAskPointPx.value = null;
            return;
        }

        const bidPx = chart.convertToPixel({ gridIndex: 0 }, [bidAxis, bidY]);
        const askPx = chart.convertToPixel({ gridIndex: 0 }, [askAxis, askY]);
        const bidPointX = asFiniteNumber(Array.isArray(bidPx) ? bidPx[0] : bidPx);
        const bidPointY = asFiniteNumber(Array.isArray(bidPx) ? bidPx[1] : null);
        const askPointX = asFiniteNumber(Array.isArray(askPx) ? askPx[0] : askPx);
        const askPointY = asFiniteNumber(Array.isArray(askPx) ? askPx[1] : null);

        if (bidPointX === null || bidPointY === null || askPointX === null || askPointY === null) {
            hoverBidPointPx.value = null;
            hoverAskPointPx.value = null;
            return;
        }

        hoverBidPointPx.value = { x: clampNumber(bidPointX, xMin, xMax), y: clampNumber(bidPointY, yMin, yMax) };
        hoverAskPointPx.value = { x: clampNumber(askPointX, xMin, xMax), y: clampNumber(askPointY, yMin, yMax) };
    };

    const dispose = () => {
        pendingPointer = null;
        if (hoverRaf !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(hoverRaf);
            hoverRaf = null;
        }
    };

    return {
        hoverActive,
        hoverBidXClamped,
        hoverAskXClamped,
        hoverTooltipLayout,
        hoverLineTop,
        hoverLineHeight,
        hoverInfo,
        hoverBidPointPx,
        hoverAskPointPx,
        hoverMouseXInGrid,
        hoverMaskLayout,
        midLineXInGrid,
        handlePointerMove,
        handlePointerLeave,
        syncGridRectFromChart,
        syncHoverInfoFromSeries,
        dispose,
    };
}
