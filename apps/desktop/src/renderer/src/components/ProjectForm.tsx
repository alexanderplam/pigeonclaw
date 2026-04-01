import { useEffect, useMemo, useRef, useState } from 'react';

import type { DesktopProjectDraft, Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';
import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';

import { makeProjectDraft } from '../../../shared/project-defaults.js';
import { HistoryView } from './HistoryView.js';
import {
  formatDateTime,
  formatRelativeTime,
  getExecutionModeDescription,
  getExecutionModeLabel,
  getRunStatusLabel,
  getRunTone,
  getRuntimeStatus,
} from './runtime-utils.js';

type WorkspaceTab = 'overview' | 'webhook' | 'agent' | 'activity';

const executionModeOptions = [
  {
    value: 'auto',
    label: 'Run automatically',
    description: 'Start Codex as soon as a new incident is opened.',
  },
  {
    value: 'ask',
    label: 'Ask before running',
    description: 'Surface the run as waiting approval instead of starting Codex automatically.',
  },
  {
    value: 'log',
    label: 'Log only',
    description: 'Capture incidents and outcomes without launching Codex.',
  },
] satisfies Array<{
  value: DesktopProjectDraft['executionMode'];
  label: string;
  description: string;
}>;

export function ProjectForm({
  project,
  incidents,
  runs,
  hasProjects,
  createFromFolderError,
  onCreateFromFolder,
  onSave,
  relayStatus,
}: {
  project: ProjectSnapshot | null;
  incidents: Incident[];
  runs: RunUpdate[];
  hasProjects: boolean;
  createFromFolderError: string | null;
  onCreateFromFolder: () => Promise<void>;
  onSave: (draft: DesktopProjectDraft) => Promise<void>;
  relayStatus: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [rotateSigningSecret, setRotateSigningSecret] = useState(false);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [formState, setFormState] = useState<DesktopProjectDraft>(() => makeProjectDraft(project));
  const previousProjectIdRef = useRef<string | undefined>(project?.projectId);

  const initialDraft = useMemo(() => makeProjectDraft(project), [project]);

  useEffect(() => {
    if (previousProjectIdRef.current === project?.projectId) {
      return;
    }

    previousProjectIdRef.current = project?.projectId;
    setFormState(makeProjectDraft(project));
    setRotateSigningSecret(false);
    setRevealSecrets(false);
    setError(null);
    setActiveTab('overview');
  }, [project]);

  useEffect(() => {
    if (!copiedValue) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedValue(null), 1_600);
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
  const runtimeStatus = getRuntimeStatus(relayStatus, formState.enabled);
  const fingerprintText = useMemo(
    () => formState.fingerprintFields.map((field) => field.path).join('\n'),
    [formState.fingerprintFields],
  );
  const rulesText = useMemo(() => formState.localRules.join('\n'), [formState.localRules]);
  const isDirty = useMemo(
    () => serializeDraft(formState) !== serializeDraft(initialDraft) || rotateSigningSecret,
    [formState, initialDraft, rotateSigningSecret],
  );
  const showEditorBanner = isDirty || submitting || Boolean(error);
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

  const saveDraft = async (
    draft: DesktopProjectDraft,
    options: { includeRotateSecret?: boolean } = {},
  ) => {
    setSubmitting(true);
    setError(null);

    try {
      await onSave({
        ...draft,
        rotateSigningSecret: options.includeRotateSecret && rotateSigningSecret ? true : undefined,
      });

      if (options.includeRotateSecret) {
        setRotateSigningSecret(false);
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save project.';
      setError(message);
      throw saveError;
    } finally {
      setSubmitting(false);
    }
  };

  const autosaveDraft = async (nextDraft: DesktopProjectDraft) => {
    const previousDraft = formState;
    setFormState(nextDraft);

    try {
      await saveDraft(nextDraft);
    } catch {
      setFormState(previousDraft);
    }
  };

  if (!project) {
    return (
      <div className="project-detail">
        <SurfaceCard className="workspace-card workspace-card--empty">
          <SectionHeader
            title={hasProjects ? 'Add another project' : 'Add your first project'}
            subtitle="Start with a local repository. Once it exists, the runtime view will focus on activity, outcomes, and controls instead of setup fields."
          />

          <div className="empty-state empty-state-large">
            <strong>Choose a folder to begin</strong>
            <p>
              PigeonClaw will infer the project name, issue a webhook, store the local path, and
              then open a runtime-focused workspace for the project.
            </p>

            {createFromFolderError ? <p className="form-error">{createFromFolderError}</p> : null}

            <button
              className="primary-button"
              type="button"
              onClick={() => void onCreateFromFolder()}
            >
              Add Project
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
        await saveDraft(formState, { includeRotateSecret: true });
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

      {showEditorBanner ? (
        <div className="editor-banner">
          <div className="editor-banner-copy">
            <strong>
              {submitting
                ? 'Saving changes…'
                : isDirty
                  ? 'Unsaved project changes'
                  : 'Project save issue'}
            </strong>
            <p>
              {error
                ? error
                : isDirty
                  ? 'Runtime controls save separately when possible, but these edits still need to be committed.'
                  : 'Waiting for the latest project state to finish saving.'}
            </p>
          </div>

          {isDirty ? (
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save project changes'}
            </button>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <div className="project-pane-stack">
          <SurfaceCard className="workspace-card runtime-dashboard">
            <div className="runtime-dashboard-header">
              <SectionHeader
                title="Runtime overview"
                subtitle="Event received -> incident created -> agent triggered -> outcome visible."
              />

              <div className="runtime-loop">
                <span>Event received</span>
                <span>Incident created</span>
                <span>Agent triggered</span>
                <span>Outcome visible</span>
              </div>
            </div>

            <div className="runtime-stat-grid">
              <div className="runtime-stat-card">
                <div className="runtime-stat-topline">
                  <span className="summary-label">Status</span>
                  <StatusPill tone={runtimeStatus.tone}>{runtimeStatus.label}</StatusPill>
                </div>
                <strong>{runtimeStatus.label}</strong>
                <p>{runtimeStatus.description}</p>
              </div>

              <div className="runtime-stat-card">
                <div className="runtime-stat-topline">
                  <span className="summary-label">Last event</span>
                  {lastIncident ? (
                    <small>{formatRelativeTime(lastIncident.lastSeenAt)}</small>
                  ) : null}
                </div>
                <strong>
                  {lastIncident ? formatDateTime(lastIncident.lastSeenAt) : 'No events yet'}
                </strong>
                <p>
                  {lastIncident
                    ? `${lastIncident.latestPayloadPreview} • Source webhook`
                    : 'Send a test event to watch the runtime populate.'}
                </p>
              </div>

              <div className="runtime-stat-card">
                <div className="runtime-stat-topline">
                  <span className="summary-label">Last run</span>
                  {lastRun ? (
                    <StatusPill tone={getRunTone(lastRun.status)}>{lastRun.status}</StatusPill>
                  ) : null}
                </div>
                <strong>{getRunStatusLabel(lastRun, project, 'short')}</strong>
                <p>
                  {lastRun
                    ? `${formatDateTime(lastRun.updatedAt)} • ${lastRun.summary ?? 'Latest runtime outcome.'}`
                    : 'The next run result will appear here as soon as the agent responds.'}
                </p>
              </div>

              <div className="runtime-stat-card">
                <div className="runtime-stat-topline">
                  <span className="summary-label">Agent mode</span>
                  <StatusPill tone={formState.executionMode === 'auto' ? 'success' : 'neutral'}>
                    {getExecutionModeLabel(formState.executionMode, 'short')}
                  </StatusPill>
                </div>
                <strong>{getExecutionModeLabel(formState.executionMode, 'short')}</strong>
                <p>{getExecutionModeDescription(formState.executionMode)}</p>
              </div>
            </div>
          </SurfaceCard>

          <div className="dashboard-columns">
            <SurfaceCard className="workspace-card">
              <SectionHeader
                title="Recent incidents"
                subtitle="The most recent fingerprints reaching this project."
              />

              <div className="compact-stream">
                {projectIncidents.slice(0, 4).map((incident) => (
                  <article key={incident.id} className="compact-stream-item">
                    <div className="compact-stream-topline">
                      <strong>{incident.latestPayloadPreview}</strong>
                      <StatusPill tone={incident.status === 'failed' ? 'danger' : 'warning'}>
                        {incident.status}
                      </StatusPill>
                    </div>
                    <p>
                      {formatDateTime(incident.lastSeenAt)} • {incident.duplicateCount} duplicate
                      {incident.duplicateCount === 1 ? '' : 's'}
                    </p>
                  </article>
                ))}

                {projectIncidents.length === 0 ? (
                  <div className="empty-state compact">
                    <strong>No incidents yet</strong>
                    <p>The next webhook event will open a new incident here.</p>
                  </div>
                ) : null}
              </div>
            </SurfaceCard>

            <SurfaceCard className="workspace-card">
              <SectionHeader
                title="Recent runs"
                subtitle="The latest local runtime outcomes from this machine."
              />

              <div className="compact-stream">
                {projectRuns.slice(0, 4).map((run) => (
                  <article key={run.runId} className="compact-stream-item">
                    <div className="compact-stream-topline">
                      <strong>{getRunStatusLabel(run, project)}</strong>
                      <StatusPill tone={getRunTone(run.status)}>{run.status}</StatusPill>
                    </div>
                    <p>
                      {formatDateTime(run.updatedAt)} •{' '}
                      {run.summary ?? 'Codex is still working through the incident.'}
                    </p>
                  </article>
                ))}

                {projectRuns.length === 0 ? (
                  <div className="empty-state compact">
                    <strong>No runs yet</strong>
                    <p>When Codex starts working, the latest run summaries will show up here.</p>
                  </div>
                ) : null}
              </div>
            </SurfaceCard>
          </div>

          <SurfaceCard className="workspace-card workspace-card--secondary">
            <SectionHeader
              title="Config summary"
              subtitle="Project setup stays compact here so the runtime state can lead."
            />

            <div className="config-summary-grid">
              <div className="config-summary-item">
                <span className="summary-label">Webhook auth</span>
                <strong>{project.signingSecret ? 'Signed requests enabled' : 'Unsigned'}</strong>
              </div>
              <div className="config-summary-item">
                <span className="summary-label">Cooldown</span>
                <strong>{formatDuration(formState.cooldownSeconds)}</strong>
              </div>
              <div className="config-summary-item">
                <span className="summary-label">Sandbox</span>
                <strong>{formState.sandboxMode}</strong>
              </div>
              <div className="config-summary-item">
                <span className="summary-label">Concurrency</span>
                <strong>{formState.concurrencyLimit} run(s)</strong>
              </div>
            </div>

            <details className="disclosure-panel">
              <summary>Project settings</summary>

              <div className="disclosure-body">
                <div className="project-settings-toggle">
                  <div>
                    <span className="summary-label">Intake state</span>
                    <strong>{formState.enabled ? 'Listening for events' : 'Paused'}</strong>
                    <p>
                      This controls whether incoming webhook events can open incidents for this
                      project.
                    </p>
                  </div>

                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={formState.enabled}
                      disabled={submitting}
                      onChange={(event) => {
                        const nextDraft = { ...formState, enabled: event.target.checked };
                        void autosaveDraft(nextDraft);
                      }}
                    />
                    <span>{formState.enabled ? 'Enabled' : 'Paused'}</span>
                  </label>
                </div>

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
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void openProjectPath()}
                  >
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
              </div>
            </details>
          </SurfaceCard>
        </div>
      ) : null}

      {activeTab === 'webhook' ? (
        <div className="project-pane-stack">
          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="Endpoint"
              subtitle="Where external systems send events for this project."
            />

            <div className="value-row value-row--stacked">
              <div>
                <span className="summary-label">Webhook URL</span>
                <code>{project.webhookUrl}</code>
              </div>

              <div className="inline-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void copyText(project.webhookUrl, 'Webhook URL')}
                >
                  {copiedValue === 'Webhook URL' ? 'Copied' : 'Copy URL'}
                </button>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="Auth / signing"
              subtitle="Keep tokens hidden by default and reveal them only when you need to rotate or inspect secrets."
            />

            <div className="credential-stack">
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
                className="guarded-button"
                type="button"
                onClick={() => setRevealSecrets((current) => !current)}
              >
                {revealSecrets ? 'Hide sensitive values' : 'Reveal sensitive values'}
              </button>

              <label className="checkbox-row checkbox-row--boxed">
                <input
                  type="checkbox"
                  checked={rotateSigningSecret}
                  onChange={(event) => setRotateSigningSecret(event.target.checked)}
                />
                <span>Rotate signing secret on next save</span>
              </label>
            </div>
          </SurfaceCard>

          <SurfaceCard className="workspace-card">
            <SectionHeader
              title="Test request"
              subtitle="A ready-to-run sample for checking the full webhook and signature path."
            />

            <div className="code-surface">
              <div className="code-surface-header">
                <span>curl</span>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void copyText(curlCommand, 'Test curl')}
                >
                  {copiedValue === 'Test curl' ? 'Copied' : 'Copy command'}
                </button>
              </div>

              <pre className="code-block">{curlCommand}</pre>
            </div>
          </SurfaceCard>

          <SurfaceCard className="workspace-card workspace-card--secondary">
            <SectionHeader
              title="Dedupe / cooldown"
              subtitle="Tell the runtime when to collapse duplicate events into the same incident."
            />

            <div className="field-grid two">
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
          </SurfaceCard>
        </div>
      ) : null}

      {activeTab === 'agent' ? (
        <div className="project-pane-stack">
          <SurfaceCard className="workspace-card mode-control-card">
            <div className="mode-control-header">
              <SectionHeader
                title="Execution mode"
                subtitle="Choose how this machine responds when a new incident reaches this project."
              />
              <StatusPill tone={formState.executionMode === 'auto' ? 'success' : 'neutral'}>
                {getExecutionModeLabel(formState.executionMode, 'short')}
              </StatusPill>
            </div>

            <div className="mode-option-grid">
              {executionModeOptions.map((option) => (
                <label
                  key={option.value}
                  className={
                    option.value === formState.executionMode
                      ? 'mode-option is-active'
                      : 'mode-option'
                  }
                >
                  <input
                    type="radio"
                    name="executionMode"
                    value={option.value}
                    checked={formState.executionMode === option.value}
                    disabled={submitting}
                    onChange={() => {
                      const nextDraft = { ...formState, executionMode: option.value };
                      void autosaveDraft(nextDraft);
                    }}
                  />
                  <strong>{option.label}</strong>
                  <p>{option.description}</p>
                </label>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="workspace-card workspace-card--secondary">
            <SectionHeader
              title="Prompt design"
              subtitle="These instructions are still available, but they sit behind the runtime control instead of leading the page."
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
                rows={9}
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
        <HistoryView
          project={project}
          incidents={incidents}
          runs={runs}
          onOpenWebhook={() => setActiveTab('webhook')}
        />
      ) : null}
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

function formatDuration(value: number) {
  if (value < 60) {
    return `${value}s`;
  }

  if (value % 60 === 0) {
    return `${value / 60}m`;
  }

  return `${Math.floor(value / 60)}m ${value % 60}s`;
}

function serializeDraft(draft: DesktopProjectDraft) {
  return JSON.stringify(draft);
}
