/**
 * Shared types for the Depth Chart feature.
 *
 * Notes:
 * - `value` is the data point ECharts consumes: `[x, y]`.
 * - We keep `price` and `amount` separately because:
 *   1) Tooltip wants original values (price/amount/cumulative),
 *   2) Series can be resampled/aggregated without losing semantics.
 */
export type DepthPoint = [number, number];

/**
 * A single depth point used for rendering.
 *
 * - `value[0]` is **x axis value**. In this implementation it is the **real price** (not normalized).
 * - `value[1]` is **cumulative total size** at that price level.
 */
export type DepthSeriesItem = { value: DepthPoint; amount: number; price: number };

/**
 * Latest series kept in memory for hover/tooltip lookup.
 * We always store the same series that is rendered (after resampling),
 * so hover tooltip matches what the user sees.
 */
export type LatestSeries = { buy: DepthSeriesItem[]; sell: DepthSeriesItem[] };
