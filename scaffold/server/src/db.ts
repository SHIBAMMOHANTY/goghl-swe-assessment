import { MongoClient, type Db } from 'mongodb';
import { config } from './config.js';

let client: MongoClient | undefined;
let connecting: Promise<MongoClient> | undefined;

// Connects on first use. Call from anywhere: const db = await getDb();
export async function getDb(): Promise<Db> {
  if (!client) {
    if (!connecting) {
      const candidate = new MongoClient(config.mongoUrl, {
        serverSelectionTimeoutMS: 5000,
      });
      connecting = candidate
        .connect()
        .then((connected) => {
          client = connected;
          return connected;
        })
        .catch(async (err) => {
          await candidate.close().catch(() => {});
          throw err;
        })
        .finally(() => {
          connecting = undefined;
        });
    }
    const connected = await connecting;
    return connected.db();
  }
  return client.db();
}

export async function pingDb(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (!client) return;
  const current = client;
  client = undefined;
  await current.close();
}
