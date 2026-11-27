'use strict';

// Mock identity provider: OpenID Connect, authorization code flow with PKCE.
// Zero dependencies. It behaves like a real IdP (Google, Auth0, Okta) for the
// parts you need: discovery, /authorize, /token, /userinfo, /jwks.
//
// Instead of a password form, /authorize shows a list of test users.

const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4020);
const ISSUER = process.env.IDP_ISSUER || 'http://localhost:' + PORT;
const CLIENT_ID = process.env.IDP_CLIENT_ID || 'switchboard-web';
const CLIENT_SECRET = process.env.IDP_CLIENT_SECRET || 'dev-secret-not-for-production';
const REDIRECTS = (process.env.IDP_REDIRECT_URIS || 'http://localhost:3000/auth/callback,http://localhost:4000/auth/callback,http://localhost:5173/auth/callback').split(',');

const USERS = [
  { sub: 'u_asha', name: 'Asha Rao', email: 'asha@acme.test', workspaces: [{ id: 'ws_acme', role: 'admin' }] },
  { sub: 'u_ben', name: 'Ben Ortiz', email: 'ben@acme.test', workspaces: [{ id: 'ws_acme', role: 'agent' }] },
  { sub: 'u_chloe', name: 'Chloe Martin', email: 'chloe@globex.test', workspaces: [{ id: 'ws_globex', role: 'admin' }] },
  { sub: 'u_dev', name: 'Dev Patel', email: 'dev@globex.test', workspaces: [{ id: 'ws_globex', role: 'agent' }] },
  { sub: 'u_eli', name: 'Eli Novak (contractor)', email: 'eli@contractor.test', workspaces: [{ id: 'ws_acme', role: 'agent' }, { id: 'ws_globex', role: 'agent' }] },
];

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = crypto.randomBytes(6).toString('hex');
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: KID, use: 'sig', alg: 'RS256' });
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

function signJwt(claims) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: KID });
  const body = b64(claims);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString('base64url');
  return head + '.' + body + '.' + sig;
}

const codes = new Map(); // code -> { user, redirectUri, challenge, nonce, exp }
const tokens = new Map(); // access token -> user

