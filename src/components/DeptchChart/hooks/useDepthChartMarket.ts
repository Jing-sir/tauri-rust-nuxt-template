import { computed } from 'vue';
import type { ComputedRef } from 'vue';

/**
 * Depth chart market helpers:
 * - parse raw `[price, amount]` lists into numeric arrays
 * - compute bestBid/bestAsk/midPrice/spread in a single pass
 *
 * Keep it deterministic and cheap because it runs whenever orderbook updates.
 */
export type DepthPointInput = [number | string, number | string];

// 解析后的数据点（避免重复类型转换）
export type ParsedDepthPoint = { price: number; amount: number };

// 市场统计数据（一次遍历获取所有信息）
export type MarketStats = {
    bestBid: number | null;
    bestAsk: number | null;
    buyMin: number | null;
    sellMax: number | null;
};

const parseDepthList = (list: DepthPointInput[]): ParsedDepthPoint[] => {
    const result: ParsedDepthPoint[] = [];
    for (const [priceInput, amountInput] of list) {
        const price = Number(priceInput);
        const amount = Number(amountInput);
        // Drop invalid entries early to keep downstream logic simple.
        if (Number.isFinite(price) && Number.isFinite(amount)) {
            result.push({ price, amount });
        }
    }
    return result;
};

/**
 * Calculate:
 * - bestBid: highest buy price
 * - bestAsk: lowest sell price
 * - buyMin: lowest buy price (to estimate left range)
 * - sellMax: highest sell price (to estimate right range)
 */
const calculateMarketStats = (buyList: ParsedDepthPoint[], sellList: ParsedDepthPoint[]): MarketStats => {
    let bestBid: number | null = null,
        buyMin: number | null = null,
        bestAsk: number | null = null,
        sellMax: number | null = null;

    for (const { price } of buyList) {
        if (bestBid === null || price > bestBid) bestBid = price;
        if (buyMin === null || price < buyMin) buyMin = price;
    }

    for (const { price } of sellList) {
        if (bestAsk === null || price < bestAsk) bestAsk = price;
        if (sellMax === null || price > sellMax) sellMax = price;
    }

    return { bestBid, bestAsk, buyMin, sellMax };
};

export function useDepthChartMarket(options: {
    buyList: ComputedRef<DepthPointInput[]>;
    sellList: ComputedRef<DepthPointInput[]>;
}) {
    // One computed that does parse + stats in one place so callers don't re-walk lists.
    const parsedData = computed(() => {
        const buyParsed = parseDepthList(options.buyList.value);
        const sellParsed = parseDepthList(options.sellList.value);
        const stats = calculateMarketStats(buyParsed, sellParsed);

        return {
            buy: buyParsed,
            sell: sellParsed,
            stats,
        };
    });

    const bestBid = computed(() => parsedData.value.stats.bestBid);
    const bestAsk = computed(() => parsedData.value.stats.bestAsk);

    // Mid is defined as (bestBid + bestAsk) / 2 (Binance/OKX style reference).
    const midPrice = computed(() => {
        const { bestBid, bestAsk } = parsedData.value.stats;
        if (bestBid === null || bestAsk === null) return null;
        return (bestBid + bestAsk) / 2;
    });

    // Spread is ask - bid.
    const spread = computed(() => {
        const { bestBid, bestAsk } = parsedData.value.stats;
        if (bestBid === null || bestAsk === null) return null;
        return bestAsk - bestBid;
    });

    // Spread percentage relative to bid.
    const spreadPct = computed(() => {
        const s = spread.value;
        const bid = bestBid.value;
        if (s === null || bid === null || bid === 0) return null;
        return (s / bid) * 100;
    });

    return {
        parsedData,
        bestBid,
        bestAsk,
        midPrice,
        spread,
        spreadPct,
    };
}
