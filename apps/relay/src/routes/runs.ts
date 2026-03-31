import { runUpdateSchema } from '@pigeonclaw/shared';
import type { FastifyInstance } from 'fastify';

import type { DatabaseClient } from '../db.js';
import { authorizeDevice } from '../services/auth.js';
import { recordRunUpdate } from '../services/incidents.js';

export async function registerRunRoutes(app: FastifyInstance, input: { sql: DatabaseClient }) {
  app.post('/v1/runs/:runId', async (request, reply) => {
    try {
      await authorizeDevice(input.sql, request.headers.authorization);
      const runId = (request.params as { runId: string }).runId;
      const update = runUpdateSchema.parse({
        ...(request.body as Record<string, unknown>),
        runId,
      });

      await recordRunUpdate(input.sql, update);
      return reply.code(202).send({ accepted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request';
      const statusCode = message === 'Invalid device token' ? 401 : 400;
      return reply.code(statusCode).send({ error: message });
    }
  });
}
