# PigeonClaw

PigeonClaw is a source-agnostic event-to-Codex bridge. A tiny hosted relay receives public webhooks, deduplicates incidents, and forwards actionable jobs to a local macOS desktop app that runs `codex exec` inside the right repository.

## Why this exists

Codex automations are great for scheduled work, but there is no first-party event trigger for things like:

- an error spike reported by any hosted platform
- a customer-impacting incident emitted by internal tooling
- a CI system, queue worker, or cron job that needs immediate triage

PigeonClaw keeps the internet-facing surface thin while preserving the local repo access that Codex needs to be effective.

## Monorepo layout

```text
apps/
  desktop/   Electron macOS desktop app
  relay/     Render-hosted Fastify relay
packages/
  shared/    Shared zod contracts, fingerprinting, and prompt helpers
  ui/        Shared desktop design tokens and UI primitives
docs/        Architecture and operational docs
```

## Security posture

- Public webhooks are source-agnostic and use random route tokens plus optional HMAC verification.
- Relay bootstrap is protected by a one-time admin secret.
- Desktop devices receive scoped bearer tokens and maintain outbound-only WebSocket connections.
- Idempotency is enforced in the relay before work reaches a desktop.
- Full Codex logs remain local by default; the relay stores only operational summaries.

See [SECURITY.md](./SECURITY.md) for the full policy.

## Quick start

1. Install dependencies:

   ```bash
   corepack enable
   pnpm install
   ```

2. Configure the relay environment:

   ```bash
   cp apps/relay/.env.example apps/relay/.env
   ```

3. Start the relay:

   ```bash
   pnpm dev:relay
   ```

4. Start the desktop app:

   ```bash
   pnpm dev:desktop
   ```

   The desktop command automatically prepares Electron native dependencies the first time it runs, and again whenever the Electron version or machine architecture changes.

## Render deployment

`render.yaml` defines the production relay and its Postgres database. The relay is designed for a single Render web service plus one Postgres instance.

Required relay secrets:

- `RELAY_BOOTSTRAP_TOKEN`: one-time admin bootstrap secret for pairing the first desktop
- `RELAY_ENCRYPTION_KEY`: master key used to encrypt webhook tokens and signing secrets at rest
- `DATABASE_URL`: Postgres connection string

## Open-source maintenance

- Security updates are tracked through Dependabot and CodeQL.
- The repo keeps app boundaries explicit so contributors and coding agents can work safely.
- Shared contracts live in one place to reduce drift between the desktop and relay.

## License

MIT