function readForm(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if ((req.headers['content-type'] || '').includes('json')) {
        try {
          return resolve(JSON.parse(raw));
        } catch (e) {
          return resolve({});
        }
      }
      resolve(Object.fromEntries(new URLSearchParams(raw)));
    });
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, ISSUER);
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return json(204, {});

    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer: ISSUER,
        authorization_endpoint: ISSUER + '/authorize',
        token_endpoint: ISSUER + '/token',
        userinfo_endpoint: ISSUER + '/userinfo',
        jwks_uri: ISSUER + '/jwks',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile', 'email'],
      });
    }
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });

    if (url.pathname === '/authorize') {
      const q = Object.fromEntries(url.searchParams);
      if (q.client_id !== CLIENT_ID) return json(400, { error: 'unauthorized_client' });
      if (!REDIRECTS.includes(q.redirect_uri)) return json(400, { error: 'invalid_request', error_description: 'redirect_uri not registered: ' + q.redirect_uri });
      if (q.response_type !== 'code') return json(400, { error: 'unsupported_response_type' });
      if (!q.code_challenge || q.code_challenge_method !== 'S256') return json(400, { error: 'invalid_request', error_description: 'PKCE with S256 is required' });
      if (q.login) {
        const user = USERS.find((u) => u.sub === q.login);
        if (!user) return json(400, { error: 'access_denied' });
        const code = crypto.randomBytes(16).toString('hex');
        codes.set(code, { user, redirectUri: q.redirect_uri, challenge: q.code_challenge, nonce: q.nonce, exp: Date.now() + 60000 });
        const back = new URL(q.redirect_uri);
        back.searchParams.set('code', code);
        if (q.state) back.searchParams.set('state', q.state);
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      const esc = (s) =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const avatarStyles = [
        'background:#ede9fe;color:#6d28d9',
        'background:#e0f2fe;color:#0369a1',
        'background:#fce7f3;color:#be185d',
        'background:#dcfce7;color:#15803d',
        'background:#fef3c7;color:#b45309',
      ];

      const userCards = USERS.map((u, idx) => {
        const next = new URL(url);
        next.searchParams.set('login', u.sub);
        const href = next.pathname + next.search.replace(/"/g, '&quot;');
        const rolesText = u.workspaces.map((w) => w.id + ' (' + w.role + ')').join(', ');
        const isAdmin = u.workspaces.some((w) => w.role === 'admin');
        const initials = u.name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0] || '')
          .join('')
          .toUpperCase();
        const roleBadgeStyle = isAdmin
          ? 'background:#ede9fe;color:#6d28d9'
          : 'background:#e0f2fe;color:#0369a1';
        const roleLabel = isAdmin ? 'Admin' : 'Agent';

        return (
          '<a class="user-card" href="' +
          href +
          '">' +
          '<div class="user-left">' +
          '<span class="avatar" style="' +
          avatarStyles[idx % avatarStyles.length] +
          '">' +
          esc(initials) +
          '</span>' +
          '<div class="user-info">' +
          '<div class="user-name">' +
          esc(u.name) +
          '</div>' +
          '<div class="user-sub">' +
          esc(u.email) +
          ' &bull; ' +
          esc(rolesText) +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div class="user-right">' +
          '<span class="role-pill" style="' +
          roleBadgeStyle +
          '">' +
          roleLabel +
          '</span>' +
          '<span class="arrow">&rarr;</span>' +
          '</div>' +
          '</a>'
        );
      }).join('');

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mock IdP — Switchboard</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0f172a;
      background: linear-gradient(135deg, #f6f7fd 0%, #ffffff 48%, #efeafd 100%);
      position: relative;
      overflow-x: hidden;
    }
    .wave-bg {
      position: fixed;
      left: 0;
      bottom: 0;
      width: 100%;
      height: 180px;
      pointer-events: none;
      z-index: 0;
    }
    .shell {
      position: relative;
      z-index: 1;
      max-width: 1120px;
      margin: 0 auto;
      min-height: 100vh;
      padding: 22px 24px 36px;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 38px;
      height: 38px;
      border-radius: 11px;
      background: linear-gradient(135deg, #7c4dff, #4f24d6);
      color: #fff;
      display: grid;
      place-items: center;
      box-shadow: 0 8px 18px rgba(79, 36, 214, 0.25);
    }
    .brand-title { font-weight: 700; font-size: 17px; line-height: 1.2; }
    .brand-sub { font-size: 12px; color: #64748b; }
    .pkce-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 999px;
      background: #eee9fe;
      color: #5b21b6;
      font-size: 12px;
      font-weight: 600;
    }
    .main {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1.15fr;
      align-items: center;
      gap: 44px;
    }
    .hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 12px 8px;
    }
    .hero-art {
      width: 220px;
      max-width: 100%;
      margin-bottom: 18px;
      filter: drop-shadow(0 18px 28px rgba(91, 33, 182, 0.18));
    }
    .hero h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }
    .hero h1 span {
      background: linear-gradient(90deg, #6d28d9, #4f46e5);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      margin: 10px 0 28px;
      font-size: 14px;
      color: #475569;
      line-height: 1.55;
      max-width: 390px;
    }
    .hero-badges {
      width: 100%;
      max-width: 440px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      border-top: 1px solid #e2e8f0;
      padding-top: 18px;
    }
    .hero-badge {
      padding: 0 10px;
      border-right: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .hero-badge:last-child { border-right: 0; }
    .hero-badge svg { width: 18px; height: 18px; color: #5b2be0; }
    .hero-badge strong { font-size: 12px; color: #0f172a; }
    .hero-badge span { font-size: 11px; color: #64748b; line-height: 1.3; }
    .card {
      background: #ffffff;
      border: 1px solid rgba(226, 232, 240, 0.9);
      border-radius: 22px;
      padding: 30px;
      box-shadow: 0 20px 55px rgba(30, 27, 75, 0.08);
    }
    .card h2 {
      margin: 0;
      font-size: 24px;
      letter-spacing: -0.01em;
    }
    .card-sub {
      margin: 6px 0 20px;
      font-size: 13px;
      color: #64748b;
    }
    .user-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .user-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      text-decoration: none;
      color: inherit;
      background: #ffffff;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.12s;
    }
    .user-card:hover {
      border-color: #7c3aed;
      box-shadow: 0 6px 18px rgba(109, 40, 217, 0.1);
      transform: translateY(-1px);
    }
    .user-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .avatar {
      width: 38px;
      height: 38px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .user-info { min-width: 0; }
    .user-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .user-sub {
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .user-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .role-pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }
    .arrow {
      color: #64748b;
      font-size: 15px;
      font-weight: 600;
    }
    @media (max-width: 900px) {
      .main {
        grid-template-columns: 1fr;
        gap: 24px;
      }
      .card { padding: 20px; }
      .user-sub { white-space: normal; }
    }
  </style>
</head>
<body>
  <svg class="wave-bg" viewBox="0 0 1200 180" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0,115 C240,55 480,170 760,95 C960,40 1090,115 1200,80 L1200,180 L0,180 Z" fill="#ddd6fe" fill-opacity="0.45" />
    <path d="M0,145 C320,105 640,185 940,120 C1080,90 1150,130 1200,115 L1200,180 L0,180 Z" fill="#c4b5fd" fill-opacity="0.35" />
  </svg>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3.75c-4.97 0-9 3.47-9 7.75 0 2.13 1 4.06 2.63 5.45-.19 1.24-.75 2.47-1.58 3.45 1.54-.17 3.1-.77 4.26-1.61 1.15.3 2.4.46 3.69.46 4.97 0 9-3.47 9-7.75S16.97 3.75 12 3.75Z" stroke-linejoin="round" />
            <circle cx="8.5" cy="11.5" r="1" fill="currentColor" />
            <circle cx="12" cy="11.5" r="1" fill="currentColor" />
            <circle cx="15.5" cy="11.5" r="1" fill="currentColor" />
          </svg>
        </div>
        <div>
          <div class="brand-title">Switchboard</div>
          <div class="brand-sub">Mock Identity Provider</div>
        </div>
      </div>
      <div class="pkce-pill">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        OIDC + PKCE (Test)
      </div>
    </header>

    <main class="main">
      <section class="hero">
        <svg class="hero-art" viewBox="0 0 260 200" fill="none" aria-hidden="true">
          <ellipse cx="130" cy="108" rx="98" ry="64" fill="#e9e3ff" />
          <g transform="rotate(-7 125 96)">
            <rect x="34" y="34" width="168" height="118" rx="18" fill="#ffffff" stroke="#7c3aed" stroke-width="6" />
            <path d="M34 52 C34 42 42 34 52 34 L184 34 C194 34 202 42 202 52 L202 62 L34 62 Z" fill="#6d28d9" />
            <circle cx="52" cy="48" r="3.5" fill="#c4b5fd" />
            <circle cx="64" cy="48" r="3.5" fill="#c4b5fd" />
            <circle cx="76" cy="48" r="3.5" fill="#c4b5fd" />
            <circle cx="118" cy="88" r="17" fill="#6d28d9" />
            <circle cx="118" cy="83" r="6" fill="#ffffff" />
            <path d="M107 98 C109 92 127 92 129 98" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
            <rect x="74" y="114" width="88" height="22" rx="11" fill="#ede9fe" />
            <circle cx="94" cy="125" r="3.2" fill="#6d28d9" />
            <circle cx="106" cy="125" r="3.2" fill="#6d28d9" />
            <circle cx="118" cy="125" r="3.2" fill="#6d28d9" />
            <circle cx="130" cy="125" r="3.2" fill="#6d28d9" />
            <circle cx="142" cy="125" r="3.2" fill="#6d28d9" />
          </g>
          <g transform="translate(166 96)">
            <path d="M13 18 V12 C13 5 19 0 26 0 C33 0 39 5 39 12 V18" stroke="#4f24d6" stroke-width="6.5" stroke-linecap="round" />
            <rect x="4" y="16" width="44" height="38" rx="11" fill="#6d28d9" />
            <circle cx="26" cy="32" r="5" fill="#ffffff" />
            <rect x="24" y="34" width="4" height="9" rx="2" fill="#ffffff" />
          </g>
          <path d="M188 26 L195 14 M200 32 L212 24 M204 42 L216 40" stroke="#7c3aed" stroke-width="4" stroke-linecap="round" />
        </svg>

        <h1>Mock <span>Identity Provider</span></h1>
        <p>A test identity provider for the Switchboard assessment. Sign in as any of the test users below to continue.</p>

        <div class="hero-badges">
          <div class="hero-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 3 4 6.5v5.5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6.5L12 3Z" />
              <path d="m9 12 2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <strong>Test Accounts</strong>
            <span>Pre-configured users &amp; roles</span>
          </div>
          <div class="hero-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
              <path d="m3 12 9 4.5 9-4.5" />
              <path d="m3 16.5 9 4.5 9-4.5" />
            </svg>
            <strong>OIDC + PKCE</strong>
            <span>Standard, secure authentication</span>
          </div>
          <div class="hero-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <strong>Development</strong>
            <span>For local testing and evaluation</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Sign in as</h2>
        <p class="card-sub">Choose a test user to authenticate with Mock IdP.</p>
        <div class="user-list">${userCards}</div>
      </section>
    </main>
  </div>
</body>
</html>`);
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const f = await readForm(req);
      let id = f.client_id;
      let secret = f.client_secret;
      const basic = (req.headers.authorization || '').match(/^Basic (.+)$/);
      if (basic) [id, secret] = Buffer.from(basic[1], 'base64').toString().split(':');
      if (id !== CLIENT_ID) return json(401, { error: 'invalid_client' });
      // Public clients (SPA) may omit the secret; if one is sent it must be right.
      if (secret !== undefined && secret !== '' && secret !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
      const entry = codes.get(f.code);
      codes.delete(f.code); // single use
      if (f.grant_type !== 'authorization_code' || !entry || entry.exp < Date.now()) return json(400, { error: 'invalid_grant' });
      if (entry.redirectUri !== f.redirect_uri) return json(400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      const challenge = crypto.createHash('sha256').update(String(f.code_verifier || '')).digest('base64url');
      if (challenge !== entry.challenge) return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
      const now = Math.floor(Date.now() / 1000);
      const u = entry.user;
      const access = 'at_' + crypto.randomBytes(18).toString('hex');
      tokens.set(access, u);
      return json(200, {
        access_token: access,
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: signJwt({ iss: ISSUER, aud: CLIENT_ID, sub: u.sub, iat: now, exp: now + 3600, nonce: entry.nonce, name: u.name, email: u.email, workspaces: u.workspaces }),
      });
    }

    if (url.pathname === '/userinfo') {
      const u = tokens.get(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      if (!u) return json(401, { error: 'invalid_token' });
      return json(200, { sub: u.sub, name: u.name, email: u.email, workspaces: u.workspaces });
    }

    json(404, { error: 'not_found' });
  })
  .listen(PORT, () => console.log('mock idp on ' + ISSUER + '  client_id=' + CLIENT_ID));
