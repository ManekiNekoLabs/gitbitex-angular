import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class HealthService {
  private readonly API_URL = environment.apiUrl;
  private readonly TIMEOUT_MS = 5000; // 5 seconds timeout

  constructor(private http: HttpClient) { }

  /**
   * Check if the backend API is available
   * @returns Observable<boolean> - true if backend is available, false otherwise
   */
  checkBackendHealth(): Observable<boolean> {
    // Try to access the Swagger UI as a health check
    // You can replace this with a dedicated health endpoint if available
    const healthUrl = `${this.API_URL}/health`;
    
    return this.http.get(healthUrl, { responseType: 'text' }).pipe(
      timeout(this.TIMEOUT_MS),
      map(() => true),
      catchError(() => {
        // If the health endpoint fails, try the Swagger UI
        return this.http.get(`${environment.apiUrl.split('/api')[0]}/swagger-ui/index.html`, { responseType: 'text' }).pipe(
          timeout(this.TIMEOUT_MS),
          map(() => true),
          catchError(() => of(false))
        );
      })
    );
  }

  /**
   * Ping the backend with a simple request to check connectivity
   * @returns Observable<boolean> - true if ping succeeds, false otherwise
   */
  pingBackend(): Observable<boolean> {
    // Try multiple endpoints to see if any respond
    const endpoints = [
      `${this.API_URL}/products`,
      `${this.API_URL}/products/BTC-USDT/book?level=1`,
      `${this.API_URL}/products/BTC-USDT/trades?limit=1`,
      `${environment.apiUrl.split('/api')[0]}/swagger-ui/index.html`
    ];
    
    // Try each endpoint in sequence
    let index = 0;
    
    const tryEndpoint = (): Observable<boolean> => {
      if (index >= endpoints.length) {
        return of(false);
      }
      
      const endpoint = endpoints[index++];
      return this.http.get(endpoint, { responseType: 'text' }).pipe(
        timeout(this.TIMEOUT_MS),
        map(() => true),
        catchError(() => tryEndpoint())
      );
    };
    
    return tryEndpoint();
  }
} 