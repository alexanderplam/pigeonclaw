import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/healthz', async () => ({
    ok: true,
    service: 'pigeonclaw-relay',
    now: new Date().toISOString(),
  }));
}
