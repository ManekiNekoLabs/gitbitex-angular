import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  forgotPasswordForm: FormGroup;
  error: string = '';
  loading: boolean = false;
  isSubmitted: boolean = false;
  emailSent: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    this.isSubmitted = true;
    
    if (this.forgotPasswordForm.valid) {
      this.loading = true;
      this.error = '';
      
      const { email } = this.forgotPasswordForm.value;
      
      this.authService.requestPasswordReset(email).subscribe({
        next: (response) => {
          console.log('Password reset request successful:', response);
          this.loading = false;
          this.emailSent = true;
          // Clear form after successful submission
          this.forgotPasswordForm.reset();
          this.isSubmitted = false;
        },
        error: (error) => {
          console.error('Password reset request error:', error);
          this.loading = false;
          this.error = error.message || 'Failed to send reset link. Please try again.';
        }
      });
    } else {
      this.error = 'Please enter a valid email address.';
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
} 