import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private API_URL = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private getOptions() {
    const headers = new HttpHeaders().set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    return { headers };
  }

  private handleError(error: any) {
    console.error('An error occurred:', error);
    return throwError(() => error);
  }

  /**
   * Update user profile information
   * @param userData User profile data to update (name, etc.)
   * @returns Observable with updated user data
   */
  updateProfile(userData: any): Observable<any> {
    return this.http.put<any>(`${this.API_URL}/users/me`, userData, this.getOptions())
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Change user password
   * @param passwordData Object containing current and new password
   * @returns Observable with success message
   */
  changePassword(passwordData: { currentPassword: string, newPassword: string }): Observable<any> {
    return this.http.put<any>(`${this.API_URL}/users/me/password`, passwordData, this.getOptions())
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Upload profile picture
   * @param file Image file to upload
   * @returns Observable with image URL
   */
  uploadProfilePicture(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('profilePicture', file);

    return this.http.post<any>(`${this.API_URL}/users/me/profile-picture`, formData, {
      headers: new HttpHeaders({
        'Authorization': `Bearer ${localStorage.getItem('token')}`
        // Don't set Content-Type here, it will be set automatically for FormData
      })
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Enable or disable MFA for the current user
   * @param enable Boolean indicating whether to enable or disable MFA
   * @returns Observable with MFA setup data or success message
   */
  setMfaEnabled(enable: boolean): Observable<any> {
    const url = `${this.API_URL}/users/me/mfa/${enable ? 'enable' : 'disable'}`;
    return this.http.post<any>(url, {}, this.getOptions())
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Generate a new MFA setup (initial TOTP setup)
   * @returns Observable with MFA setup data (secret, QR code URL)
   */
  generateMfaSetup(): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/users/me/mfa/setup`, {}, this.getOptions())
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Verify MFA code to complete setup
   * @param code Verification code from authenticator app
   * @returns Observable with success response and backup codes
   */
  verifyMfaSetup(code: string): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/users/me/mfa/verify`, { code }, this.getOptions())
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Generate new backup codes
   * @returns Observable with new backup codes
   */
  generateBackupCodes(): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/users/me/mfa/backup-codes`, {}, this.getOptions())
      .pipe(
        catchError(this.handleError)
      );
  }
} 