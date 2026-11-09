import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mongoClient, MongoRepository } from '../src/models/mongo.ts';
import { Storage } from '../src/services/storage.ts';
import { Articles } from '../src/services/articles.ts';
import { Elasticsearch, SearchService } from '../src/services/search.ts';
import { AuthService, seedAdmin } from '../src/services/auth.ts';
import { LabelQueue } from '../src/workers/queue.ts';
import { buildApp } from '../src/routes/app.ts';
import { labels, secret } from './helpers.ts';

async function until(check: () => Promise<boolean>, timeout = 20_000) {
  const deadline = Date.now()+timeout;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve,100)); }
  throw new Error('Timed out waiting for background work');
}
test('real MongoDB + Elasticsearch + Redis/BullMQ lifecycle, retry/DLQ, auth and HTTP', {skip:!process.env.TEST_MONGO_URL}, async t => {
  const redis = process.env.TEST_REDIS_URL;
  assert.ok(redis && new URL(redis).pathname === '/15','TEST_REDIS_URL must target isolated Redis database 15');
  assert.ok(process.env.TEST_ELASTICSEARCH_URL,'TEST_ELASTICSEARCH_URL is required');
  const suffix = randomUUID().replaceAll('-','');
  const client = mongoClient(process.env.TEST_MONGO_URL!);
  const db = client.db(`wiki_test_${suffix}`), repo = new MongoRepository(db);
  const root = await mkdtemp(join(tmpdir(),'wiki-objects-integration-')); const storage = new Storage(root); await storage.init();
  const index = new Elasticsearch(process.env.TEST_ELASTICSEARCH_URL!,`wiki_test_${suffix}`); await index.initialize(); await repo.initialize();
  const articles = new Articles(repo,storage,index), auth = new AuthService(repo,secret), search = new SearchService(repo,storage,index);
  const ids: string[] = []; let attempts = 0, allowRetry = false;
  const queue = new LabelQueue(redis,articles,async markdown => { if (markdown.includes('force-failure') && !allowRetry) { attempts++; throw new Error('Synthetic Gemini failure'); } return labels; },() => {});
  const app = await buildApp({articles,auth,search,retryLabels:() => queue.retryAll(),health:async () => ({mongo:true,redis:true,storage:true,elasticsearch:true})});
  t.after(async () => {
    await app.close(); await queue.close();
    await repo.remove(ids);
    await db.collection<{_id:string}>('users').deleteOne({_id:'00000000-0000-4000-8000-000000000001'});
    await db.collection('notifications').deleteMany({articleId:{$in:ids}});
    await index.remove(ids); await client.close(); await rm(root,{recursive:true,force:true});
  });
  await seedAdmin(repo,'owner','a-strong-test-password');
  const login = await app.inject({method:'POST',url:'/admin/login',payload:{username:'owner',password:'a-strong-test-password'}}); assert.equal(login.statusCode,200);
  const headers = {authorization:`Bearer ${login.json().token}`};
  async function publish(slug: string, text: string, parentId: string | null = null, deferLabels = false) {
    const created = await app.inject({method:'POST',url:'/admin/articles',headers,payload:{name:slug,slug,parentId,deferLabels}}); assert.equal(created.statusCode,201);
    const id = created.json().id; ids.push(id);
    const upload = await app.inject({method:'PUT',url:`/admin/articles/${id}/content`,headers:{...headers,'content-type':'text/markdown'},payload:text}); assert.equal(upload.statusCode,202);
    return id;
  }
  const exact = await publish('nursing','# A'); const partial = await publish('nursing-basics','# B',exact); const related = await publish('assessment','# C');
  await queue.dispatch(); await until(async () => (await repo.all()).filter(a => a.labelStatus === 'success').length === 3); await articles.reconcile();
  assert.deepEqual((await search.search('nursing')).hits.map(h => h.id),[exact,partial,related]);
  const failing = await publish('failure','# force-failure'); await queue.dispatch();
  await until(async () => (await queue.queue.getJob(failing))?.getState().then(state => state === 'delayed') ?? false);
  const job = (await queue.queue.getJob(failing))!; await job.changeDelay(0);
  await until(async () => (await queue.queue.getJob(failing))?.getState().then(state => state === 'failed') ?? false);
  await queue.dispatch(); assert.equal(attempts,2); assert.equal((await repo.get(failing))?.labelStatus,'failed'); assert.ok(await queue.dlq.getJob(failing));
  const pending = await publish('pending-retry','# Pending retry',null,true);
  await queue.dispatch(); assert.equal(await queue.queue.getJob(pending),undefined);
  allowRetry = true;
  const retry = await app.inject({method:'POST',url:'/admin/labels/retry',headers});
  assert.equal(retry.statusCode,200); assert.deepEqual(retry.json(),{retried:2});
  await until(async () => (await repo.get(failing))?.labelStatus === 'success' && (await repo.get(pending))?.labelStatus === 'success');
  assert.deepEqual((await repo.get(failing))?.labels,labels); assert.equal(await queue.dlq.getJob(failing),undefined);
  assert.equal((await repo.notifications()).filter(n => n.articleId === failing).length,2);
  const removed = await app.inject({method:'DELETE',url:`/admin/articles/${exact}`,headers}); assert.equal(removed.statusCode,200);
  assert.equal(await repo.get(partial),null); assert.equal((await search.search('nursing')).hits.length,1);
  for (const id of ids) { await (await queue.queue.getJob(id))?.remove(); await (await queue.dlq.getJob(id))?.remove(); }
});
