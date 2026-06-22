import { randomUUID } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import type { OtpRepository, SessionRepository } from '../repository.js';
import type { OtpRecord, Session } from '../types.js';

type Db = NodePgDatabase<typeof schema>;

function toOtp(row: typeof schema.otpRecords.$inferSelect): OtpRecord {
  return {
    id:        row.id,
    phone:     row.phone,
    code:      row.code,
    expiresAt: row.expiresAt.toISOString(),
    used:      row.used,
  };
}

function toSession(row: typeof schema.sessions.$inferSelect): Session {
  return {
    id:        row.id,
    userId:    row.userId,
    phone:     row.phone,
    userType:  row.userType as Session['userType'],
    token:     row.token,
    issuedAt:  row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revoked:   row.revoked,
  };
}

// ── PgOtpRepository ───────────────────────────────────────────────────────────

export class PgOtpRepository implements OtpRepository {
  constructor(private db: Db) {}

  async create(phone: string, code: string, expiresAt: string): Promise<OtpRecord> {
    const [row] = await this.db.insert(schema.otpRecords).values({
      id: randomUUID(),
      phone,
      code,
      expiresAt: new Date(expiresAt),
    }).returning();
    return toOtp(row!);
  }

  async findActiveByPhone(phone: string): Promise<OtpRecord | null> {
    const [row] = await this.db.select().from(schema.otpRecords).where(
      and(
        eq(schema.otpRecords.phone, phone),
        eq(schema.otpRecords.used, false),
        gt(schema.otpRecords.expiresAt, new Date()),
      ),
    );
    return row ? toOtp(row) : null;
  }

  async invalidateAllForPhone(phone: string): Promise<void> {
    await this.db.update(schema.otpRecords)
      .set({ used: true })
      .where(and(eq(schema.otpRecords.phone, phone), eq(schema.otpRecords.used, false)));
  }

  async markUsed(id: string): Promise<void> {
    await this.db.update(schema.otpRecords)
      .set({ used: true })
      .where(eq(schema.otpRecords.id, id));
  }
}

// ── PgSessionRepository ───────────────────────────────────────────────────────

export class PgSessionRepository implements SessionRepository {
  constructor(private db: Db) {}

  async create(data: Omit<Session, 'id'>): Promise<Session> {
    const [row] = await this.db.insert(schema.sessions).values({
      id:        randomUUID(),
      userId:    data.userId,
      phone:     data.phone,
      userType:  data.userType,
      token:     data.token,
      issuedAt:  new Date(data.issuedAt),
      expiresAt: new Date(data.expiresAt),
      revoked:   data.revoked,
    }).returning();
    return toSession(row!);
  }

  async findById(id: string): Promise<Session | null> {
    const [row] = await this.db.select().from(schema.sessions)
      .where(eq(schema.sessions.id, id));
    return row ? toSession(row) : null;
  }

  async findByToken(token: string): Promise<Session | null> {
    const [row] = await this.db.select().from(schema.sessions)
      .where(eq(schema.sessions.token, token));
    return row ? toSession(row) : null;
  }

  async revoke(id: string): Promise<void> {
    await this.db.update(schema.sessions)
      .set({ revoked: true })
      .where(eq(schema.sessions.id, id));
  }
}
