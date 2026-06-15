import { randomUUID } from 'node:crypto';
import type { OtpRecord, Session } from './types.js';

// ── OTP REPOSITORY ────────────────────────────────────────────────────────────

export interface OtpRepository {
  create(phone: string, code: string, expiresAt: string): Promise<OtpRecord>;
  findActiveByPhone(phone: string): Promise<OtpRecord | null>;
  invalidateAllForPhone(phone: string): Promise<void>;
  markUsed(id: string): Promise<void>;
}

export class InMemoryOtpRepository implements OtpRepository {
  private store = new Map<string, OtpRecord>();

  async create(phone: string, code: string, expiresAt: string): Promise<OtpRecord> {
    const record: OtpRecord = { id: randomUUID(), phone, code, expiresAt, used: false };
    this.store.set(record.id, record);
    return record;
  }

  async findActiveByPhone(phone: string): Promise<OtpRecord | null> {
    const now = new Date().toISOString();
    for (const r of this.store.values()) {
      if (r.phone === phone && !r.used && r.expiresAt > now) return r;
    }
    return null;
  }

  async invalidateAllForPhone(phone: string): Promise<void> {
    for (const [id, r] of this.store.entries()) {
      if (r.phone === phone && !r.used) this.store.set(id, { ...r, used: true });
    }
  }

  async markUsed(id: string): Promise<void> {
    const r = this.store.get(id);
    if (r) this.store.set(id, { ...r, used: true });
  }
}

// ── SESSION REPOSITORY ────────────────────────────────────────────────────────

export interface SessionRepository {
  create(data: Omit<Session, 'id'>): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findByToken(token: string): Promise<Session | null>;
  revoke(id: string): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  private store = new Map<string, Session>();

  constructor() { this.seed(); }

  async create(data: Omit<Session, 'id'>): Promise<Session> {
    const session: Session = { ...data, id: randomUUID() };
    this.store.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<Session | null> {
    return this.store.get(id) ?? null;
  }

  async findByToken(token: string): Promise<Session | null> {
    for (const s of this.store.values()) {
      if (s.token === token) return s;
    }
    return null;
  }

  async revoke(id: string): Promise<void> {
    const s = this.store.get(id);
    if (s) this.store.set(id, { ...s, revoked: true });
  }

  // Pre-issued dev session for local testing without going through OTP
  private seed() {
    const now = new Date().toISOString();
    const far = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const sessions: Session[] = [
      {
        id: 'session-dev-b001',
        userId: 'user-b001',
        phone: '+919000000001',
        userType: 'buyer',
        token: 'dev-token-b001',
        issuedAt: now,
        expiresAt: far,
        revoked: false,
      },
      {
        id: 'session-dev-s112',
        userId: 'seller-112',
        phone: '+919000000112',
        userType: 'seller',
        token: 'dev-token-s112',
        issuedAt: now,
        expiresAt: far,
        revoked: false,
      },
    ];
    for (const s of sessions) this.store.set(s.id, s);
  }
}
