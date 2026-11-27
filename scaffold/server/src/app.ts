import express, { type ErrorRequestHandler, type Express } from 'express';
import { createApiRouter, type ApiRouterDeps } from './routes/api.js';
import { createAuthRouter, type AuthRouterDeps } from './routes/auth.js';
import { createGraderRouter, type GraderDeps } from './routes/grader.js';
import { createWebhookRouter, type WebhookDeps } from './routes/webhooks.js';

export interface AppDeps {
  grader?: GraderDeps;
  webhooks?: WebhookDeps;
  auth?: AuthRouterDeps;
  api?: ApiRouterDeps;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
};

export function createApp(deps: AppDeps = {}): Express {
  const app = express();

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // Webhooks read raw bytes for HMAC verification before JSON parsing.
  app.use('/webhooks', createWebhookRouter(deps.webhooks));

  app.use(express.json());
  app.use('/__grader', createGraderRouter(deps.grader));
  app.use('/auth', createAuthRouter(deps.auth));
  app.use('/api', createApiRouter(deps.api));

  app.use(errorHandler);

  return app;
}
