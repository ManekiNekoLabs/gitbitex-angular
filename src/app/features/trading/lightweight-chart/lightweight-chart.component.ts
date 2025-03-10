import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  NgZone,
  Inject,
  PLATFORM_ID
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { isPlatformBrowser, CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';

// Import from 'lightweight-charts' library
import * as LightweightCharts from 'lightweight-charts';

type ChartTime = LightweightCharts.Time;

interface CandleData {
  time: ChartTime;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface LineData {
  time: ChartTime;
  value: number;
}

@Component({
  selector: 'app-lightweight-chart',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: `
    <div class="chart-wrapper">
      <div class="chart-header">
        <div class="interval-selector">
          <button [class.active]="selectedIntervalIndex === 0" (click)="changeTimeInterval(0)">1m</button>
          <button [class.active]="selectedIntervalIndex === 1" (click)="changeTimeInterval(1)">5m</button>
          <button [class.active]="selectedIntervalIndex === 2" (click)="changeTimeInterval(2)">15m</button>
          <button [class.active]="selectedIntervalIndex === 3" (click)="changeTimeInterval(3)">1h</button>
          <button [class.active]="selectedIntervalIndex === 4" (click)="changeTimeInterval(4)">1d</button>
        </div>

        <div class="chart-controls">
          <div class="chart-type-toggle">
            <button [class.active]="chartType === 'candlestick'" (click)="setChartType('candlestick')">
              <span class="chart-type-icon candlestick-icon"></span>
              Candlestick
            </button>
            <button [class.active]="chartType === 'line'" (click)="setChartType('line')">
              <span class="chart-type-icon line-icon"></span>
              Line
            </button>
          </div>

          <div class="ma-controls">
            <div class="ma-toggle-title">Moving Averages:</div>
            <button [class.active]="showMA5" (click)="toggleMA(5)" title="Toggle MA5">
              <span class="ma-indicator" style="background-color: rgba(33, 150, 243, 1);"></span>
              MA5
            </button>
            <button [class.active]="showMA10" (click)="toggleMA(10)" title="Toggle MA10">
              <span class="ma-indicator" style="background-color: rgba(76, 175, 80, 1);"></span>
              MA10
            </button>
            <button [class.active]="showMA20" (click)="toggleMA(20)" title="Toggle MA20">
              <span class="ma-indicator" style="background-color: rgba(255, 193, 7, 1);"></span>
              MA20
            </button>
            <button [class.active]="showMA30" (click)="toggleMA(30)" title="Toggle MA30">
              <span class="ma-indicator" style="background-color: rgba(156, 39, 176, 1);"></span>
              MA30
            </button>
          </div>
        </div>
      </div>

      <div class="chart-container" #chartContainer></div>

      <!-- Debug information -->
      <div class="chart-debug" [class.show]="showDebug || errorMessage">
        <div *ngIf="errorMessage" class="error-message">
          <div>{{ errorMessage }}</div>
          <div class="error-details">
            The chart data might not be available for {{ productId }} yet.
            You can try another time interval or check back later.
          </div>
        </div>
        <div *ngIf="!errorMessage && !hasData">
          <div class="loading-info">Loading chart data...</div>
          <div class="spinner"></div>
        </div>
        <div *ngIf="hasData">
          <div>Last update: {{ lastUpdateTime | date:'HH:mm:ss' }}</div>
          <div>Candles loaded: {{ candleCount }}</div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./lightweight-chart.component.scss']
})
export class LightweightChartComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLElement>;

  @Input() productId: string = '';
  
  // These are now optional since we're using the container's actual dimensions
  @Input() containerWidth?: number;
  @Input() containerHeight?: number;

  // Chart instance
  private chart: LightweightCharts.IChartApi | null = null;

  // Main series references
  private candleSeries: LightweightCharts.ISeriesApi<'Candlestick'> | null = null;
  private lineSeries: LightweightCharts.ISeriesApi<'Line'> | null = null;

  // Moving average line series references
  private ma5Series: LightweightCharts.ISeriesApi<'Line'> | null = null;
  private ma10Series: LightweightCharts.ISeriesApi<'Line'> | null = null;
  private ma20Series: LightweightCharts.ISeriesApi<'Line'> | null = null;
  private ma30Series: LightweightCharts.ISeriesApi<'Line'> | null = null;

  // Subscriptions / intervals
  private resizeTimeout: any = null;
  private subscriptions: Subscription = new Subscription();
  private pollingSubscription: Subscription = new Subscription();

  // Time intervals: 1min, 5min, 15min, 1h, 1d (in seconds)
  private intervals = [60, 300, 900, 3600, 86400];
  private interval: number = 3600; // default to 1-hour
  private pollingInterval = 10000; // poll every 10 seconds

  // Chart state
  public selectedIntervalIndex = 3; // default to 1h
  public chartType: 'candlestick' | 'line' = 'candlestick'; // default
  public showMA5 = true;
  public showMA10 = true;
  public showMA20 = true;
  public showMA30 = true;

  // Debug / error state
  public showDebug = true;
  public errorMessage = '';
  public hasData = false;
  public candleCount = 0;
  public lastUpdateTime: Date | null = null;

  // Candle data
  private candles: CandleData[] = [];
  private lastCandle: CandleData | null = null;
  private lastUpdate = 0;

  // MA data
  private ma5Data: LineData[] = [];
  private ma10Data: LineData[] = [];
  private ma20Data: LineData[] = [];
  private ma30Data: LineData[] = [];

  private resizeObserver: ResizeObserver | null = null;
  private chartInitialized = false;

  constructor(
    private http: HttpClient,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      console.log('Lightweight Chart component initialized');
    }
  }

  ngAfterViewInit(): void {
    // Only initialize chart in browser environment
    if (isPlatformBrowser(this.platformId)) {
      // Short delay to ensure the DOM is ready
      setTimeout(() => {
        this.initializeChart();
        this.loadInitialCandles();
        this.subscribeToWindowResize();
      }, 100);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If the productId changed, re-fetch data and optionally re-init the chart
    if (changes['productId'] && !changes['productId'].firstChange) {
      console.log('Product changed, reloading chart data:', this.productId);
      this.errorMessage = '';
      this.hasData = false;

      this.destroyChart(); // optional fresh start

      if (isPlatformBrowser(this.platformId) && this.productId) {
        // Re-initialize chart and load data
        this.initializeChart();
        this.loadInitialCandles();
      }
    }
  }

  ngOnDestroy(): void {
    // Clear all subscriptions
    this.subscriptions.unsubscribe();
    this.pollingSubscription.unsubscribe();
    
    // Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Destroy chart
    this.destroyChart();
  }

  // -----------------------
  // Chart Lifecycle
  // -----------------------
  private initializeChart(): void {
    if (!isPlatformBrowser(this.platformId) || !this.chartContainer) return;
    
    const container = this.chartContainer.nativeElement;
    
    // Create the chart using actual container dimensions
    this.chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: LightweightCharts.ColorType.Solid, color: '#151924' },
        textColor: 'rgba(255, 255, 255, 0.7)',
      },
      grid: {
        vertLines: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        horzLines: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    
    // Set up ResizeObserver to handle container size changes
    this.setupResizeObserver();
    
    // Create initial series
    this.createSeries();
    
    this.chartInitialized = true;
  }

  private setupResizeObserver(): void {
    if (!this.chart || !this.chartContainer || !isPlatformBrowser(this.platformId)) return;
    
    // Clean up existing observer if it exists
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    // Create new ResizeObserver
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Use NgZone to ensure Angular detects the changes
        this.ngZone.run(() => {
          if (this.chart) {
            this.chart.resize(
              entry.contentRect.width, 
              entry.contentRect.height
            );
          }
        });
      }
    });
    
    // Start observing the container
    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.remove(); // remove chart from DOM
      this.chart = null;
    }
    this.candleSeries = null;
    this.lineSeries = null;
    this.ma5Series = null;
    this.ma10Series = null;
    this.ma20Series = null;
    this.ma30Series = null;
  }

  // -----------------------
  // Series Setup
  // -----------------------
  private createSeries(): void {
    if (!this.chart) return;

    // Remove any existing main series
    if (this.candleSeries) {
      this.chart.removeSeries(this.candleSeries);
      this.candleSeries = null;
    }
    if (this.lineSeries) {
      this.chart.removeSeries(this.lineSeries);
      this.lineSeries = null;
    }

    // Add the new main series
    if (this.chartType === 'candlestick') {
      this.candleSeries = this.chart.addCandlestickSeries({
        upColor: 'rgba(75, 192, 192, 1)',
        downColor: 'rgba(255, 99, 132, 1)',
        borderUpColor: 'rgba(75, 192, 192, 1)',
        borderDownColor: 'rgba(255, 99, 132, 1)',
        wickUpColor: 'rgba(75, 192, 192, 1)',
        wickDownColor: 'rgba(255, 99, 132, 1)',
      });

      // If candles already loaded, set them
      if (this.candles.length > 0) {
        const formatted = this.candles.map(c => ({
          ...c,
          time: this.convertToChartTime(c.time),
        }));
        this.candleSeries.setData(formatted);
      }
    } else {
      this.lineSeries = this.chart.addLineSeries({
        color: 'rgba(255, 99, 132, 1)',
        lineWidth: 2,
      });

      if (this.candles.length > 0) {
        const lineData = this.candles.map(c => ({
          time: this.convertToChartTime(c.time),
          value: c.close,
        }));
        this.lineSeries.setData(lineData);
      }
    }

    // Build or rebuild moving average lines
    this.createMovingAverageSeries();
  }

  private createMovingAverageSeries(): void {
    if (!this.chart) return;

    // Remove existing MAs
    if (this.ma5Series) {
      this.chart.removeSeries(this.ma5Series);
      this.ma5Series = null;
    }
    if (this.ma10Series) {
      this.chart.removeSeries(this.ma10Series);
      this.ma10Series = null;
    }
    if (this.ma20Series) {
      this.chart.removeSeries(this.ma20Series);
      this.ma20Series = null;
    }
    if (this.ma30Series) {
      this.chart.removeSeries(this.ma30Series);
      this.ma30Series = null;
    }

    // Recompute MAs
    this.calculateMovingAverages();

    // MA5
    if (this.showMA5 && this.ma5Data.length > 0) {
      this.ma5Series = this.chart.addLineSeries({
        color: 'rgba(33, 150, 243, 1)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const formatted = this.ma5Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma5Series.setData(formatted);
    }

    // MA10
    if (this.showMA10 && this.ma10Data.length > 0) {
      this.ma10Series = this.chart.addLineSeries({
        color: 'rgba(76, 175, 80, 1)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const formatted = this.ma10Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma10Series.setData(formatted);
    }

    // MA20
    if (this.showMA20 && this.ma20Data.length > 0) {
      this.ma20Series = this.chart.addLineSeries({
        color: 'rgba(255, 193, 7, 1)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const formatted = this.ma20Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma20Series.setData(formatted);
    }

    // MA30
    if (this.showMA30 && this.ma30Data.length > 0) {
      this.ma30Series = this.chart.addLineSeries({
        color: 'rgba(156, 39, 176, 1)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const formatted = this.ma30Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma30Series.setData(formatted);
    }
  }

  // -----------------------
  // Fetching & Polling
  // -----------------------
  private loadInitialCandles(): void {
    if (!this.productId) return;
    this.errorMessage = '';
    this.hasData = false;
    this.showDebug = true;

    // Query your real endpoint
    const url = `${environment.apiUrl}/products/${this.productId}/candles?granularity=${this.interval}&limit=200`;
    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          if (data && Array.isArray(data) && data.length > 0) {
            this.processCandles(data);
            this.updateChartData();

            this.hasData = true;
            this.errorMessage = '';
            this.showDebug = false;

            // Start polling
            this.startCandlePolling();
          } else {
            console.log('No real data available for', this.productId);
            this.errorMessage = `No chart data available for ${this.productId}`;
            this.hasData = false;
            this.showDebug = true;
          }

          this.lastUpdateTime = new Date();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error loading candles:', error);
          this.errorMessage = `Failed to load chart data for ${this.productId}`;
          this.hasData = false;
          this.showDebug = true;
          this.lastUpdateTime = new Date();
        });
      },
    });
  }

  private processCandles(data: any[]): void {
    // [timestamp, low, high, open, close, volume]
    const candles: CandleData[] = data.map(item => {
      const timeInSecs = parseInt(item[0], 10);
      return {
        time: timeInSecs as ChartTime,
        low: parseFloat(item[1]),
        high: parseFloat(item[2]),
        open: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: item[5] ? parseFloat(item[5]) : undefined,
      };
    });

    // Sort ascending by time
    candles.sort((a, b) => (a.time as number) - (b.time as number));
    this.candles = candles;
    this.lastCandle = candles[candles.length - 1];
    this.candleCount = candles.length;
    this.lastUpdate = Date.now();

    // Pre-calc MAs
    this.calculateMovingAverages();
  }

  private updateChartData(): void {
    if (this.chartType === 'candlestick' && this.candleSeries) {
      const formatted = this.candles.map(c => ({
        ...c,
        time: this.convertToChartTime(c.time),
      }));
      this.candleSeries.setData(formatted);
    } else if (this.chartType === 'line' && this.lineSeries) {
      const lineData = this.candles.map(c => ({
        time: this.convertToChartTime(c.time),
        value: c.close,
      }));
      this.lineSeries.setData(lineData);
    }

    // Update MAs
    this.updateMovingAverageSeries();
  }

  private updateMovingAverageSeries(): void {
    this.calculateMovingAverages();

    // MA5
    if (this.showMA5 && this.ma5Series) {
      const data = this.ma5Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma5Series.setData(data);
    }

    // MA10
    if (this.showMA10 && this.ma10Series) {
      const data = this.ma10Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma10Series.setData(data);
    }

    // MA20
    if (this.showMA20 && this.ma20Series) {
      const data = this.ma20Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma20Series.setData(data);
    }

    // MA30
    if (this.showMA30 && this.ma30Series) {
      const data = this.ma30Data.map(d => ({
        time: this.convertToChartTime(d.time),
        value: d.value,
      }));
      this.ma30Series.setData(data);
    }
  }

  private startCandlePolling(): void {
    this.pollingSubscription.unsubscribe();
    this.pollingSubscription = new Subscription();

    const pollInterval = setInterval(() => {
      this.loadInitialCandles(); // re-fetch data
    }, this.pollingInterval);

    this.pollingSubscription.add({
      unsubscribe: () => clearInterval(pollInterval),
    });
  }

  private restartCandlePolling(): void {
    this.pollingSubscription.unsubscribe();
    this.pollingSubscription = new Subscription();
    this.startCandlePolling();
  }

  // -----------------------
  // Moving Averages
  // -----------------------
  private calculateMovingAverages(): void {
    this.ma5Data = this.calculateMovingAverage(this.candles, 5);
    this.ma10Data = this.calculateMovingAverage(this.candles, 10);
    this.ma20Data = this.calculateMovingAverage(this.candles, 20);
    this.ma30Data = this.calculateMovingAverage(this.candles, 30);
  }

  private calculateMovingAverage(data: CandleData[], period: number): LineData[] {
    if (!data || data.length < period) {
      console.log(`Not enough data for ${period}-period MA. Have ${data?.length || 0} data points`);
      return [];
    }
    const result: LineData[] = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      const average = sum / period;
      result.push({
        time: data[i].time,
        value: average,
      });
    }
    return result;
  }

  // -----------------------
  // User Actions
  // -----------------------
  public changeTimeInterval(intervalIndex: number): void {
    if (intervalIndex >= 0 && intervalIndex < this.intervals.length) {
      this.selectedIntervalIndex = intervalIndex;
      this.interval = this.intervals[intervalIndex];

      // Clear old data
      this.candles = [];
      this.lastCandle = null;

      this.loadInitialCandles();
      this.restartCandlePolling();
    }
  }

  public setChartType(type: 'candlestick' | 'line'): void {
    if (this.chartType !== type) {
      this.chartType = type;
      this.createSeries(); // re-create main series for new chart type
    }
  }

  public toggleMA(period: number): void {
    switch (period) {
      case 5:
        this.showMA5 = !this.showMA5;
        if (this.ma5Series) {
          this.chart?.removeSeries(this.ma5Series);
          this.ma5Series = null;
        }
        break;
      case 10:
        this.showMA10 = !this.showMA10;
        if (this.ma10Series) {
          this.chart?.removeSeries(this.ma10Series);
          this.ma10Series = null;
        }
        break;
      case 20:
        this.showMA20 = !this.showMA20;
        if (this.ma20Series) {
          this.chart?.removeSeries(this.ma20Series);
          this.ma20Series = null;
        }
        break;
      case 30:
        this.showMA30 = !this.showMA30;
        if (this.ma30Series) {
          this.chart?.removeSeries(this.ma30Series);
          this.ma30Series = null;
        }
        break;
    }
    // Rebuild MA lines
    this.createMovingAverageSeries();
  }

  // -----------------------
  // Sizing
  // -----------------------
  private subscribeToWindowResize(): void {
    // We can simplify this since we're using ResizeObserver for chart resizing
    // Just keep minimal code to handle screen size breakpoint changes if needed
    const resizeHandler = () => {
      // This is still useful to handle any logic based on window size 
      // rather than just container size
      if (this.chartContainer && this.chart) {
        // Update any component state that depends on window size
        this.checkDebugDisplay();
      }
    };
    
    // Initial call
    resizeHandler();
    
    // Set up event listener (using a more efficient throttled approach)
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('resize', this.throttle(resizeHandler, 200));
      
      // Clean up on component destroy
      this.subscriptions.add({
        unsubscribe: () => {
          window.removeEventListener('resize', resizeHandler);
        }
      });
    }
  }
  
  // Helper method to throttle resize events
  private throttle(func: Function, limit: number): () => void {
    let inThrottle: boolean = false;
    
    return function() {
      if (!inThrottle) {
        func();
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  }
  
  // Method to determine if debug display should be shown based on screen/chart size
  private checkDebugDisplay(): void {
    // Example of window-size based logic that might still be useful
    const smallScreen = window.innerWidth < 768;
    // Update any component properties based on window size if needed
  }

  // No longer need the older resize methods that used fixed dimensions
  private resizeChart(): void {
    if (!this.chart || !this.chartContainer) return;
    
    // This is now handled by ResizeObserver
    // But we can keep this method for explicit resize calls if needed
    const container = this.chartContainer.nativeElement;
    this.chart.resize(container.clientWidth, container.clientHeight);
  }

  // -----------------------
  // Helpers
  // -----------------------
  private convertToChartTime(time: any): ChartTime {
    if (typeof time === 'number') {
      return time as ChartTime; // Unix timestamp in seconds
    } else if (typeof time === 'string') {
      return time as ChartTime; // e.g. "2025-03-08" if your API returns date strings
    }
    // fallback
    return (Date.now() / 1000) as ChartTime;
  }
}
