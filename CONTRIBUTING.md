# Contributing

## Setup

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

## Working agreements

- Keep source-agnostic webhook handling generic.
- Put shared contracts in `packages/shared` before wiring app-specific behavior.
- Prefer small, composable services with narrow responsibilities.
- Do not move secrets or full Codex transcripts into the relay unless the change explicitly requires it.
- Update docs and tests when touching auth, dedupe, or queueing behavior.

## Pull requests

- Explain user-visible behavior changes.
- Call out security-sensitive changes clearly.
- Include screenshots for desktop UI changes.
- Add or update tests for relay logic and desktop state transitions.
