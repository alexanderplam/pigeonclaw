import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function secretPreview(value: string): string {
  return value.slice(-4).padStart(8, '•');
}

export function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifySignature(
  secret: string,
  payload: string,
  providedSignature: string,
): boolean {
  const expected = signPayload(secret, payload);
  const left = Buffer.from(expected);
  const right = Buffer.from(providedSignature.trim().replace(/^sha256=/, ''));

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
