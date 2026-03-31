import type { Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';
import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';

export function HistoryView({
  project,
  incidents,
  runs,
}: {
  project: ProjectSnapshot | null;
  incidents: Incident[];
  runs: RunUpdate[];
}) {
  const projectIncidents = project
    ? incidents.filter((incident) => incident.projectId === project.projectId)
    : incidents;
  const projectRuns = project ? runs.filter((run) => run.projectId === project.projectId) : runs;

  return (
    <div className="history-grid">
      <SurfaceCard className="history-panel">
        <SectionHeader title="Incidents" subtitle="Relay-side dedupe and webhook history." />
        <div className="history-list">
          {projectIncidents.map((incident) => (
            <div key={incident.id} className="history-item">
              <div className="history-item-header">
                <strong>{incident.id.slice(0, 8)}</strong>
                <StatusPill tone={statusTone(incident.status)}>{incident.status}</StatusPill>
              </div>
              <p>{incident.latestPayloadPreview}</p>
              <small>
                Duplicates: {incident.duplicateCount} • Last seen {formatDate(incident.lastSeenAt)}
              </small>
            </div>
          ))}

          {projectIncidents.length === 0 ? (
            <div className="empty-state compact">
              <strong>No incidents yet</strong>
              <p>Incoming webhooks will appear here once the relay starts dispatching work.</p>
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <SurfaceCard className="history-panel">
        <SectionHeader title="Runs" subtitle="Local Codex execution records from this Mac." />
        <div className="history-list">
          {projectRuns.map((run) => (
            <div key={run.runId} className="history-item">
              <div className="history-item-header">
                <strong>{run.runId.slice(0, 8)}</strong>
                <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
              </div>
              <p>{run.summary ?? 'Codex is still working on this run.'}</p>
              <small>
                Updated {formatDate(run.updatedAt)}
                {run.exitCode !== undefined ? ` • Exit ${run.exitCode}` : ''}
              </small>
            </div>
          ))}

          {projectRuns.length === 0 ? (
            <div className="empty-state compact">
              <strong>No runs yet</strong>
              <p>When a job reaches this Mac, the Codex result will be preserved here.</p>
            </div>
          ) : null}
        </div>
      </SurfaceCard>
    </div>
  );
}

function statusTone(status: string) {
  if (status === 'succeeded') {
    return 'success';
  }

  if (status === 'failed' || status === 'cancelled') {
    return 'danger';
  }

  if (status === 'queued') {
    return 'warning';
  }

  return 'neutral';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
