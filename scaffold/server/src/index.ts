import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

// A plain http server, so you can attach WebSockets to it.
const server = createServer(app);
server.listen(config.port, () => {
  console.log(`server on http://localhost:${config.port}`);
});
