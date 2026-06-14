import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryOtpRepository, InMemorySessionRepository } from './repository.js';
import { FakeOtpProvider, SimpleHmacJwt, HttpUserLookup } from './ports.js';
import { AuthService } from './service.js';
import { registerAuthRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  // ── Dependency wiring ─────────────────────────────────────────────────────
  // To adopt real implementations: change ONLY the lines below (one per concern).
  const otpRepo     = new InMemoryOtpRepository();       // → PostgresOtpRepository
  const sessionRepo = new InMemorySessionRepository();   // → PostgresSessionRepository
  const otpPort     = new FakeOtpProvider();             // → TwilioOtpProvider
  const jwtPort     = new SimpleHmacJwt(
    process.env['JWT_SECRET'] ?? 'hc-dev-secret-do-not-use-in-prod',
  );
  const userLookup = new HttpUserLookup(
    process.env['USER_SVC_URL'] ?? 'http://localhost:3002',
  );

  const service = new AuthService(otpRepo, sessionRepo, otpPort, jwtPort, userLookup);
  registerAuthRoutes(app, service);

  app.get('/health', async () => ({ status: 'ok', service: 'auth-svc' }));

  const PORT = 3001;
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`auth-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
