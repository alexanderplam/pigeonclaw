# Architecture

## Hosted relay

The relay is intentionally small:

- receives public webhook events
- authenticates generic sources
- computes source-agnostic idempotency fingerprints
- creates or updates incidents
- delivers jobs to desktop devices over outbound WebSocket sessions

## Desktop app

The desktop app owns:

- local repository selection
- prompt templates and Codex instructions
- Codex execution and local logs
- active-run scheduling and concurrency limits

## Trust boundaries

- The relay never needs direct filesystem access to repositories.
- The desktop never needs to expose an inbound port to the public internet.
- Device tokens are scoped to one desktop instance.
- Device tokens are stored hashed; webhook credentials are encrypted at rest in the relay.
