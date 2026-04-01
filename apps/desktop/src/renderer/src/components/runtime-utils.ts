import type { Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

export type TimelineItem = {
  id: string;
  category: 'event' | 'run';
  eventType:
    | 'webhook.received'
    | 'incident.opened'
    | 'duplicate.suppressed'
    | 'run.queued'
    | 'run.started'
    | 'run.finished'
    | 'run.failed'
    | 'run.skipped';
  timestamp: string;
  label: string;
  title: string;
  body: string;
  meta: string;
  tone: Tone;
};

export function getRuntimeStatus(relayStatus: string, enabled: boolean) {
  if (relayStatus === 'error') {
    return {
      label: 'Error',
      tone: 'danger' as const,
      description: 'Relay connection needs attention before new events can flow reliably.',
    };
  }

  if (!enabled || relayStatus !== 'connected') {
    return {
      label: 'Offline',
      tone: 'warning' as const,
      description: enabled
        ? 'Waiting for the relay connection before live intake resumes.'
        : 'Project intake is paused for this repository.',
    };
  }

  return {
    label: 'Listening',
    tone: 'success' as const,
    description: 'Webhook intake is live and new incidents can trigger local agent work.',
  };
}

export function getExecutionModeLabel(
  mode: ProjectSnapshot['executionMode'],
  variant: 'short' | 'long' = 'long',
) {
  if (mode === 'ask') {
    return variant === 'short' ? 'Ask' : 'Ask before running';
  }

  if (mode === 'log') {
    return variant === 'short' ? 'Off' : 'Log only';
  }

  return variant === 'short' ? 'Auto' : 'Run automatically';
}

export function getExecutionModeDescription(mode: ProjectSnapshot['executionMode']) {
  if (mode === 'ask') {
    return 'Capture the incident and leave the run visible in a waiting approval state.';
  }

  if (mode === 'log') {
    return 'Record incidents without launching Codex so the runtime stays visible but inactive.';
  }

  return 'Start Codex immediately whenever a new incident is opened for this project.';
}

export function getRunTone(status: RunUpdate['status']): Tone {
  if (status === 'succeeded') {
    return 'success';
  }

  if (status === 'failed') {
    return 'danger';
  }

  if (status === 'queued') {
    return 'warning';
  }

  return 'neutral';
}

export function getRunStatusLabel(
  run: RunUpdate | null,
  project: ProjectSnapshot | null,
  variant: 'short' | 'long' = 'long',
) {
  if (!run) {
    return project?.executionMode === 'log'
      ? variant === 'short'
        ? 'Off'
        : 'Logging only'
      : 'No runs yet';
  }

  if (run.status === 'queued') {
    return variant === 'short' ? 'Waiting approval' : 'Waiting for approval';
  }

  if (run.status === 'running') {
    return variant === 'short' ? 'Running' : 'Running now';
  }

  if (run.status === 'cancelled') {
    return variant === 'short' ? 'Off' : 'Execution skipped';
  }

  if (run.status === 'failed') {
    return variant === 'short' ? 'Failed' : 'Run failed';
  }

  return variant === 'short' ? 'Success' : 'Run succeeded';
}

export function buildTimelineItems({
  project,
  incidents,
  runs,
}: {
  project: ProjectSnapshot | null;
  incidents: Incident[];
  runs: RunUpdate[];
}) {
  const scopedIncidents = project
    ? incidents.filter((incident) => incident.projectId === project.projectId)
    : incidents;
  const scopedRuns = project ? runs.filter((run) => run.projectId === project.projectId) : runs;

  const items: TimelineItem[] = [];

  for (const incident of scopedIncidents) {
    items.push({
      id: `${incident.id}:received`,
      category: 'event',
      eventType: 'webhook.received',
      timestamp: incident.firstSeenAt,
      label: 'webhook.received',
      title: 'Webhook received',
      body: incident.latestPayloadPreview,
      meta: `Incident ${shortId(incident.id)} • Source webhook`,
      tone: 'neutral',
    });

    items.push({
      id: `${incident.id}:opened`,
      category: 'event',
      eventType: 'incident.opened',
      timestamp: incident.firstSeenAt,
      label: 'incident.opened',
      title: 'Incident opened',
      body: `${shortId(incident.fingerprint)} fingerprint created for this event stream.`,
      meta: incident.status === 'failed' ? 'Needs attention' : 'Ready for runtime handling',
      tone: incident.status === 'failed' ? 'danger' : 'warning',
    });

    if (incident.duplicateCount > 0) {
      items.push({
        id: `${incident.id}:dedupe`,
        category: 'event',
        eventType: 'duplicate.suppressed',
        timestamp: incident.lastSeenAt,
        label: 'duplicate.suppressed',
        title: 'Duplicate suppressed',
        body: `${incident.duplicateCount} matching event${incident.duplicateCount === 1 ? '' : 's'} merged into the active incident.`,
        meta: 'Cooldown and fingerprint rules prevented a noisy re-run.',
        tone: 'warning',
      });
    }
  }

  for (const run of scopedRuns) {
    const statusMeta =
      run.exitCode !== undefined ? `Exit code ${run.exitCode}` : `Run ${shortId(run.runId)}`;

    if (run.status === 'queued') {
      items.push({
        id: `${run.runId}:queued`,
        category: 'run',
        eventType: 'run.queued',
        timestamp: run.updatedAt,
        label: 'run.queued',
        title: 'Run waiting for approval',
        body: run.summary ?? 'The runtime captured the incident and is holding the run.',
        meta: statusMeta,
        tone: 'warning',
      });
      continue;
    }

    if (run.status === 'running') {
      items.push({
        id: `${run.runId}:running`,
        category: 'run',
        eventType: 'run.started',
        timestamp: run.updatedAt,
        label: 'codex.run.started',
        title: 'Codex run started',
        body: run.summary ?? 'Codex is actively working through the incident.',
        meta: statusMeta,
        tone: 'neutral',
      });
      continue;
    }

    if (run.status === 'cancelled') {
      items.push({
        id: `${run.runId}:skipped`,
        category: 'run',
        eventType: 'run.skipped',
        timestamp: run.updatedAt,
        label: 'run.skipped',
        title: 'Execution skipped',
        body: run.summary ?? 'The runtime recorded the incident without launching Codex.',
        meta: statusMeta,
        tone: 'neutral',
      });
      continue;
    }

    if (run.status === 'failed') {
      items.push({
        id: `${run.runId}:failed`,
        category: 'run',
        eventType: 'run.failed',
        timestamp: run.updatedAt,
        label: 'run.failed',
        title: 'Run failed',
        body: run.summary ?? 'Codex exited before finishing the incident.',
        meta: statusMeta,
        tone: 'danger',
      });
      continue;
    }

    items.push({
      id: `${run.runId}:finished`,
      category: 'run',
      eventType: 'run.finished',
      timestamp: run.updatedAt,
      label: 'run.finished',
      title: 'Run finished',
      body: run.summary ?? 'Codex completed the incident.',
      meta: statusMeta,
      tone: 'success',
    });
  }

  return items.sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatRelativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const seconds = Math.round(delta / 1_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (Math.abs(seconds) < 60) {
    return formatter.format(-seconds, 'second');
  }

  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return formatter.format(-minutes, 'minute');
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(-hours, 'hour');
  }

  const days = Math.round(hours / 24);
  return formatter.format(-days, 'day');
}

function shortId(value: string) {
  return value.slice(0, 8);
}
