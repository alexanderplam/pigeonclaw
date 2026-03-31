# Agent Guide

## Repo map

- `apps/desktop`: Electron main process, preload bridge, renderer UI, local SQLite, Codex runner
- `apps/relay`: Fastify API, Postgres access, public webhooks, device delivery
- `packages/shared`: shared contracts, fingerprinting, prompt rendering
- `packages/ui`: shared tokens and React primitives for the desktop app

## Rules of engagement

- Start from shared contracts when changing relay-desktop communication.
- Keep webhook handling source-agnostic. Avoid hardcoding vendor assumptions in shared logic.
- Preserve the relay/desktop trust boundary.
- Security-sensitive files: `apps/relay/src/routes/hooks.ts`, `apps/relay/src/services`, `apps/desktop/src/main/services`
- Prefer adding new services over growing giant modules.

## Verification targets

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
