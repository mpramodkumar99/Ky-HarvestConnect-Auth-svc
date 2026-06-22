import { createHmac } from 'node:crypto';
import type { TokenPayload } from './types.js';

// ── OTP PORT ──────────────────────────────────────────────────────────────────

export interface OtpPort {
  send(phone: string, code: string): Promise<void>;
}

export class FakeOtpProvider implements OtpPort {
  async send(phone: string, code: string): Promise<void> {
    console.log(`[OTP] ${phone} → ${code}`);
  }
}

// ── JWT PORT ──────────────────────────────────────────────────────────────────

export interface JwtPort {
  sign(payload: Omit<TokenPayload, 'iat' | 'exp'>): string;
  verify(token: string): TokenPayload | null;
}

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

export class SimpleHmacJwt implements JwtPort {
  constructor(private secret: string, private ttlSeconds = 86400) {}

  sign(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    const now  = Math.floor(Date.now() / 1000);
    const full: TokenPayload = { ...payload, iat: now, exp: now + this.ttlSeconds };
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body   = b64url(JSON.stringify(full));
    const sig    = b64url(createHmac('sha256', this.secret).update(`${header}.${body}`).digest());
    return `${header}.${body}.${sig}`;
  }

  verify(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, body, sig] = parts as [string, string, string];
      const expected = b64url(createHmac('sha256', this.secret).update(`${header}.${body}`).digest());
      if (sig !== expected) return null;
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }
}

// ── USER LOOKUP PORT (inter-service) ──────────────────────────────────────────

export interface UserLookupPort {
  findByPhone(phone: string): Promise<{ id: string; type: 'buyer' | 'seller'; email?: string } | null>;
}

export class HttpUserLookup implements UserLookupPort {
  constructor(private baseUrl: string) {}

  async findByPhone(phone: string): Promise<{ id: string; type: 'buyer' | 'seller'; email?: string } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/users?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return null;
      const body = await res.json() as {
        success: boolean;
        data: Array<{ id: string; type: 'buyer' | 'seller'; email?: string }>;
      };
      return body.success && body.data.length > 0 ? (body.data[0] ?? null) : null;
    } catch {
      return null;
    }
  }
}

// ── USER REGISTRATION PORT (inter-service) ────────────────────────────────────

export interface UserRegistrationPort {
  create(name: string, phone: string, type: 'buyer' | 'seller', email?: string): Promise<{ id: string; type: 'buyer' | 'seller' }>;
  verify(userId: string): Promise<void>;
}

export class HttpUserRegistration implements UserRegistrationPort {
  constructor(private baseUrl: string, private adminKey: string) {}

  async create(name: string, phone: string, type: 'buyer' | 'seller', email?: string): Promise<{ id: string; type: 'buyer' | 'seller' }> {
    const res = await fetch(`${this.baseUrl}/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, type, ...(email ? { email } : {}) }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: { title?: string } };
      throw new Error(err.error?.title ?? `user-svc returned ${res.status}`);
    }
    const body = await res.json() as { data: { id: string; type: 'buyer' | 'seller' } };
    return body.data;
  }

  async verify(userId: string): Promise<void> {
    await fetch(`${this.baseUrl}/v1/users/${userId}/verify`, {
      method: 'PATCH',
      headers: { 'X-Admin-Key': this.adminKey },
    });
  }
}
