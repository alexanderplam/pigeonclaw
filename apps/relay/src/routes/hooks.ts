import type { FastifyInstance } from 'fastify';

import type { RelayConfig } from '../config.js';
import type { DatabaseClient } from '../db.js';
import type { DeviceHub } from '../services/device-hub.js';
import { processWebhookEvent } from '../services/incidents.js';
import { findProjectByWebhookToken } from '../services/projects.js';

export async function registerHookRoutes(
  app: FastifyInstance,
  input: { config: RelayConfig; sql: DatabaseClient; hub: DeviceHub },
) {
  app.post(
    '/v1/hooks/:token',
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const token = (request.params as { token: string }).token;
      const project = await findProjectByWebhookToken(input.sql, token);
      if (!project) {
        return reply.code(404).send({ error: 'Unknown webhook' });
      }

      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
        return reply.code(400).send({ error: 'Webhook payload must be a JSON object' });
      }

      try {
        const result = await processWebhookEvent({
          sql: input.sql,
          hub: input.hub,
          project,
          headers: normalizeHeaders(request.headers),
          payload: request.body as Record<string, unknown>,
          rawBody:
            (request as typeof request & { rawBody?: string }).rawBody ??
            JSON.stringify(request.body),
          encryptionKey: input.config.RELAY_ENCRYPTION_KEY,
        });

        return reply.code(202).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook rejected';
        const statusCode = message === 'Invalid webhook signature' ? 401 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    },
  );
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : (value ?? ''),
    ]),
  );
}
