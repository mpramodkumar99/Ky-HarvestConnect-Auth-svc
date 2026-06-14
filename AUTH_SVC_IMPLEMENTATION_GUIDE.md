# auth-svc Implementation Guide

## Overview
Handles OTP-based authentication, JWT session management, and token verification for all HarvestConnect services. Runs on **port 3001**.

---

## Stack
| Item | Version |
|------|---------|
| Fastify | ^5.8.5 |
| Zod | ^4.4.3 |
| TypeScript | ^6.0.3 |
| Node built-in crypto | JWT signing (no external lib) |

`tsconfig`: `"module": "ES2022"`, `"moduleResolution": "bundler"` — all imports use `.js` extension.

---

## Architecture

```
routes.ts  →  service.ts  →  ports.ts (OtpPort | JwtPort | UserLookupPort)
                          →  repository.ts (InMemoryOtpRepository | InMemorySessionRepository)
```

All external dependencies (SMS delivery, JWT signing, user lookup) are behind interfaces in `ports.ts`. Fake implementations handle dev; real ones are wired in `server.ts` via env vars.

---

## Key Design Decisions

### OTP Generation
`generateCode()` always returns `'123456'` in dev. In production swap the function body — no other file changes needed.

### JWT — no external library
`SimpleHmacJwt` uses `createHmac('sha256', secret)` from Node's built-in `crypto`. Token format: `header.payload.signature` with base64url-encoded parts. TTL is 24 hours.

### Dev Bypass Tokens
Two seed sessions skip JWT verification entirely:
- `dev-token-b001` → buyer `user-b001`
- `dev-token-s112` → seller `seller-112`

These are checked first in `verifyToken()` before any crypto is performed.

### Phone Normalization
`normalizePhone()` in `service.ts`:
- 10-digit number → `+91XXXXXXXXXX`
- 12-digit starting with `91` → `+91XXXXXXXXXX`
- Already `+91...` → unchanged

### OTP Lifecycle
1. `requestOtp` — marks any active OTP for that phone as `used` before issuing a new one (prevents replay)
2. `verifyOtp` — checks expiry, marks OTP `used`, creates JWT session
3. `verifyToken` — dev bypass first; then JWT decode + session lookup
4. `logout` — validates token, sets `session.revoked = true`

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/otp/request` | Send OTP to phone |
| POST | `/v1/auth/otp/verify` | Verify OTP, receive JWT |
| POST | `/v1/auth/token/verify` | Validate bearer token (used by other services) |
| DELETE | `/v1/auth/sessions/:id` | Logout / revoke session |

---

## Response Envelope
```json
// success
{ "success": true, "data": { ... } }

// error
{ "success": false, "error": { "type": "...", "title": "...", "status": 401 } }
```

---

## Seed Data
| Token | UserId | UserType | Expiry |
|-------|--------|----------|--------|
| `dev-token-b001` | `user-b001` | `buyer` | +365 days |
| `dev-token-s112` | `seller-112` | `seller` | +365 days |

---

## Environment Variables

| Var | Default | Effect |
|-----|---------|--------|
| `USER_SVC_URL` | _(unset)_ | When set, switches `FakeUserLookup` → `HttpUserLookup` (GET `/v1/users?phone=`) |
| `JWT_SECRET` | `hc-dev-secret-do-not-use-in-prod` | HMAC signing key |
| `PORT` | `3001` | Listening port |

---

## Files & Responsibilities

| File | Responsibility |
|------|----------------|
| `src/types.ts` | `OtpRecord`, `Session`, `TokenPayload` |
| `src/schemas.ts` | Zod schemas for request bodies |
| `src/errors.ts` | `AppError` hierarchy (NotFound, Conflict, …) |
| `src/ports.ts` | `OtpPort`, `JwtPort`, `UserLookupPort` + Fake/Http impls |
| `src/repository.ts` | In-memory OTP + Session storage with seed sessions |
| `src/service.ts` | `AuthService` — all auth business logic |
| `src/routes.ts` | Fastify route registration + `handleError` |
| `src/server.ts` | Wires deps, registers routes, starts server |

---

## Changes Required When Real Services Are Available

### DB Available
| File | Change |
|------|--------|
| `src/repository.ts` | Replace `InMemoryOtpRepository` / `InMemorySessionRepository` with Postgres implementations behind the same interfaces |
| `src/server.ts` | Instantiate real repositories and pass them in |

### SMS Provider Available
| File | Change |
|------|--------|
| `src/ports.ts` | Add `TwilioOtpProvider` (or equivalent) implementing `OtpPort` |
| `src/server.ts` | Wire `TWILIO_*` env vars → `TwilioOtpProvider` instead of `FakeOtpProvider` |
| `src/service.ts` | Change `generateCode()` to use `crypto.randomInt(100000, 999999).toString()` |

### User-svc Available
| File | Change |
|------|--------|
| `src/server.ts` | Set `USER_SVC_URL` env var — automatically switches to `HttpUserLookup` |
