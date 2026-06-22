import { randomUUID, randomInt } from 'node:crypto';
import type { OtpRepository, SessionRepository } from './repository.js';
import type { OtpPort, JwtPort, UserLookupPort, UserRegistrationPort } from './ports.js';
import { NotFoundError, UnauthorizedError, ConflictError } from './errors.js';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

// Dev mode: fixed 123456 so you can test without real email delivery.
// Production: cryptographically random 6-digit code.
function generateCode(): string {
  if (process.env['NODE_ENV'] !== 'production') return '123456';
  return randomInt(100000, 1000000).toString();
}

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class AuthService {
  constructor(
    private otpRepo:      OtpRepository,
    private sessionRepo:  SessionRepository,
    private otpPort:      OtpPort,
    private jwtPort:      JwtPort,
    private userLookup:   UserLookupPort,
    private userReg:      UserRegistrationPort,
  ) {}

  // ── Login OTP request (user must already have an account) ─────────────────

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    const user  = await this.userLookup.findByPhone(phone);
    if (!user) throw new NotFoundError(`No account found for ${phone}. Register first.`);

    await this.otpRepo.invalidateAllForPhone(phone);
    const code      = generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await this.otpRepo.create(phone, code, expiresAt);
    await this.otpPort.send(phone, code);
    return { message: 'OTP sent. Enter it to log in.', phone };
  }

  // ── Login OTP verify ──────────────────────────────────────────────────────

  async verifyOtp(rawPhone: string, code: string) {
    const phone  = normalizePhone(rawPhone);
    const record = await this.otpRepo.findActiveByPhone(phone);
    if (!record)              throw new UnauthorizedError('OTP expired or not found. Request a new one.');
    if (record.code !== code) throw new UnauthorizedError('Incorrect OTP.');

    await this.otpRepo.markUsed(record.id);

    const user = await this.userLookup.findByPhone(phone);
    if (!user) throw new NotFoundError(`User not found for ${phone}`);

    return this.issueSession(user.id, phone, user.type);
  }

  // ── Registration: create account + send OTP ───────────────────────────────

  async register(name: string, rawPhone: string, type: 'buyer' | 'seller', email?: string) {
    const phone = normalizePhone(rawPhone);

    const existing = await this.userLookup.findByPhone(phone);
    if (existing) throw new ConflictError(`An account already exists for ${phone}. Log in instead.`);

    await this.userReg.create(name, phone, type, email);

    await this.otpRepo.invalidateAllForPhone(phone);
    const code      = generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await this.otpRepo.create(phone, code, expiresAt);
    await this.otpPort.send(phone, code);
    return { message: 'OTP sent. Enter it to complete registration.', phone };
  }

  // ── Registration: verify OTP, mark user verified, issue JWT ──────────────

  async registerVerify(rawPhone: string, code: string) {
    const phone  = normalizePhone(rawPhone);
    const record = await this.otpRepo.findActiveByPhone(phone);
    if (!record)              throw new UnauthorizedError('OTP expired or not found. Request a new one.');
    if (record.code !== code) throw new UnauthorizedError('Incorrect OTP.');

    await this.otpRepo.markUsed(record.id);

    const user = await this.userLookup.findByPhone(phone);
    if (!user) throw new NotFoundError(`User not found for ${phone}`);

    // Mark user as verified (OTP proves phone/email ownership)
    await this.userReg.verify(user.id);

    return this.issueSession(user.id, phone, user.type);
  }

  // ── Token verify (used by other services) ────────────────────────────────

  async verifyToken(token: string) {
    const payload = this.jwtPort.verify(token);
    if (!payload) return { valid: false as const };

    const session = await this.sessionRepo.findByToken(token);
    if (!session || session.revoked) return { valid: false as const };

    return { valid: true as const, userId: payload.sub, phone: payload.phone, userType: payload.userType };
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(sessionId: string, token: string) {
    const check = await this.verifyToken(token);
    if (!check.valid) throw new UnauthorizedError('Invalid or expired token.');
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundError('Session not found.');
    await this.sessionRepo.revoke(sessionId);
  }

  // ── Shared session issuer ─────────────────────────────────────────────────

  private async issueSession(userId: string, phone: string, userType: 'buyer' | 'seller') {
    const sessionId = randomUUID();
    const token     = this.jwtPort.sign({ sub: userId, phone, userType, sessionId });
    const issuedAt  = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const session = await this.sessionRepo.create({
      userId, phone, userType, token, issuedAt, expiresAt, revoked: false,
    });

    return { token, userId, userType, sessionId: session.id, expiresAt };
  }
}
