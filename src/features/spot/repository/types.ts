import type { AssetItem, OrderItem, PairItem, TradeItem } from '~~/types/spotTypes';

export type SpotDataSource = 'mock' | 'binance-bootstrap' | 'api';

export interface SpotRepository {
    getPairs(): Promise<PairItem[]>;
    getOpenOrders(): Promise<OrderItem[]>;
    getOrderHistory(): Promise<OrderItem[]>;
    getMyTrades(): Promise<TradeItem[]>;
    getAssets(): Promise<AssetItem[]>;
}
