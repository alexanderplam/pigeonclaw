import { createHash } from 'node:crypto';

import type { DesktopProjectSettings, FingerprintField } from './contracts.js';

type JsonLike = Record<string, unknown>;
const rootFingerprintField: FingerprintField = { path: '$', label: 'Whole event' };

export function getValueAtPath(input: JsonLike, rawPath: string): unknown {
  if (rawPath.trim() === '$') {
    return input;
  }

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

export function coerceFingerprintFields(fields: unknown): FingerprintField[] {
  const normalized = normalizeFingerprintFields(fields);
  return normalized.length > 0 ? normalized : [rootFingerprintField];
}

export function buildFingerprintPayload(
  payload: JsonLike,
  project: Pick<DesktopProjectSettings, 'projectId'> & {
    fingerprintFields?: unknown;
  },
): Record<string, unknown> {
  const selectedFields = coerceFingerprintFields(project.fingerprintFields);
  return selectedFields.reduce<Record<string, unknown>>((accumulator, field) => {
    const key = field.label ?? field.path;
    accumulator[key] = normalizeFingerprintValue(getValueAtPath(payload, field.path));
    return accumulator;
  }, {});
}

export function fingerprintEvent(projectId: string, payload: JsonLike, fields: unknown): string {
  const selected = coerceFingerprintFields(fields).reduce<Record<string, unknown>>(
    (accumulator, field) => {
      const key = field.label ?? field.path;
      accumulator[key] = normalizeFingerprintValue(getValueAtPath(payload, field.path));
      return accumulator;
    },
    {},
  );

  return createHash('sha256').update(JSON.stringify({ projectId, selected })).digest('hex');
}

function normalizeFingerprintFields(fields: unknown): FingerprintField[] {
  if (Array.isArray(fields)) {
    return fields.flatMap((field) => {
      const normalized = normalizeFingerprintField(field);
      return normalized ? [normalized] : [];
    });
  }

  if (typeof fields === 'string') {
    return fields
      .split(/[\n,]/)
      .map((path) => normalizeFingerprintField(path))
      .filter((field): field is FingerprintField => field !== null);
  }

  const normalized = normalizeFingerprintField(fields);
  return normalized ? [normalized] : [];
}

function normalizeFingerprintField(field: unknown): FingerprintField | null {
  if (typeof field === 'string') {
    const path = field.trim();
    return path ? { path } : null;
  }

  if (!field || typeof field !== 'object') {
    return null;
  }

  const path =
    typeof (field as { path?: unknown }).path === 'string'
      ? (field as { path: string }).path.trim()
      : '';
  if (!path) {
    return null;
  }

  const rawLabel = (field as { label?: unknown }).label;
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';

  return label ? { path, label } : { path };
}

export function summarizePayload(payload: JsonLike, limit = 360): string {
  const json = JSON.stringify(normalizeFingerprintValue(payload));
  return json.length > limit ? `${json.slice(0, limit - 1)}…` : json;
}
