import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, getDb, pingDb } from './db.js';
import { closeRedis, getRedis, pingRedis } from './redis.js';
import { OutboxWorker } from './services/outbox.js';
import { WorkspaceWsHub } from './ws/server.js';

const outbox = new OutboxWorker({
  getDb,
  getRedis,
});

const kickOutbox = () => outbox.kick();

const checkReadiness = async () => {
  const [mongo, redis] = await Promise.all([pingDb(), pingRedis()]);
  return { ok: mongo && redis, mongo, redis };
};

const app = createApp({
  grader: { getDb, getRedis, kickOutbox },
  api: { getDb, getRedis, kickOutbox },
  healthCheck: checkReadiness,
});

const server = createServer(app);
const wsHub = new WorkspaceWsHub({ getDb });
wsHub.attach(server);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);
  outbox.stop();
  try {
    await wsHub.close();
  } catch (err) {
    console.error('Error closing WebSocket hub:', err);
  }
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await Promise.allSettled([closeRedis(), closeDb()]);
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

server.listen(config.port, () => {
  console.log(`server on http://localhost:${config.port}`);
  outbox.start();
  void checkReadiness().then((status) => {
    if (!status.ok) {
      console.warn('Startup readiness check degraded:', status);
    }
  });
});
