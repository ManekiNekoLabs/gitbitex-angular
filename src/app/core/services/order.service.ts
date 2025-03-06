import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, retry, map } from 'rxjs/operators';
import { Order, OrderSide, OrderType } from '../models/order.model';
import { environment } from '../../../environments/environment';

export interface OrderBookEntry {
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private readonly API_URL = `${environment.apiUrl}/orders`;
  private readonly BOOK_URL = `${environment.apiUrl}/book`;

  constructor(private http: HttpClient) { }

  getOrders(productId?: string): Observable<Order[]> {
    let url = this.API_URL;
    if (productId) {
      url += `?product_id=${productId}`;
    }

    return this.http.get<Order[]>(url).pipe(
      retry(1),
      catchError((error: HttpErrorResponse) => {
        console.warn('Error fetching orders, returning empty array', error);
        return of([]);
      })
    );
  }

  getOrderBook(productId: string, level: number = 2): Observable<OrderBook> {
    const url = `${environment.apiUrl}/products/${productId}/book?level=${level}`;
    
    return this.http.get<any>(url).pipe(
      retry(1),
      catchError((error: HttpErrorResponse) => {
        console.warn(`Error fetching order book for ${productId}, using mock data`, error);
        return of(this.generateMockOrderBook(productId));
      }),
      map((response: any) => {
        // If response is null or undefined, return mock data
        if (!response) {
          console.warn(`Null response when fetching order book for ${productId}, using mock data`);
          return this.generateMockOrderBook(productId);
        }
        
        // Check if the response is already in the expected format
        if (response.bids && response.asks && 
            Array.isArray(response.bids) && Array.isArray(response.asks)) {
          
          // Convert the response to our OrderBook format
          const orderBook: OrderBook = {
            bids: response.bids.map((bid: any) => ({
              price: parseFloat(bid[0]),
              size: parseFloat(bid[1]),
              side: 'buy'
            })),
            asks: response.asks.map((ask: any) => ({
              price: parseFloat(ask[0]),
              size: parseFloat(ask[1]),
              side: 'sell'
            }))
          };
          
          return orderBook;
        }
        
        // If the response doesn't have the expected format, return mock data
        console.warn(`Unexpected response format for order book of ${productId}, using mock data`, response);
        return this.generateMockOrderBook(productId);
      })
    );
  }

  createOrder(
    productId: string,
    side: OrderSide,
    type: OrderType,
    size?: string,
    price?: string,
    funds?: string
  ): Observable<Order> {
    const order: any = {
      product_id: productId,
      side,
      type
    };

    if (size) order.size = size;
    if (price) order.price = price;
    if (funds) order.funds = funds;

    return this.http.post<Order>(this.API_URL, order).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error creating order', error);
        return throwError(() => new Error('Failed to create order. Please try again.'));
      })
    );
  }

  cancelOrder(orderId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${orderId}`).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error canceling order', error);
        return throwError(() => new Error('Failed to cancel order. Please try again.'));
      })
    );
  }

  cancelAllOrders(productId?: string): Observable<void> {
    let url = `${this.API_URL}`;
    if (productId) {
      url += `?product_id=${productId}`;
    }

    return this.http.delete<void>(url).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error canceling all orders', error);
        return throwError(() => new Error('Failed to cancel orders. Please try again.'));
      })
    );
  }

  private generateMockOrderBook(productId: string): OrderBook {
    const bids: OrderBookEntry[] = [];
    const asks: OrderBookEntry[] = [];
    
    // Determine base price based on product
    let basePrice = 50000; // Default for BTC-USD
    if (productId.includes('ETH')) {
      basePrice = 3000;
    } else if (productId.includes('LTC')) {
      basePrice = 200;
    }
    
    // Generate buy orders (bids)
    for (let i = 0; i < 10; i++) {
      const priceOffset = i * (basePrice * 0.001); // 0.1% steps
      const price = basePrice - priceOffset;
      const size = Math.random() * 2 + 0.1; // Random size between 0.1 and 2.1
      
      bids.push({
        price,
        size,
        side: 'buy'
      });
    }
    
    // Generate sell orders (asks)
    for (let i = 0; i < 10; i++) {
      const priceOffset = i * (basePrice * 0.001); // 0.1% steps
      const price = basePrice + priceOffset;
      const size = Math.random() * 2 + 0.1; // Random size between 0.1 and 2.1
      
      asks.push({
        price,
        size,
        side: 'sell'
      });
    }
    
    // Sort orders
    bids.sort((a, b) => b.price - a.price); // Descending for bids
    asks.sort((a, b) => a.price - b.price); // Ascending for asks
    
    return { bids, asks };
  }
}
