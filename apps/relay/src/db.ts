import postgres from 'postgres';

import type { RelayConfig } from './config.js';

export type DatabaseClient = ReturnType<typeof postgres>;

export function createDatabaseClient(config: RelayConfig) {
  return postgres(config.DATABASE_URL, {
    max: config.NODE_ENV === 'production' ? 10 : 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export async function initializeDatabase(sql: DatabaseClient) {
  await sql`
    create table if not exists tenants (
      id uuid primary key,
      name text not null,
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists devices (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      platform text not null,
      app_version text not null,
      token_hash text not null unique,
      last_seen_at timestamptz,
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists projects (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      device_id uuid not null references devices(id) on delete cascade,
      name text not null,
      slug text not null,
      enabled boolean not null default true,
      cooldown_seconds integer not null default 600,
      fingerprint_fields jsonb not null,
      event_id_path text,
      webhook_token_hash text not null unique,
      webhook_token_ciphertext text not null,
      webhook_token_preview text not null,
      signing_secret_ciphertext text,
      signing_secret_preview text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, slug)
    );
  `;

  await sql`
    create table if not exists incidents (
      id uuid primary key,
      project_id uuid not null references projects(id) on delete cascade,
      fingerprint text not null,
      status text not null,
      first_seen_at timestamptz not null,
      last_seen_at timestamptz not null,
      duplicate_count integer not null default 0,
      latest_payload_preview text not null,
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    create index if not exists incidents_project_fingerprint_idx
      on incidents(project_id, fingerprint, last_seen_at desc);
  `;

  await sql`
    create table if not exists events (
      id uuid primary key,
      project_id uuid not null references projects(id) on delete cascade,
      incident_id uuid references incidents(id) on delete set null,
      external_event_id text,
      idempotency_key text,
      headers jsonb not null,
      payload jsonb not null,
      received_at timestamptz not null default now()
    );
  `;

  await sql`
    create index if not exists events_project_external_id_idx
      on events(project_id, external_event_id);
  `;

  await sql`
    create index if not exists events_project_idempotency_idx
      on events(project_id, idempotency_key);
  `;

  await sql`
    create table if not exists jobs (
      id uuid primary key,
      incident_id uuid not null references incidents(id) on delete cascade,
      project_id uuid not null references projects(id) on delete cascade,
      device_id uuid not null references devices(id) on delete cascade,
      payload jsonb not null,
      fingerprint text not null,
      duplicate_count integer not null default 0,
      status text not null default 'queued',
      attempts integer not null default 0,
      queued_at timestamptz not null default now(),
      delivered_at timestamptz,
      updated_at timestamptz not null default now()
    );
  `;

  await sql`
    create index if not exists jobs_device_status_idx
      on jobs(device_id, status, queued_at asc);
  `;

  await sql`
    create table if not exists run_summaries (
      run_id uuid primary key,
      incident_id uuid not null references incidents(id) on delete cascade,
      project_id uuid not null references projects(id) on delete cascade,
      status text not null,
      summary text,
      log_path text,
      last_message_path text,
      exit_code integer,
      updated_at timestamptz not null default now()
    );
  `;
}
