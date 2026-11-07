import { readConfig } from './config/env.ts';
import { mongoClient, MongoRepository } from './models/mongo.ts';
import { Storage } from './services/storage.ts';
import { Elasticsearch, SearchService } from './services/search.ts';
import { Articles } from './services/articles.ts';
import { AuthService, seedAdmin } from './services/auth.ts';
import { gemini } from './workers/labels.ts';
import { LabelQueue } from './workers/queue.ts';
import { buildApp } from './routes/app.ts';

const config = readConfig();
const client = mongoClient(config.MONGO_URL);
const repo = new MongoRepository(client.db(config.MONGO_DB));
const storage = new Storage(config.OBJECT_ROOT);
await storage.init();
const index = new Elasticsearch(config.ELASTICSEARCH_URL);
const articles = new Articles(repo, storage, index);
let queue: LabelQueue | undefined;
const check = async (fn: () => Promise<unknown>) => { try { await fn(); return true; } catch { return false; } };
const app = await buildApp({ articles, auth: new AuthService(repo, config.JWT_SECRET), search: new SearchService(repo, storage, index),
  health: async () => {
    const [mongo, redis, disk, es] = await Promise.all([check(() => repo.ping()), check(async () => { if (!queue) throw new Error(); await queue.ping(); }), check(() => storage.writable()), check(() => index.ping())]);
    return { mongo, redis, storage: disk, elasticsearch: es };
  }
}, config.LOG_LEVEL);
const log = (error: unknown) => app.log.warn({ err: error }, 'Background dependency unavailable; will retry');
let initialized = false, busy = false, closing = false;
async function background() {
  if (busy || closing) return; busy = true;
  try {
    if (!initialized) { await repo.initialize(); initialized = true; }
    await seedAdmin(repo, config.ADMIN_USERNAME, config.ADMIN_PASSWORD).catch(log);
    const createdIndex = await index.initialize().catch(log);
    if (createdIndex) await articles.rebuildIndex();
    await articles.reconcile();
    if (closing) return;
    queue ??= new LabelQueue(config.REDIS_URL, articles, gemini(config.GEMINI_API_KEY, config.GEMINI_MODEL), log);
    await queue.dispatch();
  } catch (e) { log(e); } finally { busy = false; }
}
await app.listen({ port: config.PORT, host: config.HOST });
let backgroundTask = background();
// shortcut: full manifest scan suits a single-owner wiki; use a durable journal if the corpus outgrows it.
const timer = setInterval(() => { if (!busy && !closing) backgroundTask = background(); }, 15_000);
async function close() {
  if (closing) return; closing = true;
  clearInterval(timer);
  await app.close();
  await backgroundTask;
  await queue?.close();
  await client.close();
}
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());
