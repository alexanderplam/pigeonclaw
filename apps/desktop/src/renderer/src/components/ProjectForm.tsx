import { useEffect, useMemo, useState } from 'react';

import type { DesktopProjectDraft, Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';
import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';

import { makeProjectDraft } from '../../../shared/project-defaults.js';
import { HistoryView } from './HistoryView.js';

type WorkspaceTab = 'overview' | 'webhook' | 'agent' | 'activity';

export function ProjectForm({
  project,
  incidents,
  runs,
  hasProjects,
  createFromFolderError,
  onCreateFromFolder,
  onSave,
}: {
  project: ProjectSnapshot | null;
  incidents: Incident[];
  runs: RunUpdate[];
  hasProjects: boolean;
  createFromFolderError: string | null;
  onCreateFromFolder: () => Promise<void>;
  onSave: (draft: DesktopProjectDraft) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [rotateSigningSecret, setRotateSigningSecret] = useState(false);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [formState, setFormState] = useState<DesktopProjectDraft>(() => makeProjectDraft(project));

  useEffect(() => {
    const currentProjectId = project?.projectId ?? null;
    if (formState.projectId === currentProjectId) {
      return;
    }

    setFormState(makeProjectDraft(project));
    setRotateSigningSecret(false);
    setRevealSecrets(false);
    setError(null);
    setActiveTab('overview');
  }, [formState.projectId, project]);

  useEffect(() => {
    if (!copiedValue) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedValue(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedValue]);

  const projectIncidents = useMemo(
    () => (project ? incidents.filter((incident) => incident.projectId === project.projectId) : []),
    [incidents, project],
  );
  const projectRuns = useMemo(
    () => (project ? runs.filter((run) => run.projectId === project.projectId) : []),
    [project, runs],
  );

  const lastIncident = projectIncidents[0] ?? null;
  const lastRun = projectRuns[0] ?? null;
  const fingerprintText = useMemo(
    () => formState.fingerprintFields.map((field) => field.path).join('\n'),
    [formState.fingerprintFields],
  );
  const rulesText = useMemo(() => formState.localRules.join('\n'), [formState.localRules]);
  const curlCommand = useMemo(() => {
    if (!project?.webhookUrl || !project.signingSecret) {
      return 'Save the project to generate a webhook URL and signing secret.';
    }

    return [
      'body=\'{"source":"manual-test","error":{"message":"Sample incident","code":"E_TEST"}}\'',
      `sig=$(printf '%s' \"$body\" | openssl dgst -sha256 -hmac '${project.signingSecret}' | sed 's/^.* //')`,
      `curl -X POST '${project.webhookUrl}' \\`,
      "  -H 'content-type: application/json' \\",
      '  -H "x-pigeonclaw-signature: $sig" \\',
      '  -d "$body"',
    ].join('\n');
  }, [project?.signingSecret, project?.webhookUrl]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : `Could not copy ${label}.`);
    }
  };

  const openProjectPath = async () => {
    try {
      await window.pigeonclaw.openPath(formState.repoPath);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open the project path.');
    }
  };

  if (!project) {
    return (
      <div className="project-detail">
        <SurfaceCard className="workspace-card workspace-card--empty">
          <SectionHeader
            title={hasProjects ? 'Add another repository' : 'Add your first repository'}
            subtitle="Start with a local folder. Once the project exists, the webhook, agent rules, and history fall into calmer sections."
          />

          <div className="empty-state empty-state-large">
            <strong>Choose a folder to begin</strong>
            <p>
              PigeonClaw will infer the project name, issue a webhook, store the local path, and
              then open a simpler project workspace with separate tabs for configuration.
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
    <form
      className="project-detail"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
          await onSave({
            ...formState,
            rotateSigningSecret,
          });
          setRotateSigningSecret(false);
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : 'Failed to save project.');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="project-tabs" role="tablist" aria-label="Project sections">
        {(
          [
            ['overview', 'Overview'],
            ['webhook', 'Webhook'],
            ['agent', 'Agent'],
            ['activity', 'Activity'],
          ] satisfies Array<[WorkspaceTab, string]>
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'project-tab is-active' : 'project-tab'}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="project-pane-stack">
          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="At a glance"
              subtitle="The things you usually need first: current webhook status, last incident, and last run."
            />

            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">Webhook</span>
                <strong>{project.enabled ? 'Ready to receive events' : 'Project paused'}</strong>
                <p>{project.webhookUrl}</p>
                <button
                  className="ghost-button summary-action"
                  type="button"
                  onClick={() => void copyText(project.webhookUrl, 'Webhook URL')}
                >
                  {copiedValue === 'Webhook URL' ? 'Copied' : 'Copy URL'}
                </button>
              </div>

              <div className="summary-card">
                <span className="summary-label">Last incident</span>
                <strong>
                  {lastIncident ? formatDate(lastIncident.lastSeenAt) : 'No incidents yet'}
                </strong>
                <p>
                  {lastIncident
                    ? `${lastIncident.duplicateCount} duplicate${lastIncident.duplicateCount === 1 ? '' : 's'}`
                    : 'Your next webhook event will appear here.'}
                </p>
              </div>

              <div className="summary-card">
                <span className="summary-label">Last run</span>
                <strong>{lastRun ? formatDate(lastRun.updatedAt) : 'No runs yet'}</strong>
                <p>{lastRun ? lastRun.status : 'Codex results from this Mac will show up here.'}</p>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="Project details"
              subtitle="Keep this minimal: just the name, slug, and local path for this repository."
            />

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

            <div className="inline-actions">
              <button className="ghost-button" type="button" onClick={() => void openProjectPath()}>
                Open Folder
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void copyText(formState.repoPath, 'Repository path')}
              >
                {copiedValue === 'Repository path' ? 'Copied' : 'Copy Path'}
              </button>
            </div>
          </SurfaceCard>
        </div>
      ) : null}

      {activeTab === 'webhook' ? (
        <div className="project-pane-stack">
          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="Webhook credentials"
              subtitle="These are the values you’ll paste into whatever service is sending events."
            />

            <div className="credential-stack">
              <div className="value-row">
                <div>
                  <span className="summary-label">Webhook URL</span>
                  <code>{project.webhookUrl}</code>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void copyText(project.webhookUrl, 'Webhook URL')}
                >
                  {copiedValue === 'Webhook URL' ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="value-row">
                <div>
                  <span className="summary-label">Webhook token</span>
                  <code>
                    {revealSecrets
                      ? (project.webhookToken ?? 'Stored locally only')
                      : mask(project.webhookToken)}
                  </code>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    project.webhookToken
                      ? void copyText(project.webhookToken, 'Webhook token')
                      : undefined
                  }
                  disabled={!project.webhookToken}
                >
                  {copiedValue === 'Webhook token' ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="value-row">
                <div>
                  <span className="summary-label">Signing secret</span>
                  <code>
                    {revealSecrets
                      ? (project.signingSecret ?? project.signingSecretHint ?? 'Pending')
                      : mask(project.signingSecret, project.signingSecretHint)}
                  </code>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    project.signingSecret
                      ? void copyText(project.signingSecret, 'Signing secret')
                      : undefined
                  }
                  disabled={!project.signingSecret}
                >
                  {copiedValue === 'Signing secret' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="inline-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setRevealSecrets((current) => !current)}
              >
                {revealSecrets ? 'Hide Secrets' : 'Reveal Secrets'}
              </button>
            </div>
          </SurfaceCard>

          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="Test request"
              subtitle="A ready-to-paste example for quickly proving the webhook path works."
            />
            <pre className="code-block">{curlCommand}</pre>
            <div className="inline-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => void copyText(curlCommand, 'Test curl')}
              >
                {copiedValue === 'Test curl' ? 'Copied' : 'Copy curl command'}
              </button>
            </div>
          </SurfaceCard>

          <details className="disclosure-panel">
            <summary>Advanced dedupe settings</summary>

            <div className="disclosure-body">
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

                <label className="checkbox-row checkbox-row--boxed">
                  <input
                    type="checkbox"
                    checked={rotateSigningSecret}
                    onChange={(event) => setRotateSigningSecret(event.target.checked)}
                  />
                  <span>Rotate signing secret on save</span>
                </label>
              </div>

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
            </div>
          </details>
        </div>
      ) : null}

      {activeTab === 'agent' ? (
        <div className="project-pane-stack">
          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="Agent instructions"
              subtitle="Your base prompt, event template, and repo-specific rules live here."
            />

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
          </SurfaceCard>

          <details className="disclosure-panel">
            <summary>Advanced runtime settings</summary>

            <div className="disclosure-body">
              <div className="field-grid three">
                <label className="field">
                  <span>Project concurrency</span>
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

                <label className="field">
                  <span>Codex model</span>
                  <input
                    placeholder="Optional override"
                    value={formState.codexModel ?? ''}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        codexModel: event.target.value.trim() || undefined,
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {activeTab === 'activity' ? (
        <HistoryView project={project} incidents={incidents} runs={runs} />
      ) : null}

      <div className="editor-footer">
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

        <div className="editor-footer-meta">
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}

function mask(value?: string, hint?: string) {
  if (!value && !hint) {
    return 'Pending';
  }

  if (hint) {
    return `••••${hint.replace(/^••••/, '')}`;
  }

  if (!value) {
    return 'Pending';
  }

  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
