export interface Product {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseMinSize: string;
  baseMaxSize: string;
  quoteIncrement: string;
  displayName: string;
  status: string;
  minMarketFunds: string;
  maxMarketFunds: string;
  postOnly: boolean;
  limitOnly: boolean;
  cancelOnly: boolean;
  price?: number;
  volume?: number;
} 