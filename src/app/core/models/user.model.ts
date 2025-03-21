export interface User {
  id: string;
  email: string;
  username?: string;
  name?: string;
  profilePhoto?: string;
  createdAt: Date | string;
  updatedAt?: string;
  twoStepVerificationType?: string; // Type of 2FA enabled (e.g., 'totp')
  totpEnabled?: boolean; // Whether TOTP is enabled for this user (from API)
  isTotpEnabled?: boolean; // Whether TOTP is enabled for this user
  mfaEnabled?: boolean; // Whether MFA is enabled for this user
  band?: boolean; // User ban status
}

export interface AuthResponse {
  user: User;
  token: string;
  twoStepVerification?: string; // Indicates 2FA is required during login
  requireMfa?: boolean; // Indicates MFA verification is required
}

export interface UserTotpStatus {
  enabled: boolean;
  secretKey?: string;
  backupCodesCount?: number;
}

export interface MfaSetupData {
  secret: string;
  qrCodeUrl: string;
  otpAuthUrl: string;
}

export interface MfaVerifyResponse {
  success: boolean;
  backupCodes?: string[];
}

export interface BackupCodesResponse {
  backupCodes: string[];
} 