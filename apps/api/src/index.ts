import { Learning } from './services/learning.ts';
import { emailSender } from './services/email.ts';
import { flashcardGemini } from './services/flashcardGeneration.ts';
import { LearningQueues } from './workers/learning.ts';
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
let learningQueues: LearningQueues | undefined;
const learning = new Learning(repo.db,config.JWT_SECRET,emailSender(config),articles);
const check = async (fn: () => Promise<unknown>) => { try { await fn(); return true; } catch { return false; } };
const app = await buildApp({ learning, learningQueues:()=>learningQueues, articles, auth: new AuthService(repo, config.JWT_SECRET), search: new SearchService(repo, storage, index),
  retryLabels: async () => {
    if (!queue) throw new Error('Label generation is not available yet');
    return queue.retryAll();
  },
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
    if (!initialized) { await repo.initialize(); await learning.initialize(); initialized = true; }
    await seedAdmin(repo, config.ADMIN_USERNAME, config.ADMIN_PASSWORD).catch(log);
    const createdIndex = await index.initialize().catch(log);
    if (createdIndex) await articles.rebuildIndex();
    await articles.reconcile();
    if (closing) return;
    queue ??= new LabelQueue(config.REDIS_URL, articles, gemini(config.GEMINI_API_KEY, config.GEMINI_MODEL), log);
    learningQueues ??= new LearningQueues(config.REDIS_URL,learning,flashcardGemini(config.GEMINI_API_KEY,config.GEMINI_MODEL),log);
    await queue.dispatch();
  } catch (e) { log(e); } finally { busy = false; }
}
await app.listen({ port: config.PORT, host: config.HOST });
let backgroundTask = background();
// shortcut: full manifest scan suits a single-owner wiki; use a durable journal if the corpus outgrows it.
const timer = setInterval(() => { if (!busy && !closing) backgroundTask = background(); }, 15_000);
let learningBusy=false;
let learningTask:Promise<void>=Promise.resolve();
const learningTimer=setInterval(()=>{if(learningBusy || closing || !initialized)return;learningBusy=true;learningTask=(async()=>{try{await learning.tick(async id=>{if(learningQueues) await learningQueues.grade(id).catch(log);});}catch(e){log(e);}finally{learningBusy=false;}})();},1000);
async function close() {
  if (closing) return; closing = true;
  clearInterval(timer); clearInterval(learningTimer);
  await app.close();
  await backgroundTask; await learningTask;
  await queue?.close(); await learningQueues?.close();
  await client.close();
}
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());
