import express, { type ErrorRequestHandler, type Express } from 'express';
import { config } from './config.js';
import { createApiRouter, type ApiRouterDeps } from './routes/api.js';
import { createAuthRouter, type AuthRouterDeps } from './routes/auth.js';
import { createGraderRouter, type GraderDeps } from './routes/grader.js';
import { createWebhookRouter, type WebhookDeps } from './routes/webhooks.js';

export interface HealthStatus {
  ok: boolean;
  mongo: boolean;
  redis: boolean;
}

export interface AppDeps {
  grader?: GraderDeps;
  webhooks?: WebhookDeps;
  auth?: AuthRouterDeps;
  api?: ApiRouterDeps;
  healthCheck?: () => Promise<HealthStatus>;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
};

export function createApp(deps: AppDeps = {}): Express {
  const app = express();

  app.get('/', (req, res) => {
    if (typeof req.headers.accept === 'string' && req.headers.accept.includes('text/html')) {
      res.redirect(302, `${config.webOrigin.replace(/\/$/, '')}/`);
      return;
    }
    res.status(200).json({ service: 'switchboard-server', webOrigin: config.webOrigin });
  });

  app.get('/healthz', async (_req, res) => {
    if (!deps.healthCheck) {
      res.status(200).json({ ok: true });
      return;
    }
    try {
      const status = await deps.healthCheck();
      res.status(status.ok ? 200 : 503).json(status);
    } catch {
      res.status(503).json({ ok: false, mongo: false, redis: false });
    }
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
