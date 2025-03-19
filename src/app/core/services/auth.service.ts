import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, of } from 'rxjs';
import { catchError, map, tap, delay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { isPlatformBrowser } from '@angular/common';

interface AuthResponse {
  token?: string;
  user?: any;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<any>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);
  private readonly isBrowser: boolean;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    
    // Check localStorage for existing token only in browser environment
    if (this.isBrowser) {
      const token = localStorage.getItem('token');
      if (token) {
        this.tokenSubject.next(token);
        this.loadCurrentUser().subscribe();
      }
    }
  }

  get currentUser$(): Observable<any> {
    return this.currentUserSubject.asObservable();
  }

  get token$(): Observable<string | null> {
    return this.tokenSubject.asObservable();
  }

  get isAuthenticated(): boolean {
    return !!this.tokenSubject.value;
  }

  login(email: string, password: string): Observable<any> {
    const headers = new HttpHeaders().set('Content-Type', 'application/json');
    
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, { email, password }, { headers })
      .pipe(
        tap(response => {
          console.log('Login response:', response);
          if (response.token) {
            if (this.isBrowser) {
              localStorage.setItem('token', response.token);
            }
            this.tokenSubject.next(response.token);
            if (response.user) {
              this.currentUserSubject.next(response.user);
            }
          }
        }),
        catchError(this.handleError)
      );
  }

  signup(email: string, password: string, username: string, country: string): Observable<any> {
    const headers = new HttpHeaders().set('Content-Type', 'application/json');
    
    return this.http.post<AuthResponse>(`${this.API_URL}/signup`, { 
      email, 
      password, 
      username, 
      country 
    }, { headers })
      .pipe(
        tap(response => {
          console.log('Signup response:', response);
        }),
        catchError(this.handleError)
      );
  }

  requestPasswordReset(email: string): Observable<any> {
    const headers = new HttpHeaders().set('Content-Type', 'application/json');
    
    // In a real application, this would call the actual API endpoint
    // return this.http.post<any>(`${this.API_URL}/reset-password`, { email }, { headers })
    //   .pipe(
    //     catchError(this.handleError)
    //   );
    
    // For now, we'll use a mock response with a delay to simulate an API call
    console.log('Password reset requested for:', email);
    return of({ success: true, message: 'Password reset email sent' })
      .pipe(
        delay(1500) // simulate network delay
      );
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem('token');
    }
    this.tokenSubject.next(null);
    this.currentUserSubject.next(null);
  }

  private loadCurrentUser(): Observable<any> {
    return this.http.get<any>(`${this.API_URL}/user/me`)
      .pipe(
        tap(user => this.currentUserSubject.next(user)),
        catchError(error => {
          this.logout();
          return throwError(() => error);
        })
      );
  }

  private handleError(error: HttpErrorResponse) {
    console.error('An error occurred:', error);
    let errorMessage = 'An error occurred. Please try again later.';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else if (typeof error.error === 'string') {
      try {
        // Try to parse error message if it's JSON
        const parsedError = JSON.parse(error.error);
        errorMessage = parsedError.message || errorMessage;
      } catch {
        // If it's not JSON, use the string directly
        errorMessage = error.error;
      }
    } else if (error.error?.message) {
      // Server-side error with message
      errorMessage = error.error.message;
    } else if (error.status === 404) {
      errorMessage = 'API endpoint not found. Please check the server configuration.';
    } else if (error.status === 0) {
      errorMessage = 'Unable to connect to the server. Please check your connection.';
    }

    return throwError(() => ({
      message: errorMessage,
      status: error.status,
      statusText: error.statusText
    }));
  }

  // Helper method to get auth headers
  getAuthHeaders(): HttpHeaders {
    const token = this.tokenSubject.value;
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  getToken(): string | null {
    return this.tokenSubject.value;
  }
}
