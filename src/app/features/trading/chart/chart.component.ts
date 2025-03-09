import { Component, OnInit, AfterViewInit, OnDestroy, OnChanges, ViewChild, ElementRef, Input, SimpleChanges, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebsocketService } from '../../../core/services/websocket.service';
import { Subscription } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../../environments/environment';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from 'chartjs-chart-financial';
import { TooltipItem } from 'chart.js';
import { CommonModule } from '@angular/common';
import { DatePipe } from '@angular/common';

// Register the candlestick components with Chart.js
Chart.register(CandlestickController, CandlestickElement, OhlcController, OhlcElement);

// Interface for our candle data
interface CandleData {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

enum ChartType {
  CANDLESTICK = 'candlestick',
  LINE = 'line'
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

  private chart: Chart | null = null;
  private resizeTimeout: any = null;
  private subscriptions: Subscription = new Subscription();
  private pollingSubscription: Subscription = new Subscription();
  private interval: number = 3600; // Default to 1-hour candles
  private intervals = [60, 300, 900, 3600, 86400]; // 1min, 5min, 15min, 1h, 1d
  private pollingInterval = 10000; // 10 seconds
  private chartInitialized = false;
  
  // Make this public for the template
  public selectedIntervalIndex = 3; // Default to 1h (index 3)
  public chartType: ChartType = ChartType.CANDLESTICK; // Default to candlestick
  
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
    if (isPlatformBrowser(this.platformId)) {
      console.log('Chart component initialized');
      this.subscribeToWindowResize();
      
      if (this.productId) {
        this.loadInitialCandles();
      }
      
      // Timeout to show an error if data doesn't load
      setTimeout(() => {
        if (!this.hasData && !this.errorMessage) {
          this.errorMessage = 'Data loading timeout. This could be due to no candle data available or a connection issue.';
        }
      }, 10000);
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      console.log('Chart afterViewInit, initializing chart...');
      setTimeout(() => {
        this.initializeChart();
      }, 500);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productId'] && !changes['productId'].firstChange) {
      console.log('Product changed, reloading chart data:', this.productId);
      this.errorMessage = '';
      this.hasData = false;
      
      // Reset and destroy chart
      if (this.chart) {
        this.chart.destroy();
        this.chart = null;
      }
      
      if (isPlatformBrowser(this.platformId) && this.productId) {
        this.loadInitialCandles();
        this.initializeChart();
      }
    }
    
    if (changes['containerWidth'] || changes['containerHeight']) {
      this.resizeChart();
    }
  }

