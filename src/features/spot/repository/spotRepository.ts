import type { AssetItem, OrderItem, PairItem, TradeItem } from '~~/types/spotTypes';
import type { SpotDataSource, SpotRepository } from './types';

const mockPairs: PairItem[] = [
    { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', price: '63,842.12', change: '+2.14%', volume: '12.9B', tone: 'up' },
    { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', price: '3,482.90', change: '+1.06%', volume: '8.1B', tone: 'up' },
    { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', price: '138.22', change: '-0.72%', volume: '1.4B', tone: 'down' },
    { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', price: '412.04', change: '+0.44%', volume: '782M', tone: 'up' },
    { symbol: 'XRP/USDT', base: 'XRP', quote: 'USDT', price: '0.6021', change: '-0.35%', volume: '654M', tone: 'down' },
    { symbol: 'DOGE/USDT', base: 'DOGE', quote: 'USDT', price: '0.1624', change: '+3.22%', volume: '512M', tone: 'up' },
];

const mockOpenOrders: OrderItem[] = [
    { id: 'A1', pair: 'BTC/USDT', type: 'Limit', side: 'Buy', price: '63,120.00', amount: '0.12', filled: '0%' },
    { id: 'A2', pair: 'ETH/USDT', type: 'Limit', side: 'Sell', price: '3,520.00', amount: '1.40', filled: '35%' },
];

const mockHistoryOrders: OrderItem[] = [
    { id: 'H1', pair: 'SOL/USDT', type: 'Market', side: 'Buy', price: '138.10', amount: '5.2', filled: '100%' },
    { id: 'H2', pair: 'BNB/USDT', type: 'Limit', side: 'Sell', price: '412.00', amount: '0.8', filled: '100%' },
];

const mockMyTrades: TradeItem[] = [
    { side: 'buy', price: 63840.12, amount: 0.05, time: '11:42' },
    { side: 'sell', price: 63890.55, amount: 0.03, time: '11:58' },
];

const mockAssets: AssetItem[] = [
    { asset: 'USDT', available: '12,400.00', total: '12,400.00' },
    { asset: 'BTC', available: '0.8421', total: '0.8421' },
];

const wait = (delay = 120) =>
    new Promise(resolve => setTimeout(resolve, delay));

const clone = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T;

const resolveDataSource = (): SpotDataSource => {
    const config = useRuntimeConfig();
    const raw = String(config.public?.dataSource ?? 'mock');
    if (raw === 'api' || raw === 'binance-bootstrap') return raw;
    return 'mock';
};

const createMockRepository = (): SpotRepository => ({
    async getPairs() {
        await wait();
        return clone(mockPairs);
    },
    async getOpenOrders() {
        await wait();
        return clone(mockOpenOrders);
    },
    async getOrderHistory() {
        await wait();
        return clone(mockHistoryOrders);
    },
    async getMyTrades() {
        await wait();
        return clone(mockMyTrades);
    },
    async getAssets() {
        await wait();
        return clone(mockAssets);
    },
});

export const createSpotRepository = (): SpotRepository => {
    const dataSource = resolveDataSource();

    // PR-1 only unifies boundaries. We keep behavior unchanged by routing every source to mock data for now.
    if (dataSource === 'api') {
        return createMockRepository();
    }

    if (dataSource === 'binance-bootstrap') {
        return createMockRepository();
    }

    return createMockRepository();
};
