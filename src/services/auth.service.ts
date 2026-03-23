import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../lib/errors';
import type { Config } from '../config';

const oauthClient = new OAuth2Client();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export const AuthService = {
  async verifyGoogleToken(
    idToken: string,
    config: Config,
  ): Promise<{ email: string; name?: string }> {
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      throw new AppError('Email not verified', 401, 'AUTH_FAILED');
    }

    const domain = payload.email.split('@')[1].toLowerCase();
    const allowed = config.allowedDomains
      .split(',')
      .map((d) => d.trim().toLowerCase());

    if (!allowed.includes(domain)) {
      throw new AppError('Domain not allowed', 403, 'DOMAIN_NOT_ALLOWED');
    }

    return { email: payload.email, name: payload.name };
  },

  signToken(email: string): string {
    return jwt.sign({ type: 'session', email }, getJwtSecret(), {
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
