# Security Policy

## Supported versions

PigeonClaw is pre-1.0. Security fixes land on the latest `main` branch first. Releases should be cut from the latest secure commit rather than backporting to old tags.

## Reporting a vulnerability

Please do not open a public GitHub issue for a suspected vulnerability.

- Email the maintainers with a minimal reproduction, affected commit or tag, and impact summary.
- If email is not available, open a private security advisory on GitHub.
- Expect an acknowledgment within 72 hours.

## Security principles

- Treat all webhook payloads as hostile input.
- Keep ingress generic: never trust provider-specific semantics unless configured explicitly.
- Verify HMAC signatures when a webhook secret is configured.
- Use constant-time comparison for secrets and signatures.
- Store device tokens as hashes, and encrypt webhook tokens and signing secrets at rest with a relay master key.
- Keep Codex execution local and sandboxed by default.
- Preserve full run logs on the desktop, not the relay.
- Make duplicate suppression a server-side invariant, not a UI convention.

## Secure operations checklist

- Rotate `RELAY_BOOTSTRAP_TOKEN` after the first device is registered.
- Protect and rotate `RELAY_ENCRYPTION_KEY` like any other production secret.
- Rotate webhook secrets when a source is reconfigured.
- Keep the relay and desktop dependencies current.
- Require TLS at the edge. Render-managed TLS is sufficient for MVP.
- Review queued incidents and run summaries for unexpected prompt injection patterns.
- Keep database backups enabled in production.
