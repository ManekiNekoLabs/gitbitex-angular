export interface Trade {
  id: string;
  productId: string;
  takerOrderId: string;
  makerOrderId: string;
  price: string;
  size: string;
  side: 'buy' | 'sell';
  time: Date;
} 