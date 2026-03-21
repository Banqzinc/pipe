import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from '../../lib/encryption';

describe('encryption', () => {
  beforeAll(() => {
    process.env.PIPE_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('round-trips a string', () => {
    const plaintext = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const plaintext = 'test-token';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    const tampered = encrypted.slice(0, -4) + 'xxxx';
    expect(() => decrypt(tampered)).toThrow();
  });
});
