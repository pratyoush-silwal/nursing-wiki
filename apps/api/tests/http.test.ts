import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/routes/app.ts';
import { AuthService, seedAdmin } from '../src/services/auth.ts';
import { fixture, png } from './helpers.ts';

test('HTTP integration: login, protected mutations, uploads, search, credentials and cascade', async t => {
  const f = await fixture(); t.after(f.close);
  await seedAdmin(f.repo,'owner','a-strong-test-password');
  const app = await buildApp({...f,health:async () => ({mongo:true,redis:true,storage:true,elasticsearch:true})}); t.after(() => app.close());
  const unauthenticated = await app.inject({method:'POST',url:'/admin/articles',payload:{name:'X',slug:'x'}}); assert.equal(unauthenticated.statusCode,401);
  for (const [method,url] of [['GET','/admin/tree'],['GET','/admin/notifications'],['PUT','/admin/credentials'],['DELETE','/admin/articles/00000000-0000-4000-8000-000000000000'],['PATCH','/admin/notifications/x/read']]) {
    assert.equal((await app.inject({method:method as 'GET',url})).statusCode,401);
  }
  const login = await app.inject({method:'POST',url:'/admin/login',payload:{username:'owner',password:'a-strong-test-password'}}); assert.equal(login.statusCode,200);
  const headers = { authorization:`Bearer ${login.json().token}` };
  const create = await app.inject({method:'POST',url:'/admin/articles',headers,payload:{name:'Nursing',slug:'nursing',folderPath:['Fundamentals']}}); assert.equal(create.statusCode,201); const id = create.json().id;
  assert.equal((await app.inject(`/articles/nursing`)).statusCode,404);
  assert.equal((await app.inject({method:'PUT',url:`/admin/articles/${id}/content`,headers:{...headers,'content-type':'application/json'},payload:{bad:'body'}})).statusCode,415);
  const upload = await app.inject({method:'PUT',url:`/admin/articles/${id}/content`,headers:{...headers,'content-type':'text/markdown'},payload:'# Nursing\n![Scan](scan.png)'}); assert.equal(upload.statusCode,202);
  const boundary = 'wiki-test-boundary';
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="scan.png"\r\nContent-Type: image/png\r\n\r\n`),png,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const image = await app.inject({method:'POST',url:`/admin/articles/${id}/images`,headers:{...headers,'content-type':`multipart/form-data; boundary=${boundary}`},payload}); assert.equal(image.statusCode,201);
  const read = await app.inject('/articles/nursing'); assert.equal(read.statusCode,200); assert.ok(read.json().images['scan.png']); assert.equal(read.headers['cache-control'],'no-store');
  assert.equal((await app.inject({method:'PUT',url:`/admin/articles/${id}/content`,headers:{...headers,'content-type':'text/markdown'},payload:'# Changed'})).statusCode,409);
  f.index.down = true; const search = await app.inject('/search?q=nursing'); assert.equal(search.statusCode,200); assert.equal(search.json().source,'mongo'); assert.equal(search.json().hits.length,1);
  const updated = await app.inject({method:'PUT',url:'/admin/credentials',headers,payload:{username:'new-owner',currentPassword:'a-strong-test-password',password:'a-new-strong-password'}}); assert.equal(updated.statusCode,204);
  assert.equal((await app.inject({method:'GET',url:'/admin/tree',headers})).statusCode,401);
  const newLogin = await app.inject({method:'POST',url:'/admin/login',payload:{username:'new-owner',password:'a-new-strong-password'}});
  f.index.down = false;
  assert.equal((await app.inject({method:'DELETE',url:`/admin/articles/${id}`,headers:{authorization:`Bearer ${newLogin.json().token}`}})).statusCode,200);
  assert.equal((await app.inject('/articles/nursing')).statusCode,404);
});
test('public routes survive missing authentication/queue/Gemini; readiness reports degradation', async t => {
  const f = await fixture(); t.after(f.close); await f.publish('public');
  const app = await buildApp({...f,auth:new AuthService(f.repo,undefined),health:async () => ({mongo:true,redis:false,storage:true,elasticsearch:false})}); t.after(() => app.close());
  assert.equal((await app.inject('/articles/public')).statusCode,200);
  assert.equal((await app.inject('/search?q=public')).statusCode,200);
  const ready = await app.inject('/health/ready'); assert.equal(ready.statusCode,200); assert.equal(ready.json().status,'degraded');
  assert.equal((await app.inject('/health/live')).statusCode,200);
  const login = await app.inject({method:'POST',url:'/admin/login',payload:{username:'owner',password:'password'}}); assert.equal(login.statusCode,503);
});
