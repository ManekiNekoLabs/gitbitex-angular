export interface Wallet {
  id: string;
  userId: string;
  currency: string;
  available: string;
  hold: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  userId: string;
  currency: string;
  amount: string;
  type: 'deposit' | 'withdrawal' | 'transfer';
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
} 