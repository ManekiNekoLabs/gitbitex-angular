import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, Input, OnChanges, SimpleChanges, NgZone, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { WebsocketService } from '../../../core/services/websocket.service';
import { Subscription, timer } from 'rxjs';
import { environment } from '../../../../environments/environment';

// Interface for our candle data
interface CandleData {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.scss']
})
export class ChartComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  @Input() productId: string = '';
  @Input() containerWidth: number = 800;
  @Input() containerHeight: number = 500;

  // Chart elements
  private ctx: CanvasRenderingContext2D | null = null;
  private resizeTimeout: any = null;
  private subscriptions: Subscription = new Subscription();
  private pollingSubscription: Subscription = new Subscription();
  private interval: number = 3600; // Default to 1-hour candles (changed to make testing easier)
  private intervals = [60, 300, 900, 3600, 86400]; // 1min, 5min, 15min, 1h, 1d
  private pollingInterval = 10000; // 10 seconds
  private chartInitialized = false;
  
  // Make this public for the template
  public selectedIntervalIndex = 3; // Default to 1h (index 3)
  
  // Debug information
  public showDebug = true; // Always show debug initially
  public errorMessage = '';
  public hasData = false;
  public candleCount = 0;
  public lastUpdateTime: Date | null = null;
  
  // Store candle data
  private candles: CandleData[] = [];
  private lastCandle: CandleData | null = null;
  private lastUpdate = 0;
  
  constructor(
    private http: HttpClient, 
    private websocketService: WebsocketService,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    console.log('Chart component initialized');
    this.subscribeToWindowResize();
    
    // Timeout to show an error if data doesn't load
    setTimeout(() => {
      if (!this.hasData && !this.errorMessage) {
        this.errorMessage = 'Data loading timeout. This could be due to no candle data available or a connection issue.';
      }
    }, 10000);
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    console.log('Chart afterViewInit, initializing chart...');
    // Set a slightly longer delay to ensure the container is fully rendered
    setTimeout(() => {
      this.initializeChart();
      this.loadInitialCandles();
    }, 500);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (changes['productId'] && !changes['productId'].firstChange) {
      console.log('Product changed, reloading chart data:', this.productId);
      this.errorMessage = '';
      this.hasData = false;
      
      // Product changed, reload chart data
      this.loadInitialCandles();
      this.restartCandlePolling();
    }
    
    if (changes['containerWidth'] || changes['containerHeight']) {
      this.resizeChart();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.pollingSubscription.unsubscribe();
    
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  private initializeChart(): void {
    if (!this.chartCanvas) {
      console.error('Chart canvas not found');
      this.errorMessage = 'Chart canvas not found';
      return;
    }
    
    const canvas = this.chartCanvas.nativeElement;
    this.ctx = canvas.getContext('2d');
    
    if (!this.ctx) {
      console.error('Failed to get canvas context');
      this.errorMessage = 'Failed to initialize chart canvas';
      return;
    }
    
    // Set up canvas dimensions
    canvas.width = this.containerWidth;
    canvas.height = this.containerHeight;
    
    console.log('Canvas initialized:', canvas.width, 'x', canvas.height);
    this.chartInitialized = true;
  }

  private resizeChart(): void {
    if (!this.chartCanvas || !this.ctx || !isPlatformBrowser(this.platformId)) return;
    
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    this.resizeTimeout = setTimeout(() => {
      const canvas = this.chartCanvas.nativeElement;
      canvas.width = this.containerWidth;
      canvas.height = this.containerHeight;
      
      console.log('Canvas resized:', canvas.width, 'x', canvas.height);
      
      // Redraw the chart if we have data
      if (this.hasData) {
        this.drawChart();
      }
    }, 100);
  }

  private subscribeToWindowResize(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    window.addEventListener('resize', () => {
      if (this.chartCanvas) {
        const width = this.chartCanvas.nativeElement.parentElement?.clientWidth || this.containerWidth;
        const height = this.chartCanvas.nativeElement.parentElement?.clientHeight || this.containerHeight;
        
        if (width > 0 && height > 0) {
          this.containerWidth = width;
          this.containerHeight = height;
          this.resizeChart();
        }
      }
    });
  }

  private loadInitialCandles(): void {
    if (!this.productId || !isPlatformBrowser(this.platformId)) return;
    
    console.log(`Loading candles for ${this.productId} with interval ${this.interval}`);
    
    const url = `${environment.apiUrl}/products/${this.productId}/candles?granularity=${this.interval}&limit=100`;
    console.log(`Requesting candles from URL: ${url}`);
    
    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        console.log('Received candles response:', data);
        
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.log('No candle data received or empty array');
          this.errorMessage = 'No candle data available for this product and time interval.';
          this.showDebug = true;
          this.hasData = false;
          return;
        }
        
        // Clear error message if we get data
        this.errorMessage = '';
        
        this.processCandles(data);
      },
      error: (error) => {
        console.error('Error loading candles:', error);
        console.log('Request URL was:', url);
        
        // Set error message
        this.errorMessage = `Failed to load candle data: ${error.status || 'Network error'}`;
        this.showDebug = true;
        this.hasData = false;
        
        // Check if the error is related to CORS or network
        if (error.status === 0) {
          console.error('This might be a CORS or network connectivity issue');
        }
        
        // Check for 404
        if (error.status === 404) {
          console.error('Endpoint not found. The candles API may not be implemented on the backend');
        }
      }
    });
  }

  private processCandles(data: any[]): void {
    try {
      console.log('Processing candle data with count:', data.length);
      
      // Format candle data
      this.candles = data.map(candle => {
        return {
          time: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]) || 0
        };
      });
      
      // Reverse so newest is last (for drawing left to right)
      this.candles.reverse();
      
      this.candleCount = this.candles.length;
      this.hasData = true;
      
      // Set the last candle
      if (this.candles.length > 0) {
        this.lastCandle = this.candles[this.candles.length - 1];
        console.log('Latest candle:', this.lastCandle);
        this.lastUpdate = Date.now();
        this.lastUpdateTime = new Date();
      }
      
      // Draw the chart
      this.drawChart();
      
      // Hide debug after successful load unless there was an error
      if (this.hasData && !this.errorMessage) {
        setTimeout(() => {
          this.showDebug = false;
        }, 2000);
      }
    } catch (error) {
      console.error('Error processing candle data:', error);
      this.errorMessage = 'Error processing candle data: ' + (error instanceof Error ? error.message : String(error));
      this.showDebug = true;
    }
  }
  
  private drawChart(): void {
    if (!this.ctx || !this.hasData || this.candles.length === 0) return;
    
    const canvas = this.chartCanvas.nativeElement;
    const ctx = this.ctx;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set background
    ctx.fillStyle = '#151924';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#232632';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const gridLines = 5;
    for (let i = 1; i < gridLines; i++) {
      const y = (canvas.height / gridLines) * i + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Get min and max values for scaling
    const prices = this.candles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    // Add 10% padding
    const paddedMin = minPrice - priceRange * 0.1;
    const paddedMax = maxPrice + priceRange * 0.1;
    const paddedRange = paddedMax - paddedMin;
    
    // Chart area dimensions
    const chartTop = 30;
    const chartBottom = canvas.height - 30;
    const chartHeight = chartBottom - chartTop;
    
    // Function to convert price to y coordinate
    const priceToY = (price: number) => chartBottom - ((price - paddedMin) / paddedRange * chartHeight);
    
    // Draw price scale on the right
    ctx.fillStyle = '#DDD';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= gridLines; i++) {
      const price = paddedMin + (paddedRange / gridLines) * i;
      const y = priceToY(price);
      ctx.fillText(price.toFixed(2), canvas.width - 10, y + 4);
    }
    
    // Calculate bar width
    const barWidth = Math.max(2, (canvas.width - 100) / this.candles.length - 2);
    const barSpacing = barWidth + 2;
    
    // Draw line chart
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    this.candles.forEach((candle, i) => {
      const x = 50 + i * barSpacing + barWidth / 2;
      const y = priceToY(candle.close);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Draw candles
    this.candles.forEach((candle, i) => {
      const x = 50 + i * barSpacing;
      const open = priceToY(candle.open);
      const close = priceToY(candle.close);
      const high = priceToY(candle.high);
      const low = priceToY(candle.low);
      
      // Determine if bullish or bearish
      const isBullish = candle.close >= candle.open;
      ctx.fillStyle = isBullish ? '#26a69a' : '#ef5350';
      
      // Draw candle body
      const bodyHeight = Math.abs(close - open);
      const bodyY = isBullish ? close : open;
      ctx.fillRect(x, bodyY, barWidth, Math.max(1, bodyHeight));
      
      // Draw wick
      ctx.beginPath();
      ctx.moveTo(x + barWidth / 2, high);
      ctx.lineTo(x + barWidth / 2, low);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke();
    });
    
    // Draw time labels at the bottom
    if (this.candles.length > 0) {
      ctx.fillStyle = '#DDD';
      ctx.textAlign = 'center';
      
      // Show at most 5 time labels
      const step = Math.ceil(this.candles.length / 5);
      
      for (let i = 0; i < this.candles.length; i += step) {
        const candle = this.candles[i];
        const x = 50 + i * barSpacing + barWidth / 2;
        const time = new Date(typeof candle.time === 'number' ? candle.time * 1000 : candle.time);
        const label = `${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`;
        
        ctx.fillText(label, x, chartBottom + 20);
      }
    }
    
    // Draw current price
    if (this.lastCandle) {
      const lastPrice = this.lastCandle.close;
      const y = priceToY(lastPrice);
      
      // Price line
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Price label
      ctx.fillStyle = '#4CAF50';
      ctx.textAlign = 'left';
      ctx.fillText(lastPrice.toFixed(2), 10, y - 5);
    }
  }

  private startCandlePolling(): void {
    if (!isPlatformBrowser(this.platformId) || !this.productId) return;
    
    console.log(`Starting polling for candles every ${this.pollingInterval}ms`);
    
    // Cancel existing polling
    this.pollingSubscription.unsubscribe();
    this.pollingSubscription = new Subscription();
    
    // Start new polling
    this.pollingSubscription.add(
      timer(this.pollingInterval, this.pollingInterval).subscribe(() => {
        this.loadInitialCandles();
      })
    );
  }

  private restartCandlePolling(): void {
    this.pollingSubscription.unsubscribe();
    this.pollingSubscription = new Subscription();
    this.startCandlePolling();
  }

  // Public methods for changing intervals
  public setInterval(intervalIndex: number): void {
    if (intervalIndex >= 0 && intervalIndex < this.intervals.length) {
      this.selectedIntervalIndex = intervalIndex;
      const oldInterval = this.interval;
      this.interval = this.intervals[intervalIndex];
      
      console.log(`Changing interval from ${oldInterval} to ${this.interval}`);
      this.errorMessage = '';  // Clear any existing errors
      this.hasData = false;    // Reset data status
      
      // Reload candles with new interval
      this.loadInitialCandles();
      this.restartCandlePolling();
    }
  }
}
