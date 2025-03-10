import { Component, OnDestroy, OnInit, AfterViewInit, Inject, PLATFORM_ID, HostListener, NgZone, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, Subscription, of, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, tap, take } from 'rxjs/operators';
import { Product } from '../../../core/models/product.model';
import { ProductService } from '../../../core/services/product.service';
import { WebsocketService } from '../../../core/services/websocket.service';
import { OrderService } from '../../../core/services/order.service';
import { TradeService } from '../../../core/services/trade.service';
import { HealthService } from '../../../core/services/health.service';
import { OrderBookComponent } from '../order-book/order-book.component';
import { TradeHistoryComponent } from '../trade-history/trade-history.component';
import { CommonModule } from '@angular/common';
import { OrderFormComponent } from '../order-form/order-form.component';
import { isPlatformBrowser } from '@angular/common';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

// Import lightweight chart component only
import { LightweightChartComponent } from '../lightweight-chart/lightweight-chart.component';

// Define the TickerData interface
interface TickerData {
  close24h: string;
  high24h: string;
  lastSize: string;
  low24h: string;
  open24h: string;
  price: string;
  productId: string;
  sequence: number;
  side: string;
  time: string;
  tradeId: number;
  type: string;
  volume24h: string;
  volume30d: string;
  _timestamp?: number; // Optional timestamp for change detection
}

@Component({
  selector: 'app-trading-view',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatGridListModule,
    MatCardModule,
    MatDividerModule,
    OrderBookComponent,
    TradeHistoryComponent,
    OrderFormComponent,
    LightweightChartComponent
  ],
  templateUrl: './trading-view.component.html',
  styleUrl: './trading-view.component.scss',
  changeDetection: ChangeDetectionStrategy.Default
})
export class TradingViewComponent implements OnInit, OnDestroy, AfterViewInit {
  products: Product[] = [];
  selectedProduct: Product | null = null;
  loading = true;
  error = false;
  usingMockData = false;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'connecting';
  backendStatus: 'available' | 'unavailable' | 'checking' = 'checking';
  wsConnected = false;
  lastTickerUpdate: Date | null = null;

  private subscriptions: Subscription = new Subscription();
  private productSubscriptions: Set<string> = new Set();
  private componentSizesInitialized = false;

  isSmallScreen = false;

  // Use BehaviorSubject for ticker data
  private tickerDataSubject = new BehaviorSubject<TickerData | null>(null);
  tickerData$ = this.tickerDataSubject.asObservable();

  // Keep a reference to the current ticker data
  get tickerData(): TickerData | null {
    return this.tickerDataSubject.value;
  }

  set tickerData(value: TickerData | null) {
    this.tickerDataSubject.next(value);
  }

  constructor(
    private productService: ProductService,
    private websocketService: WebsocketService,
    private orderService: OrderService,
    private tradeService: TradeService,
    private healthService: HealthService,
    private route: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Initialize WebSocket connection
    this.websocketService.checkBackendAvailability();

    // Subscribe to backend availability status
    this.subscriptions.add(
      this.websocketService.isBackendAvailable().subscribe(status => {
        console.log('Backend availability status:', status);
        this.backendStatus = status;
        this.cdr.markForCheck();
      })
    );

    // Subscribe to WebSocket connection status
    this.subscriptions.add(
      this.websocketService.isConnected().subscribe(connected => {
        console.log('WebSocket connection status:', connected);
        this.wsConnected = connected;

        if (connected) {
          // When connected, subscribe to feeds for the selected product
          this.subscribeToFeeds();

          // Also subscribe to ticker updates
          this.subscribeToTickerUpdates();

          // Subscribe to all WebSocket messages for debugging
          this.subscribeToAllMessages();

        } else {
          // Reset ticker data when disconnected
          this.tickerData = null;
        }
      })
    );

    // Load products
    this.loadProducts();

    // Check screen size on init
    if (isPlatformBrowser(this.platformId)) {
      this.checkScreenSize();
    }
  }

  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    this.subscriptions.unsubscribe();

    // Unsubscribe from all product feeds
    this.productSubscriptions.forEach(productId => {
      this.websocketService.unsubscribe(`product:${productId}`);
    });
    this.productSubscriptions.clear();

    // Disconnect from WebSocket
    this.websocketService.disconnect();

