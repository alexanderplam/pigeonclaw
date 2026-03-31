import type { FastifyInstance } from 'fastify';

import type { RelayConfig } from '../config.js';
import type { DatabaseClient } from '../db.js';
import { authorizeDevice } from '../services/auth.js';
import { createProject, listProjects, updateProject } from '../services/projects.js';

export async function registerProjectRoutes(
  app: FastifyInstance,
  input: {
    config: RelayConfig;
    sql: DatabaseClient;
    getBaseUrl: (request: { headers: Record<string, string | string[] | undefined> }) => string;
  },
) {
  app.get('/v1/projects', async (request, reply) => {
    try {
      const device = await authorizeDevice(input.sql, request.headers.authorization);
      const projects = await listProjects(input.sql, {
        tenantId: device.tenant_id,
        deviceId: device.id,
        baseUrl: input.getBaseUrl(request),
        encryptionKey: input.config.RELAY_ENCRYPTION_KEY,
      });

      return { projects };
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.post('/v1/projects', async (request, reply) => {
    try {
      const device = await authorizeDevice(input.sql, request.headers.authorization);
      const result = await createProject(input.sql, input.config, {
        tenantId: device.tenant_id,
        deviceId: device.id,
        baseUrl: input.getBaseUrl(request),
        project: request.body,
      });

      return reply.code(201).send(result);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  app.patch('/v1/projects/:projectId', async (request, reply) => {
    try {
      const device = await authorizeDevice(input.sql, request.headers.authorization);
      const result = await updateProject(input.sql, input.config, {
        tenantId: device.tenant_id,
        deviceId: device.id,
        projectId: (request.params as { projectId: string }).projectId,
        project: request.body,
      });

      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request';
      const statusCode = message === 'Invalid device token' ? 401 : 400;
      return reply.code(statusCode).send({ error: message });
    }
  });
}
