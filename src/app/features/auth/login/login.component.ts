import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  loginForm: FormGroup;
  mfaForm: FormGroup;
  error: string = '';
  loading: boolean = false;
  showMfaVerification: boolean = false;
  twoStepVerificationType: string | null = null;
  registrationSuccess: boolean = false;
  
  // Store credentials temporarily for MFA verification
  private email: string = '';
  private password: string = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
    
    this.mfaForm = this.fb.group({
      verificationCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
    
    // Check for successful registration message
    this.route.queryParams.subscribe(params => {
      if (params['registered'] === 'success') {
        this.registrationSuccess = true;
      }
    });
  }

  onSubmit(): void {
    if (this.showMfaVerification) {
      this.verifyMfa();
    } else {
      this.login();
    }
  }
  
  login(): void {
    if (this.loginForm.invalid) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    
    const { email, password } = this.loginForm.value;
    this.email = email;
    this.password = password;
    
    this.authService.login(email, password).subscribe({
      next: (response) => {
        // Check if MFA verification is required
        if (response.twoStepVerification && response.twoStepVerification !== 'none') {
          this.showMfaVerification = true;
          this.twoStepVerificationType = response.twoStepVerification;
          this.loading = false;
        } else {
          // No MFA required, redirect to dashboard
          console.log('Login successful:', response);
          this.loading = false;
          this.router.navigate(['/trading']);
        }
      },
      error: (error) => {
        console.error('Login error:', error);
        this.loading = false;
        this.error = error.message || 'Login failed. Please try again.';
      }
    });
  }
  
  verifyMfa(): void {
    if (this.mfaForm.invalid) {
      return;
    }
    
    this.loading = true;
    this.error = '';
    
    const code = this.mfaForm.get('verificationCode')?.value;
    
    // Call login again with the verification code
    this.authService.login(this.email, this.password, code).subscribe({
      next: (response) => {
        console.log('MFA verification successful:', response);
        this.loading = false;
        this.router.navigate(['/trading']);
      },
      error: (error) => {
        console.error('MFA verification error:', error);
        this.loading = false;
        this.error = error.message || 'Verification failed. Please try again.';
      }
    });
  }
  
  cancelMfa(): void {
    this.showMfaVerification = false;
    this.twoStepVerificationType = null;
    this.mfaForm.reset();
  }
  
  clearMessages(): void {
    this.error = '';
    this.registrationSuccess = false;
  }
}
