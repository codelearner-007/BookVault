// User-facing text of the auth routes. Responses never reveal whether an email has an
// account (AC-37), so several outcomes share one message on purpose.
export const AUTH_COPY = {
  invalidCredentials: 'Invalid email or password',
  signupSent: 'If this email can be used, we sent a link to verify it. Check your inbox.',
  verificationSent: 'If this email has an unverified account, we sent a new verification link.',
  resetSent: 'If an account exists for this email, we sent a link to reset the password.',
  resetDone: 'Password updated. Other sessions were signed out.',
  resetLinkInvalid: 'This reset link is invalid or has expired. Request a new one.',
  breachedPassword: 'This password appeared in a data breach. Choose a different one.',
  weakPassword: 'This password does not meet the password rules.',
  currentPasswordWrong: 'Current password is incorrect',
  reauthRequired: 'Sign in again to confirm this change.',
  passwordChanged: 'Password changed. Other sessions were signed out.',
  sessionsRevoked: 'All other sessions were signed out.',
  invalidCode: 'Invalid or expired code',
  invalidRecoveryCode: 'Invalid recovery code',
  mfaDisabled: 'Two-factor authentication is turned off.',
  unauthorized: 'Unauthorized',
  failed: 'The request could not be completed',
};
