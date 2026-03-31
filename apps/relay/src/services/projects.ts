import { randomUUID } from 'node:crypto';

import {
  relayProjectCreateSchema,
  relayProjectSchema,
  relayProjectUpdateSchema,
  secretPreview,
} from '@pigeonclaw/shared';

import type { RelayConfig } from '../config.js';
import type { DatabaseClient } from '../db.js';
import { decryptSecret, encryptSecret, generateOpaqueToken, hashValue } from './crypto.js';

type ProjectRecord = {
  id: string;
  device_id: string;
  name: string;
  slug: string;
  enabled: boolean;
  cooldown_seconds: number;
  fingerprint_fields: Array<{ path: string; label?: string }>;
  event_id_path?: string | null;
  webhook_token_ciphertext: string;
  webhook_token_preview: string;
  signing_secret_ciphertext?: string | null;
  signing_secret_preview?: string | null;
  created_at: string;
  updated_at: string;
};

export async function ensurePrimaryTenant(sql: DatabaseClient) {
  const [tenant] = await sql<{ id: string }[]>`select id from tenants limit 1`;
  if (tenant) {
    return tenant.id;
  }

  const tenantId = randomUUID();
  await sql`
    insert into tenants (id, name)
    values (${tenantId}, ${'Primary tenant'})
  `;
  return tenantId;
}

export async function registerDevice(
  sql: DatabaseClient,
  tenantId: string,
  input: { deviceName: string; platform: string; appVersion: string },
) {
  const deviceId = randomUUID();
  const deviceToken = generateOpaqueToken(32);

  await sql`
    insert into devices (id, tenant_id, name, platform, app_version, token_hash, last_seen_at)
    values (
      ${deviceId},
      ${tenantId},
      ${input.deviceName},
      ${input.platform},
      ${input.appVersion},
      ${hashValue(deviceToken)},
      now()
    )
  `;

  return {
    deviceId,
    deviceToken,
  };
}

export async function listProjects(
  sql: DatabaseClient,
  input: { tenantId: string; deviceId: string; baseUrl: string; encryptionKey: string },
) {
  const records = await sql<ProjectRecord[]>`
    select *
    from projects
    where tenant_id = ${input.tenantId}
      and device_id = ${input.deviceId}
    order by updated_at desc
  `;

  return records.map((record) =>
    relayProjectSchema.parse({
      id: record.id,
      deviceId: record.device_id,
      name: record.name,
      slug: record.slug,
      enabled: record.enabled,
      cooldownSeconds: record.cooldown_seconds,
      fingerprintFields: record.fingerprint_fields,
      eventIdPath: record.event_id_path ?? undefined,
      signingSecretHint: record.signing_secret_preview ?? undefined,
      webhookUrl: buildWebhookUrl(
        input.baseUrl,
        decryptSecret(record.webhook_token_ciphertext, input.encryptionKey),
      ),
      webhookTokenPreview: record.webhook_token_preview,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }),
  );
}

export async function createProject(
  sql: DatabaseClient,
  config: RelayConfig,
  input: {
    tenantId: string;
    deviceId: string;
    baseUrl: string;
    project: unknown;
  },
) {
  const parsed = relayProjectCreateSchema.parse(input.project);
  const projectId = randomUUID();
  const webhookToken = generateOpaqueToken(24);
  const signingSecret = parsed.signingSecret ?? generateOpaqueToken(24);
  const now = new Date().toISOString();

  await sql`
    insert into projects (
      id,
      tenant_id,
      device_id,
      name,
      slug,
      enabled,
      cooldown_seconds,
      fingerprint_fields,
      event_id_path,
      webhook_token_hash,
      webhook_token_ciphertext,
      webhook_token_preview,
      signing_secret_ciphertext,
      signing_secret_preview,
      created_at,
      updated_at
    )
    values (
      ${projectId},
      ${input.tenantId},
      ${input.deviceId},
      ${parsed.name},
      ${parsed.slug},
      ${parsed.enabled},
      ${parsed.cooldownSeconds},
      ${JSON.stringify(parsed.fingerprintFields)}::jsonb,
      ${parsed.eventIdPath ?? null},
      ${hashValue(webhookToken)},
      ${encryptSecret(webhookToken, config.RELAY_ENCRYPTION_KEY)},
      ${secretPreview(webhookToken)},
      ${encryptSecret(signingSecret, config.RELAY_ENCRYPTION_KEY)},
      ${secretPreview(signingSecret)},
      ${now},
      ${now}
    )
  `;

  return {
    project: relayProjectSchema.parse({
      id: projectId,
      deviceId: input.deviceId,
      name: parsed.name,
      slug: parsed.slug,
      enabled: parsed.enabled,
      cooldownSeconds: parsed.cooldownSeconds,
      fingerprintFields: parsed.fingerprintFields,
      eventIdPath: parsed.eventIdPath,
      signingSecretHint: secretPreview(signingSecret),
      webhookUrl: buildWebhookUrl(input.baseUrl, webhookToken),
      webhookTokenPreview: secretPreview(webhookToken),
      createdAt: now,
      updatedAt: now,
    }),
    issuedSigningSecret: signingSecret,
    issuedWebhookToken: webhookToken,
  };
}

export async function updateProject(
  sql: DatabaseClient,
  config: RelayConfig,
  input: {
    tenantId: string;
    deviceId: string;
    projectId: string;
    project: unknown;
  },
) {
  const parsed = relayProjectUpdateSchema.parse(input.project);
  const existing = await sql<ProjectRecord[]>`
    select *
    from projects
    where id = ${input.projectId}
      and tenant_id = ${input.tenantId}
      and device_id = ${input.deviceId}
    limit 1
  `;

  const current = existing[0];
  if (!current) {
    throw new Error('Project not found');
  }

  const nextSigningSecret = parsed.signingSecret;

  await sql`
    update projects
    set
      name = ${parsed.name ?? current.name},
      slug = ${parsed.slug ?? current.slug},
      enabled = ${parsed.enabled ?? current.enabled},
      cooldown_seconds = ${parsed.cooldownSeconds ?? current.cooldown_seconds},
      fingerprint_fields = ${JSON.stringify(parsed.fingerprintFields ?? current.fingerprint_fields)}::jsonb,
      event_id_path = ${parsed.eventIdPath ?? current.event_id_path ?? null},
      signing_secret_ciphertext = ${
        nextSigningSecret
          ? encryptSecret(nextSigningSecret, config.RELAY_ENCRYPTION_KEY)
          : (current.signing_secret_ciphertext ?? null)
      },
      signing_secret_preview = ${
        nextSigningSecret
          ? secretPreview(nextSigningSecret)
          : (current.signing_secret_preview ?? null)
      },
      updated_at = now()
    where id = ${input.projectId}
  `;

  return {
    issuedSigningSecret: nextSigningSecret,
  };
}

export async function findProjectByWebhookToken(sql: DatabaseClient, token: string) {
  const [project] = await sql<ProjectRecord[]>`
    select *
    from projects
    where webhook_token_hash = ${hashValue(token)}
    limit 1
  `;

  return project ?? null;
}

export function buildWebhookUrl(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, '')}/v1/hooks/${token}`;
}
