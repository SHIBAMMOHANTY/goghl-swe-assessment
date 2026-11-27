import { Router } from 'express';
import type { Db } from 'mongodb';
import { config } from '../config.js';
import { getDb } from '../db.js';
import {
  consumeOAuthState,
  createOAuthState,
  createSession,
  deleteSession,
  getOidcDiscovery,
  resolveRedirectUri,
  SESSION_COOKIE_NAME,
  verifyIdToken,
} from '../services/auth.js';

export interface AuthRouterDeps {
  getDb: () => Promise<Db>;
  fetchImpl?: typeof fetch;
}

export function createAuthRouter(deps: AuthRouterDeps = { getDb }): Router {
  const router = Router();

  router.get('/login', async (req, res, next) => {
    try {
      const db = await deps.getDb();
      const discovery = await getOidcDiscovery(config.oidc.issuer, deps.fetchImpl);
      const { state, nonce, codeChallenge } = await createOAuthState(db);
      const redirectUri = resolveRedirectUri(req);

      const authUrl = new URL(discovery.authorization_endpoint);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', config.oidc.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('nonce', nonce);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      res.redirect(302, authUrl.toString());
    } catch (err) {
      next(err);
    }
  });

  router.get('/callback', async (req, res, next) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';

      if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state' });
        return;
      }

      const db = await deps.getDb();
      const oauthState = await consumeOAuthState(db, state);
      if (!oauthState) {
        res.status(400).json({ error: 'Invalid or expired OAuth state' });
        return;
      }

      const discovery = await getOidcDiscovery(config.oidc.issuer, deps.fetchImpl);
      const redirectUri = resolveRedirectUri(req);
      const fetchFn = deps.fetchImpl ?? fetch;

      const tokenRes = await fetchFn(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: config.oidc.clientId,
          client_secret: config.oidc.clientSecret,
          code_verifier: oauthState.codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(5000),
      });

      if (!tokenRes.ok) {
        res.status(401).json({ error: 'OIDC token exchange failed' });
        return;
      }

      const tokenBody = (await tokenRes.json()) as { id_token?: string };
      if (!tokenBody.id_token) {
        res.status(401).json({ error: 'Missing id_token from IdP' });
        return;
      }

      const claims = await verifyIdToken(tokenBody.id_token, {
        jwksUri: discovery.jwks_uri,
        issuer: discovery.issuer,
        clientId: config.oidc.clientId,
        nonce: oauthState.nonce,
        fetchImpl: deps.fetchImpl,
      });

      const session = await createSession(db, {
        sub: claims.sub,
        name: claims.name ?? claims.sub,
        email: claims.email ?? '',
        workspaces: Array.isArray(claims.workspaces) ? claims.workspaces : [],
      });

      res.cookie(SESSION_COOKIE_NAME, session._id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.redirect(302, '/');
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const db = await deps.getDb();
      await deleteSession(db, req.headers.cookie);
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
