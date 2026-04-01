import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type ProjectSnapshot, projectSnapshotSchema, type RunUpdate } from '@pigeonclaw/shared';
import Database from 'better-sqlite3';
import { safeStorage } from 'electron';

type RunRow = {
  id: string;
  incident_id: string;
  project_id: string;
  status: string;
  summary: string | null;
  log_path: string | null;
  last_message_path: string | null;
  exit_code: number | null;
  created_at: string;
  updated_at: string;
};

type ProjectRow = {
  project_id: string;
  name: string;
  slug: string;
  repo_path: string;
  base_prompt: string;
  event_prompt_template: string;
  local_rules: string;
  codex_model: string | null;
  concurrency_limit: number;
  sandbox_mode: ProjectSnapshot['sandboxMode'];
  cooldown_seconds: number;
  fingerprint_fields: string;
  event_id_path: string | null;
  enabled: number;
  webhook_url: string;
  webhook_token: string | null;
  signing_secret: string | null;
  signing_secret_hint: string | null;
  updated_at: string;
};

export class LocalStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  getSetting(key: string) {
    const row = this.db
      .prepare<[string], { value: string; is_secret: number }>(
        'select value, is_secret from settings where key = ? limit 1',
      )
      .get(key);

    if (!row) {
      return null;
    }