  ngOnDestroy(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    this.subscriptions.unsubscribe();
    this.pollingSubscription.unsubscribe();
    
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private initializeChart(): void {
    if (!isPlatformBrowser(this.platformId) || !this.chartCanvas) return;
    
    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Failed to get 2D context from canvas');
      return;
    }
    
    // Resize canvas to its parent container
    this.resizeChart();
    
    // Create a Chart.js instance
    this.chart = new Chart(ctx, {
      type: this.chartType as any,
      data: {
        datasets: [
          {
            label: this.productId,
            data: this.formatCandlesForChartJs(this.candles),
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: 'rgba(255, 99, 132, 1)',
            tension: 0.1,
            // Candlestick specific options
            color: {
              up: 'rgba(75, 192, 192, 1)',
              down: 'rgba(255, 99, 132, 1)',
              unchanged: 'rgba(180, 180, 180, 1)',
            }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: this.getTimeUnit(),
              displayFormats: {
                minute: 'HH:mm',
                hour: 'HH:mm',
                day: 'MMM d'
              }
            },
            title: {
              display: true,
              text: 'Time'
            },
            grid: {
              display: true,
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            }
          },
          y: {
            position: 'right',
            title: {
              display: true,
              text: 'Price'
            },
            grid: {
              display: true,
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context: TooltipItem<any>) => {
                const dataPoint = context.raw as any;
                if (this.chartType === ChartType.CANDLESTICK) {
                  return [
                    `Open: ${dataPoint.o.toFixed(2)}`,
                    `High: ${dataPoint.h.toFixed(2)}`,
                    `Low: ${dataPoint.l.toFixed(2)}`,
                    `Close: ${dataPoint.c.toFixed(2)}`,
                    dataPoint.v ? `Volume: ${dataPoint.v.toFixed(2)}` : ''
                  ].filter(Boolean);
                } else {
                  return `Price: ${dataPoint.y.toFixed(2)}`;
                }
              }
            }
          }
        }
      }
    });

    this.chartInitialized = true;
  }

  private resizeChart(): void {
    if (!isPlatformBrowser(this.platformId) || !this.chartCanvas) return;
    
    const canvas = this.chartCanvas.nativeElement;
    const container = canvas.parentElement;
    
    if (!container) return;
    
    // Get the container dimensions
    const rect = container.getBoundingClientRect();
    
    // Set canvas dimensions to match container
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Update chart if it exists
    if (this.chart) {
      this.chart.resize();
    }
  }

  private subscribeToWindowResize(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    window.addEventListener('resize', () => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      
      this.resizeTimeout = setTimeout(() => {
        this.resizeChart();
      }, 100);
    });
  }

  private loadInitialCandles(): void {
    if (!this.productId) return;
    
    this.errorMessage = '';
    this.hasData = false;
    this.showDebug = true;
    
    // Fetch candles from API
    const url = `${environment.apiUrl}/products/${this.productId}/candles?granularity=${this.interval}&limit=200`;
    
    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          if (data && Array.isArray(data) && data.length > 0) {
            this.processCandles(data);
            
            // Update chart with new candles
            if (this.chart) {
              this.updateChartData();
            }
            
            this.hasData = true;
            this.errorMessage = '';
            this.showDebug = false;
            
            // Start polling for updates
            this.startCandlePolling();
          } else {
            this.hasData = false;
            this.errorMessage = `No chart data available for ${this.productId}`;
          }
          
          this.lastUpdateTime = new Date();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error loading candles:', error);
          this.hasData = false;
          this.errorMessage = `Failed to load chart data for ${this.productId}`;
          this.lastUpdateTime = new Date();
        });
      }
    });
  }

  private processCandles(data: any[]): void {
    // If data is in [timestamp, low, high, open, close, volume] format
    const candles: CandleData[] = data.map(item => {
      const time = parseInt(item[0]);
      const low = parseFloat(item[1]);
      const high = parseFloat(item[2]);
      const open = parseFloat(item[3]);
      const close = parseFloat(item[4]);
      const volume = item[5] ? parseFloat(item[5]) : undefined;
      
      return { time, open, high, low, close, volume };
    });
    
    // Sort by time (ascending) - convert to number first if needed
    candles.sort((a, b) => {
      const timeA = typeof a.time === 'number' ? a.time : parseInt(a.time as string);
      const timeB = typeof b.time === 'number' ? b.time : parseInt(b.time as string);
      return timeA - timeB;
    });
    
    this.candles = candles;
    this.lastCandle = candles[candles.length - 1];
    this.candleCount = candles.length;
    this.lastUpdate = Date.now();
  }

  private updateChartData(): void {
    if (!this.chart) return;
    
    if (this.chartType === ChartType.CANDLESTICK) {
      this.chart.data.datasets[0].data = this.formatCandlesForChartJs(this.candles);
    } else {
      this.chart.data.datasets[0].data = this.formatCandlesForLineChart(this.candles);
    }
    
    this.chart.update();
  }

  private startCandlePolling(): void {
    // Clear previous polling
    this.pollingSubscription.unsubscribe();
    this.pollingSubscription = new Subscription();
    
    // Set up interval to fetch candles
    const pollInterval = setInterval(() => {
      this.loadInitialCandles();
    }, this.pollingInterval);
    
    this.pollingSubscription.add({
      unsubscribe: () => clearInterval(pollInterval)
    });
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
      this.interval = this.intervals[intervalIndex];
      
      // Update time unit
      if (this.chart) {
        const options = this.chart.options;
        if (options && options.scales && options.scales['x']) {
          const xScale = options.scales['x'] as any;
          if (xScale.time) {
            xScale.time.unit = this.getTimeUnit();
            this.chart.update();
          }
        }
      }
      
      // Reload candles with new interval
      this.candles = [];
      this.lastCandle = null;
      this.loadInitialCandles();
      this.restartCandlePolling();
    }
  }

  public toggleChartType(): void {
    this.chartType = this.chartType === ChartType.CANDLESTICK 
      ? ChartType.LINE 
      : ChartType.CANDLESTICK;
    
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
      this.initializeChart();
    }
  }

  private getTimeUnit(): string {
    const intervalInSeconds = this.intervals[this.selectedIntervalIndex];
    if (intervalInSeconds <= 60) return 'minute';
    if (intervalInSeconds <= 3600) return 'hour';
    return 'day';
  }

  private formatCandlesForChartJs(candles: CandleData[]): any[] {
    return candles.map(candle => {
      // Ensure time is a number before multiplication
      const timeInMs = typeof candle.time === 'number' 
        ? candle.time * 1000 
        : parseInt(candle.time as string) * 1000;
        
      return {
        x: timeInMs,
        o: candle.open,
        h: candle.high,
        l: candle.low,
        c: candle.close,
        v: candle.volume
      };
    });
  }

  private formatCandlesForLineChart(candles: CandleData[]): any[] {
    return candles.map(candle => {
      // Ensure time is a number before multiplication
      const timeInMs = typeof candle.time === 'number' 
        ? candle.time * 1000 
        : parseInt(candle.time as string) * 1000;
        
      return {
        x: timeInMs,
        y: candle.close
      };
    });
  }
}
