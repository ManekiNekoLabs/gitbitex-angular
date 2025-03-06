import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap, retry } from 'rxjs/operators';
import { Product } from '../models/product.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private readonly API_URL = `${environment.apiUrl}/products`;
  private cachedProducts: Product[] = [];
  
  private mockProducts: Product[] = [
    {
      id: 'BTC-USD',
      baseCurrency: 'BTC',
      quoteCurrency: 'USD',
      baseMinSize: '0.001',
      baseMaxSize: '100',
      quoteIncrement: '0.01',
      displayName: 'BTC/USD',
      status: 'online',
      minMarketFunds: '10',
      maxMarketFunds: '1000000',
      postOnly: false,
      limitOnly: false,
      cancelOnly: false
    },
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
      id: 'ETH-USD',
      baseCurrency: 'ETH',
      quoteCurrency: 'USD',
      baseMinSize: '0.01',
      baseMaxSize: '1000',
      quoteIncrement: '0.01',
      displayName: 'ETH/USD',
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
    },
    {
      id: 'ETH-BTC',
      baseCurrency: 'ETH',
      quoteCurrency: 'BTC',
      baseMinSize: '0.01',
      baseMaxSize: '1000',
      quoteIncrement: '0.00001',
      displayName: 'ETH/BTC',
      status: 'online',
      minMarketFunds: '0.001',
      maxMarketFunds: '100',
      postOnly: false,
      limitOnly: false,
      cancelOnly: false
    },
    {
      id: 'LTC-USD',
      baseCurrency: 'LTC',
      quoteCurrency: 'USD',
      baseMinSize: '0.1',
      baseMaxSize: '10000',
      quoteIncrement: '0.01',
      displayName: 'LTC/USD',
      status: 'online',
      minMarketFunds: '10',
      maxMarketFunds: '1000000',
      postOnly: false,
      limitOnly: false,
      cancelOnly: false
    }
  ];

  constructor(private http: HttpClient) { }

  getProducts(): Observable<Product[]> {
    // If we have cached products, return them
    if (this.cachedProducts.length > 0) {
      return of(this.cachedProducts);
    }
    
    return this.http.get<Product[]>(this.API_URL).pipe(
      retry(2), // Retry failed requests up to 2 times
      tap(products => {
        this.cachedProducts = products;
      }),
      catchError((error: HttpErrorResponse) => {
        console.warn('Error fetching products from API, using mock data', error);
        this.cachedProducts = this.mockProducts;
        return of(this.mockProducts);
      })
    );
  }

  getProduct(productId: string): Observable<Product> {
    // If we have the product in cache, return it
    const cachedProduct = this.cachedProducts.find(p => p.id === productId);
    if (cachedProduct) {
      return of(cachedProduct);
    }
    
    return this.http.get<Product>(`${this.API_URL}/${productId}`).pipe(
      retry(2), // Retry failed requests up to 2 times
      catchError((error: HttpErrorResponse) => {
        console.warn(`Error fetching product ${productId} from API, checking mock data`, error);
        
        // Try to find the product in mock data
        const mockProduct = this.mockProducts.find(p => p.id === productId);
        if (mockProduct) {
          return of(mockProduct);
        }
        
        // If not found in mock data either, throw an error
        return throwError(() => new Error(`Product ${productId} not found`));
      })
    );
  }
}
