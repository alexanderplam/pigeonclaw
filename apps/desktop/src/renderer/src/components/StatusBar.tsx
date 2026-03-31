import { StatusPill, SurfaceCard } from '@pigeonclaw/ui';

export function StatusBar({
  relayStatus,
  deviceName,
  codexPath,
  globalConcurrency,
  onSaveSettings,
}: {
  relayStatus: string;
  deviceName?: string | null;
  codexPath: string;
  globalConcurrency: number;
  onSaveSettings: (payload: { codexPath?: string; globalConcurrency?: number }) => Promise<void>;
}) {
  return (
    <SurfaceCard className="status-bar">
      <div className="status-cluster">
        <StatusPill
          tone={
            relayStatus === 'connected' ? 'success' : relayStatus === 'error' ? 'danger' : 'warning'
          }
        >
          Relay {relayStatus}
        </StatusPill>
        <span>{deviceName ?? 'Unpaired Mac'}</span>
      </div>

      <div className="status-settings">
        <label className="inline-field">
          <span>Codex path</span>
          <input
            defaultValue={codexPath}
            onBlur={(event) => void onSaveSettings({ codexPath: event.target.value })}
          />
        </label>

        <label className="inline-field small">
          <span>Global concurrency</span>
          <input
            type="number"
            min={1}
            max={8}
            defaultValue={globalConcurrency}
            onBlur={(event) =>
              void onSaveSettings({ globalConcurrency: Number(event.target.value || 2) })
            }
          />
        </label>
      </div>
    </SurfaceCard>
  );
}
