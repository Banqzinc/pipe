import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AuthService } from '../../services/auth.service';

describe('AuthService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-auth-test-'));
    // Set required env for JWT signing
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initSecret', () => {
    it('creates a .pipe-secret file and returns a secret', async () => {
      const secret = await AuthService.initSecret(tmpDir);

      expect(secret).toBeTruthy();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(32); // 16 bytes hex-encoded = 32 chars

      const filePath = path.join(tmpDir, '.pipe-secret');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8').trim()).toBe(secret);
    });

    it('reads existing file on subsequent calls', async () => {
      const firstSecret = await AuthService.initSecret(tmpDir);
      const secondSecret = await AuthService.initSecret(tmpDir);

      expect(secondSecret).toBe(firstSecret);
    });
  });

  describe('validateSecret', () => {
    it('returns true for correct secret', async () => {
      const secret = await AuthService.initSecret(tmpDir);
      const result = AuthService.validateSecret(secret);

      expect(result).toBe(true);
    });

    it('returns false for wrong secret', async () => {
      await AuthService.initSecret(tmpDir);
      const result = AuthService.validateSecret('wrong-secret-value');

      expect(result).toBe(false);
    });
  });

  describe('signToken / verifyToken', () => {
    it('signToken produces a valid JWT', async () => {
      await AuthService.initSecret(tmpDir);
      const token = AuthService.signToken();

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      // JWT has 3 parts separated by dots
      expect(token.split('.').length).toBe(3);
    });

    it('verifyToken accepts valid token', async () => {
      await AuthService.initSecret(tmpDir);
      const token = AuthService.signToken();
      const payload = AuthService.verifyToken(token);

      expect(payload).toBeTruthy();
      expect((payload as any).type).toBe('session');
    });

    it('verifyToken rejects invalid token', async () => {
      await AuthService.initSecret(tmpDir);

      expect(() => AuthService.verifyToken('invalid.token.here')).toThrow();
    });

    it('verifyToken rejects expired token', async () => {
      await AuthService.initSecret(tmpDir);
      // Sign a token with very short (already expired) ttl by using jwt directly
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { type: 'session' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', expiresIn: '-1s' },
      );

      expect(() => AuthService.verifyToken(token)).toThrow();
    });
  });
});
