# Switchboard

A multi-tenant shared team inbox built with React, Node.js, TypeScript, MongoDB, and Redis.

## Prerequisites

- Node.js 22+
- Docker Desktop (for MongoDB 7, Redis 7, Pigeon, and Mock IdP) or standalone MongoDB/Redis with `npm run mocks`

Verify environment readiness:

```bash
node harness/doctor.js --preflight
```

## Running from a clean clone

1. Install dependencies:

   ```bash
   npm run scaffold:install
   ```

2. Start MongoDB, Redis, Pigeon, and the Mock IdP:

   ```bash
   npm run up
   npm run doctor
   ```

3. Start the backend server (`PORT` defaults to `4000`):

   ```bash
   npm run scaffold:server
   ```

4. Start the React frontend (`http://localhost:5173`):

   ```bash
   npm run scaffold:web
   ```

## Tests and Verification

Run backend TypeScript typechecking and automated tests:

```bash
npm --prefix scaffold/server run typecheck
npm --prefix scaffold/server test
```

Run frontend TypeScript typechecking and production build:

```bash
npm --prefix scaffold/web run typecheck
npm --prefix scaffold/web run build
```

Run the assessment harness (stop your dev server first so port `4000` is free):

```bash
npm run check
npm run check:full
```

## Architecture Overview

- `scaffold/server/src/routes/webhooks.ts`: Raw-body HMAC-SHA256 verification (`t=<unix>,v1=<hex>`), 5-minute replay window, idempotent `message.inbound` ingestion, monotonic `message.status` transitions.
- `scaffold/server/src/services/inbox.ts`: Shared conversation claim/release, close/reopen, reply enqueueing, private notes, and grader snapshot projection.
- `scaffold/server/src/services/outbox.ts`: MongoDB lease-based durable outbox worker with `Idempotency-Key`, Redis shared per-workspace token bucket + `Retry-After` cool-off, and `503` backoff.
- `scaffold/server/src/services/auth.ts` & `routes/auth.ts`: OpenID Connect Authorization Code + PKCE (`S256`) login, RS256 `id_token` verification against JWKS, and MongoDB-backed session cookies.
- `scaffold/server/src/routes/api.ts`: Session-authenticated, workspace-isolated inbox REST API (conversations, overview stats, message search, claim/release, close/reopen, replies, and encrypted notes).
- `scaffold/server/src/ws/server.ts`: Authenticated WebSocket hub (`/ws?workspace=<id>&after=<seq>`) backed by MongoDB monotonic sequence numbers and Redis Pub/Sub.
- `scaffold/web/src/`: React support dashboard with workspace switching, overview counters (`Open`, `Mine`, `Unassigned`, `Closed`), message search, live WebSocket updates, claim/release, close/reopen, replies with status tracking, and Web Crypto E2E encrypted private notes (`PROTOCOL.md`).
