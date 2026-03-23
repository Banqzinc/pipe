import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import type { Config } from '../../config';

// Mock google-auth-library
const mockVerifyIdToken = vi.hoisted(() => vi.fn());

vi.mock('google-auth-library', () => {
  return {
    // biome-ignore lint/complexity/useArrowFunction: constructor mock requires function keyword
    OAuth2Client: vi.fn(function () {
      this.verifyIdToken = mockVerifyIdToken;
    }),
  };
});

const testConfig: Config = {
  port: 3100,
  databaseUrl: 'postgres://localhost/test',
  jwtSecret: 'test-jwt-secret-at-least-16-chars',
  encryptionKey: 'a'.repeat(64),
  reposDir: './repos',
  nodeEnv: 'test',
  origin: 'http://localhost:5173',
  googleClientId: 'test-client-id.apps.googleusercontent.com',
  allowedDomains: 'quidkey.com, example.com',
};

describe('AuthService', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = testConfig.jwtSecret;
    vi.clearAllMocks();
  });

  describe('verifyGoogleToken', () => {
    it('returns email and name for valid token with allowed domain', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'user@quidkey.com',
          email_verified: true,
          name: 'Test User',
        }),
      });

      const result = await AuthService.verifyGoogleToken('valid-token', testConfig);
      expect(result).toEqual({ email: 'user@quidkey.com', name: 'Test User' });
    });

    it('rejects token with disallowed domain', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'user@evil.com',
          email_verified: true,
        }),
      });

      await expect(
        AuthService.verifyGoogleToken('valid-token', testConfig),
      ).rejects.toThrow('Domain not allowed');
    });

    it('rejects token with unverified email', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'user@quidkey.com',
          email_verified: false,
        }),
      });

      await expect(
        AuthService.verifyGoogleToken('valid-token', testConfig),
      ).rejects.toThrow('Email not verified');
    });

    it('rejects invalid token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(
        AuthService.verifyGoogleToken('bad-token', testConfig),
      ).rejects.toThrow();
    });
  });

  describe('signToken / verifyToken', () => {
    it('signToken produces a valid JWT with email', () => {
      const token = AuthService.signToken('user@quidkey.com');
      expect(token.split('.').length).toBe(3);

      const payload = AuthService.verifyToken(token);
      expect(payload.type).toBe('session');
      expect(payload.email).toBe('user@quidkey.com');
    });

    it('verifyToken rejects invalid token', () => {
      expect(() => AuthService.verifyToken('invalid.token.here')).toThrow();
    });

    it('verifyToken rejects expired token', async () => {
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { type: 'session', email: 'user@quidkey.com' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', expiresIn: '-1s' },
      );
      expect(() => AuthService.verifyToken(token)).toThrow();
    });
  });
});
