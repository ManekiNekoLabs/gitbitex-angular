import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { OrderService, OrderBookEntry } from '../../../core/services/order.service';
import { WebsocketService } from '../../../core/services/websocket.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-order-book',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-book.component.html',
  styleUrl: './order-book.component.scss'
})
export class OrderBookComponent implements OnInit, OnChanges, OnDestroy {
  @Input() productId: string | undefined;
  
  buyOrders: OrderBookEntry[] = [];
  sellOrders: OrderBookEntry[] = [];
  currentPrice: number = 0;
  priceChangePercent: number = 0;
  isPriceUp: boolean = true;
  
  private subscriptions: Subscription = new Subscription();
  private lastPrice: number = 0;
  private isSubscribed: boolean = false;
  
  constructor(
    private orderService: OrderService,
    private websocketService: WebsocketService
  ) {}
  
  ngOnInit(): void {
    console.log('OrderBookComponent initialized');
    console.log('WebSocket environment:', this.websocketService.getEnvironmentInfo());
    
    if (this.productId) {
      this.loadOrderBook();
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productId'] && !changes['productId'].firstChange) {
      // Unsubscribe from previous product's feed
      if (changes['productId'].previousValue) {
        this.unsubscribeFromOrderBook(changes['productId'].previousValue);
      }
      this.loadOrderBook();
    }
  }
  
  ngOnDestroy(): void {
    if (this.productId) {
      this.unsubscribeFromOrderBook(this.productId);
    }
    this.subscriptions.unsubscribe();
  }
  
  getMaxSize(orders: OrderBookEntry[]): number {
    if (orders.length === 0) return 1;
    return Math.max(...orders.map(order => order.size));
  }
  
  private loadOrderBook(): void {
    if (!this.productId) return;
    
    console.log(`Loading order book for ${this.productId}`);
    
    // Load initial order book data from API
    this.subscriptions.add(
      this.orderService.getOrderBook(this.productId).pipe(
        take(1) // Only take the first emission
      ).subscribe({
        next: (orderBook) => {
          if (!orderBook) {
            console.error('Received null or undefined order book');
            return;
          }
          
          console.log('Received initial order book data:', orderBook);
          this.buyOrders = orderBook.bids || [];
          this.sellOrders = orderBook.asks || [];
          
          // Set current price based on the highest bid
          if (this.buyOrders.length > 0) {
            this.updatePrice(this.buyOrders[0].price);
          } else if (this.sellOrders.length > 0) {
            this.updatePrice(this.sellOrders[0].price);
          }
          
          // Subscribe to WebSocket updates if not already subscribed
          if (!this.isSubscribed) {
            this.subscribeToOrderBook();
          }
        },
        error: (error) => {
          console.error('Error loading order book:', error);
          this.buyOrders = [];
          this.sellOrders = [];
          
          // Still try to subscribe to WebSocket updates even if initial load fails
          if (!this.isSubscribed) {
            this.subscribeToOrderBook();
          }
        }
      })
    );
  }

  private updatePrice(newPrice: number): void {
    if (this.lastPrice > 0) {
      this.isPriceUp = newPrice >= this.lastPrice;
      this.priceChangePercent = ((newPrice - this.lastPrice) / this.lastPrice) * 100;
    }
    this.currentPrice = newPrice;
    this.lastPrice = newPrice;
  }
  
  private subscribeToOrderBook(): void {
    if (!this.productId || this.isSubscribed) return;
    
    console.log(`Subscribing to order book for ${this.productId}`);
    this.isSubscribed = true;
    
    // First subscribe to WebSocket connection status
    this.subscriptions.add(
      this.websocketService.isConnected().subscribe(connected => {
        console.log('WebSocket connection status:', connected);
        if (connected) {
          console.log('WebSocket connected, subscribing to order book and ticker');
          if (!this.subscriptions.closed) {
            this.subscribeToOrderBookUpdates();
            this.subscribeToTickerUpdates();
          }
        } else {
          console.log('WebSocket disconnected');
        }
      })
    );
  }
  
  private subscribeToOrderBookUpdates(): void {
    if (!this.productId) return;

    console.log(`Subscribing to order book updates for ${this.productId}`);
    
    // Subscribe to order book updates via WebSocket
    this.subscriptions.add(
      this.websocketService.subscribe(`level2:${this.productId}`).subscribe({
        next: (data) => {
          console.log('Order book update received:', data);
          if (!data) {
            console.log('Received null data');
            return;
          }
          
          try {
            // Handle initial snapshot
            if (data.type === 'snapshot') {
              console.log('Received order book snapshot:', data);
              this.handleSnapshot(data);
            }
            // Handle incremental updates
            else if (data.type === 'l2update') {
              console.log('Received order book update:', data);
              this.handleUpdate(data);
            } else {
              console.log('Unhandled message type:', data.type);
            }
          } catch (error) {
            console.error('Error processing order book update:', error);
          }
        },
        error: (error) => {
          console.error('Error in order book subscription:', error);
          this.isSubscribed = false;
          // Try to resubscribe after a delay
          setTimeout(() => {
            if (!this.subscriptions.closed) {
              this.subscribeToOrderBook();
            }
          }, 5000);
        },
        complete: () => {
          console.log('Order book subscription completed');
          this.isSubscribed = false;
        }
      })
    );
  }
  
