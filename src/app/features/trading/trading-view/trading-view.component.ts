import { Component, OnDestroy, OnInit, AfterViewInit, Inject, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, of } from 'rxjs';
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
import { ResizableDirective } from '../../../shared/directives/resizable.directive';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-trading-view',
  standalone: true,
  imports: [CommonModule, OrderBookComponent, TradeHistoryComponent, OrderFormComponent, ResizableDirective],
  templateUrl: './trading-view.component.html',
  styleUrl: './trading-view.component.scss'
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
  
  private subscriptions: Subscription = new Subscription();
  private productSubscriptions: Set<string> = new Set();
  private componentSizesInitialized = false;

  constructor(
    private productService: ProductService,
    private websocketService: WebsocketService,
    private orderService: OrderService,
    private tradeService: TradeService,
    private healthService: HealthService,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Initialize WebSocket connection
    this.websocketService.checkBackendAvailability();
    
    // Subscribe to WebSocket connection status
    this.subscriptions.add(
      this.websocketService.isConnected().subscribe(connected => {
        console.log('WebSocket connection status:', connected);
        if (connected) {
          this.subscribeToFeeds();
        }
      })
    );

    // Load products
    this.loadProducts();

    // Add event listener for window resize - only in browser environment
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('resize', this.handleWindowResize.bind(this));
    }
    
    // Initialize resizable components after view is initialized
    setTimeout(() => {
      this.initializeResizableComponents();
    }, 500);
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

    // Remove event listener - only in browser environment
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.handleWindowResize.bind(this));
    }
  }

  ngAfterViewInit(): void {
    // Only run in browser environment
    if (isPlatformBrowser(this.platformId)) {
      // Initialize the layout with proper proportions
      setTimeout(() => {
        this.initializeLayout();
      }, 100);
    }
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
      // Unsubscribe from current product
      if (this.selectedProduct) {
        this.unsubscribeFromProductFeed(this.selectedProduct.id);
      }
      
      this.selectedProduct = product;
      
      // Subscribe to new product
      this.subscribeToFeeds();
      
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
    if (!this.selectedProduct) {
      console.warn('No product selected for subscription');
      return;
    }

    console.log('Subscribing to product feed:', this.selectedProduct.id);
    
    // Subscribe to product updates
    this.subscriptions.add(
      this.websocketService.subscribe(`product:${this.selectedProduct.id}`).subscribe({
        next: (data) => {
          console.log('Product update received:', data);
          // Handle product updates
        },
        error: (error) => console.error('Product subscription error:', error)
      })
    );
    
    // Subscribe to match updates
    this.subscriptions.add(
      this.websocketService.subscribe(`match:${this.selectedProduct.id}`).subscribe({
        next: (data) => {
          console.log('Match update received:', data);
          // Handle match updates
        },
        error: (error) => console.error('Match subscription error:', error)
      })
    );
    
    // Add this product to the set of subscribed products
    this.productSubscriptions.add(this.selectedProduct.id);
  }
  
  private unsubscribeFromProductFeed(productId: string): void {
    console.log(`Unsubscribing from product feed: ${productId}`);
    this.websocketService.unsubscribe(`product:${productId}`);
    this.websocketService.unsubscribe(`match:${productId}`);
    this.productSubscriptions.delete(productId);
  }

  public checkBackendHealth(): void {
    // Check if backend is available
    this.productService.getProducts().pipe(
      take(1),
      catchError(error => {
        console.error('Backend health check failed:', error);
        this.error = true;
        this.loading = false;
        // Retry connection after a delay
        this.retryConnection();
        return of([]);
      })
    ).subscribe(products => {
      if (products.length > 0) {
        this.error = false;
        this.loading = false;
        // Initialize WebSocket connection
        this.websocketService.checkBackendAvailability();
      } else {
        this.error = true;
        this.loading = false;
        // Retry connection after a delay
        this.retryConnection();
      }
    });
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
    // Only run in browser environment
    if (isPlatformBrowser(this.platformId)) {
      // Adjust component sizes on window resize
      this.adjustComponentSizes();
    }
  }

  private initializeResizableComponents(): void {
    // Only run in browser environment
    if (!isPlatformBrowser(this.platformId)) return;

    const tradingView = document.querySelector('.trading-view');
    if (!tradingView) return;

    const chartContainer = tradingView.querySelector('.chart-container');
    const orderBookContainer = tradingView.querySelector('.order-book-container');
    const tradeHistoryContainer = tradingView.querySelector('.trade-history-container');
    const orderFormContainer = tradingView.querySelector('.order-form-container');

    if (chartContainer && orderBookContainer && tradeHistoryContainer && orderFormContainer) {
      this.adjustComponentSizes();
    }
  }

  private adjustComponentSizes(): void {
    // Only run in browser environment
    if (!isPlatformBrowser(this.platformId)) return;

    const tradingView = document.querySelector('.trading-view');
    if (!tradingView) return;

    const totalWidth = tradingView.clientWidth;
    
    // Default proportions if not already set
    if (!this.componentSizesInitialized) {
      const chartContainer = tradingView.querySelector('.chart-container') as HTMLElement;
      const orderBookContainer = tradingView.querySelector('.order-book-container') as HTMLElement;
      const tradeHistoryContainer = tradingView.querySelector('.trade-history-container') as HTMLElement;
      const orderFormContainer = tradingView.querySelector('.order-form-container') as HTMLElement;

      if (chartContainer && orderBookContainer && tradeHistoryContainer && orderFormContainer) {
        // Set chart to 50% of the width
        chartContainer.style.width = `${totalWidth * 0.5}px`;
        
        // Distribute remaining 50% equally among the other three components
        const remainingWidth = totalWidth * 0.5;
        const componentWidth = remainingWidth / 3;
        
        orderBookContainer.style.width = `${componentWidth}px`;
        tradeHistoryContainer.style.width = `${componentWidth}px`;
        orderFormContainer.style.width = `${componentWidth}px`;
        
        this.componentSizesInitialized = true;
      }
    }
  }

  private initializeLayout(): void {
    // Only run in browser environment
    if (!isPlatformBrowser(this.platformId)) return;

    const tradingView = document.querySelector('.trading-view');
    if (!tradingView) return;

    const totalWidth = tradingView.clientWidth;
    
    const chartContainer = tradingView.querySelector('.chart-container') as HTMLElement;
    const orderBookContainer = tradingView.querySelector('.order-book-container') as HTMLElement;
    const tradeHistoryContainer = tradingView.querySelector('.trade-history-container') as HTMLElement;
    const orderFormContainer = tradingView.querySelector('.order-form-container') as HTMLElement;

    if (chartContainer && orderBookContainer && tradeHistoryContainer && orderFormContainer) {
      // Set chart to 50% of the width
      chartContainer.style.width = `${totalWidth * 0.5}px`;
      
      // Distribute remaining 50% equally among the other three components
      const remainingWidth = totalWidth * 0.5;
      const componentWidth = remainingWidth / 3;
      
      orderBookContainer.style.width = `${componentWidth}px`;
      tradeHistoryContainer.style.width = `${componentWidth}px`;
      orderFormContainer.style.width = `${componentWidth}px`;
      
      this.componentSizesInitialized = true;
    }
  }
}


