import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';

import type { RelayConfig } from './config.js';
import type { DatabaseClient } from './db.js';
import { registerBootstrapRoutes } from './routes/bootstrap.js';
import { registerDeviceSocketRoutes } from './routes/connect.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerHookRoutes } from './routes/hooks.js';
import { registerIncidentRoutes } from './routes/incidents.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerRunRoutes } from './routes/runs.js';
import { DeviceHub } from './services/device-hub.js';

export async function buildRelayApp(input: {
  config: RelayConfig;
  sql: DatabaseClient;
  relayVersion: string;
}) {
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
  });

  const hub = new DeviceHub();

  await app.register(websocket);
  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });

  const getBaseUrl = (request: { headers: Record<string, string | string[] | undefined> }) => {
    if (input.config.PUBLIC_BASE_URL) {
      return input.config.PUBLIC_BASE_URL;
    }

    const protocol = (request.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    const host =
      (request.headers['x-forwarded-host'] as string | undefined) ?? request.headers.host;
    return `${protocol}://${host}`;
  };

  await registerHealthRoutes(app);
  await registerBootstrapRoutes(app, { config: input.config, sql: input.sql, getBaseUrl });
  await registerProjectRoutes(app, { config: input.config, sql: input.sql, getBaseUrl });
  await registerIncidentRoutes(app, { sql: input.sql });
  await registerRunRoutes(app, { sql: input.sql });
  await registerHookRoutes(app, { config: input.config, sql: input.sql, hub });
  await registerDeviceSocketRoutes(app, { sql: input.sql, hub, relayVersion: input.relayVersion });

  return app;
}
