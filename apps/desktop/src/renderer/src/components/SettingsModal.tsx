import { SectionHeader, StatusPill, SurfaceCard } from '@pigeonclaw/ui';
import { useEffect, useState } from 'react';

export function SettingsModal({
  isOpen,
  relayStatus,
  relayBaseUrl,
  deviceName,
  codexPath,
  globalConcurrency,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  relayStatus: string;
  relayBaseUrl?: string | null;
  deviceName?: string | null;
  codexPath: string;
  globalConcurrency: number;
  onClose: () => void;
  onSave: (payload: { codexPath?: string; globalConcurrency?: number }) => Promise<void>;
}) {
  const [draftCodexPath, setDraftCodexPath] = useState(codexPath);
  const [draftConcurrency, setDraftConcurrency] = useState(globalConcurrency);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDraftCodexPath(codexPath);
    setDraftConcurrency(globalConcurrency);
    setError(null);
  }, [codexPath, globalConcurrency, isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <button
        className="modal-scrim"
        type="button"
        aria-label="Close desktop settings"
        onClick={onClose}
      />
      <SurfaceCard className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-header">
          <SectionHeader
            title="Desktop settings"
            subtitle="Global runtime settings for this machine. They apply across projects and stay separate from project configuration."
            className="settings-modal-heading"
          />
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="settings-runtime-card">
          <div className="settings-summary-row">
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
            <span>This machine: {deviceName ?? 'Unpaired Mac'}</span>
          </div>

          <p>
            Use this modal for machine-wide runtime defaults such as the Codex binary, shared
            concurrency, and the paired relay endpoint.
          </p>
        </div>

        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);

            try {
              await onSave({
                codexPath: draftCodexPath,
                globalConcurrency: draftConcurrency,
              });
              onClose();
            } catch (saveError) {
              setError(
                saveError instanceof Error ? saveError.message : 'Failed to save desktop settings.',
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <SurfaceCard className="settings-section-card">
            <SectionHeader
              title="Runtime defaults"
              subtitle="These values shape how this Mac launches Codex across all projects."
            />

            <div className="settings-grid">
              <label className="field">
                <span>Codex path</span>
                <input
                  value={draftCodexPath}
                  onChange={(event) => setDraftCodexPath(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Global concurrency</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={draftConcurrency}
                  onChange={(event) => setDraftConcurrency(Number(event.target.value || 2))}
                />
              </label>
            </div>
          </SurfaceCard>

          <SurfaceCard className="settings-section-card">
            <SectionHeader
              title="Relay connection"
              subtitle="This paired endpoint is read-only here so it does not compete with project settings."
            />

            <div className="value-row value-row--stacked">
              <div>
                <span className="summary-label">Relay base URL</span>
                <code>{relayBaseUrl ?? 'Not paired yet'}</code>
              </div>
            </div>
          </SurfaceCard>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="settings-modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save desktop settings'}
            </button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}
