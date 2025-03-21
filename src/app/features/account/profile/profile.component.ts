import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { TotpService, TotpSetupResponse } from '../../../core/services/totp.service';
import { User } from '../../../core/models/user.model';
import { catchError, finalize, of, tap } from 'rxjs';
import { UserService } from '../../../core/services/user.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit, OnDestroy {
  user: User | null = null;
  
  // TOTP/MFA related properties
  isTotpEnabled = false;
  totpSetupData: TotpSetupResponse | null = null;
  backupCodes: string[] = [];
  showBackupCodes = false;
  
  // Forms
  profileForm: FormGroup;
  totpEnableForm: FormGroup;
  totpDisableForm: FormGroup;
  mfaForm: FormGroup;
  passwordChangeForm: FormGroup;
  
  // UI states
  loading = false;
  setupInProgress = false;
  error = '';
  successMessage = '';
  showPasswordChangeForm = false;
  
  // MFA states
  mfaSetupData: any = null;
  mfaEnabled = false;
  mfaSetupStarted = false;
  mfaVerificationCompleted = false;
  
  // Profile Picture
  selectedProfilePicture: File | null = null;
  profilePictureUrl: string | null = null;
  
  // Expose environment for template
  environment = environment;
  
  private isComponentMounted = true;
  
  constructor(
    private authService: AuthService,
    private totpService: TotpService,
    private fb: FormBuilder,
    private userService: UserService,
    private http: HttpClient
  ) {
    this.profileForm = this.fb.group({
      email: [{ value: '', disabled: true }],
      name: ['', [Validators.required]],
    });
    
    this.totpEnableForm = this.fb.group({
      verificationCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
    
    this.totpDisableForm = this.fb.group({
      password: ['', [Validators.required]]
    });

    this.mfaForm = this.fb.group({
      verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });
    
    this.passwordChangeForm = this.fb.group({
      currentPassword: ['', [Validators.required, Validators.minLength(6)]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }
  
  ngOnInit(): void {
    this.loadUserProfile();
  }
  
  ngOnDestroy(): void {
    this.isComponentMounted = false;
  }
  
  loadUserProfile() {
    this.loading = true;
    this.error = '';
    
    this.authService.currentUser$.subscribe({
      next: (user) => {
        this.user = user;
        if (user) {
          this.profileForm.patchValue({
            email: user.email,
            name: user.name || ''
          });
          
          // Log the user object to debug
          console.log('User profile loaded:', user);
          
          // Fix: Check totpEnabled property directly from API response
          // The API returns totpEnabled instead of mfaEnabled and the twoStepVerificationType can be null
          this.isTotpEnabled = user.totpEnabled === true || user.twoStepVerificationType === 'totp';
          
          // Log the status for debugging
          console.log('2FA status (isTotpEnabled):', this.isTotpEnabled);
          console.log('User properties:', {
            totpEnabled: user.totpEnabled,
            twoStepVerificationType: user.twoStepVerificationType
          });
          
          // For backward compatibility
          this.mfaEnabled = user.totpEnabled || false;
          this.profilePictureUrl = user.profilePhoto || null;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading user profile:', err);
        this.error = 'Could not load user profile. Please try again.';
        this.loading = false;
      }
    });
  }
  
  // MFA Setup Related Methods
  
  /**
   * Set up TOTP (Time-based One-Time Password) for this user
   */
  setupTotp(): void {
    this.setupInProgress = true;
    this.error = '';
    
    this.totpService.setupTotp().subscribe({
      next: (response: TotpSetupResponse) => {
        this.totpSetupData = response;
        if (response.secretKey) {
          this.generateQrCode(response.secretKey);
        }
      },
      error: (error: any) => {
        this.setupInProgress = false;
        this.error = this.formatError(error);
      }
    });
  }
  
  /**
   * Enable TOTP after verification code is entered
   */
  enableTotp() {
    if (this.totpEnableForm.invalid) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    const code = this.totpEnableForm.get('verificationCode')?.value;
    
    this.totpService.enableTotp(code).pipe(
      tap(response => {
        this.isTotpEnabled = true;
        this.setupInProgress = false;
        this.totpSetupData = null;
        this.successMessage = 'Two-factor authentication has been successfully enabled!';
        this.loadUserProfile(); // Reload user to get updated MFA status
      }),
      catchError(error => {
        console.error('Error enabling TOTP:', error);
        this.error = error.message || 'Invalid verification code. Please try again.';
        return of(null);
      }),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe();
  }
  
  /**
   * Disable TOTP with password verification
   */
  disableTotp() {
    if (this.totpDisableForm.invalid) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    const password = this.totpDisableForm.get('password')?.value;
    
    this.totpService.disableTotp(password).pipe(
      tap(response => {
        this.isTotpEnabled = false;
        this.successMessage = 'Two-factor authentication has been disabled.';
        this.loadUserProfile(); // Reload user to get updated MFA status
      }),
      catchError(error => {
        console.error('Error disabling TOTP:', error);
        this.error = error.message || 'Incorrect password. Please try again.';
        return of(null);
      }),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe();
  }
  
  /**
   * Regenerate backup codes
   */
  regenerateBackupCodes() {
    this.loading = true;
    this.error = '';
    
    this.totpService.regenerateBackupCodes().pipe(
      tap(backupCodes => {
        this.backupCodes = backupCodes;
        this.showBackupCodes = true;
        this.successMessage = 'Backup codes have been regenerated.';
      }),
      catchError(error => {
        console.error('Error regenerating backup codes:', error);
        this.error = error.message || 'Failed to regenerate backup codes.';
        return of(null);
      }),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe();
  }
  
  /**
   * Copy text to clipboard
   */
  copyToClipboard(text: string, successMessage: string = 'Copied to clipboard!'): void {
    // Create a flag to track if the operation is still valid
    let isOperationValid = true;
    
    // Set a timeout to ensure the operation doesn't hang
    const timeoutId = setTimeout(() => {
      isOperationValid = false;
    }, 2000); // 2 seconds should be enough for clipboard operations
    
    try {
      navigator.clipboard.writeText(text)
        .then(() => {
          // Clear the timeout as operation completed
          clearTimeout(timeoutId);
          
          // Only update UI if the operation is still valid
          if (isOperationValid) {
            this.successMessage = successMessage;
            setTimeout(() => {
              if (this.successMessage === successMessage) {
                this.successMessage = '';
              }
            }, 3000);
          }
        })
        .catch((err) => {
          // Clear the timeout as operation completed
          clearTimeout(timeoutId);
          
          // Handle error only if operation is still valid
          if (isOperationValid) {
            console.error('Could not copy text: ', err);
            this.error = 'Failed to copy to clipboard.';
            
            // Alternative method using document.execCommand (deprecated but works as fallback)
            this.fallbackCopyTextToClipboard(text);
          }
        });
    } catch (e) {
      // Clear the timeout
      clearTimeout(timeoutId);
      
      // Fallback for browsers that don't support clipboard API
      if (isOperationValid) {
        console.error('Clipboard API not supported, using fallback', e);
        this.fallbackCopyTextToClipboard(text);
      }
    }
  }
  
  /**
   * Fallback method to copy text to clipboard using execCommand
   * @deprecated But useful as a fallback
   */
  private fallbackCopyTextToClipboard(text: string): void {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Make the textarea out of viewport
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      if (successful) {
        this.successMessage = 'Copied to clipboard!';
        setTimeout(() => {
          if (this.successMessage === 'Copied to clipboard!') {
            this.successMessage = '';
          }
        }, 3000);
      } else {
        this.error = 'Unable to copy to clipboard';
      }
      
      document.body.removeChild(textArea);
    } catch (err) {
      console.error('Fallback clipboard method failed:', err);
      this.error = 'Failed to copy to clipboard.';
    }
  }
  
  /**
   * Copy secret key to clipboard
   */
  copySecretKey(): void {
    if (this.totpSetupData?.secretKey) {
      this.copyToClipboard(this.totpSetupData.secretKey, 'Secret key copied to clipboard!');
    }
  }
  
  /**
   * Copy backup codes to clipboard
   */
  copyBackupCodes(): void {
    if (this.backupCodes.length > 0) {
      this.copyToClipboard(this.backupCodes.join('\n'), 'Backup codes copied to clipboard!');
    }
  }
  
  /**
   * Cancel the MFA setup process
   */
  cancelSetup() {
    this.setupInProgress = false;
    this.totpSetupData = null;
    this.backupCodes = [];
    this.showBackupCodes = false;
    this.totpEnableForm.reset();
  }
  
  /**
   * Clear success and error messages
   */
  clearMessages() {
    this.error = '';
    this.successMessage = '';
  }

  // MFA Methods
  startMfaSetup(): void {
    this.loading = true;
    this.error = '';
    this.mfaSetupData = null;

    this.userService.generateMfaSetup()
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (data) => {
          this.mfaSetupData = data;
          this.mfaSetupStarted = true;
        },
        error: (error) => {
          this.error = 'Failed to set up MFA. Please try again.';
          console.error('Error setting up MFA:', error);
        }
      });
  }

  verifyMfaSetup(): void {
    if (this.mfaForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = '';
    
    const { verificationCode } = this.mfaForm.value;

    this.userService.verifyMfaSetup(verificationCode)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (data) => {
          this.mfaEnabled = true;
          this.mfaVerificationCompleted = true;
          this.backupCodes = data.backupCodes || [];
          this.showBackupCodes = true;
          this.successMessage = 'Two-factor authentication has been enabled';
          this.mfaForm.reset();
          // Reload user profile to update MFA status
          this.loadUserProfile();
        },
        error: (error) => {
          this.error = 'Failed to verify code. Please check and try again.';
          console.error('Error verifying MFA code:', error);
        }
      });
  }

  disableMfa(): void {
    if (!confirm('Are you sure you want to disable two-factor authentication? This will reduce the security of your account.')) {
      return;
    }

    this.loading = true;
    this.error = '';
    
    this.userService.setMfaEnabled(false)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: () => {
          this.mfaEnabled = false;
          this.mfaSetupStarted = false;
          this.mfaVerificationCompleted = false;
          this.mfaSetupData = null;
          this.backupCodes = [];
          this.showBackupCodes = false;
          this.successMessage = 'Two-factor authentication has been disabled';
          // Reload user profile to update MFA status
          this.loadUserProfile();
        },
        error: (error) => {
          this.error = 'Failed to disable MFA. Please try again.';
          console.error('Error disabling MFA:', error);
        }
      });
  }

  generateBackupCodes(): void {
    this.loading = true;
    this.error = '';
    
    this.userService.generateBackupCodes()
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (data) => {
          this.backupCodes = data.backupCodes || [];
          this.showBackupCodes = true;
          this.successMessage = 'New backup codes have been generated';
        },
        error: (error) => {
          this.error = 'Failed to generate backup codes. Please try again.';
          console.error('Error generating backup codes:', error);
        }
      });
  }

  hideBackupCodes(): void {
    this.showBackupCodes = false;
  }

  cancelMfaSetup(): void {
    this.mfaSetupStarted = false;
    this.mfaSetupData = null;
    this.mfaForm.reset();
  }

  // Password match validator
  passwordMatchValidator(control: FormGroup): { [key: string]: boolean } | null {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');
    
    if (newPassword && confirmPassword && newPassword.value !== confirmPassword.value) {
      return { 'passwordMismatch': true };
    }
    
    return null;
  }
  
  /**
   * Update user profile (name/display name)
   */
  updateProfile(): void {
    if (this.profileForm.invalid) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    this.successMessage = '';
    
    const userData = {
      name: this.profileForm.get('name')?.value
    };
    
    this.userService.updateProfile(userData)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (response) => {
          this.successMessage = 'Profile updated successfully';
          this.loadUserProfile(); // Reload to get updated user data
        },
        error: (error) => {
          this.error = error.message || 'Failed to update profile information';
          console.error('Error updating profile:', error);
        }
      });
  }
  
  /**
   * Toggle password change form visibility
   */
  togglePasswordChangeForm(): void {
    this.showPasswordChangeForm = !this.showPasswordChangeForm;
    if (!this.showPasswordChangeForm) {
      this.passwordChangeForm.reset();
    }
  }
  
  /**
   * Submit password change
   */
  changePassword(): void {
    if (this.passwordChangeForm.invalid) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    this.successMessage = '';
    
    const passwordData = {
      currentPassword: this.passwordChangeForm.get('currentPassword')?.value,
      newPassword: this.passwordChangeForm.get('newPassword')?.value
    };
    
    this.userService.changePassword(passwordData)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (response) => {
          this.successMessage = 'Password changed successfully';
          this.passwordChangeForm.reset();
          this.showPasswordChangeForm = false;
        },
        error: (error) => {
          this.error = error.message || 'Failed to change password. Please verify your current password.';
          console.error('Error changing password:', error);
        }
      });
  }
  
  /**
   * Handle profile picture file selection 
   */
  onProfilePictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // Validate file is an image and size is reasonable
      if (!file.type.startsWith('image/')) {
        this.error = 'Please select an image file (JPG, PNG, etc.)';
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) { // 5MB max
        this.error = 'Image size must be less than 5MB';
        return;
      }
      
      this.selectedProfilePicture = file;
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profilePictureUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }
  
  /**
   * Upload the selected profile picture
   */
  uploadProfilePicture(): void {
    if (!this.selectedProfilePicture) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    this.successMessage = '';
    
    this.userService.uploadProfilePicture(this.selectedProfilePicture)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (response) => {
          this.successMessage = 'Profile picture updated successfully';
          this.selectedProfilePicture = null;
          this.loadUserProfile(); // Reload to get updated user data
        },
        error: (error) => {
          this.error = error.message || 'Failed to upload profile picture';
          console.error('Error uploading profile picture:', error);
        }
      });
  }
  
  /**
   * Set up Two-Factor Authentication (2FA) directly
   * This is an alternative approach that can work with various backend configurations
   */
  setup2FA(): void {
    this.setupInProgress = true;
    this.loading = true;
    this.error = '';
    this.successMessage = '';
    
    // Define the URL for setting up TOTP
    const setupUrl = `${environment.apiUrl}/users/totp/setup`;
    
    // Make a GET request to set up TOTP
    this.http.get(setupUrl, {
      headers: this.authService.getAuthHeaders()
    })
    .pipe(
      finalize(() => {
        this.loading = false;
      })
    )
    .subscribe({
      next: (response: any) => {
        console.log('TOTP setup response:', response);
        
        // Map the response to the expected format
        this.totpSetupData = {
          secretKey: response.secretKey,
          qrCodeUrl: response.qrCodeUri, // Map qrCodeUri to qrCodeUrl
          backupCodes: response.backupCodes
        };
        
        this.backupCodes = response.backupCodes || [];
        this.showBackupCodes = true;
        this.setupInProgress = true;
        
        // Generate QR code if we have a secret key
        if (response.secretKey) {
          this.generateQrCode(response.secretKey);
        }
      },
      error: (error: any) => {
        console.error('TOTP setup error:', error);
        this.error = this.formatError(error);
        this.setupInProgress = false;
      }
    });
  }
  
  /**
   * Generate QR code on the client side using the secretKey
   */
  private generateQrCode(secret: string): void {
    if (!secret) {
      return;
    }
    
    // Constructing the otpauth URL - this is the standard format for TOTP
    const userEmail = this.user?.email ?? 'user';
    const issuer = 'GitBitex'; // Change this to your application name
    const otpauthUrl = `otpauth://totp/${issuer}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    
    // Set a timeout for the QR code generation (5 seconds should be more than enough)
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('QR code generation timed out')), 5000);
    });
    
    // Generate QR code as data URL with a timeout
    Promise.race([
      QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'H' }),
      timeoutPromise
    ])
      .then(url => {
        // Only update if component is still mounted
        if (this.isComponentMounted) {
          // Update the QR code URL with our generated one
          if (this.totpSetupData) {
            this.totpSetupData.qrCodeUrl = url;
          }
        }
      })
      .catch(err => {
        if (this.isComponentMounted) {
          console.error('Error generating QR code:', err);
          
          // Try a simpler version with fewer options as fallback
          QRCode.toDataURL(otpauthUrl)
            .then(url => {
              if (this.isComponentMounted && this.totpSetupData) {
                this.totpSetupData.qrCodeUrl = url;
              }
            })
            .catch(fallbackErr => {
              console.error('Fallback QR code generation also failed:', fallbackErr);
            });
        }
      });
  }

  /**
   * Format error messages for display
   */
  private formatError(error: any): string {
    if (error.error && error.error.message) {
      return error.error.message;
    } else if (error.message) {
      return error.message;
    } else if (typeof error === 'string') {
      return error;
    } else {
      return `Error: ${error.status} ${error.statusText || 'Unknown error'}`;
    }
  }
}