    return row.is_secret ? this.decodeSecret(row.value) : row.value;
  }

  setSetting(key: string, value: string, secret = false) {
    const stored = secret ? this.encodeSecret(value) : value;
    this.db
      .prepare(
        `insert into settings (key, value, is_secret, updated_at)
         values (?, ?, ?, ?)
         on conflict(key) do update set
           value = excluded.value,
           is_secret = excluded.is_secret,
           updated_at = excluded.updated_at`,
      )
      .run(key, stored, secret ? 1 : 0, new Date().toISOString());
  }

  getAppState() {
    return {
      relayBaseUrl: this.getSetting('relayBaseUrl'),
      tenantId: this.getSetting('tenantId'),
      deviceId: this.getSetting('deviceId'),
      deviceName: this.getSetting('deviceName'),
      codexPath: this.getSetting('codexPath') ?? 'codex',
      globalConcurrency: Number(this.getSetting('globalConcurrency') ?? '2'),
    };
  }

  listProjects() {
    const rows = this.db
      .prepare<[], ProjectRow>('select * from projects order by updated_at desc')
      .all();

    return rows.map((row) =>
      projectSnapshotSchema.parse({
        projectId: row.project_id,
        name: row.name,
        slug: row.slug,
        repoPath: row.repo_path,
        basePrompt: row.base_prompt,
        eventPromptTemplate: row.event_prompt_template,
        localRules: JSON.parse(String(row.local_rules)),
        codexModel: row.codex_model ?? undefined,
        concurrencyLimit: row.concurrency_limit,
        sandboxMode: row.sandbox_mode,
        cooldownSeconds: row.cooldown_seconds,
        fingerprintFields: JSON.parse(String(row.fingerprint_fields)),
        eventIdPath: row.event_id_path ?? undefined,
        enabled: Boolean(row.enabled),
        webhookUrl: row.webhook_url,
        webhookToken: row.webhook_token ? this.decodeSecret(String(row.webhook_token)) : undefined,
        signingSecret: row.signing_secret
          ? this.decodeSecret(String(row.signing_secret))
          : undefined,
        signingSecretHint: row.signing_secret_hint ?? undefined,
        updatedAt: row.updated_at,
      }),
    );
  }

  getProject(projectId: string) {
    return this.listProjects().find((project) => project.projectId === projectId) ?? null;
  }

  upsertProject(project: ProjectSnapshot) {
    const parsed = projectSnapshotSchema.parse(project);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `insert into projects (
          project_id,
          name,
          slug,
          repo_path,
          base_prompt,
          event_prompt_template,
          local_rules,
          codex_model,
          concurrency_limit,
          sandbox_mode,
          cooldown_seconds,
          fingerprint_fields,
          event_id_path,
          enabled,
          webhook_url,
          webhook_token,
          signing_secret,
          signing_secret_hint,
          created_at,
          updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce((select created_at from projects where project_id = ?), ?), ?)
        on conflict(project_id) do update set
          name = excluded.name,
          slug = excluded.slug,
          repo_path = excluded.repo_path,
          base_prompt = excluded.base_prompt,
          event_prompt_template = excluded.event_prompt_template,
          local_rules = excluded.local_rules,
          codex_model = excluded.codex_model,
          concurrency_limit = excluded.concurrency_limit,
          sandbox_mode = excluded.sandbox_mode,
          cooldown_seconds = excluded.cooldown_seconds,
          fingerprint_fields = excluded.fingerprint_fields,
          event_id_path = excluded.event_id_path,
          enabled = excluded.enabled,
          webhook_url = excluded.webhook_url,
          webhook_token = coalesce(excluded.webhook_token, projects.webhook_token),
          signing_secret = coalesce(excluded.signing_secret, projects.signing_secret),
          signing_secret_hint = coalesce(excluded.signing_secret_hint, projects.signing_secret_hint),
          updated_at = excluded.updated_at`,
      )
      .run(
        parsed.projectId,
        parsed.name,
        parsed.slug,
        parsed.repoPath,
        parsed.basePrompt,
        parsed.eventPromptTemplate,
        JSON.stringify(parsed.localRules),
        parsed.codexModel ?? null,
        parsed.concurrencyLimit,
        parsed.sandboxMode,
        parsed.cooldownSeconds,
        JSON.stringify(parsed.fingerprintFields),
        parsed.eventIdPath ?? null,
        parsed.enabled ? 1 : 0,
        parsed.webhookUrl,
        parsed.webhookToken ? this.encodeSecret(parsed.webhookToken) : null,
        parsed.signingSecret ? this.encodeSecret(parsed.signingSecret) : null,
        parsed.signingSecretHint ?? null,
        parsed.projectId,
        now,
        parsed.updatedAt ?? now,
      );
  }

  getRun(runId: string) {
    const row = this.db
      .prepare<[string], RunRow>('select * from runs where id = ? limit 1')
      .get(runId);
    return row ? this.mapRunRow(row) : null;
  }

  listRuns(projectId?: string) {
    const rows = projectId
      ? this.db
          .prepare<[string], RunRow>(
            'select * from runs where project_id = ? order by updated_at desc',
          )
          .all(projectId)
      : this.db.prepare<[], RunRow>('select * from runs order by updated_at desc').all();

    return rows.map((row) => this.mapRunRow(row));
  }

  upsertRun(update: RunUpdate) {
    this.db
      .prepare(
        `insert into runs (
          id,
          incident_id,
          project_id,
          status,
          summary,
          log_path,
          last_message_path,
          exit_code,
          created_at,
          updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, coalesce((select created_at from runs where id = ?), ?), ?)
        on conflict(id) do update set
          status = excluded.status,
          summary = excluded.summary,
          log_path = excluded.log_path,
          last_message_path = excluded.last_message_path,
          exit_code = excluded.exit_code,
          updated_at = excluded.updated_at`,
      )
      .run(
        update.runId,
        update.incidentId,
        update.projectId,
        update.status,
        update.summary ?? null,
        update.logPath ?? null,
        update.lastMessagePath ?? null,
        update.exitCode ?? null,
        update.runId,
        update.updatedAt,
        update.updatedAt,
      );
  }

  close() {
    this.db.close();
  }

  private initialize() {
    this.db.exec(`
      create table if not exists settings (
        key text primary key,
        value text not null,
        is_secret integer not null default 0,
        updated_at text not null
      );

      create table if not exists projects (
        project_id text primary key,
        name text not null,
        slug text not null,
        repo_path text not null,
        base_prompt text not null,
        event_prompt_template text not null,
        local_rules text not null,
        codex_model text,
        concurrency_limit integer not null,
        sandbox_mode text not null,
        cooldown_seconds integer not null,
        fingerprint_fields text not null,
        event_id_path text,
        enabled integer not null,
        webhook_url text not null,
        webhook_token text,
        signing_secret text,
        signing_secret_hint text,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists runs (
        id text primary key,
        incident_id text not null,
        project_id text not null,
        status text not null,
        summary text,
        log_path text,
        last_message_path text,
        exit_code integer,
        created_at text not null,
        updated_at text not null
      );
    `);
  }

  private encodeSecret(value: string) {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(value).toString('base64')}`;
    }

    return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
  }

  private decodeSecret(value: string) {
    const [mode, payload] = value.split(':', 2);
    if (mode === 'enc') {
      return safeStorage.decryptString(Buffer.from(payload, 'base64'));
    }

    return Buffer.from(payload, 'base64').toString('utf8');
  }

  private mapRunRow(row: RunRow) {
    return {
      runId: row.id,
      incidentId: row.incident_id,
      projectId: row.project_id,
      status: row.status as RunUpdate['status'],
      summary: row.summary ?? undefined,
      logPath: row.log_path ?? undefined,
      lastMessagePath: row.last_message_path ?? undefined,
      exitCode: row.exit_code ?? undefined,
      updatedAt: row.updated_at,
    };
  }
}
