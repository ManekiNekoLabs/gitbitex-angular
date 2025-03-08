import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of, interval } from 'rxjs';
import { filter, map, takeUntil, catchError, retryWhen, delay, take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';

export interface WebSocketMessage {
  type: string;
  channel?: string;
  data?: any;
  [key: string]: any;
}

/**
 * Service for managing WebSocket connections
 */
@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private readonly WS_URL = environment.wsUrl;
  private readonly RECONNECT_INTERVAL = 5000;
  private readonly MAX_RETRIES = 5;
  private connected$ = new BehaviorSubject<boolean>(false);
  private backendAvailable$ = new BehaviorSubject<'available' | 'unavailable' | 'checking'>('checking');
  private messageSubject = new Subject<WebSocketMessage>();
  private subscriptions: { [channel: string]: Subject<any> } = {};
  private reconnectAttempts = 0;
  private useMockData = false;
  private readonly isBrowser: boolean;
  private mockDataIntervals: { [channel: string]: any } = {};
  private mockDataInitialized = false;
  private connectionAttempts = 0;
  private readonly MAX_CONNECTION_ATTEMPTS = 3;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    console.log('WebSocket Service initialized');
    
    if (this.isBrowser) {
      // Delay the initial connection attempt
      setTimeout(() => {
        this.checkBackendAvailability();
      }, 1000);
    }
  }

  /**
   * Check if the backend WebSocket is available and initialize the connection
   * If the backend is not available, fall back to mock data
   */
  public checkBackendAvailability(): void {
    // Only check in browser environment
    if (!this.isBrowser) {
      console.log('Backend availability check skipped in server-side rendering');
      return;
    }
    
    console.log('Checking backend availability...');
    this.backendAvailable$.next('checking');
    
    // Convert WebSocket URL to HTTP URL for health check
    const healthCheckUrl = `${environment.apiUrl}/products`;
    console.log('Health check URL:', healthCheckUrl);
    
    this.http.get(healthCheckUrl).pipe(
      catchError((error) => {
        console.error('Backend health check failed:', error);
        this.backendAvailable$.next('unavailable');
        return of(null);
      })
    ).subscribe(response => {
      if (response) {
        console.log('Backend is available, initializing WebSocket');
        this.backendAvailable$.next('available');
        this.useMockData = false;
        this.initializeWebSocket();
      } else {
        console.warn('Backend is not available, falling back to mock data');
        this.backendAvailable$.next('unavailable');
        this.useMockData = true;
        this.initializeMockData();
      }
    });
  }

  /**
   * Get an observable of the backend availability status
   */
  public isBackendAvailable(): Observable<'available' | 'unavailable' | 'checking'> {
    return this.backendAvailable$.asObservable();
  }

  private initializeWebSocket(): void {
    if (!this.isBrowser) {
      console.log('Not in browser environment, skipping WebSocket initialization');
      return;
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('WebSocket is already connected');
      this.logSubscriptions();
      return;
    }

    // Get the WebSocket URL
    let wsUrl = this.WS_URL;
    
    // If the URL is relative, convert it to an absolute URL
    if (wsUrl.startsWith('/')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsUrl = `${protocol}//${host}${wsUrl}`;
    }
    
    console.log('Initializing WebSocket connection to:', wsUrl);

    try {
      this.socket = new WebSocket(wsUrl);
      console.log('WebSocket object created, connecting...');
      
      this.socket.onopen = () => {
        console.log('WebSocket connection established successfully');
        this.connected$.next(true);
        this.reconnectAttempts = 0;
        
        // Log the current subscriptions
        this.logSubscriptions();
        
        // Resubscribe to existing channels
        Object.keys(this.subscriptions).forEach(channel => {
          this.subscribeToChannel(channel);
        });
        
        // Start debug logging
        this.startDebugLogging();
      };

      this.socket.onclose = (event) => {
        console.log('WebSocket connection closed:', event);
        console.log('Close code:', event.code, 'Reason:', event.reason);
        this.connected$.next(false);
        
        if (this.reconnectAttempts < this.MAX_RETRIES) {
          this.reconnectAttempts++;
          const delay = this.RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RETRIES})`);
          setTimeout(() => this.initializeWebSocket(), delay);
        } else {
          console.warn('Max reconnection attempts reached, falling back to mock data');
          this.useMockData = true;
          this.initializeMockData();
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.log('Current WebSocket state:', this.getWebSocketStateString());
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Don't log every message here to avoid console spam
          // Instead, we'll log in the handleMessage method
          this.handleMessage(event);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error, 'Raw data:', event.data);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.connected$.next(false);
      this.useMockData = true;
      this.initializeMockData();
    }
  }

  private getWebSocketStateString(): string {
    if (!this.isBrowser) {
      return 'Not available in server-side rendering';
    }
    
    if (!this.socket) return 'No socket';
    
    if (typeof WebSocket === 'undefined') {
      return 'WebSocket not available';
    }
    
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return `Unknown (${this.socket.readyState})`;
    }
  }

  private subscribeToChannel(channel: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready, queuing subscription for:', channel);
      return;
    }

    const [channelType, productId] = channel.split(':');
    let subscribeMessage;
    
    // Format the subscription message based on channel type
    if (channelType === 'ticker') {
      subscribeMessage = {
        type: 'subscribe',
        product_ids: [productId],
        channels: ['ticker']
      };
    } else if (channelType === 'level2') {
      subscribeMessage = {
        type: 'subscribe',
        product_ids: [productId],
        channels: ['level2']
      };
    } else if (channelType === 'match') {
      // Use the correct format for match channel
      subscribeMessage = {
        type: 'subscribe',
        product_ids: [productId],
        channels: ['match']
      };
    } else {
      subscribeMessage = {
        type: 'subscribe',
        productIds: [productId],
        channels: [channelType]
      };
    }

    console.log('Sending subscription message:', subscribeMessage);
    this.socket.send(JSON.stringify(subscribeMessage));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected$.next(false);
    this.subscriptions = {};
  }

  send(message: any): void {
    // If not in browser, we can't use WebSocket
    if (!this.isBrowser) {
      return;
    }

    // If we're using mock data, just log the message
    if (this.useMockData) {
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
    }
  }

  subscribe(channel: string): Observable<any> {
    console.log(`Subscribing to channel: ${channel}`);
    
    // If we already have a subject for this channel, return it
    if (this.subscriptions[channel]) {
      console.log(`Already subscribed to channel: ${channel}`);
      return this.subscriptions[channel].asObservable();
    }
    
    // Create a new subject for this channel
    this.subscriptions[channel] = new Subject<any>();
    
    // If we're using mock data, start generating it
    if (this.useMockData) {
      console.log(`Using mock data for channel: ${channel}`);
      this.startMockDataForChannel(channel);
      return this.subscriptions[channel].asObservable();
    } else if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not connected, attempting to connect...');
      this.initializeWebSocket();
    } else {
      this.subscribeToChannel(channel);
    }
    
    // Log all active subscriptions
    this.logSubscriptions();
    
    return this.subscriptions[channel].asObservable();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const rawData = event.data;
      const message = JSON.parse(rawData);
      console.log('Received WebSocket message:', message);
      
      // Extract channel and type information
      let channel = '';
      let data = message;
      
      // Handle different message formats
      if (message.type === 'ticker') {
        // Ticker messages have a different format
        channel = `ticker:${message.product_id || message.productId}`;
        data = message;
      } else if (message.type === 'match') {
        // Match messages for trades - use the correct format
        const productId = message.product_id || message.productId;
        console.log(`Received match data for ${productId}:`, message);
        
        // Emit to match channel
        channel = `match:${productId}`;
        data = message;
      } else if (message.type === 'l2update') {
        // Order book messages (level2)
        channel = `level2:${message.product_id || message.productId}`;
        data = message;
      } else if (message.channel) {
        // Generic channel format
        channel = message.channel;
        data = message.data || message;
      }
      
      // Emit the message to the appropriate channel subject
      if (channel && this.subscriptions[channel]) {
        console.log(`Emitting message to channel: ${channel}`, data);
        this.subscriptions[channel].next(data);
      }
      
      // Also emit to the general message subject
      this.messageSubject.next(message);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  onMessage(): Observable<WebSocketMessage> {
    return this.messageSubject.asObservable().pipe(
      map(message => {
        // Log all messages for debugging
        console.log('Raw WebSocket message:', message);
        
        // Try to normalize the message format
        if (message.type && message['productId']) {
          // If the message has a type and productId, add a channel property for compatibility
          message.channel = `${message.type}:${message['productId']}`;
        } else if (message.type && message['product_id']) {
          // If the message uses product_id instead of productId
          message['productId'] = message['product_id'];
          message.channel = `${message.type}:${message['productId']}`;
        }
        
        return message;
      })
    );
  }

  isConnected(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  private initializeMockData(): void {
    if (this.mockDataInitialized) return;
    
    this.mockDataInitialized = true;
    console.log('Initializing mock WebSocket data generation');
    
    // Start generating mock data for any existing subscriptions
    Object.keys(this.subscriptions).forEach(channel => {
      this.startMockDataForChannel(channel);
    });
  }

  private startMockDataForChannel(channel: string): void {
    // If we already have an interval for this channel, do nothing
    if (this.mockDataIntervals[channel]) return;
    
    // Parse the channel to determine what kind of data to generate
    if (channel.startsWith('book:')) {
      // Order book updates
      const productId = channel.split(':')[1];
      this.mockDataIntervals[channel] = setInterval(() => {
        this.generateMockOrderBookUpdate(productId);
      }, 2000);
    } else if (channel.startsWith('ticker:')) {
      // Ticker updates
      const productId = channel.split(':')[1];
      this.mockDataIntervals[channel] = setInterval(() => {
        this.generateMockTickerUpdate(productId);
      }, 1000);
    } else if (channel.startsWith('matches:')) {
      // Trade matches
      const productId = channel.split(':')[1];
      this.mockDataIntervals[channel] = setInterval(() => {
        this.generateMockTradeMatch(productId);
      }, 3000);
    }
  }

  private stopMockDataForChannel(channel: string): void {
    if (this.mockDataIntervals[channel]) {
      clearInterval(this.mockDataIntervals[channel]);
      delete this.mockDataIntervals[channel];
    }
  }

  private generateMockOrderBookUpdate(productId: string): void {
    // Determine base price based on product
    let basePrice = 50000; // Default for BTC-USD
    if (productId.includes('ETH-USD') || productId.includes('ETH-USDT')) {
      basePrice = 3000;
    } else if (productId.includes('LTC')) {
      basePrice = 200;
    } else if (productId.includes('ETH-BTC')) {
      basePrice = 0.06; // ETH/BTC price
    }
    
    // Generate random changes
    const buyChanges = [];
    const sellChanges = [];
    
    // Generate 1-3 buy changes
    const buyCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < buyCount; i++) {
      const priceOffset = (Math.random() * 10) * (basePrice * 0.0001);
      const price = (basePrice - priceOffset).toFixed(2);
      const size = (Math.random() * 2 + 0.1).toFixed(6);
      buyChanges.push([price, size]);
    }
    
    // Generate 1-3 sell changes
    const sellCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < sellCount; i++) {
      const priceOffset = (Math.random() * 10) * (basePrice * 0.0001);
      const price = (basePrice + priceOffset).toFixed(2);
      const size = (Math.random() * 2 + 0.1).toFixed(6);
      sellChanges.push([price, size]);
    }
    
    // Create the message
    const message: WebSocketMessage = {
      type: `book:${productId}`,
      channel: `book:${productId}`,
      data: {
        changes: {
          buy: buyChanges,
          sell: sellChanges
        }
      }
    };
    
    // Send the message
    this.messageSubject.next(message);
  }

  private generateMockTickerUpdate(productId: string): void {
    // Determine base price based on product
    let basePrice = 50000; // Default for BTC-USD
    if (productId.includes('ETH-USD') || productId.includes('ETH-USDT')) {
      basePrice = 3000;
    } else if (productId.includes('LTC')) {
      basePrice = 200;
    } else if (productId.includes('ETH-BTC')) {
      basePrice = 0.06; // ETH/BTC price
    }
    
    // Generate a small random price change
    const priceChange = (Math.random() - 0.5) * (basePrice * 0.001);
    const newPrice = basePrice + priceChange;
    const price_24h = basePrice - (Math.random() * basePrice * 0.01);
    
    // Create the message
    const message: WebSocketMessage = {
      type: `ticker:${productId}`,
      channel: `ticker:${productId}`,
      data: {
        price: newPrice.toFixed(2),
        price_24h: price_24h.toFixed(2),
        volume_24h: (Math.random() * 1000 + 100).toFixed(2),
        product_id: productId
      }
    };
    
    // Send the message
    this.messageSubject.next(message);
  }

  private generateMockTradeMatch(productId: string): void {
    // Determine base price based on product
    let basePrice = 50000; // Default for BTC-USD
    if (productId.includes('ETH-USD') || productId.includes('ETH-USDT')) {
      basePrice = 3000;
    } else if (productId.includes('LTC')) {
      basePrice = 200;
    } else if (productId.includes('ETH-BTC')) {
      basePrice = 0.06; // ETH/BTC price
    }
    
    // Generate a small random price change
    const priceChange = (Math.random() - 0.5) * (basePrice * 0.001);
    const price = basePrice + priceChange;
    const size = Math.random() * 2 + 0.1;
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    
    // Create the message
    const message: WebSocketMessage = {
      type: `matches:${productId}`,
      channel: `matches:${productId}`,
      data: {
        trade_id: `mock-${Date.now()}`,
        product_id: productId,
        price: price.toFixed(2),
        size: size.toFixed(6),
        side: side,
        time: new Date().toISOString()
      }
    };
    
    // Send the message
    this.messageSubject.next(message);
  }

  unsubscribe(channel: string): void {
    console.log(`Unsubscribing from channel: ${channel}`);
    
    if (this.subscriptions[channel]) {
      this.subscriptions[channel].complete();
      delete this.subscriptions[channel];
    }
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const [channelType, productId] = channel.split(':');
      let unsubscribeMessage;
      
      // Format the unsubscription message based on channel type
      if (channelType === 'ticker') {
        unsubscribeMessage = {
          type: 'unsubscribe',
          product_ids: [productId],
          channels: ['ticker']
        };
      } else if (channelType === 'level2') {
        unsubscribeMessage = {
          type: 'unsubscribe',
          product_ids: [productId],
          channels: ['level2']
        };
      } else if (channelType === 'match') {
        unsubscribeMessage = {
          type: 'unsubscribe',
          product_ids: [productId],
          channels: ['matches']
        };
      } else {
        unsubscribeMessage = {
          type: 'unsubscribe',
          productIds: [productId],
          channels: [channelType]
        };
      }
      
      console.log('Sending unsubscription message:', unsubscribeMessage);
      this.socket.send(JSON.stringify(unsubscribeMessage));
    }
    
    // Stop mock data generation if we were using it
    if (this.useMockData) {
      this.stopMockDataForChannel(channel);
    }
  }

  // Add a method to check connection status
  isSocketOpen(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    return this.socket?.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.OPEN : undefined);
  }

  // Add method to check environment
  getEnvironmentInfo(): string {
    const wsUrl = this.WS_URL;
    let absoluteWsUrl = wsUrl;
    let socketState = 'Not available in server-side rendering';
    let isConnected = false;
    
    // Only access browser-specific objects in browser environment
    if (this.isBrowser) {
      absoluteWsUrl = wsUrl.startsWith('/') 
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${wsUrl}`
        : wsUrl;
      socketState = this.getWebSocketStateString();
      isConnected = this.socket?.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.OPEN : undefined);
    }
      
    return `
      Is Browser: ${this.isBrowser}
      WebSocket URL: ${wsUrl}
      Absolute WebSocket URL: ${absoluteWsUrl}
      Mock Data: ${this.useMockData}
      Socket State: ${socketState}
      Connected: ${isConnected}
      Reconnect Attempts: ${this.reconnectAttempts}/${this.MAX_RETRIES}
      Active Subscriptions: ${Object.keys(this.subscriptions).join(', ') || 'none'}
    `;
  }

  /**
   * Log all active subscriptions
   */
  logSubscriptions(): void {
    const channels = Object.keys(this.subscriptions);
    if (channels.length === 0) {
      console.log('No active WebSocket subscriptions');
    } else {
      console.log(`Active WebSocket subscriptions (${channels.length}):`, channels);
    }
  }

  /**
   * Start debug logging of all WebSocket messages
   */
  private startDebugLogging(): void {
    console.log('Starting WebSocket debug logging');
    
    // Subscribe to all messages
    this.onMessage().subscribe(message => {
      // Check if this is a trade/match message
      if (message.type === 'match') {
        console.log('%c🔄 TRADE MATCH:', 'color: green; font-weight: bold', message);
      }
      
      // Check if this is a ticker message
      if (message.type === 'ticker') {
        console.log('%c📈 TICKER:', 'color: blue; font-weight: bold', message);
      }
      
      // Check if this is an order book message
      if (message.type === 'l2update') {
        console.log('%c📊 ORDER BOOK:', 'color: purple; font-weight: bold', message);
      }
    });
  }

  /**
   * Manually subscribe to the trade channel
   * @param productId The product ID to subscribe to
   */
  subscribeToTrades(productId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready, cannot subscribe to trades');
      return;
    }
    
    console.log(`Manually subscribing to trades for ${productId}`);
    
    // Use the correct subscription format
    const subscribeMessage = {
      type: 'subscribe',
      product_ids: [productId],
      channels: ['match']
    };
    
    console.log('Sending trade subscription message:', subscribeMessage);
    this.socket.send(JSON.stringify(subscribeMessage));
  }

  connect(): void {
    // Only connect in browser environment
    if (!this.isBrowser) {
      console.log('WebSocket not available in server-side rendering');
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('WebSocket is already connected');
      this.logSubscriptions();
      return;
    }

    // Get the WebSocket URL
    let wsUrl = this.WS_URL;
    
    // If the URL is relative, convert it to an absolute URL
    if (wsUrl.startsWith('/')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsUrl = `${protocol}//${host}${wsUrl}`;
    }
    
    console.log('Initializing WebSocket connection to:', wsUrl);

    try {
      this.socket = new WebSocket(wsUrl);
      console.log('WebSocket object created, connecting...');
      
      this.socket.onopen = () => {
        console.log('WebSocket connection established successfully');
        this.connected$.next(true);
        this.reconnectAttempts = 0;
        
        // Log the current subscriptions
        this.logSubscriptions();
        
        // Resubscribe to existing channels
        Object.keys(this.subscriptions).forEach(channel => {
          this.subscribeToChannel(channel);
        });
        
        // Start debug logging
        this.startDebugLogging();
      };

      this.socket.onclose = (event) => {
        console.log('WebSocket connection closed:', event);
        console.log('Close code:', event.code, 'Reason:', event.reason);
        this.connected$.next(false);
        
        if (this.reconnectAttempts < this.MAX_RETRIES) {
          this.reconnectAttempts++;
          const delay = this.RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RETRIES})`);
          setTimeout(() => this.initializeWebSocket(), delay);
        } else {
          console.warn('Max reconnection attempts reached, falling back to mock data');
          this.useMockData = true;
          this.initializeMockData();
        }
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.log('Current WebSocket state:', this.getWebSocketStateString());
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Don't log every message here to avoid console spam
          // Instead, we'll log in the handleMessage method
          this.handleMessage(event);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error, 'Raw data:', event.data);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.connected$.next(false);
      this.useMockData = true;
      this.initializeMockData();
    }
  }
} 