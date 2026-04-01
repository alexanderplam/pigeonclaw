import { useMemo, useState } from 'react';

import type { Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';
import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';

import { buildTimelineItems, formatDateTime, formatRelativeTime } from './runtime-utils.js';

type ActivityFilter = 'all' | 'events' | 'runs' | 'failures';

export function HistoryView({
  project,
  incidents,
  runs,
  onOpenWebhook,
}: {
  project: ProjectSnapshot | null;
  incidents: Incident[];
  runs: RunUpdate[];
  onOpenWebhook: () => void;
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const activityItems = useMemo(() => {
    const normalized = buildTimelineItems({ project, incidents, runs });

    if (filter === 'all') {
      return normalized;
    }

    if (filter === 'events') {
      return normalized.filter((item) => item.category === 'event');
    }

    if (filter === 'runs') {
      return normalized.filter((item) => item.category === 'run');
    }

    return normalized.filter((item) => item.tone === 'danger');
  }, [filter, incidents, project, runs]);

  return (
    <SurfaceCard className="activity-panel">
      <div className="activity-header">
        <SectionHeader
          title="Activity timeline"
          subtitle="A live stream of intake, dedupe, incident creation, and local Codex outcomes."
        />

        <div className="activity-filters" role="tablist" aria-label="Activity filters">
          {(
            [
              ['all', 'All'],
              ['events', 'Events'],
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

      <div className="timeline">
        {activityItems.map((item) => (
          <article key={item.id} className="timeline-item">
            <div className="timeline-rail">
              <span className={`timeline-dot timeline-dot--${item.tone}`} aria-hidden="true" />
            </div>

            <div className="timeline-card">
              <div className="timeline-topline">
                <div className="timeline-title">
                  <span className="summary-label">{item.label}</span>
                  <strong>{item.title}</strong>
                </div>
                <StatusPill tone={item.tone}>{item.category}</StatusPill>
              </div>

              <p>{item.body}</p>

              <small>
                {formatDateTime(item.timestamp)} • {formatRelativeTime(item.timestamp)} •{' '}
                {item.meta}
              </small>
            </div>
          </article>
        ))}

        {activityItems.length === 0 ? (
          <div className="empty-state empty-state-large timeline-empty">
            <strong>No runtime activity yet</strong>
            <p>
              Send a test event to watch the timeline fill in from webhook intake through local
              agent outcomes.
            </p>
            <div className="inline-actions">
              <button className="primary-button" type="button" onClick={onOpenWebhook}>
                Send test event
              </button>
              <button className="ghost-button" type="button" onClick={onOpenWebhook}>
                Go to Webhook tab
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
