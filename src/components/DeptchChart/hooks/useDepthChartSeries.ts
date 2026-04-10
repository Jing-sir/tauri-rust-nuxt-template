import { shallowRef } from 'vue';
import type { ComputedRef, ShallowRef } from 'vue';
import type { ParsedDepthPoint } from './useDepthChartMarket';
import type { DepthPoint, DepthSeriesItem } from './depthChartTypes';
import { smoothValue } from './depthChartUtils';

type XRange = { min: number; max: number };

/**
 * Build render-ready depth series and y-axis scaling.
 *
 * Core goals:
 * 1) Keep x-axis in **real prices** so axis labels and hover are intuitive.
 * 2) Support adaptive point density based on zoom (Binance/OKX-like feel):
 *    - zoom out: aggregate more price levels -> fewer points
 *    - zoom in: aggregate less -> more points
 * 3) Preserve cumulative semantics:
 *    We aggregate raw (price, amount) first, then compute cumulative.
 *
 * Important: this resampling is visual only. Input orderbook stays intact outside.
 *
 * 中文补充:
 * - 这里的 “自适应密度” 不是修改真实盘口，而是为了让图表在不同缩放级别下:
 *   1) 不至于点太多导致锯齿/卡顿
 *   2) 不至于点太少导致形状失真
 * - 聚合发生在 “累计之前”，否则累计曲线会被错误地平滑/扭曲。
 */
