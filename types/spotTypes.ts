export type PairItem = {
  symbol: string;
  base: string;
  quote: string;
  price: string;
  change: string;
  volume: string;
  tone?: 'up' | 'down';
};

export type TradeItem = {
  id?: string;
  price: number;
  amount: number;
  time: string;
  side?: 'buy' | 'sell';
};

export type OrderItem = {
  id: string;
  pair: string;
  type: string;
  side: string;
  price: string;
  amount: string;
  filled: string;
};

export type TradeHistoryItem = {
  id: string;
  pair: string;
  side: string;
  price: string;
  amount: string;
  time: string;
};

export type AssetItem = {
  asset: string;
  available: string;
  total?: string;
};
