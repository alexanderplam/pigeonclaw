import { useMemo, useState } from 'react';

import type { Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';
import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';

type ActivityFilter = 'all' | 'incidents' | 'runs' | 'failures';

type ActivityItem =
  | {
      id: string;
      kind: 'incident';
      status: Incident['status'];
      timestamp: string;
      title: string;
      body: string;
      meta: string;
    }
  | {
      id: string;
      kind: 'run';
      status: RunUpdate['status'];
      timestamp: string;
      title: string;
      body: string;
      meta: string;
    };

export function HistoryView({
  project,
  incidents,
  runs,
}: {
  project: ProjectSnapshot | null;
  incidents: Incident[];
  runs: RunUpdate[];
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const activityItems = useMemo(() => {
    const scopedIncidents = project
      ? incidents.filter((incident) => incident.projectId === project.projectId)
      : incidents;
    const scopedRuns = project ? runs.filter((run) => run.projectId === project.projectId) : runs;

    const normalized: ActivityItem[] = [
      ...scopedIncidents.map((incident) => ({
        id: incident.id,
        kind: 'incident' as const,
        status: incident.status,
        timestamp: incident.lastSeenAt,
        title: `Incident ${incident.id.slice(0, 8)}`,
        body: incident.latestPayloadPreview,
        meta: `${incident.duplicateCount} duplicate${incident.duplicateCount === 1 ? '' : 's'}`,
      })),
      ...scopedRuns.map((run) => ({
        id: run.runId,
        kind: 'run' as const,
        status: run.status,
        timestamp: run.updatedAt,
        title: `Run ${run.runId.slice(0, 8)}`,
        body: run.summary ?? 'Codex is still working on this run.',
        meta: run.exitCode !== undefined ? `Exit code ${run.exitCode}` : 'Execution in progress',
      })),
    ].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );

    if (filter === 'all') {
      return normalized;
    }

    if (filter === 'incidents') {
      return normalized.filter((item) => item.kind === 'incident');
    }

    if (filter === 'runs') {
      return normalized.filter((item) => item.kind === 'run');
    }

    return normalized.filter((item) => item.status === 'failed' || item.status === 'cancelled');
  }, [filter, incidents, project, runs]);

  return (
    <SurfaceCard className="activity-panel">
      <div className="activity-header">
        <SectionHeader
          title="Activity"
          subtitle="One timeline for webhook incidents and local Codex runs."
        />

        <div className="activity-filters" role="tablist" aria-label="Activity filters">
          {(
            [
              ['all', 'All'],
              ['incidents', 'Incidents'],
              ['runs', 'Runs'],
              ['failures', 'Failures'],
            ] satisfies Array<[ActivityFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'filter-chip is-active' : 'filter-chip'}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="activity-list">
        {activityItems.map((item) => (
          <article key={`${item.kind}-${item.id}`} className="activity-item">
            <div className="activity-item-topline">
              <div className="activity-item-title">
                <span className="activity-kind">{item.kind}</span>
                <strong>{item.title}</strong>
              </div>
              <StatusPill tone={statusTone(item.status)}>{item.status}</StatusPill>
            </div>

            <p>{item.body}</p>

            <small>
              {formatDate(item.timestamp)} • {item.meta}
            </small>
          </article>
        ))}

        {activityItems.length === 0 ? (
          <div className="empty-state empty-state-large">
            <strong>No activity yet</strong>
            <p>
              Incoming webhook events and local Codex runs will appear here as a single timeline.
            </p>
          </div>
        ) : null}
      </div>
    </SurfaceCard>
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
