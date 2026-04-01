import { randomUUID } from 'node:crypto';

import {
  fingerprintEvent,
  getValueAtPath,
  summarizePayload,
  verifySignature,
} from '@pigeonclaw/shared';

import type { DatabaseClient } from '../db.js';
import { decryptSecret } from './crypto.js';
import type { DeviceHub } from './device-hub.js';

type ProjectLookup = {
  id: string;
  device_id: string;
  enabled: boolean;
  cooldown_seconds: number;
  fingerprint_fields: Array<{ path: string; label?: string }>;
  event_id_path?: string | null;
  signing_secret_ciphertext?: string | null;
};

type IncidentRecord = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  first_seen_at: string | Date;
  last_seen_at: string | Date;
  duplicate_count: number;
};

type JobRecord = {
  id: string;
  incident_id: string;
  project_id: string;
  device_id: string;
  payload: Record<string, unknown>;
  fingerprint: string;
  duplicate_count: number;
  queued_at: string;
};

export async function processWebhookEvent(input: {
  sql: DatabaseClient;
  hub: DeviceHub;
  project: ProjectLookup;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  rawBody: string;
  encryptionKey: string;
}) {
  if (!input.project.enabled) {
    throw new Error('Project is disabled');
  }

  await verifyWebhookSignature(input.project, input.headers, input.rawBody, input.encryptionKey);

  const explicitIdempotencyKey =
    input.headers['idempotency-key'] ?? input.headers['x-idempotency-key'] ?? undefined;
  const externalEventId =
    (input.project.event_id_path
      ? getValueAtPath(input.payload, input.project.event_id_path)
      : undefined) ??
    input.headers['x-event-id'] ??
    input.headers['x-request-id'] ??
    undefined;

  const resolvedExternalEventId =
    typeof externalEventId === 'string' && externalEventId.length > 0 ? externalEventId : undefined;
  const fingerprint =
    explicitIdempotencyKey ??
    resolvedExternalEventId ??
    fingerprintEvent(input.project.id, input.payload, input.project.fingerprint_fields);

  const duplicate = await findDuplicateEvent(input.sql, {
    projectId: input.project.id,
    idempotencyKey: explicitIdempotencyKey,
    externalEventId: resolvedExternalEventId,
  });

  if (duplicate) {
    return {
      accepted: true,
      deduped: true,
      incidentId: duplicate.incident_id,
      jobId: null,
    };
  }

  const summary = summarizePayload(input.payload);
  const result = await input.sql.begin(async (tx) => {
    const transaction = tx as unknown as DatabaseClient;
    const latestIncident = await transaction<IncidentRecord[]>`
      select id, status, first_seen_at, last_seen_at, duplicate_count
      from incidents
      where project_id = ${input.project.id}
        and fingerprint = ${fingerprint}
      order by last_seen_at desc
      limit 1
      for update
    `;

    const now = new Date();
    const incident = latestIncident[0];
    const withinCooldown =
      incident &&
      now.getTime() - new Date(incident.last_seen_at).getTime() <
        input.project.cooldown_seconds * 1_000;

    let incidentId = incident?.id;
    let duplicateCount = incident?.duplicate_count ?? 0;
    let shouldQueue = true;

    if (incident && withinCooldown) {
      duplicateCount += 1;
      shouldQueue = false;
      await transaction`
        update incidents
        set
          last_seen_at = now(),
          duplicate_count = ${duplicateCount},
          latest_payload_preview = ${summary}
        where id = ${incident.id}
      `;
    } else {
      incidentId = randomUUID();
      await transaction`
        insert into incidents (
          id,
          project_id,
          fingerprint,
          status,
          first_seen_at,
          last_seen_at,
          duplicate_count,
          latest_payload_preview
        )
        values (
          ${incidentId},
          ${input.project.id},
          ${fingerprint},
          ${'queued'},
          now(),
          now(),
          0,
          ${summary}
        )
      `;
    }

    const eventId = randomUUID();
    await transaction`
      insert into events (
        id,
        project_id,
        incident_id,
        external_event_id,
        idempotency_key,
        headers,
        payload
      )
      values (
        ${eventId},
        ${input.project.id},
        ${incidentId},
        ${resolvedExternalEventId ?? null},
        ${explicitIdempotencyKey ?? null},
        ${JSON.stringify(input.headers)}::jsonb,
        ${JSON.stringify(input.payload)}::jsonb
      )
    `;

    if (!shouldQueue) {
      return {
        incidentId,
        jobId: null,
        deduped: true,
      };
    }

    const jobId = randomUUID();
    await transaction`
      insert into jobs (
        id,
        incident_id,
        project_id,
        device_id,
        payload,
        fingerprint,
        duplicate_count,
        status
      )
      values (
        ${jobId},
        ${incidentId},
        ${input.project.id},
        ${input.project.device_id},
        ${JSON.stringify(input.payload)}::jsonb,
        ${fingerprint},
        ${duplicateCount},
        ${'queued'}
      )
    `;

    return {
      incidentId,
      jobId,
      deduped: false,
    };
  });

  await deliverQueuedJobs(input.sql, input.hub, input.project.device_id);

  return {
    accepted: true,
    deduped: result.deduped,
    incidentId: result.incidentId,
    jobId: result.jobId,
  };
}

