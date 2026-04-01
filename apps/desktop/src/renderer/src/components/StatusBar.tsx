import { StatusPill } from '@pigeonclaw/ui';

export function StatusBar({
  relayStatus,
  deviceName,
  projectName,
  repoPath,
  onOpenSettings,
}: {
  relayStatus: string;
  deviceName?: string | null;
  projectName?: string | null;
  repoPath?: string | null;
  onOpenSettings: () => void;
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
        <p>{repoPath ?? 'Choose a local repository to create a project and issue a webhook.'}</p>
      </div>

      <div className="toolbar-meta">
        <div className="toolbar-device">
          <span className="toolbar-device-label">Device</span>
          <strong>{deviceName ?? 'Unpaired Mac'}</strong>
        </div>
        <button
          className="ghost-button toolbar-settings-button"
          type="button"
          onClick={onOpenSettings}
        >
          Settings
        </button>
      </div>
    </header>
  );
}
