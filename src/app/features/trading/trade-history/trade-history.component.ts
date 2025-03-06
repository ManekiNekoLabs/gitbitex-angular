import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TradeService } from '../../../core/services/trade.service';
import { WebsocketService } from '../../../core/services/websocket.service';
import { Trade } from '../../../core/models/trade.model';

@Component({
  selector: 'app-trade-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trade-history.component.html',
  styleUrl: './trade-history.component.scss'
})
export class TradeHistoryComponent implements OnInit, OnChanges, OnDestroy {
  @Input() productId: string | undefined;
  
  trades: Trade[] = [];
  isLoading = false;
  error: string | null = null;
  
  private subscriptions: Subscription = new Subscription();
  
  constructor(
    private tradeService: TradeService,
    private websocketService: WebsocketService
  ) {}
  
  ngOnInit(): void {
    if (this.productId) {
      this.loadTrades();
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productId'] && !changes['productId'].firstChange) {
      this.loadTrades();
    }
  }
  
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
  
  loadTrades(): void {
    if (!this.productId) return;
    
    // Unsubscribe from previous subscriptions
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    
    this.isLoading = true;
    this.error = null;
    
    // Load initial trade history from API
    this.subscriptions.add(
      this.tradeService.getTrades(this.productId).subscribe({
        next: (trades) => {
          this.trades = trades;
          this.isLoading = false;
          
          // Subscribe to WebSocket after initial data is loaded
          this.subscribeToTradeUpdates();
        },
        error: (error) => {
          console.error('Error loading trades:', error);
          this.error = 'Failed to load trade history';
          this.isLoading = false;
          
          // Still try to subscribe to WebSocket even if initial load fails
          this.subscribeToTradeUpdates();
        }
      })
    );
  }
  
  private subscribeToTradeUpdates(): void {
    if (!this.productId) return;
    
    console.log(`Subscribing to trade updates for ${this.productId}`);
    
    // First check WebSocket connection status
    this.subscriptions.add(
      this.websocketService.isConnected().subscribe(connected => {
        if (connected) {
          // Subscribe to match channel
          console.log(`Subscribing to match channel for ${this.productId}`);
          this.subscriptions.add(
            this.websocketService.subscribe(`match:${this.productId}`).subscribe({
              next: (data) => {
                console.log('Trade update received from match channel:', data);
                this.handleTradeUpdate(data);
              },
              error: (error) => console.error('WebSocket match subscription error:', error)
            })
          );
          
          // Also try manual subscription with non-null assertion since we've already checked
          this.websocketService.subscribeToTrades(this.productId!);
        } else {
          console.log('WebSocket not connected, will subscribe when connected');
        }
      })
    );
  }
  
  private handleTradeUpdate(data: any): void {
    if (!data) {
      console.log('Received null trade data');
      return;
    }
    
    console.log('Processing trade update:', data);
    
    // Create a new trade from the WebSocket data
    try {
      const newTrade: Trade = {
        id: data.tradeId || data.trade_id || `ws-${Date.now()}`,
        productId: data.productId || data.product_id || this.productId || '',
        takerOrderId: data.takerOrderId || data.taker_order_id || '',
        makerOrderId: data.makerOrderId || data.maker_order_id || '',
        price: data.price || '0',
        size: data.size || '0',
        side: data.side || 'buy',
        time: new Date(data.time || Date.now())
      };
      
      console.log('Created new trade object:', newTrade);
      
      // Add the new trade to the beginning of the array
      this.trades = [newTrade, ...this.trades.slice(0, 49)];
    } catch (error) {
      console.error('Error processing trade data:', error, data);
    }
  }
}
