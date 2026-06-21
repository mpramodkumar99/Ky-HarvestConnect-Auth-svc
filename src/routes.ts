import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { AuthService } from './service.js';
import { requestOtpSchema, verifyOtpSchema, verifyTokenSchema } from './schemas.js';
import { AppError } from './errors.js';

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({
      success: false,
      error: { type: err.name, title: err.message, status: err.statusCode },
    });
  }
  if (err instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: { type: 'validation_error', title: 'Validation error', status: 400, detail: err.flatten().fieldErrors },
    });
  }
  console.error(err);
  return reply.status(500).send({
    success: false,
    error: { type: 'internal_error', title: 'Internal server error', status: 500 },
  });
}

export function registerAuthRoutes(app: FastifyInstance, service: AuthService) {

  // POST /v1/auth/otp/request
  app.post('/v1/auth/otp/request', async (request, reply) => {
    try {
      const body   = requestOtpSchema.parse(request.body);
      const result = await service.requestOtp(body.phone, body.userType);
      return reply.send({ success: true, data: result });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/auth/otp/verify
  app.post('/v1/auth/otp/verify', async (request, reply) => {
    try {
      const body   = verifyOtpSchema.parse(request.body);
      const result = await service.verifyOtp(body.phone, body.code, body.userType);
      return reply.send({ success: true, data: result });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/auth/token/verify  — used by other services as a soft auth check
  app.post('/v1/auth/token/verify', async (request, reply) => {
    try {
      const body   = verifyTokenSchema.parse(request.body);
      const result = await service.verifyToken(body.token);
      return reply.send({ success: true, data: result });
    } catch (err) { return handleError(err, reply); }
  });

  // DELETE /v1/auth/sessions/:id  — logout
  app.delete('/v1/auth/sessions/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const auth   = (request.headers['authorization'] as string | undefined) ?? '';
      const token  = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) {
        return reply.status(401).send({
          success: false,
          error: { type: 'UnauthorizedError', title: 'Authorization: Bearer <token> header required', status: 401 },
        });
      }
      await service.logout(id, token);
      return reply.status(204).send();
    } catch (err) { return handleError(err, reply); }
  });
}
