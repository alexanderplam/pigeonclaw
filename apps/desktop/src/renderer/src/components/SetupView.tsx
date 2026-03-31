import { useState } from 'react';

import { SectionHeader, SurfaceCard } from '@pigeonclaw/ui';

export function SetupView({
  onPair,
  defaultDeviceName,
  errorMessage,
}: {
  onPair: (payload: {
    relayBaseUrl: string;
    bootstrapToken: string;
    deviceName: string;
  }) => Promise<void>;
  defaultDeviceName: string;
  errorMessage?: string | null;
}) {
  const [relayBaseUrl, setRelayBaseUrl] = useState('http://localhost:3001');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="setup-shell">
      <div className="window-drag-region" aria-hidden="true" />
      <div className="setup-hero">
        <span className="setup-kicker">PigeonClaw Relay Pairing</span>
        <h1>Connect this Mac to your hosted webhook relay.</h1>
        <p>
          The desktop app stays local. The relay receives public events, deduplicates them, and
          forwards secure jobs here for Codex execution.
        </p>
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      </div>

      <SurfaceCard className="setup-card">
        <SectionHeader
          title="First device setup"
          subtitle="Use the Render relay URL and bootstrap token from your deployment."
        />

        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);

            try {
              await onPair({ relayBaseUrl, bootstrapToken, deviceName });
            } catch (pairError) {
              setError(
                pairError instanceof Error ? pairError.message : 'Failed to pair with relay.',
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <label className="field">
            <span>Relay base URL</span>
            <input value={relayBaseUrl} onChange={(event) => setRelayBaseUrl(event.target.value)} />
          </label>

          <label className="field">
            <span>Bootstrap token</span>
            <input
              type="password"
              value={bootstrapToken}
              onChange={(event) => setBootstrapToken(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Device name</span>
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Pairing…' : 'Pair This Mac'}
          </button>
        </form>
      </SurfaceCard>
    </div>
  );
}
