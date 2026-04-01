import type { DesktopProjectDraft, ProjectSnapshot } from '@pigeonclaw/shared';
import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';
import { useEffect, useMemo, useState } from 'react';

const defaultBasePrompt =
  'You are triaging a live development incident. Investigate the repository, use the event context carefully, avoid broad changes, and summarize the result clearly.';

const defaultEventPrompt =
  'An event triggered this repository.\n\nIncident: {{incident.id}}\nFingerprint: {{incident.fingerprint}}\nDuplicate count: {{incident.duplicateCount}}\nProject: {{project.name}}\nRepository: {{project.repoPath}}\n\nIncoming payload:\n{{event}}\n';

export function ProjectForm({
  project,
  onSave,
}: {
  project: ProjectSnapshot | null;
  onSave: (draft: DesktopProjectDraft) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotateSigningSecret, setRotateSigningSecret] = useState(false);
  const [formState, setFormState] = useState<DesktopProjectDraft>(() => makeDraft(project));

  useEffect(() => {
    setFormState(makeDraft(project));
    setRotateSigningSecret(false);
  }, [project]);

  const fingerprintText = useMemo(
    () => formState.fingerprintFields.map((field) => field.path).join('\n'),
    [formState.fingerprintFields],
  );
  const rulesText = useMemo(() => formState.localRules.join('\n'), [formState.localRules]);

  return (
    <div className="project-detail">
      <SurfaceCard className="detail-panel">
        <SectionHeader
          title={project ? 'Project Configuration' : 'Create Project'}
          subtitle="Local repo wiring, public webhook credentials, and Codex instructions stay together here."
        />

        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);

            try {
              await onSave({
                ...formState,
                rotateSigningSecret,
              });
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : 'Failed to save project.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="field-grid two">
            <label className="field">
              <span>Name</span>
              <input
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>

            <label className="field">
              <span>Slug</span>
              <input
                value={formState.slug}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, slug: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="field">
            <span>Repository path</span>
            <input
              value={formState.repoPath}
              onChange={(event) =>
                setFormState((current) => ({ ...current, repoPath: event.target.value }))
              }
            />
          </label>

          <div className="field-grid three">
            <label className="field">
              <span>Cooldown seconds</span>
              <input
                type="number"
                min={0}
                value={formState.cooldownSeconds}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    cooldownSeconds: Number(event.target.value || 0),
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Concurrency limit</span>
              <input
                type="number"
                min={1}
                max={8}
                value={formState.concurrencyLimit}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    concurrencyLimit: Number(event.target.value || 1),
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Sandbox</span>
              <select
                value={formState.sandboxMode}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    sandboxMode: event.target.value as DesktopProjectDraft['sandboxMode'],
                  }))
                }
              >
                <option value="read-only">read-only</option>
                <option value="workspace-write">workspace-write</option>
                <option value="danger-full-access">danger-full-access</option>
              </select>
            </label>
          </div>

          <div className="field-grid two">
            <label className="field">
              <span>Fingerprint fields</span>
              <textarea
                rows={5}
                value={fingerprintText}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    fingerprintFields: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((path) => ({ path })),
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Event ID path</span>
              <input
                value={formState.eventIdPath ?? ''}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    eventIdPath: event.target.value.trim() || undefined,
                  }))
                }
              />
            </label>
          </div>

          <label className="field">
            <span>Base prompt</span>
            <textarea
              rows={6}
              value={formState.basePrompt}
              onChange={(event) =>
                setFormState((current) => ({ ...current, basePrompt: event.target.value }))
              }
            />
          </label>

          <label className="field">
            <span>Event prompt template</span>
            <textarea
              rows={10}
              value={formState.eventPromptTemplate}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  eventPromptTemplate: event.target.value,
                }))
              }
            />
          </label>

          <div className="field-grid two">
            <label className="field">
              <span>Project rules</span>
              <textarea
                rows={5}
                value={rulesText}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    localRules: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </label>

            <div className="credential-card">
              <div className="credential-header">
                <span>Webhook credentials</span>
                <StatusPill tone={project?.enabled ? 'success' : 'warning'}>
                  {project ? 'Issued' : 'Pending'}
                </StatusPill>
              </div>

              <div className="credential-row">
                <span>URL</span>
                <code>{project?.webhookUrl ?? 'Created after save'}</code>
              </div>

              <div className="credential-row">
                <span>Token</span>
                <code>{project?.webhookToken ?? 'Stored locally after create'}</code>
              </div>

              <div className="credential-row">
                <span>Signing secret</span>
                <code>
                  {project?.signingSecret ??
                    project?.signingSecretHint ??
                    'Auto-generated on create'}
                </code>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={rotateSigningSecret}
                  onChange={(event) => setRotateSigningSecret(event.target.checked)}
                />
                <span>Rotate signing secret on save</span>
              </label>
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="form-actions">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={formState.enabled}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>Project enabled</span>
            </label>

            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : project ? 'Save Project' : 'Create Project'}
            </button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}

function makeDraft(project: ProjectSnapshot | null): DesktopProjectDraft {
  return {
    projectId: project?.projectId,
    name: project?.name ?? '',
    slug: project?.slug ?? '',
    repoPath: project?.repoPath ?? '',
    basePrompt: project?.basePrompt ?? defaultBasePrompt,
    eventPromptTemplate: project?.eventPromptTemplate ?? defaultEventPrompt,
    localRules: project?.localRules ?? ['Summarize your findings and any code changes clearly.'],
    codexModel: project?.codexModel,
    concurrencyLimit: project?.concurrencyLimit ?? 1,
    sandboxMode: project?.sandboxMode ?? 'workspace-write',
    cooldownSeconds: project?.cooldownSeconds ?? 600,
    fingerprintFields: project?.fingerprintFields ?? [
      { path: 'error.message' },
      { path: 'error.code' },
    ],
    eventIdPath: project?.eventIdPath,
    enabled: project?.enabled ?? true,
  };
}
