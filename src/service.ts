import { randomUUID } from 'node:crypto';
import type { OtpRepository, SessionRepository } from './repository.js';
import type { OtpPort, JwtPort, UserLookupPort } from './ports.js';
import { NotFoundError, UnauthorizedError } from './errors.js';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

// In dev: always '123456'. In prod: crypto.randomInt(100000, 999999).toString()
function generateCode(): string {
  return '123456';
}

export class AuthService {
  constructor(
    private otpRepo:     OtpRepository,
    private sessionRepo: SessionRepository,
    private otpPort:     OtpPort,
    private jwtPort:     JwtPort,
    private userLookup:  UserLookupPort,
  ) {}

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    const user = await this.userLookup.findByPhone(phone);
    if (!user) {
      throw new NotFoundError(`No account found for ${phone}. Register first.`);
    }
    // Invalidate any existing unused OTP before issuing a new one
    await this.otpRepo.invalidateAllForPhone(phone);
    const code      = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await this.otpRepo.create(phone, code, expiresAt);
    await this.otpPort.send(phone, code);
    return { message: 'OTP sent', phone };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone  = normalizePhone(rawPhone);
    const record = await this.otpRepo.findActiveByPhone(phone);
    if (!record)           throw new UnauthorizedError('OTP expired or not found. Request a new one.');
    if (record.code !== code) throw new UnauthorizedError('Incorrect OTP.');

    await this.otpRepo.markUsed(record.id);

    const user = await this.userLookup.findByPhone(phone);
    if (!user) throw new NotFoundError(`User not found for ${phone}`);

    const sessionId = randomUUID();
    const token     = this.jwtPort.sign({ sub: user.id, phone, userType: user.type, sessionId });
    const issuedAt  = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const session = await this.sessionRepo.create({
      userId: user.id, phone, userType: user.type,
      token, issuedAt, expiresAt, revoked: false,
    });

    return { token, userId: user.id, userType: user.type, sessionId: session.id, expiresAt };
  }

  async verifyToken(token: string) {
    // Dev bypass — hardcoded tokens bypass JWT verification
    if (token === 'dev-token-b001') {
      return { valid: true, userId: 'user-b001', phone: '+919000000001', userType: 'buyer' as const };
    }
    if (token === 'dev-token-s112') {
      return { valid: true, userId: 'user-s112', phone: '+919000000112', userType: 'seller' as const };
    }

    const payload = this.jwtPort.verify(token);
    if (!payload) return { valid: false as const };

    const session = await this.sessionRepo.findByToken(token);
    if (!session || session.revoked) return { valid: false as const };

    return { valid: true as const, userId: payload.sub, phone: payload.phone, userType: payload.userType };
  }

  async logout(sessionId: string, token: string) {
    const check = await this.verifyToken(token);
    if (!check.valid) throw new UnauthorizedError('Invalid or expired token.');
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundError('Session not found.');
    await this.sessionRepo.revoke(sessionId);
  }
}
