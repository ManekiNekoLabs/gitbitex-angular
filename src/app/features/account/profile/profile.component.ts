import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { TotpService, TotpSetupResponse } from '../../../core/services/totp.service';
import { User } from '../../../core/models/user.model';
import { catchError, finalize, of, tap } from 'rxjs';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
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
  
  // UI states
  loading = false;
  setupInProgress = false;
  error = '';
  successMessage = '';
  
  // MFA states
  mfaSetupData: any = null;
  mfaEnabled = false;
  mfaSetupStarted = false;
  mfaVerificationCompleted = false;
  
  constructor(
    private authService: AuthService,
    private totpService: TotpService,
    private fb: FormBuilder,
    private userService: UserService
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
  }
  
  ngOnInit(): void {
    this.loadUserProfile();
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
          
          this.isTotpEnabled = user.twoStepVerificationType === 'totp';
          this.mfaEnabled = user.mfaEnabled || false;
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
   * Start the TOTP setup process
   */
  setupTotp() {
    this.setupInProgress = true;
    this.loading = true;
    this.error = '';
    
    this.totpService.setupTotp().pipe(
      tap(response => {
        this.totpSetupData = response;
        this.backupCodes = response.backupCodes;
        this.showBackupCodes = true;
      }),
      catchError(error => {
        console.error('Error setting up TOTP:', error);
        this.error = error.message || 'Failed to setup two-factor authentication.';
        return of(null);
      }),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe();
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
    navigator.clipboard.writeText(text).then(
      () => {
        this.successMessage = successMessage;
        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
        this.error = 'Failed to copy to clipboard.';
      }
    );
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
}
