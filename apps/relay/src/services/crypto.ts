import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function compareHash(raw: string, hashed: string): boolean {
  const left = Buffer.from(hashValue(raw));
  const right = Buffer.from(hashed);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function generateOpaqueToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

function deriveKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(secret: string, encryptionKey: string): string {
  const iv = randomBytes(12);
  const key = deriveKey(encryptionKey);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((entry) => entry.toString('base64url')).join('.');
}

export function decryptSecret(ciphertext: string, encryptionKey: string): string {
  const [ivSegment, tagSegment, encryptedSegment] = ciphertext.split('.');
  const iv = Buffer.from(ivSegment, 'base64url');
  const tag = Buffer.from(tagSegment, 'base64url');
  const encrypted = Buffer.from(encryptedSegment, 'base64url');
  const key = deriveKey(encryptionKey);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const value = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return value.toString('utf8');
}
