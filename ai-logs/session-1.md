# AI Session Log — Switchboard

## Session Goals
1. Diagnose and implement `POST /__grader/reset` protected by `x-grader-token` (`GRADER_TOKEN`), returning `401` on invalid/missing token, clearing MongoDB and Redis application data while preserving login sessions, and returning `200`.
2. Build out the Switchboard backend and React frontend incrementally using Node.js, TypeScript, Express, MongoDB, Redis, and React:
   - Pigeon webhook ingestion (`POST /webhooks/pigeon`) with raw-body HMAC verification, timestamp replay check, deduplication, deterministic ordering, and monotonic outbound status updates.
   - Shared inbox & grader endpoints (`/__grader/snapshot`, `/__grader/reply`, `/__grader/claim`, `/api/me`, `/api/conversations*`).
   - Lease-based durable `OutboxWorker` with `Idempotency-Key`, shared Redis token bucket + `Retry-After` cool-off, and `503` outage backoff.
   - OIDC Authorization Code + PKCE (`S256`) login, RS256 `id_token` verification, and session cookies.
   - Multi-instance WebSocket hub (`/ws?workspace=<id>&after=<seq>`) with MongoDB `seq` replay and Redis Pub/Sub live fanout.
   - End-to-end encrypted private notes (`AES-256-GCM` client-side Web Crypto + server ciphertext storage + `PROTOCOL.md`), inbox overview stats, and workspace-scoped message search.
   - React support dashboard UI (`scaffold/web/src/`).
3. Run `node harness/doctor.js --preflight`, TypeScript typechecks, frontend build, and backend unit/integration tests.
4. Maintain `README.md`, `DECISIONS.md`, and `PROTOCOL.md`.
