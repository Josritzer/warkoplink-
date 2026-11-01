import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reload, sendEmailVerification } from 'firebase/auth';
import {
  emailVerificationErrorMessage,
  refreshAccountVerification,
  sendAccountVerificationEmail
} from './emailVerification.js';

vi.mock('firebase/auth', () => ({
  reload: vi.fn(),
  sendEmailVerification: vi.fn()
}));

describe('email verification flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a verification email to an existing unverified account', async () => {
    const user = { email: 'member@example.com', emailVerified: false };
    await expect(sendAccountVerificationEmail(user)).resolves.toBe(true);
    expect(sendEmailVerification).toHaveBeenCalledWith(user);
  });

  it('does not send another email when the account is already verified', async () => {
    const user = { emailVerified: true };
    await expect(sendAccountVerificationEmail(user)).resolves.toBe(false);
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('rejects when no authenticated user is available', async () => {
    await expect(sendAccountVerificationEmail(null)).rejects.toMatchObject({ code: 'auth/no-current-user' });
  });

  it('refreshes the Firebase user before reading verification status', async () => {
    const user = { emailVerified: false };
    reload.mockImplementation(async currentUser => { currentUser.emailVerified = true; });
    await expect(refreshAccountVerification(user)).resolves.toBe(true);
    expect(reload).toHaveBeenCalledWith(user);
  });

  it('returns false when no user is available for a status refresh', async () => {
    await expect(refreshAccountVerification(null)).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows a clear cooldown message when Firebase rate-limits resend requests', () => {
    expect(emailVerificationErrorMessage({ code: 'auth/too-many-requests' })).toContain('Tunggu');
  });
});
