import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db.js';
import { getRedis } from './redis.js';
import { OutboxWorker } from './services/outbox.js';
import { WorkspaceWsHub } from './ws/server.js';

const outbox = new OutboxWorker({
  getDb,
  getRedis,
});

const kickOutbox = () => outbox.kick();

const app = createApp({
  grader: { getDb, getRedis, kickOutbox },
  api: { getDb, getRedis, kickOutbox },
});

const server = createServer(app);
const wsHub = new WorkspaceWsHub({ getDb });
wsHub.attach(server);

server.listen(config.port, () => {
  console.log(`server on http://localhost:${config.port}`);
  outbox.start();
});
