import { useEffect, useMemo, useState } from 'react';

import type { DesktopProjectDraft, ProjectSnapshot } from '@pigeonclaw/shared';
import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';
import { makeProjectDraft } from '../../../shared/project-defaults.js';

export function ProjectForm({
  project,
  hasProjects,
  createFromFolderError,
  onCreateFromFolder,
  onSave,
}: {
  project: ProjectSnapshot | null;
  hasProjects: boolean;
  createFromFolderError: string | null;
  onCreateFromFolder: () => Promise<void>;
  onSave: (draft: DesktopProjectDraft) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotateSigningSecret, setRotateSigningSecret] = useState(false);
  const [formState, setFormState] = useState<DesktopProjectDraft>(() => makeProjectDraft(project));

  useEffect(() => {
    setFormState(makeProjectDraft(project));
    setRotateSigningSecret(false);
  }, [project]);

  const fingerprintText = useMemo(
    () => formState.fingerprintFields.map((field) => field.path).join('\n'),
    [formState.fingerprintFields],
  );
  const rulesText = useMemo(() => formState.localRules.join('\n'), [formState.localRules]);

  if (!project) {
    return (
      <div className="project-detail">
        <SurfaceCard className="detail-panel detail-panel-empty">
          <SectionHeader
            title={hasProjects ? 'Add another repository' : 'Add your first repository'}
            subtitle="Choose a local project folder first. You can tune the webhook rules, prompt, and idempotency settings after it exists."
          />

          <div className="empty-state empty-state-large">
            <strong>Start from a folder, not a form</strong>
            <p>
              PigeonClaw will infer the project name, generate a webhook, store the local path, and
              then open the full configuration view for refinement.
            </p>

            {createFromFolderError ? <p className="form-error">{createFromFolderError}</p> : null}

            <button
              className="primary-button"
              type="button"
              onClick={() => void onCreateFromFolder()}
            >
              Choose Project Folder
            </button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

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
