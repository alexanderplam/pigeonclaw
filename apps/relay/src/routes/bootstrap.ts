import { desktopPairRequestSchema, desktopPairResponseSchema } from '@pigeonclaw/shared';
import type { FastifyInstance } from 'fastify';

import type { RelayConfig } from '../config.js';
import type { DatabaseClient } from '../db.js';
import { ensureBootstrapToken } from '../services/auth.js';
import { ensurePrimaryTenant, registerDevice } from '../services/projects.js';

export async function registerBootstrapRoutes(
  app: FastifyInstance,
  input: {
    config: RelayConfig;
    sql: DatabaseClient;
    getBaseUrl: (request: { headers: Record<string, string | string[] | undefined> }) => string;
  },
) {
  app.post('/v1/bootstrap/register-device', async (request, reply) => {
    try {
      await ensureBootstrapToken(
        input.config.RELAY_BOOTSTRAP_TOKEN,
        request.headers['x-bootstrap-token'] as string | undefined,
      );
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = desktopPairRequestSchema.parse(request.body);
    const tenantId = await ensurePrimaryTenant(input.sql);
    const device = await registerDevice(input.sql, tenantId, parsed);
    return desktopPairResponseSchema.parse({
      tenantId,
      deviceId: device.deviceId,
      deviceToken: device.deviceToken,
      relayBaseUrl: input.getBaseUrl(request),
    });
  });
}
