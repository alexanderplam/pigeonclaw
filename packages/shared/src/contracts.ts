import { z } from 'zod';

export const idSchema = z.string().uuid();

export const fingerprintFieldSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1).max(64).optional(),
});

export const desktopPairRequestSchema = z.object({
  deviceName: z.string().min(2).max(80),
  platform: z.literal('macos').default('macos'),
  appVersion: z.string().min(1),
});

export const desktopPairResponseSchema = z.object({
  tenantId: idSchema,
  deviceId: idSchema,
  deviceToken: z.string().min(24),
  relayBaseUrl: z.string().url(),
});

export const relayProjectSchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80),
  enabled: z.boolean(),
  cooldownSeconds: z.number().int().min(0).max(86_400),
  fingerprintFields: z.array(fingerprintFieldSchema).min(1).max(10),
  eventIdPath: z.string().min(1).max(200).optional(),
  signingSecretHint: z.string().max(8).optional(),
  webhookUrl: z.string().url(),
  webhookTokenPreview: z.string().min(8),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const relayProjectCreateSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(600),
  fingerprintFields: z.array(fingerprintFieldSchema).min(1).max(10),
  eventIdPath: z.string().min(1).max(200).optional(),
  signingSecret: z.string().min(16).max(256).optional(),
  enabled: z.boolean().default(true),
});

export const relayProjectUpdateSchema = relayProjectCreateSchema.partial();

export const desktopProjectSettingsSchema = z.object({
  projectId: idSchema,
  name: z.string().min(1).max(80),
  repoPath: z.string().min(1),
  basePrompt: z.string().min(1),
  eventPromptTemplate: z.string().min(1),
  localRules: z.array(z.string().min(1).max(240)).max(20).default([]),
  codexModel: z.string().max(80).optional(),
  concurrencyLimit: z.number().int().min(1).max(8).default(1),
  sandboxMode: z
    .enum(['read-only', 'workspace-write', 'danger-full-access'])
    .default('workspace-write'),
});

export const desktopProjectDraftSchema = z.object({
  projectId: idSchema.optional(),
  name: z.string().min(1).max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
  repoPath: z.string().min(1),
  basePrompt: z.string().min(1),
  eventPromptTemplate: z.string().min(1),
  localRules: z.array(z.string().min(1).max(240)).max(20).default([]),
  codexModel: z.string().max(80).optional(),
  concurrencyLimit: z.number().int().min(1).max(8).default(1),
  sandboxMode: z
    .enum(['read-only', 'workspace-write', 'danger-full-access'])
    .default('workspace-write'),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(600),
  fingerprintFields: z.array(fingerprintFieldSchema).min(1).max(10),
  eventIdPath: z.string().min(1).max(200).optional(),
  enabled: z.boolean().default(true),
  rotateSigningSecret: z.boolean().optional(),
});

export const projectSnapshotSchema = z.object({
  projectId: idSchema,
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80),
  repoPath: z.string().min(1),
  basePrompt: z.string().min(1),
  eventPromptTemplate: z.string().min(1),
  localRules: z.array(z.string()),
  codexModel: z.string().optional(),
  concurrencyLimit: z.number().int().min(1).max(8),
  sandboxMode: z.enum(['read-only', 'workspace-write', 'danger-full-access']),
  cooldownSeconds: z.number().int().min(0).max(86_400),
  fingerprintFields: z.array(fingerprintFieldSchema).min(1).max(10),
  eventIdPath: z.string().optional(),
  enabled: z.boolean(),
  webhookUrl: z.string().url(),
  webhookToken: z.string().min(8).optional(),
  signingSecret: z.string().min(8).optional(),
  signingSecretHint: z.string().optional(),
  updatedAt: z.string().datetime(),
});

export const webhookEventSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  receivedAt: z.string().datetime(),
  externalEventId: z.string().max(200).optional(),
  idempotencyKey: z.string().max(200).optional(),
  payload: z.record(z.string(), z.unknown()),
  headers: z.record(z.string(), z.string()),
});

export const incidentStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed']);

export const incidentSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  fingerprint: z.string().min(16),
  status: incidentStatusSchema,
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  duplicateCount: z.number().int().min(0),
  latestPayloadPreview: z.string().max(800),
});

export const jobSchema = z.object({
  id: idSchema,
  incidentId: idSchema,
  projectId: idSchema,
  deliveredToDeviceId: idSchema,
  queuedAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
  fingerprint: z.string(),
  duplicateCount: z.number().int().min(0),
});

export const runStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

export const relayProjectCredentialsSchema = z.object({
  project: relayProjectSchema,
  issuedSigningSecret: z.string().min(8).optional(),
  issuedWebhookToken: z.string().min(8).optional(),
});

export const runUpdateSchema = z.object({
  runId: idSchema,
  incidentId: idSchema,
  projectId: idSchema,
  status: runStatusSchema,
  summary: z.string().max(4_000).optional(),
  logPath: z.string().optional(),
  lastMessagePath: z.string().optional(),
  exitCode: z.number().int().optional(),
  updatedAt: z.string().datetime(),
});

export const relayEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('job.ready'),
    payload: jobSchema,
  }),
  z.object({
    type: z.literal('job.ack'),
    payload: z.object({
      jobId: idSchema,
    }),
  }),
  z.object({
    type: z.literal('job.result'),
    payload: runUpdateSchema,
  }),
  z.object({
    type: z.literal('device.hello'),
    payload: z.object({
      deviceId: idSchema,
      connectedAt: z.string().datetime(),
      relayVersion: z.string(),
    }),
  }),
]);

export type DesktopPairRequest = z.infer<typeof desktopPairRequestSchema>;
export type DesktopPairResponse = z.infer<typeof desktopPairResponseSchema>;
export type RelayProject = z.infer<typeof relayProjectSchema>;
export type RelayProjectCreate = z.infer<typeof relayProjectCreateSchema>;
export type RelayProjectUpdate = z.infer<typeof relayProjectUpdateSchema>;
export type DesktopProjectSettings = z.infer<typeof desktopProjectSettingsSchema>;
export type DesktopProjectDraft = z.infer<typeof desktopProjectDraftSchema>;
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type Job = z.infer<typeof jobSchema>;
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;
export type RunUpdate = z.infer<typeof runUpdateSchema>;
export type RelayEnvelope = z.infer<typeof relayEnvelopeSchema>;
export type RelayProjectCredentials = z.infer<typeof relayProjectCredentialsSchema>;
