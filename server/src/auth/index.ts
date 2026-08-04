import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/index.js';

// Ported from local-link-downloader/server/auth.ts (HMAC-signed expiry token scheme).

export function isAuthEnabled(): boolean {
  return Boolean(config.appPassword);
}

export function createSession(): string {
  const expiry = Date.now() + config.sessionTtlHours * 60 * 60 * 1000;
  const signature = createHmac('sha256', config.appPassword!).update(String(expiry)).digest('hex');
  return `${expiry}.${signature}`;
}

export function isValidSession(token: string): boolean {
  if (!config.appPassword) return false;
  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) return false;
  const expiryStr = token.substring(0, dotIdx);
  const providedSig = token.substring(dotIdx + 1);
  const expiry = Number(expiryStr);
  if (isNaN(expiry) || Date.now() > expiry) return false;
  const expectedSig = createHmac('sha256', config.appPassword!).update(expiryStr).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(providedSig, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Timing-safe password verification. Always calls timingSafeEqual regardless
 * of length so attackers cannot binary-search the password length via timing.
 */
export function verifyPassword(provided: string): boolean {
  const expected = config.appPassword!;
  const padded = provided.padEnd(expected.length, '\0').substring(0, expected.length);
  const lengthMatch = provided.length === expected.length;
  return lengthMatch && timingSafeEqual(Buffer.from(padded), Buffer.from(expected));
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.substring('Bearer '.length);
  const queryToken = req.query.token;
  if (typeof queryToken === 'string') return queryToken;
  return undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthEnabled()) {
    next();
    return;
  }
  const token = extractToken(req);
  if (!token || !isValidSession(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
