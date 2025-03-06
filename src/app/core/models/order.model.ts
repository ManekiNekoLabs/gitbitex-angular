export enum OrderSide {
  BUY = 'buy',
  SELL = 'sell'
}

export enum OrderType {
  LIMIT = 'limit',
  MARKET = 'market'
}

export enum OrderStatus {
  OPEN = 'open',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  PENDING = 'pending'
}

export interface Order {
  id: string;
  userId: string;
  productId: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  size: string;
  price: string;
  funds: string;
  filledSize: string;
  executedValue: string;
  createdAt: Date;
  updatedAt: Date;
} 