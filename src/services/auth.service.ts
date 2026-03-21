import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger';

let storedSecret: string | null = null;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export const AuthService = {
  async initSecret(reposDir: string): Promise<string> {
    const filePath = path.join(reposDir, '.pipe-secret');

    if (fs.existsSync(filePath)) {
      storedSecret = fs.readFileSync(filePath, 'utf-8').trim();
      return storedSecret;
    }

    // Ensure reposDir exists
    fs.mkdirSync(reposDir, { recursive: true });

    storedSecret = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(filePath, storedSecret, { mode: 0o600 });
    logger.info(`Auth secret: ${storedSecret} (enter this in the UI to log in)`);

    return storedSecret;
  },

  validateSecret(input: string): boolean {
    if (!storedSecret) {
      return false;
    }

    const inputBuf = Buffer.from(input);
    const secretBuf = Buffer.from(storedSecret);

    if (inputBuf.length !== secretBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(inputBuf, secretBuf);
  },

  signToken(): string {
    return jwt.sign({ type: 'session' }, getJwtSecret(), {
      algorithm: 'HS256',
      expiresIn: '7d',
    });
  },

  verifyToken(token: string): jwt.JwtPayload {
    return jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
  },
};
