const STORAGE_PREFIX = 'sb_e2e_key:';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function importAesKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyB64.trim());
  if (raw.byteLength !== 32) {
    throw new Error('Workspace key must be a 256-bit base64url key');
  }
  return crypto.subtle.importKey('raw', raw as unknown as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function generateWorkspaceKey(): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(raw);
}

export async function computeKeyId(keyB64: string): Promise<string> {
  const raw = fromBase64Url(keyB64.trim());
  const digest = await crypto.subtle.digest('SHA-256', raw as unknown as BufferSource);
  return toBase64Url(new Uint8Array(digest).slice(0, 6));
}

export function getStoredWorkspaceKey(workspace: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${workspace}`);
  } catch {
    return null;
  }
}

export function setStoredWorkspaceKey(workspace: string, keyB64: string): void {
  localStorage.setItem(`${STORAGE_PREFIX}${workspace}`, keyB64.trim());
}

export function clearStoredWorkspaceKey(workspace: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${workspace}`);
}

export async function encryptNote(
  keyB64: string,
  workspace: string,
  contact: string,
  plaintext: string
): Promise<{ ciphertext: string; iv: string; alg: string; keyId: string }> {
  const key = await importAesKey(keyB64);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const aad = enc.encode(`${workspace}:${contact}`);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource, additionalData: aad as unknown as BufferSource },
    key,
    enc.encode(plaintext) as unknown as BufferSource
  );
  const keyId = await computeKeyId(keyB64);
  return {
    ciphertext: toBase64Url(new Uint8Array(encrypted)),
    iv: toBase64Url(ivBytes),
    alg: 'AES-256-GCM',
    keyId,
  };
}

export async function decryptNote(
  keyB64: string,
  workspace: string,
  contact: string,
  ciphertext: string,
  iv: string
): Promise<string> {
  const key = await importAesKey(keyB64);
  const enc = new TextEncoder();
  const aad = enc.encode(`${workspace}:${contact}`);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(iv) as unknown as BufferSource,
      additionalData: aad as unknown as BufferSource,
    },
    key,
    fromBase64Url(ciphertext) as unknown as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}
