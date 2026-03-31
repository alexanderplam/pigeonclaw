import type { DatabaseClient } from '../db.js';
import { hashValue } from './crypto.js';

type DeviceRecord = {
  id: string;
  tenant_id: string;
  name: string;
};

export async function ensureBootstrapToken(expected: string, provided: string | undefined) {
  if (!provided || provided !== expected) {
    throw new Error('Unauthorized bootstrap token');
  }
}

export async function authorizeDevice(
  sql: DatabaseClient,
  authorizationHeader: string | undefined,
) {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const [device] = await sql<DeviceRecord[]>`
    select id, tenant_id, name
    from devices
    where token_hash = ${hashValue(token)}
    limit 1
  `;

  if (!device) {
    throw new Error('Invalid device token');
  }

  await sql`
    update devices
    set last_seen_at = now()
    where id = ${device.id}
  `;

  return device;
}

function extractBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, value] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }

  return value.trim();
}
