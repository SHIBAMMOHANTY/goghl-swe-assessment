import express, { type ErrorRequestHandler, type Express } from 'express';
import { createGraderRouter, type GraderDeps } from './routes/grader.js';

export interface AppDeps {
  grader?: GraderDeps;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
};

export function createApp(deps: AppDeps = {}): Express {
  const app = express();

  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/__grader', createGraderRouter(deps.grader));

  app.use(errorHandler);

  return app;
}
