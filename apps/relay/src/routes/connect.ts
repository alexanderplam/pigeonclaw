import type { FastifyInstance } from 'fastify';

import type { DatabaseClient } from '../db.js';
import { authorizeDevice } from '../services/auth.js';
import type { DeviceHub } from '../services/device-hub.js';
import { deliverQueuedJobs } from '../services/incidents.js';

export async function registerDeviceSocketRoutes(
  app: FastifyInstance,
  input: { sql: DatabaseClient; hub: DeviceHub; relayVersion: string },
) {
  app.get(
    '/v1/devices/connect',
    {
      websocket: true,
    },
    async (connection, request) => {
      try {
        const device = await authorizeDevice(input.sql, request.headers.authorization);
        input.hub.register(device.id, connection);

        connection.send(
          JSON.stringify({
            type: 'device.hello',
            payload: {
              deviceId: device.id,
              connectedAt: new Date().toISOString(),
              relayVersion: input.relayVersion,
            },
          }),
        );

        await deliverQueuedJobs(input.sql, input.hub, device.id);

        connection.on('close', () => {
          input.hub.unregister(device.id, connection);
        });
      } catch {
        connection.close(4001, 'Unauthorized');
      }
    },
  );
}
