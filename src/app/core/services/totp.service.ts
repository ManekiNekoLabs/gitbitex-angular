import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { tap, catchError } from 'rxjs/operators';

// TOTP Setup Response interface
export interface TotpSetupResponse {
  secretKey: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

// TOTP Enable/Verify Request
export interface TotpVerifyRequest {
  code: string;
}

// TOTP Disable Request
export interface TotpDisableRequest {
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class TotpService {
  private readonly API_URL = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  /**
   * Setup TOTP for the current user
   * @returns Observable with TOTP setup information
   */
  setupTotp(): Observable<TotpSetupResponse> {
    const url = `${this.API_URL}/users/totp/setup`;
    const fallbackUrl = `${this.API_URL}/users/self/totp/setup`;
    
    console.log('Calling TOTP setup endpoint:', url);
    
    return this.http.get<TotpSetupResponse>(url, {
      headers: this.authService.getAuthHeaders()
    }).pipe(
      tap(response => console.log('TOTP setup response:', response)),
      catchError(error => {
        if (error.status === 404) {
          console.log('Primary endpoint not found, trying fallback endpoint:', fallbackUrl);
          return this.http.get<TotpSetupResponse>(fallbackUrl, {
            headers: this.authService.getAuthHeaders()
          }).pipe(
            tap(response => console.log('TOTP setup response from fallback:', response)),
            catchError(fallbackError => {
              console.error('TOTP setup error from fallback:', fallbackError);
              throw fallbackError;
            })
          );
        }
        console.error('TOTP setup error:', error);
        throw error;
      })
    );
  }

  /**
   * Enable TOTP for the current user after verification
   * @param code Verification code from authenticator app
   * @returns Observable with the result
   */
  enableTotp(code: string): Observable<any> {
    const request: TotpVerifyRequest = { code };
    const url = `${this.API_URL}/users/totp/enable`;
    console.log('Calling TOTP enable endpoint:', url);
    
    return this.http.post(url, request, {
      headers: this.authService.getAuthHeaders()
    }).pipe(
      tap(response => console.log('TOTP enable response:', response)),
      catchError(error => {
        console.error('TOTP enable error:', error);
        throw error;
      })
    );
  }

  /**
   * Disable TOTP for the current user
   * @param password User's current password
   * @returns Observable with the result
   */
  disableTotp(password: string): Observable<any> {
    const request: TotpDisableRequest = { password };
    return this.http.post(`${this.API_URL}/users/totp/disable`, request, {
      headers: this.authService.getAuthHeaders()
    });
  }

  /**
   * Regenerate backup codes for the current user
   * @returns Observable with new backup codes
   */
  regenerateBackupCodes(): Observable<string[]> {
    return this.http.post<string[]>(`${this.API_URL}/users/totp/backup-codes`, {}, {
      headers: this.authService.getAuthHeaders()
    });
  }

  /**
   * Verify a TOTP code (for testing purposes)
   * @param code Verification code from authenticator app
   * @returns Observable with verification result
   */
  verifyTotp(code: string): Observable<boolean> {
    const request: TotpVerifyRequest = { code };
    return this.http.post<boolean>(`${this.API_URL}/users/totp/verify`, request, {
      headers: this.authService.getAuthHeaders()
    });
  }
} 