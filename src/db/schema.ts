import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const otpRecords = pgTable('otp_records', {
  id:        text('id').primaryKey(),
  phone:     text('phone').notNull(),
  code:      text('code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used:      boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull(),
  phone:     text('phone').notNull(),
  userType:  text('user_type').notNull(),
  token:     text('token').notNull().unique(),
  issuedAt:  timestamp('issued_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked:   boolean('revoked').notNull().default(false),
});
