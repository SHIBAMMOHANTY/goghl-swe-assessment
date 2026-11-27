import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as cryptoVerify,
  type JsonWebKey,
} from 'node:crypto';
import type { Request } from 'express';
import type { Db } from 'mongodb';
import { config } from '../config.js';
import {
  COLLECTIONS,
  ensureIndexes,
  type OAuthStateDoc,
  type SessionDoc,
  type WorkspaceMembership,
} from '../store/schema.js';

export const SESSION_COOKIE_NAME = 'sb_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 30 * 60 * 1000;

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
}

let cachedDiscovery: { issuer: string; doc: OidcDiscovery; fetchedAt: number } | null = null;
let cachedJwks: { uri: string; keys: Array<JsonWebKey & { kid?: string }>; fetchedAt: number } | null =
  null;

export async function getOidcDiscovery(
  issuer: string,
  fetchImpl: typeof fetch = fetch
): Promise<OidcDiscovery> {
  const cleanIssuer = issuer.replace(/\/$/, '');
  if (
    cachedDiscovery &&
    cachedDiscovery.issuer === cleanIssuer &&
    Date.now() - cachedDiscovery.fetchedAt < 60_000
  ) {
    return cachedDiscovery.doc;
  }

  const res = await fetchImpl(`${cleanIssuer}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed with ${res.status}`);
  }
  const doc = (await res.json()) as OidcDiscovery;
  cachedDiscovery = { issuer: cleanIssuer, doc, fetchedAt: Date.now() };
  return doc;
}

async function getJwks(
  jwksUri: string,
  forceRefresh: boolean,
  fetchImpl: typeof fetch = fetch
): Promise<Array<JsonWebKey & { kid?: string }>> {
  if (
    !forceRefresh &&
    cachedJwks &&
    cachedJwks.uri === jwksUri &&
    Date.now() - cachedJwks.fetchedAt < 60_000
  ) {
    return cachedJwks.keys;
  }

  const res = await fetchImpl(jwksUri, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error(`JWKS fetch failed with ${res.status}`);
  }
  const body = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cachedJwks = { uri: jwksUri, keys, fetchedAt: Date.now() };
  return keys;
}

export interface IdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  nonce?: string;
  name?: string;
  email?: string;
  workspaces?: WorkspaceMembership[];
}

export async function verifyIdToken(
  idToken: string,
  opts: {
    jwksUri: string;
    issuer: string;
    clientId: string;
    nonce?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<IdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed id_token JWT');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported id_token alg: ${header.alg}`);
  }

  let keys = await getJwks(opts.jwksUri, false, opts.fetchImpl);
  let jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) {
    keys = await getJwks(opts.jwksUri, true, opts.fetchImpl);
    jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  }
  if (!jwk) {
    throw new Error('Matching JWK not found');
  }

  const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
  const ok = cryptoVerify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
    publicKey,
    Buffer.from(sigB64, 'base64url')
  );
  if (!ok) {
    throw new Error('Invalid id_token signature');
  }

  const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as IdTokenClaims;
  const expectedIssuer = opts.issuer.replace(/\/$/, '');
  if (!claims.iss || claims.iss.replace(/\/$/, '') !== expectedIssuer) {
    throw new Error('id_token issuer mismatch');
  }
  const audMatch = Array.isArray(claims.aud)
    ? claims.aud.includes(opts.clientId)
    : claims.aud === opts.clientId;
  if (!audMatch) {
    throw new Error('id_token audience mismatch');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) {
    throw new Error('id_token expired');
  }
  if (opts.nonce && claims.nonce !== opts.nonce) {
    throw new Error('id_token nonce mismatch');
  }
  if (!claims.sub) {
    throw new Error('id_token missing sub');
  }

  return claims;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function createOAuthState(
  db: Db,
  returnTo?: string
): Promise<{
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
}> {
  await ensureIndexes(db);
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const { verifier, challenge } = createPkcePair();
  const now = new Date();
  await db.collection<OAuthStateDoc>(COLLECTIONS.oauthStates).insertOne({
    _id: state,
    nonce,
    codeVerifier: verifier,
    ...(returnTo ? { returnTo } : {}),
    createdAt: now,
    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
  });
  return { state, nonce, codeVerifier: verifier, codeChallenge: challenge };
}

export async function consumeOAuthState(db: Db, state: string): Promise<OAuthStateDoc | null> {
  await ensureIndexes(db);
  const doc = await db
    .collection<OAuthStateDoc>(COLLECTIONS.oauthStates)
    .findOneAndDelete({ _id: state, expiresAt: { $gt: new Date() } });
  return doc ?? null;
}

export async function createSession(
  db: Db,
  user: { sub: string; name: string; email: string; workspaces: WorkspaceMembership[] }
): Promise<SessionDoc> {
  await ensureIndexes(db);
  const now = new Date();
  const doc: SessionDoc = {
    _id: randomBytes(24).toString('base64url'),
    sub: user.sub,
    name: user.name,
    email: user.email,
    workspaces: user.workspaces,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  };
  await db.collection<SessionDoc>(COLLECTIONS.sessions).insertOne(doc);
  return doc;
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

export async function getSessionFromCookieHeader(
  db: Db,
  cookieHeader: string | undefined
): Promise<SessionDoc | null> {
  const cookies = parseCookieHeader(cookieHeader);
  const sid = cookies[SESSION_COOKIE_NAME];
  if (!sid) return null;
  await ensureIndexes(db);
  const doc = await db
    .collection<SessionDoc>(COLLECTIONS.sessions)
    .findOne({ _id: sid, expiresAt: { $gt: new Date() } });
  return doc ?? null;
}

export async function getSessionFromRequest(
  db: Db,
  req: Request
): Promise<SessionDoc | null> {
  return getSessionFromCookieHeader(db, req.headers.cookie);
}

export async function deleteSession(db: Db, cookieHeader: string | undefined): Promise<void> {
  const cookies = parseCookieHeader(cookieHeader);
  const sid = cookies[SESSION_COOKIE_NAME];
  if (!sid) return;
  await ensureIndexes(db);
  await db.collection<SessionDoc>(COLLECTIONS.sessions).deleteOne({ _id: sid });
}

export function resolveRedirectUri(req: Request): string {
  if (process.env.OIDC_REDIRECT_URI) {
    return process.env.OIDC_REDIRECT_URI;
  }
  const host = req.get('x-forwarded-host') || req.get('host');
  if (host) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    return `${proto}://${host}/auth/callback`;
  }
  return config.oidc.redirectUri;
}

export function isSafeLocalReturnUrl(candidate: string): string | null {
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.toString();
    }
    const configured = new URL(config.webOrigin);
    if (u.origin === configured.origin) {
      return u.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveReturnTo(req: Request): string {
  const nextRaw: unknown = req.query.next;
  if (typeof nextRaw === 'string' && nextRaw.trim()) {
    const safe = isSafeLocalReturnUrl(nextRaw.trim());
    if (safe) return safe;
  }
  const ref = req.get('referer') || req.get('origin');
  if (ref) {
    const safe = isSafeLocalReturnUrl(ref);
    if (safe) {
      const u = new URL(safe);
      return `${u.origin}/`;
    }
  }
  return `${config.webOrigin.replace(/\/$/, '')}/`;
}

export function getWorkspaceRole(
  session: SessionDoc,
  workspaceId: string
): 'admin' | 'agent' | null {
  const entry = session.workspaces.find((w) => w.id === workspaceId);
  return entry ? entry.role : null;
}
