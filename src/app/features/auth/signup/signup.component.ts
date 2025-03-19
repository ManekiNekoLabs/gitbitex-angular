import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss'
})
export class SignupComponent {
  signupForm: FormGroup;
  error: string = '';
  loading: boolean = false;
  isSubmitted: boolean = false;
  termsAccepted: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8), this.passwordStrengthValidator]],
      confirmPassword: ['', [Validators.required]],
      username: ['', [Validators.required, Validators.minLength(3)]],
      country: ['', [Validators.required]],
      terms: [false, [Validators.requiredTrue]]
    }, { validators: this.passwordMatchValidator });
  }

  // Custom validator for password strength
  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value: string = control.value || '';
    
    if (!value) {
      return null;
    }

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(value);
    
    const passwordValid = hasUpperCase && hasLowerCase && hasNumeric && hasSpecialChar;
    
    return !passwordValid ? { passwordStrength: true } : null;
  }

  // Custom validator to check if passwords match
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    
    if (password !== confirmPassword) {
      control.get('confirmPassword')?.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    
    return null;
  }

  onSubmit(): void {
    this.isSubmitted = true;
    
    if (this.signupForm.valid) {
      this.loading = true;
      this.error = '';
      
      const { email, password, username, country } = this.signupForm.value;
      
      this.authService.signup(email, password, username, country).subscribe({
        next: (response) => {
          console.log('Signup successful:', response);
          this.loading = false;
          this.router.navigate(['/auth/login'], { 
            queryParams: { registered: 'success' } 
          });
        },
        error: (error) => {
          console.error('Signup error:', error);
          this.loading = false;
          this.error = error.message || 'Registration failed. Please try again.';
        }
      });
    } else {
      this.error = 'Please fill in all required fields correctly.';
    }
  }

  getPasswordStrength(): { text: string, color: string } {
    const password = this.signupForm.get('password')?.value || '';
    
    if (!password) {
      return { text: 'None', color: '#9ca3af' };
    }
    
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumeric = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
    
    const strength = (hasUpperCase ? 1 : 0) + 
                     (hasLowerCase ? 1 : 0) + 
                     (hasNumeric ? 1 : 0) + 
                     (hasSpecialChar ? 1 : 0);
    
    if (password.length < 8) {
      return { text: 'Too short', color: '#ef4444' };
    } else if (strength === 1) {
      return { text: 'Weak', color: '#ef4444' };
    } else if (strength === 2) {
      return { text: 'Fair', color: '#f59e0b' };
    } else if (strength === 3) {
      return { text: 'Good', color: '#84cc16' };
    } else if (strength === 4) {
      return { text: 'Strong', color: '#22c55e' };
    }
    
    return { text: 'None', color: '#9ca3af' };
  }
}