    // Clear auto-refresh interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
  }

  ngAfterViewInit(): void {
    // No need for the old layout initialization
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    this.isSmallScreen = window.innerWidth < 1200;
  }

  private loadProducts(): void {
    this.subscriptions.add(
      this.productService.getProducts().pipe(
        tap(products => {
          console.log('Loaded products:', products);
          this.products = products;

          // If we have a BTC-USDT product, make sure it's first in the list
          const btcUsdtIndex = this.products.findIndex(p => p.id === 'BTC-USDT');
          if (btcUsdtIndex > 0) {
            const btcUsdt = this.products.splice(btcUsdtIndex, 1)[0];
            this.products.unshift(btcUsdt);
          }
        }),
        catchError(error => {
          console.error('Error loading products:', error);
          // Create mock products for development
          this.products = [
            {
              id: 'BTC-USDT',
              baseCurrency: 'BTC',
              quoteCurrency: 'USDT',
              baseMinSize: '0.001',
              baseMaxSize: '100',
              quoteIncrement: '0.01',
              displayName: 'BTC/USDT',
              status: 'online',
              minMarketFunds: '10',
              maxMarketFunds: '1000000',
              postOnly: false,
              limitOnly: false,
              cancelOnly: false
            },
            {
              id: 'ETH-USDT',
              baseCurrency: 'ETH',
              quoteCurrency: 'USDT',
              baseMinSize: '0.01',
              baseMaxSize: '1000',
              quoteIncrement: '0.01',
              displayName: 'ETH/USDT',
              status: 'online',
              minMarketFunds: '10',
              maxMarketFunds: '1000000',
              postOnly: false,
              limitOnly: false,
              cancelOnly: false
            }
          ];
          return of(this.products);
        })
      ).subscribe(products => {
        if (products.length > 0) {
          const productId = this.route.snapshot.paramMap.get('productId');
          if (productId) {
            const product = products.find(p => p.id === productId);
            if (product) {
              this.selectedProduct = product;
            } else {
              this.selectedProduct = products[0];
              this.router.navigate(['/trading', this.selectedProduct.id]);
            }
          } else {
            this.selectedProduct = products[0];
            this.router.navigate(['/trading', this.selectedProduct.id]);
          }

          // Only subscribe if connected and not already subscribed
          if (this.wsConnected && this.selectedProduct && !this.productSubscriptions.has(this.selectedProduct.id)) {
            this.subscribeToFeeds();
          }
        }
        this.loading = false;
      }, error => {
        console.error('Error loading products:', error);
        this.error = true;
        this.loading = false;
      })
    );
  }

  onProductSelect(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const selectedProductId = selectElement.value;

    if (selectedProductId) {
      const product = this.products.find(p => p.id === selectedProductId);
      if (product) {
        this.selectProduct(product);
      }
    }
  }

  selectProduct(product: Product): void {
    if (product && product.id !== this.selectedProduct?.id) {
      // Unsubscribe from current product's ticker
      if (this.selectedProduct) {
        const currentTickerChannel = `ticker:${this.selectedProduct.id}`;
        this.websocketService.unsubscribe(currentTickerChannel);
        this.unsubscribeFromProductFeed(this.selectedProduct.id);
      }

      this.selectedProduct = product;

      // Reset ticker data when changing products
      this.tickerData = null;

      // Subscribe to new product's feeds
      this.subscribeToFeeds();

      // Subscribe to ticker updates for the new product
      this.subscribeToTickerUpdates();

      // Navigate to the product's trading page
      this.router.navigate(['/trading', product.id]);
    }
  }

  public reconnectWebSocket(): void {
    console.log('Attempting to reconnect WebSocket...');
    this.websocketService.disconnect();
    setTimeout(() => {
      this.websocketService.checkBackendAvailability();

      // Resubscribe to product feed if a product is selected
      if (this.selectedProduct) {
        this.subscribeToFeeds();
      }
    }, 1000);
  }

  public retryConnection(): void {
    console.log('Retrying WebSocket connection...');
    setTimeout(() => {
      // Try to reconnect
      this.websocketService.checkBackendAvailability();

      // Resubscribe to product feed if a product is selected
      if (this.selectedProduct) {
        this.subscribeToFeeds();
      }
    }, 1000);
  }

  private subscribeToFeeds(): void {
    if (!this.selectedProduct) return;

    const productId = this.selectedProduct.id;

    // Check if we're already subscribed to this product
    if (this.productSubscriptions.has(productId)) {
      console.log(`Already subscribed to feeds for ${productId}`);
      return;
    }

    console.log(`Subscribing to feeds for ${productId}`);

    // Subscribe to all channels for this product
    this.websocketService.send({
      type: 'subscribe',
      product_ids: [productId],
      channels: ['ticker', 'level2', 'matches']  // Subscribe to all needed channels
    });

    // Add to our set of subscribed products
    this.productSubscriptions.add(productId);

    // Subscribe to individual channel updates
    this.subscribeToTickerUpdates();
    this.subscribeToOrderBookUpdates();
    this.subscribeToTradeUpdates();
  }

  private unsubscribeFromProductFeed(productId: string): void {
    if (!this.productSubscriptions.has(productId)) {
      console.log(`Not subscribed to ${productId}, no need to unsubscribe`);
      return;
    }

    console.log(`Unsubscribing from feeds for ${productId}`);

    // Unsubscribe from all channels
    this.websocketService.send({
      type: 'unsubscribe',
      product_ids: [productId],
      channels: ['ticker', 'level2', 'matches']
    });

    // Unsubscribe from individual channel subscriptions
    this.websocketService.unsubscribe(`ticker:${productId}`);
    this.websocketService.unsubscribe(`level2:${productId}`);
    this.websocketService.unsubscribe(`matches:${productId}`);

    // Remove from our set of subscribed products
    this.productSubscriptions.delete(productId);
  }

  public checkBackendHealth(): void {
    // Set status to checking
    this.backendStatus = 'checking';

    // Use the WebsocketService to check backend availability
    this.websocketService.checkBackendAvailability();
  }

  private checkIfUsingMockData(): void {
    // Check if we're using mock data by testing the API
    this.subscriptions.add(
      this.orderService.getOrderBook(this.selectedProduct?.id || 'BTC-USDT')
        .pipe(
          catchError(error => {
            // If we get an error, we're likely using mock data
            this.usingMockData = true;
            return of(null);
          })
        )
        .subscribe(orderBook => {
          // If we got a response and it has a mock flag, we're using mock data
          if (orderBook && 'isMockData' in orderBook && orderBook.isMockData) {
            this.usingMockData = true;
          }
        })
    );

    // Also check with the trade service
    this.subscriptions.add(
      this.tradeService.getTrades(this.selectedProduct?.id || 'BTC-USDT')
        .pipe(
          catchError(error => {
            // If we get an error, we're likely using mock data
            this.usingMockData = true;
            return of([]);
          })
        )
        .subscribe(trades => {
          // If we got a response and it has a mock flag, we're using mock data
          if (trades && trades.length > 0 && 'isMockData' in trades[0] && trades[0].isMockData) {
            this.usingMockData = true;
          }
        })
    );
  }

  private handleWindowResize(): void {
    // Only check screen size now
    this.checkScreenSize();
  }

  private initializeResizableComponents(): void {
    // No longer needed with the grid layout
  }

  private adjustComponentSizes(): void {
    // No longer needed with the grid layout
  }

  private initializeLayout(): void {
    // No longer needed with the grid layout
  }

  private subscribeToTickerUpdates(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    console.log('Subscribing to ticker updates...');

    // Only subscribe if we have a selected product
    if (!this.selectedProduct) {
      console.log('No product selected, skipping ticker subscription');
      return;
    }

    const tickerChannel = `ticker:${this.selectedProduct.id}`;
    // console.log(`Subscribing to ticker channel: ${tickerChannel}`);

    // Subscribe to ticker channel
    this.subscriptions.add(
      this.websocketService.subscribe(tickerChannel).subscribe(
        (data: any) => {
          // console.log('Received data from ticker channel:', data);

          // Use NgZone to ensure change detection runs
          this.ngZone.run(() => {
            // console.log('Before update - tickerData:', this.tickerData);

            // Ensure volume data is properly formatted
            if (data.volume24h) {
              // console.log('Original volume24h:', data.volume24h);
              // Make sure volume is a string
              data.volume24h = data.volume24h.toString();
            }

            // Create a new object to ensure change detection
            const updatedData = {
              ...data,
              _timestamp: new Date().getTime() // Add timestamp to force update
            };

            // Update the ticker data
            this.tickerData = updatedData;
            this.lastTickerUpdate = new Date();

            // console.log('After update - tickerData:', this.tickerData);

            // Log the values to verify we're getting the data
            // console.log('Updated price from ticker:', data.price);
            // console.log('Updated 24h Change:', this.getPercentChange());
            // console.log('Updated 24h High:', data.high24h);
            // console.log('Updated 24h Low:', data.low24h);
            // console.log('Updated 24h Volume:', data.volume24h);
            // console.log('Formatted 24h Volume:', this.formatVolume(data.volume24h));

            // Explicitly trigger change detection
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          });
        },
        error => {
          console.error('Error subscribing to ticker:', error);
        }
      )
    );
  }

  // Calculate percent change between open24h and current price
  getPercentChange(): number {
    if (!this.tickerData || !this.tickerData.open24h || !this.tickerData.price) {
      return 0;
    }

    const open = parseFloat(this.tickerData.open24h);
    const current = parseFloat(this.tickerData.price);

    if (open === 0) return 0;

    const percentChange = ((current - open) / open) * 100;
    return parseFloat(percentChange.toFixed(2));
  }

  // Format volume data for display
  formatVolume(volume: string | undefined): string {
    if (!volume) return '0.00';

    const volumeNum = parseFloat(volume);

    // Log the volume for debugging
    // console.log('Formatting volume:', volume, 'as number:', volumeNum);

    // Format based on size
    if (volumeNum >= 1000000) {
      return (volumeNum / 1000000).toFixed(2) + 'M';
    } else if (volumeNum >= 1000) {
      return (volumeNum / 1000).toFixed(2) + 'K';
    } else {
      return volumeNum.toFixed(2);
    }
  }

  // Debug method to manually set ticker data
  public setDebugTickerData(): void {
    // console.log('Setting debug ticker data');

    if (this.selectedProduct) {
      // Generate a random volume between 10,000 and 100,000
      const randomVolume = (Math.floor(Math.random() * 90000) + 10000).toString();

      const mockTickerData: TickerData = {
        close24h: "6",
        high24h: "9",
        lastSize: "4",
        low24h: "9",
        open24h: "9",
        price: Math.floor(Math.random() * 10).toString(), // Random price for testing updates
        productId: this.selectedProduct.id,
        sequence: 0,
        side: Math.random() > 0.5 ? "buy" : "sell", // Randomly alternate buy/sell
        time: new Date().toISOString(),
        tradeId: 13852,
        type: "ticker",
        volume24h: randomVolume, // Random volume for testing
        volume30d: (parseInt(randomVolume) * 30).toString(), // 30x the 24h volume for testing
        _timestamp: new Date().getTime()
      };

      this.ngZone.run(() => {
        // Update the ticker data
        this.tickerData = mockTickerData;
        this.lastTickerUpdate = new Date();

        // console.log('Debug ticker data set:', this.tickerData);
        // console.log('Random price set:', mockTickerData.price);
        // console.log('Random volume set:', mockTickerData.volume24h);

        // Explicitly trigger change detection
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      });
    }
  }

  // Subscribe to all WebSocket messages for debugging
  private subscribeToAllMessages(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    console.log('Subscribing to all WebSocket messages for debugging...');

    this.subscriptions.add(
      this.websocketService.onMessage().subscribe(
        (message: any) => {
          // console.log('WebSocket message received:', message);
        },
        error => {
          console.error('Error subscribing to all messages:', error);
        }
      )
    );
  }

  // Auto-refresh ticker data for testing
  private autoRefreshInterval: any;

  private startAutoRefresh(): void {
    if (isPlatformBrowser(this.platformId)) {
      console.log('Starting auto-refresh for testing...');

      // Clear any existing interval
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
      }

      // Add to subscriptions to ensure cleanup
      this.subscriptions.add({
        unsubscribe: () => {
          if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
          }
        }
      });
    }
  }

  // Add new methods for order book and trade subscriptions
  private subscribeToOrderBookUpdates(): void {
    if (!this.selectedProduct) return;

    const channel = `level2:${this.selectedProduct.id}`;
    // console.log(`Subscribing to order book updates: ${channel}`);

    this.subscriptions.add(
      this.websocketService.subscribe(channel).subscribe(
        (data: any) => {
          // console.log('Received order book update:', data);
          // Handle order book updates
          if (data.type === 'snapshot') {
            // Handle initial snapshot
            // console.log('Received order book snapshot:', data);
          } else if (data.type === 'l2update') {
            // Handle incremental updates
            // console.log('Received order book update:', data);
          }
        },
        error => {
          console.error('Error subscribing to order book:', error);
        }
      )
    );
  }

  private subscribeToTradeUpdates(): void {
    if (!this.selectedProduct) return;

    const channel = `matches:${this.selectedProduct.id}`;
    // console.log(`Subscribing to trade updates: ${channel}`);

    this.subscriptions.add(
      this.websocketService.subscribe(channel).subscribe(
        (data: any) => {
          // console.log('Received trade update:', data);
          // Handle trade updates
          if (data.type === 'match') {
            // console.log('Received trade match:', data);
          }
        },
        error => {
          console.error('Error subscribing to trades:', error);
        }
      )
    );
  }
}


