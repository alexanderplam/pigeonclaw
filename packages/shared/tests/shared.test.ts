import { describe, expect, it } from 'vitest';

import {
  buildCodexPrompt,
  coerceFingerprintFields,
  fingerprintEvent,
  renderPromptTemplate,
  signPayload,
  verifySignature,
} from '../src/index.js';

describe('fingerprintEvent', () => {
  it('normalizes whitespace and stable object ordering', () => {
    const first = fingerprintEvent(
      'project-1',
      {
        error: {
          message: 'Database   unavailable',
          metadata: { code: 'E_CONN', stage: 'prod' },
        },
      },
      [{ path: 'error' }],
    );

    const second = fingerprintEvent(
      'project-1',
      {
        error: {
          metadata: { stage: 'prod', code: 'E_CONN' },
          message: 'Database unavailable',
        },
      },
      [{ path: 'error' }],
    );

    expect(first).toBe(second);
  });

  it('accepts a legacy single-field object shape', () => {
    const payload = {
      error: {
        message: 'Queue timeout',
      },
    };

    const fingerprint = fingerprintEvent('project-1', payload, {
      path: 'error.message',
    } as unknown as Array<{ path: string; label?: string }>);

    const expected = fingerprintEvent('project-1', payload, [{ path: 'error.message' }]);
    expect(fingerprint).toBe(expected);
  });

  it('falls back to the whole payload when fields are unusable', () => {
    const payload = {
      error: {
        code: 'E_CONN',
        message: 'Database unavailable',
      },
    };

    const fingerprint = fingerprintEvent('project-1', payload, [] as Array<{ path: string }>);
    const expected = fingerprintEvent('project-1', payload, [{ path: '$', label: 'Whole event' }]);

    expect(fingerprint).toBe(expected);
  });
});

describe('coerceFingerprintFields', () => {
  it('wraps a single stored object into an array', () => {
    expect(coerceFingerprintFields({ path: 'error.message' })).toEqual([{ path: 'error.message' }]);
  });
});

describe('prompt rendering', () => {
  it('replaces nested placeholders', () => {
    const output = renderPromptTemplate('Problem: {{event.error.message}} for {{project.name}}', {
      event: {
        error: {
          message: 'Queue timeout',
        },
      },
      incident: {
        id: 'incident-1',
        fingerprint: 'abc',
        duplicateCount: 2,
      },
      project: {
        id: 'project-1',
        name: 'Worker API',
        repoPath: '/tmp/worker-api',
        rules: [],
      },
    });

    expect(output).toContain('Queue timeout');
    expect(output).toContain('Worker API');
  });

  it('builds a final Codex prompt with rules', () => {
    const prompt = buildCodexPrompt({
      basePrompt: 'Investigate carefully.',
      eventPromptTemplate: 'Event: {{event.type}}',
      event: { type: 'incident.created' },
      incidentId: 'incident-1',
      fingerprint: 'fingerprint-1',
      duplicateCount: 1,
      projectId: 'project-1',
      projectName: 'Relay',
      repoPath: '/tmp/relay',
      rules: ['Do not create broad refactors.'],
    });

    expect(prompt).toContain('Investigate carefully.');
    expect(prompt).toContain('Do not create broad refactors.');
    expect(prompt).toContain('incident.created');
  });
});

describe('webhook signatures', () => {
  it('verifies HMAC signatures', () => {
    const payload = JSON.stringify({ hello: 'world' });
    const secret = 'top-secret-token';
    const signature = signPayload(secret, payload);

    expect(verifySignature(secret, payload, signature)).toBe(true);
    expect(verifySignature(secret, payload, 'sha256=wrong')).toBe(false);
  });
});