export function useDepthChartSeries(options: {
    smoothingFactor: ComputedRef<number>;
    initialDepthMax: ComputedRef<number>;
    zoomSpan: ShallowRef<number | null>;
    baseBinsPerSide: ComputedRef<number>;
}) {
    const buySmoothCache = shallowRef<Map<number, number>>(new Map());
    const sellSmoothCache = shallowRef<Map<number, number>>(new Map());
    const yMaxCache = shallowRef<number | null>(null);

    const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    /**
     * For `step: 'end'` line semantics, the value between (x_i, x_{i+1}) is y_i.
     *
     * Therefore, the value at a boundary x should be taken from the point with:
     *   price <= x  (rightmost point not exceeding x)
     *
     * 如果用 “nearest”，会出现两类偏差:
     * - buy 左边界: nearest 可能选到右侧点（更靠近 mid，累计更小）=> yMax 被低估，曲线峰值会超过 2/3
     * - sell 右边界: nearest 可能选到右侧点（窗口外，累计更大）=> yMax 被高估，曲线峰值会低于 2/3
     */
    const findStepEndValueAtOrBeforeX = (series: DepthSeriesItem[], x: number): number | null => {
        if (!series.length) return null;
        if (!Number.isFinite(x)) return null;

        let left = 0,
            right = series.length - 1,
            bestIdx = -1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const current = series[mid]!;
            if (current.price <= x) {
                bestIdx = mid;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        if (bestIdx < 0) return series[0]!.value[1];
        return series[bestIdx]!.value[1];
    };

    /**
     * Decide how many points we want on each side of the book.
     *
     * - `baseBinsPerSide` is derived from container width (roughly: how many points fit nicely).
     * - `zoomSpan` comes from dataZoom range: smaller span means zoom-in -> allow more points.
     */
    const getAdaptivePointsPerSide = () => {
        // zoomSpan: 100 = full view, smaller = zoom-in.
        const spanPct = options.zoomSpan.value ?? 100;
        const span = clampNumber(spanPct, 5, 100);

        // zoom out: fewer points (aggregate more). zoom in: more points (split more).
        const base = Math.max(20, Math.round(options.baseBinsPerSide.value));
        const MIN_POINTS_PER_SIDE = 40;
        const MAX_POINTS_PER_SIDE = 360;
        return clampNumber(Math.round(base * (100 / span)), MIN_POINTS_PER_SIDE, MAX_POINTS_PER_SIDE);
    };

    /**
     * Aggregate raw depth points into fixed price-distance buckets around mid.
     *
     * How it works:
     * - Convert each level into a "distance from mid" (absolute price difference on that side).
     * - Put it into a bucket by `Math.floor(distance / step)`.
     * - Sum `amount` in the same bucket.
     *
     * Representative price selection:
     * - buy: use bucket.minPrice (farthest from mid) so buckets "cover" the left side.
     * - sell: use bucket.maxPrice (farthest from mid) so buckets "cover" the right side.
     *
     * This doesn't try to be an exact exchange aggregation rule; it's a practical downsampling
     * strategy optimized for stability and a familiar visual shape.
     */
    const aggregateByPrice = (params: {
        list: ParsedDepthPoint[];
        side: 'buy' | 'sell';
        mid: number;
        step: number;
        targetPoints: number;
    }): ParsedDepthPoint[] => {
        const { list, side, mid, step, targetPoints } = params;
        if (!list.length) return [];
        if (!Number.isFinite(step) || step <= 0) return list;

        // If we already have fewer points than the target, no need to aggregate.
        if (list.length <= targetPoints) return list;

        type Bucket = { amountSum: number; minPrice: number; maxPrice: number };
        const buckets = new Map<number, Bucket>();

        for (const { price, amount } of list) {
            const dist = side === 'buy' ? mid - price : price - mid;
            if (dist < 0) continue;
            const idx = Math.floor(dist / step);

            const bucket = buckets.get(idx);
            if (!bucket) {
                buckets.set(idx, { amountSum: amount, minPrice: price, maxPrice: price });
                continue;
            }

            bucket.amountSum += amount;
            if (price < bucket.minPrice) bucket.minPrice = price;
            if (price > bucket.maxPrice) bucket.maxPrice = price;
        }

        if (!buckets.size) return list;

        const aggregated: ParsedDepthPoint[] = [];
        for (const bucket of buckets.values()) {
            const repPrice = side === 'buy' ? bucket.minPrice : bucket.maxPrice;
            aggregated.push({ price: repPrice, amount: bucket.amountSum });
        }

        // Keep list sorted by price ascending for stable axis and binary-search friendliness.
        aggregated.sort((a, b) => a.price - b.price);
        return aggregated;
    };

    /**
     * Convert `[price, amount]` levels into ECharts series points:
     * - sort by price (buy: desc for cumulative, sell: asc for cumulative)
     * - compute cumulative totals
     * - output points sorted by price ascending for rendering
     */
    const buildDepthData = (
        list: ParsedDepthPoint[],
        type: 'buy' | 'sell',
        midPrice: number | null,
        scale: number | null,
        useNormalizedAxis: boolean
    ): DepthSeriesItem[] => {
        if (!list.length) return [];

        const sorted = [...list].sort((a, b) => (type === 'buy' ? b.price - a.price : a.price - b.price));

        const result: DepthSeriesItem[] = [];
        let cumulative = 0;

        for (const { price, amount } of sorted) {
            cumulative += amount;
            const axisValue =
                !useNormalizedAxis || midPrice === null || scale === null || scale === 0
                    ? price
                    : (price - midPrice) / scale;

            result.push({
                value: [axisValue, cumulative],
                amount,
                price,
            });
        }

        return result.sort((a, b) => a.price - b.price);
    };

    /**
     * Ensure cumulative curve direction stays monotonic.
     * - buy side (decreasing): cumulative should not increase when moving right
     * - sell side (increasing): cumulative should not decrease when moving right
     */
    const enforceMonotonic = (series: DepthSeriesItem[], direction: 'increasing' | 'decreasing') => {
        let last = direction === 'increasing' ? 0 : Number.POSITIVE_INFINITY;
        return series.map((item) => {
            const raw = item.value[1];
            const next = direction === 'increasing' ? Math.max(raw, last) : Math.min(raw, last);
            last = next;
            return {
                ...item,
                value: [item.value[0], next] as DepthPoint,
            };
        });
    };

    const smoothSeries = (
        series: DepthSeriesItem[],
        cache: Map<number, number>,
        alpha: number,
        direction: 'increasing' | 'decreasing'
    ): DepthSeriesItem[] => {
        // alpha close to 0/1 does not benefit from smoothing; skip to save work.
        if (alpha <= 0.01 || alpha >= 0.99) {
            const monotonic = enforceMonotonic(series, direction);
            const nextCache = new Map<number, number>();
            for (const item of monotonic) nextCache.set(item.price, item.value[1]);
            cache.clear();
            for (const [key, value] of nextCache) cache.set(key, value);
            return monotonic;
        }

        const nextCache = new Map<number, number>();
        const smoothed = series.map((item) => {
            const previous = cache.get(item.price);
            const current = item.value[1];
            const blended = previous === undefined ? current : smoothValue(previous, current, alpha);
            const nextValue: DepthPoint = [item.value[0], blended];
            nextCache.set(item.price, blended);
            return { ...item, value: nextValue };
        });

        const monotonic = enforceMonotonic(smoothed, direction);
        cache.clear();
        for (const item of monotonic) nextCache.set(item.price, item.value[1]);
        for (const [key, value] of nextCache) cache.set(key, value);
        return monotonic;
    };

    /**
     * Visual-only extension so lines "reach" mid and edges:
     * - Add a mid anchor point so the curve touches the mid line.
     * - Add edge anchors (min/max) so the filled area doesn't look clipped.
     *
     * 这个函数主要是为了解决用户视觉问题:
     * - 初始化时买卖曲线没有“铺满”容器左右两侧，看起来像被截断
     * - 因为真实盘口数据点的最远价位不一定刚好等于 xAxis.min/max
     *
     * 做法:
     * - 在 mid 处补一个锚点，让阶梯线与 mid 线“贴合”
     * - 在 xRange 的 min/max 再补锚点，让填充区域一直延伸到边界
     * - 这些锚点 amount=0，只用于绘制，不参与 tooltip 档位计算
     */
    const extendSeriesForDisplay = (
        buyData: DepthSeriesItem[],
        sellData: DepthSeriesItem[],
        midAxisValue: number | null,
        midPriceValue: number | null,
        xRange: XRange | null
    ) => {
        const buy = buyData.slice();
        const sell = sellData.slice();
        const EPS = 1e-9;

        if (midAxisValue !== null) {
            if (buy.length) {
                const last = buy[buy.length - 1]!;
                if (Math.abs(last.value[0] - midAxisValue) > EPS) {
                    buy.push({
                        value: [midAxisValue, last.value[1]],
                        amount: 0,
                        price: midPriceValue ?? last.price,
                    });
                }
            }

            if (sell.length) {
                const first = sell[0]!;
                if (Math.abs(first.value[0] - midAxisValue) > EPS) {
                    sell.unshift({
                        value: [midAxisValue, first.value[1]],
                        amount: 0,
                        price: midPriceValue ?? first.price,
                    });
                }
            }
        }

        if (xRange) {
            if (buy.length) {
                const first = buy[0]!;
                if (first.value[0] > xRange.min + EPS) {
                    buy.unshift({
                        value: [xRange.min, first.value[1]],
                        amount: 0,
                        price: first.price,
                    });
                }
            }

            if (sell.length) {
                const last = sell[sell.length - 1]!;
                if (last.value[0] < xRange.max - EPS) {
                    sell.push({
                        value: [xRange.max, last.value[1]],
                        amount: 0,
                        price: last.price,
                    });
                }
            }
        }

        return { buy, sell };
    };

    const computeRenderData = (input: {
        buy: ParsedDepthPoint[];
        sell: ParsedDepthPoint[];
        midPriceValue: number | null;
        buyMin: number | null;
        sellMax: number | null;
    }) => {
        const { buy, sell, midPriceValue, buyMin, sellMax } = input;

        // 用于构建 “以 mid 为中心对称” 的 x 轴窗口范围。
        // Binance/OKX 深度图的一个关键观感就是:
        // - 左右两侧的可视范围对称（围绕 mid）
        // - 即便买卖盘一侧更稀疏，窗口仍然围绕 mid 居中
        const buyScale = midPriceValue !== null && buyMin !== null ? midPriceValue - buyMin : null;
        const sellScale = midPriceValue !== null && sellMax !== null ? sellMax - midPriceValue : null;
        const sideRange = midPriceValue !== null ? Math.max(0, buyScale ?? 0, sellScale ?? 0) : 0;

        const canComputeSymmetricRange = midPriceValue !== null && Number.isFinite(sideRange) && sideRange > 0;

        const spanPct = options.zoomSpan.value ?? 100;
        const spanFraction = clampNumber(spanPct, 1, 100) / 100;
        const visibleHalfRange = canComputeSymmetricRange ? sideRange * spanFraction : sideRange;

        // 自适应聚合步长:
        // - step 越大: 聚合越狠，点越少（zoom out）
        // - step 越小: 聚合越轻，点越多（zoom in）
        // 这里 step 基于 “当前左右最大价格跨度 / 期望点数” 推导。
        const targetPoints = getAdaptivePointsPerSide();
        // 用可视半径来计算 step，这样 zoom in 时会自然变得更细。
        const step = canComputeSymmetricRange ? visibleHalfRange / Math.max(1, targetPoints) : 0;

        const buyInput =
            canComputeSymmetricRange && midPriceValue !== null
                ? aggregateByPrice({ list: buy, side: 'buy', mid: midPriceValue, step, targetPoints })
                : buy;
        const sellInput =
            canComputeSymmetricRange && midPriceValue !== null
                ? aggregateByPrice({ list: sell, side: 'sell', mid: midPriceValue, step, targetPoints })
                : sell;

        // Use real price for x-axis to keep x labels correct (Binance/OKX style).
        const buyRaw = buildDepthData(buyInput, 'buy', midPriceValue, buyScale, false);
        const sellRaw = buildDepthData(sellInput, 'sell', midPriceValue, sellScale, false);

        // Smooth the curves (optional) and keep cumulative monotonic.
        const buyData = smoothSeries(buyRaw, buySmoothCache.value, options.smoothingFactor.value, 'decreasing');
        const sellData = smoothSeries(sellRaw, sellSmoothCache.value, options.smoothingFactor.value, 'increasing');

        // y-axis range: use "upper fast, lower slow" smoothing to avoid jitter.
        // yAxis.max 必须随 zoom 动态变化（用户要求）:
        // - 缩放后，可视窗口的最深点仍然保持在 y 轴 2/3 高度附近
        // - 因为我们强制 zoom 窗口以 mid 为中心，所以可视范围也以 mid 为中心对称
        const maxVisibleDepth = (() => {
            if (!canComputeSymmetricRange || midPriceValue === null) {
                // fallback: 没法算窗口时，退化为全量最大值
                return Math.max(0, ...buyData.map((item) => item.value[1]), ...sellData.map((item) => item.value[1]));
            }

            const visibleMin = midPriceValue - visibleHalfRange;
            const visibleMax = midPriceValue + visibleHalfRange;

            // buy side valid price range: [buyMinPrice .. bestBidPrice]
            const buyMinPrice = buyData.length ? buyData[0]!.price : null;
            const bestBidPrice = buyData.length ? buyData[buyData.length - 1]!.price : null;

            // sell side valid price range: [bestAskPrice .. sellMaxPrice]
            const bestAskPrice = sellData.length ? sellData[0]!.price : null;
            const sellMaxPrice = sellData.length ? sellData[sellData.length - 1]!.price : null;

            const buyEdgePrice =
                buyMinPrice === null || bestBidPrice === null
                    ? null
                    : clampNumber(visibleMin, buyMinPrice, bestBidPrice);
            const sellEdgePrice =
                bestAskPrice === null || sellMaxPrice === null
                    ? null
                    : clampNumber(visibleMax, bestAskPrice, sellMaxPrice);

            // 用 step-end 语义取边界值（<=边界的最后一个点）
            const buyEdgeY = buyEdgePrice === null ? null : findStepEndValueAtOrBeforeX(buyData, buyEdgePrice);
            const sellEdgeY = sellEdgePrice === null ? null : findStepEndValueAtOrBeforeX(sellData, sellEdgePrice);

            return Math.max(0, buyEdgeY ?? 0, sellEdgeY ?? 0);
        })();

        // 严格保持峰值在 2/3:
        // - yMax = maxVisibleDepth * 1.5  => 峰值约在 2/3 高度
        // - initialDepthMax 只在 “没有数据” 时兜底，避免它把 yMax 抬太高导致峰值低于 2/3
        const targetYMax = maxVisibleDepth > 0 ? maxVisibleDepth * 1.5 : options.initialDepthMax.value;

        const yInterval = targetYMax > 0 ? targetYMax / 4 : null;

        // 为满足“始终保持 2/3”的视觉规则，yMax 不再做平滑。
        // 如果后续需要抗抖，可以改成 “只允许 yMax 变大时立即跟随、变小时延迟”，但那会破坏严格 2/3。
        const yMax = targetYMax > 0 ? targetYMax : null;
        yMaxCache.value = yMax;

        // mid 线永远落在真实价格的 mid（不是 0 / 不是归一化值）。
        const midAxisValue = midPriceValue;
        const xRange: XRange | null =
            canComputeSymmetricRange && midPriceValue !== null
                ? // 这里的 xRange 表示 “当前可视窗口”，用于:
            // - xAxis min/max（从而固定 5 个刻度）
            // - extendSeriesForDisplay 补边，保证曲线铺满容器边缘
                { min: midPriceValue - visibleHalfRange, max: midPriceValue + visibleHalfRange }
                : null;

        const displaySeries = extendSeriesForDisplay(buyData, sellData, midAxisValue, midPriceValue, xRange);

        return {
            buyScale,
            sellScale,
            hasNormalizedAxis: false,
            xRange,
            midAxisValue,
            buyData,
            sellData,
            displaySeries,
            yMax,
            yInterval,
        };
    };

    const reset = () => {
        // Called on component unmount to avoid memory growth.
        buySmoothCache.value.clear();
        sellSmoothCache.value.clear();
        yMaxCache.value = null;
    };

    return { computeRenderData, reset };
}