  private subscribeToTickerUpdates(): void {
    if (!this.productId) return;

    console.log(`Subscribing to ticker updates for ${this.productId}`);
    
    // Subscribe to ticker updates via WebSocket
    this.subscriptions.add(
      this.websocketService.subscribe(`ticker:${this.productId}`).subscribe({
        next: (data) => {
          console.log('Ticker update received:', data);
          if (!data || !data.price) {
            return;
          }
          
          try {
            // Update the current price from ticker
            const price = parseFloat(data.price);
            if (!isNaN(price) && price > 0) {
              this.updatePrice(price);
              console.log('Updated price from ticker:', price);
            }
          } catch (error) {
            console.error('Error processing ticker update:', error);
          }
        },
        error: (error) => {
          console.error('Error in ticker subscription:', error);
        }
      })
    );
  }
  
  private handleSnapshot(data: any): void {
    console.log('Processing order book snapshot:', data);
    
    type OrderBookEntryOrNull = OrderBookEntry | null;
    
    // Check if we have the expected data structure
    if (!data || !data.bids || !data.asks) {
      console.error('Invalid snapshot data format:', data);
      return;
    }
    
    if (Array.isArray(data.bids)) {
      console.log('Processing bids:', data.bids);
      this.buyOrders = data.bids
        .map((bid: any) => {
          if (!Array.isArray(bid) || bid.length < 2) {
            console.log('Invalid bid format:', bid);
            return null;
          }
          const price = parseFloat(bid[0]);
          const size = parseFloat(bid[1]);
          if (isNaN(price) || isNaN(size)) {
            console.log('Invalid bid numbers:', { price, size });
            return null;
          }
          return { price, size, side: 'buy' as const };
        })
        .filter((bid: OrderBookEntryOrNull): bid is OrderBookEntry => bid !== null);
      console.log('Processed buy orders:', this.buyOrders);
    }
    
    if (Array.isArray(data.asks)) {
      console.log('Processing asks:', data.asks);
      this.sellOrders = data.asks
        .map((ask: any) => {
          if (!Array.isArray(ask) || ask.length < 2) {
            console.log('Invalid ask format:', ask);
            return null;
          }
          const price = parseFloat(ask[0]);
          const size = parseFloat(ask[1]);
          if (isNaN(price) || isNaN(size)) {
            console.log('Invalid ask numbers:', { price, size });
            return null;
          }
          return { price, size, side: 'sell' as const };
        })
        .filter((ask: OrderBookEntryOrNull): ask is OrderBookEntry => ask !== null);
      console.log('Processed sell orders:', this.sellOrders);
    }
    
    // Sort the orders
    this.buyOrders.sort((a, b) => b.price - a.price);  // Descending for buy orders
    this.sellOrders.sort((a, b) => a.price - b.price); // Ascending for sell orders
    
    // Update the current price
    if (this.buyOrders.length > 0 || this.sellOrders.length > 0) {
      const bestBid = this.buyOrders.length > 0 ? this.buyOrders[0].price : 0;
      const bestAsk = this.sellOrders.length > 0 ? this.sellOrders[0].price : 0;
      
      console.log('Best bid:', bestBid, 'Best ask:', bestAsk);
      
      if (bestBid > 0) {
        this.updatePrice(bestBid);
      } else if (bestAsk > 0) {
        this.updatePrice(bestAsk);
      }
    }
  }
  
  private handleUpdate(data: any): void {
    console.log('Processing order book update:', data);
    
    // Check if we have the expected data structure
    if (!data || !data.changes) {
      console.error('Invalid update data format:', data);
      return;
    }
    
    // Process the changes
    if (Array.isArray(data.changes)) {
      data.changes.forEach((change: any) => {
        if (!Array.isArray(change) || change.length < 3) {
          console.log('Invalid change format:', change);
          return;
        }
        
        const side = change[0].toLowerCase();
        const price = parseFloat(change[1]);
        const size = parseFloat(change[2]);
        
        if (isNaN(price) || isNaN(size)) {
          console.log('Invalid change numbers:', { price, size });
          return;
        }
        
        console.log(`Processing ${side} order change: price=${price}, size=${size}`);
        
        // Update the order book
        if (side === 'buy') {
          this.updateOrderLevel(this.buyOrders, price, size, 'buy');
        } else if (side === 'sell') {
          this.updateOrderLevel(this.sellOrders, price, size, 'sell');
        }
      });
      
      // Sort the orders after updates
      this.buyOrders.sort((a, b) => b.price - a.price);  // Descending for buy orders
      this.sellOrders.sort((a, b) => a.price - b.price); // Ascending for sell orders
      
      // Update the current price if needed
      if (this.buyOrders.length > 0) {
        this.updatePrice(this.buyOrders[0].price);
      } else if (this.sellOrders.length > 0) {
        this.updatePrice(this.sellOrders[0].price);
      }
    }
  }
  
  private updateOrderLevel(orders: OrderBookEntry[], price: number, size: number, side: 'buy' | 'sell'): void {
    const index = orders.findIndex(order => order.price === price);
    
    if (size === 0) {
      // Remove the price level if size is 0
      if (index !== -1) {
        orders.splice(index, 1);
      }
    } else {
      if (index !== -1) {
        // Update existing price level
        orders[index] = { price, size, side: side as 'buy' | 'sell' };
      } else {
        // Add new price level
        orders.push({ price, size, side: side as 'buy' | 'sell' });
        // Sort buy orders in descending order, sell orders in ascending order
        orders.sort((a, b) => side === 'buy' ? b.price - a.price : a.price - b.price);
      }
    }
  }
  
  private unsubscribeFromOrderBook(productId: string): void {
    console.log(`Unsubscribing from order book for ${productId}`);
    this.websocketService.unsubscribe(`level2:${productId}`);
    this.websocketService.unsubscribe(`ticker:${productId}`);
    this.isSubscribed = false;
  }
}
