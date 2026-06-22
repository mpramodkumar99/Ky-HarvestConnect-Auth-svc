import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryOtpRepository, InMemorySessionRepository } from './repository.js';
import { PgOtpRepository, PgSessionRepository } from './db/pg-repository.js';
import { db } from './db/client.js';
import { FakeOtpProvider, SimpleHmacJwt, HttpUserLookup, HttpUserRegistration } from './ports.js';
import { AuthService } from './service.js';
import { registerAuthRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Admin-Key'],
    credentials: true,
  });

  const usePostgres = Boolean(process.env['DATABASE_URL']);
  const otpRepo     = usePostgres ? new PgOtpRepository(db)     : new InMemoryOtpRepository();
  const sessionRepo = usePostgres ? new PgSessionRepository(db)  : new InMemorySessionRepository();

  const otpPort = new FakeOtpProvider();

  const jwtPort    = new SimpleHmacJwt(
    process.env['JWT_SECRET'] ?? 'hc-dev-secret-do-not-use-in-prod',
  );
  const userSvcUrl = process.env['USER_SVC_URL'] ?? 'http://localhost:3002';
  const adminKey   = process.env['ADMIN_KEY']    ?? 'dev-admin-key';

  const userLookup = new HttpUserLookup(userSvcUrl);
  const userReg    = new HttpUserRegistration(userSvcUrl, adminKey);

  const service = new AuthService(otpRepo, sessionRepo, otpPort, jwtPort, userLookup, userReg);
  registerAuthRoutes(app, service);

  app.get('/health', async () => ({ status: 'ok', service: 'auth-svc' }));

  const PORT = Number(process.env['PORT'] ?? 3001);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`auth-svc storage backend: ${usePostgres ? 'PostgreSQL' : 'in-memory'}`);
  app.log.info('auth-svc OTP delivery: console (dev mode — code is always 123456)');
  console.log(`auth-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
