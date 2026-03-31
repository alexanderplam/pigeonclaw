import { createHash } from 'node:crypto';

import type { DesktopProjectSettings } from './contracts.js';

type JsonLike = Record<string, unknown>;

export function getValueAtPath(input: JsonLike, rawPath: string): unknown {
  const path = rawPath.replace(/\[(\d+)\]/g, '.$1');
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }

      return (current as Record<string, unknown>)[key];
    }, input);
}

export function normalizeFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFingerprintValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, [key, entryValue]) => {
        accumulator[key] = normalizeFingerprintValue(entryValue);
        return accumulator;
      }, {});
  }

  if (typeof value === 'string') {
    return value.trim().replace(/\s+/g, ' ');
  }

  return value ?? null;
}

export function buildFingerprintPayload(
  payload: JsonLike,
  project: Pick<DesktopProjectSettings, 'projectId'> & {
    fingerprintFields?: Array<{ path: string; label?: string }>;
  },
): Record<string, unknown> {
  const selectedFields = project.fingerprintFields ?? [];
  return selectedFields.reduce<Record<string, unknown>>((accumulator, field) => {
    const key = field.label ?? field.path;
    accumulator[key] = normalizeFingerprintValue(getValueAtPath(payload, field.path));
    return accumulator;
  }, {});
}

export function fingerprintEvent(
  projectId: string,
  payload: JsonLike,
  fields: Array<{ path: string; label?: string }>,
): string {
  const selected = fields.reduce<Record<string, unknown>>((accumulator, field) => {
    const key = field.label ?? field.path;
    accumulator[key] = normalizeFingerprintValue(getValueAtPath(payload, field.path));
    return accumulator;
  }, {});

  return createHash('sha256').update(JSON.stringify({ projectId, selected })).digest('hex');
}

export function summarizePayload(payload: JsonLike, limit = 360): string {
  const json = JSON.stringify(normalizeFingerprintValue(payload));
  return json.length > limit ? `${json.slice(0, limit - 1)}…` : json;
}
