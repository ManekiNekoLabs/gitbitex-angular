import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { Trade } from '../models/trade.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TradeService {
  constructor(private http: HttpClient) { }

  getTrades(productId: string, limit: number = 50): Observable<Trade[]> {
    const url = `${environment.apiUrl}/products/${productId}/trades?limit=${limit}`;
    
    return this.http.get<Trade[]>(url).pipe(
      retry(1),
      catchError((error: HttpErrorResponse) => {
        console.warn(`Error fetching trades for ${productId}, using mock data`, error);
        return of(this.generateMockTrades(productId, limit));
      })
    );
  }

  getUserTrades(): Observable<Trade[]> {
    return this.http.get<Trade[]>(`${environment.apiUrl}/orders`).pipe(
      retry(1),
      catchError((error: HttpErrorResponse) => {
        console.warn('Error fetching user trades, returning empty array', error);
        return of([]);
      })
    );
  }

  private generateMockTrades(productId: string, limit: number): Trade[] {
    const trades: Trade[] = [];
    
    // Determine base price based on product
    let basePrice = 50000; // Default for BTC-USD
    if (productId.includes('ETH-USD') || productId.includes('ETH-USDT')) {
      basePrice = 3000;
    } else if (productId.includes('LTC')) {
      basePrice = 200;
    } else if (productId.includes('ETH-BTC')) {
      basePrice = 0.06; // ETH/BTC price
    }
    
    for (let i = 0; i < limit; i++) {
      const priceVariation = (Math.random() - 0.5) * (basePrice * 0.01); // ±0.5% variation
      const price = (basePrice + priceVariation).toFixed(2);
      const size = (Math.random() * 2 + 0.01).toFixed(6);
      const side = Math.random() > 0.5 ? 'buy' : 'sell';
      const time = new Date(Date.now() - i * 60000);
      
      trades.push({
        id: `mock-${Date.now()}-${i}`,
        productId: productId,
        takerOrderId: `taker-${Date.now()}-${i}`,
        makerOrderId: `maker-${Date.now()}-${i}`,
        price: price,
        size: size,
        side,
        time
      });
    }
    
    return trades;
  }
} 