export async function deliverQueuedJobs(sql: DatabaseClient, hub: DeviceHub, deviceId: string) {
  if (!hub.isConnected(deviceId)) {
    return;
  }

  const jobs = await sql<JobRecord[]>`
    select id, incident_id, project_id, device_id, payload, fingerprint, duplicate_count, queued_at
    from jobs
    where device_id = ${deviceId}
      and (status = ${'queued'} or status = ${'delivered'})
    order by queued_at asc
    limit 10
  `;

  for (const job of jobs) {
    const delivered = hub.send(deviceId, {
      type: 'job.ready',
      payload: {
        id: job.id,
        incidentId: job.incident_id,
        projectId: job.project_id,
        deliveredToDeviceId: job.device_id,
        queuedAt: job.queued_at,
        payload: job.payload,
        fingerprint: job.fingerprint,
        duplicateCount: job.duplicate_count,
      },
    });

    if (delivered) {
      await sql`
        update jobs
        set status = ${'delivered'}, delivered_at = now(), attempts = attempts + 1, updated_at = now()
        where id = ${job.id}
      `;
    }
  }
}

export async function recordRunUpdate(
  sql: DatabaseClient,
  update: {
    runId: string;
    incidentId: string;
    projectId: string;
    status: string;
    summary?: string;
    logPath?: string;
    lastMessagePath?: string;
    exitCode?: number;
    updatedAt: string;
  },
) {
  await sql.begin(async (tx) => {
    const transaction = tx as unknown as DatabaseClient;
    await transaction`
      insert into run_summaries (
        run_id,
        incident_id,
        project_id,
        status,
        summary,
        log_path,
        last_message_path,
        exit_code,
        updated_at
      )
      values (
        ${update.runId},
        ${update.incidentId},
        ${update.projectId},
        ${update.status},
        ${update.summary ?? null},
        ${update.logPath ?? null},
        ${update.lastMessagePath ?? null},
        ${update.exitCode ?? null},
        ${update.updatedAt}
      )
      on conflict (run_id)
      do update set
        status = excluded.status,
        summary = excluded.summary,
        log_path = excluded.log_path,
        last_message_path = excluded.last_message_path,
        exit_code = excluded.exit_code,
        updated_at = excluded.updated_at
    `;

    await transaction`
      update jobs
      set status = ${update.status}, updated_at = ${update.updatedAt}
      where id = ${update.runId}
    `;

    await transaction`
      update incidents
      set status = ${mapIncidentStatus(update.status)}, last_seen_at = ${update.updatedAt}
      where id = ${update.incidentId}
    `;
  });
}

export async function listIncidentsForDevice(
  sql: DatabaseClient,
  input: { tenantId: string; deviceId: string },
) {
  return sql<
    {
      id: string;
      project_id: string;
      fingerprint: string;
      status: 'queued' | 'running' | 'succeeded' | 'failed';
      first_seen_at: string | Date;
      last_seen_at: string | Date;
      duplicate_count: number;
      latest_payload_preview: string;
    }[]
  >`
    select incidents.*
    from incidents
    join projects on projects.id = incidents.project_id
    where projects.tenant_id = ${input.tenantId}
      and projects.device_id = ${input.deviceId}
    order by incidents.last_seen_at desc
    limit 100
  `;
}

async function verifyWebhookSignature(
  project: ProjectLookup,
  headers: Record<string, string>,
  rawBody: string,
  encryptionKey: string,
) {
  if (!project.signing_secret_ciphertext) {
    return;
  }

  const providedSignature = headers['x-pigeonclaw-signature'] ?? headers['x-signature'] ?? '';
  const secret = decryptSecret(project.signing_secret_ciphertext, encryptionKey);

  if (!verifySignature(secret, rawBody, providedSignature)) {
    throw new Error('Invalid webhook signature');
  }
}

async function findDuplicateEvent(
  sql: DatabaseClient,
  input: { projectId: string; idempotencyKey?: string; externalEventId?: string },
) {
  if (input.idempotencyKey) {
    const [event] = await sql<{ incident_id: string }[]>`
      select incident_id
      from events
      where project_id = ${input.projectId}
        and idempotency_key = ${input.idempotencyKey}
      limit 1
    `;

    if (event) {
      return event;
    }
  }

  if (input.externalEventId) {
    const [event] = await sql<{ incident_id: string }[]>`
      select incident_id
      from events
      where project_id = ${input.projectId}
        and external_event_id = ${input.externalEventId}
      limit 1
    `;

    if (event) {
      return event;
    }
  }

  return null;
}

function mapIncidentStatus(status: string) {
  if (
    status === 'queued' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'failed'
  ) {
    return status;
  }

  if (status === 'cancelled') {
    return 'succeeded';
  }

  return 'failed';
}
