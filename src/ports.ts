import { createHmac } from 'node:crypto';
import type { TokenPayload } from './types.js';

// ── OTP PORT ──────────────────────────────────────────────────────────────────
// Swap FakeOtpProvider → TwilioOtpProvider in server.ts; zero changes elsewhere.

export interface OtpPort {
  send(phone: string, code: string): Promise<void>;
}

export class FakeOtpProvider implements OtpPort {
  async send(phone: string, code: string): Promise<void> {
    // In production: Twilio SMS API
    console.log(`[OTP] ${phone} → ${code}`);
  }
}

// ── JWT PORT ───────────────────────────────────────────────────────────────────
// HS256 using Node.js crypto only — no external library needed.
// Swap SimpleHmacJwt → any JWKS-backed implementation in server.ts.

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

// ── USER-SVC PORT (inter-service) ─────────────────────────────────────────────
// Looks up a user by (phone, userType) — same phone can be registered in
// multiple apps with different types; each lookup is scoped to one type.
// Swap FakeUserLookup → HttpUserLookup via USER_SVC_URL env var in server.ts.

import type { UserType } from './types.js';

export interface UserLookupPort {
  findByPhoneAndType(phone: string, userType: UserType): Promise<{ id: string; type: UserType } | null>;
}

export class FakeUserLookup implements UserLookupPort {
  // key: `${phone}:${type}`
  private devUsers = new Map<string, { id: string; type: UserType }>([
    ['+919000000001:buyer',  { id: 'user-b001',   type: 'buyer'  }],
    ['+919000000002:buyer',  { id: 'user-b002',   type: 'buyer'  }],
    ['+919000000112:seller', { id: 'seller-112',  type: 'seller' }],
    ['+919000000113:seller', { id: 'seller-113',  type: 'seller' }],
    ['+919000000105:seller', { id: 'seller-105',  type: 'seller' }],
    ['+919000000099:agent',  { id: 'agent-001',   type: 'agent'  }],
  ]);

  async findByPhoneAndType(phone: string, userType: UserType) {
    return this.devUsers.get(`${phone}:${userType}`) ?? null;
  }
}

// Real implementation — calls user-svc GET /v1/users?phone=<phone>&type=<type>
export class HttpUserLookup implements UserLookupPort {
  constructor(private baseUrl: string) {}

  async findByPhoneAndType(phone: string, userType: UserType): Promise<{ id: string; type: UserType } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/users?phone=${encodeURIComponent(phone)}&type=${userType}`);
      if (!res.ok) return null;
      const body = await res.json() as { success: boolean; data: Array<{ id: string; type: UserType }> };
      return body.success && body.data.length > 0 ? (body.data[0] ?? null) : null;
    } catch {
      return null;
    }
  }
}
