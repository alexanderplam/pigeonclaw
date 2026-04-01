import type { DesktopProjectDraft, ProjectSnapshot } from '@pigeonclaw/shared';

export const defaultBasePrompt =
  'You are triaging a live development incident. Investigate the repository, use the event context carefully, avoid broad changes, and summarize the result clearly.';

export const defaultEventPrompt =
  'An event triggered this repository.\n\nIncident: {{incident.id}}\nFingerprint: {{incident.fingerprint}}\nDuplicate count: {{incident.duplicateCount}}\nProject: {{project.name}}\nRepository: {{project.repoPath}}\n\nIncoming payload:\n{{event}}\n';

export const defaultProjectRules = ['Summarize your findings and any code changes clearly.'];

export function makeProjectDraft(
  project: ProjectSnapshot | null,
  overrides: Partial<DesktopProjectDraft> = {},
): DesktopProjectDraft {
  return {
    projectId: overrides.projectId ?? project?.projectId,
    name: overrides.name ?? project?.name ?? '',
    slug: overrides.slug ?? project?.slug ?? '',
    repoPath: overrides.repoPath ?? project?.repoPath ?? '',
    executionMode: overrides.executionMode ?? project?.executionMode ?? 'auto',
    basePrompt: overrides.basePrompt ?? project?.basePrompt ?? defaultBasePrompt,
    eventPromptTemplate:
      overrides.eventPromptTemplate ?? project?.eventPromptTemplate ?? defaultEventPrompt,
    localRules: overrides.localRules ?? project?.localRules ?? defaultProjectRules,
    codexModel: overrides.codexModel ?? project?.codexModel,
    concurrencyLimit: overrides.concurrencyLimit ?? project?.concurrencyLimit ?? 1,
    sandboxMode: overrides.sandboxMode ?? project?.sandboxMode ?? 'workspace-write',
    cooldownSeconds: overrides.cooldownSeconds ?? project?.cooldownSeconds ?? 600,
    fingerprintFields: overrides.fingerprintFields ??
      project?.fingerprintFields ?? [{ path: 'error.message' }, { path: 'error.code' }],
    eventIdPath: overrides.eventIdPath ?? project?.eventIdPath,
    enabled: overrides.enabled ?? project?.enabled ?? true,
    rotateSigningSecret: overrides.rotateSigningSecret,
  };
}

export function slugifyProjectName(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  const truncated = normalized.slice(0, 80).replace(/-+$/g, '');
  return truncated || 'project';
}

export function ensureUniqueProjectSlug(baseSlug: string, existingSlugs: Iterable<string>) {
  const normalizedBase = slugifyProjectName(baseSlug);
  const taken = new Set(Array.from(existingSlugs, (slug) => slug.toLowerCase()));

  if (!taken.has(normalizedBase)) {
    return normalizedBase;
  }

  for (let counter = 2; counter < 10_000; counter += 1) {
    const suffix = `-${counter}`;
    const stem = normalizedBase.slice(0, Math.max(1, 80 - suffix.length)).replace(/-+$/g, '');
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `${normalizedBase.slice(0, 76)}-9999`;
}
