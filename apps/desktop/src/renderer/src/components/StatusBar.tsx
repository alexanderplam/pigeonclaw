import { StatusPill } from '@pigeonclaw/ui';

export function StatusBar({
  relayStatus,
  projectName,
  repoPath,
  runtimeReady,
}: {
  relayStatus: string;
  projectName?: string | null;
  repoPath?: string | null;
  runtimeReady: boolean;
}) {
  return (
    <header className="status-bar">
      <div className="toolbar-project">
        <span className="toolbar-kicker">Current project</span>
        <div className="toolbar-title-row">
          <h1>{projectName ?? 'No project selected'}</h1>
          <StatusPill
            tone={
              relayStatus === 'connected'
                ? 'success'
                : relayStatus === 'error'
                  ? 'danger'
                  : 'warning'
            }
          >
            Relay {relayStatus}
          </StatusPill>
        </div>
        <p>{repoPath ?? 'Choose a local repository to open a project runtime.'}</p>
      </div>

      <div className="toolbar-meta">
        {runtimeReady ? <span className="runtime-ready-indicator">Runtime ready</span> : null}
      </div>
    </header>
  );
}
