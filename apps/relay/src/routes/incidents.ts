import { incidentSchema } from '@pigeonclaw/shared';
import type { FastifyInstance } from 'fastify';

import type { DatabaseClient } from '../db.js';
import { authorizeDevice, isUnauthorizedError } from '../services/auth.js';
import { listIncidentsForDevice } from '../services/incidents.js';

export async function registerIncidentRoutes(app: FastifyInstance, input: { sql: DatabaseClient }) {
  app.get('/v1/incidents', async (request, reply) => {
    try {
      const device = await authorizeDevice(input.sql, request.headers.authorization);
      const incidents = await listIncidentsForDevice(input.sql, {
        tenantId: device.tenant_id,
        deviceId: device.id,
      });

      return {
        incidents: incidents.map((incident) =>
          incidentSchema.parse({
            id: incident.id,
            projectId: incident.project_id,
            fingerprint: incident.fingerprint,
            status: incident.status,
            firstSeenAt: incident.first_seen_at,
            lastSeenAt: incident.last_seen_at,
            duplicateCount: incident.duplicate_count,
            latestPayloadPreview: incident.latest_payload_preview,
          }),
        ),
      };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      request.log.error({ err: error }, 'Failed to list incidents');
      return reply.code(500).send({ error: 'Failed to list incidents' });
    }
  });
}
