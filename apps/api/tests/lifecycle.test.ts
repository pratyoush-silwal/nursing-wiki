import test from 'node:test';
import assert from 'node:assert/strict';
import { unlink, symlink, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MARKDOWN_LIMIT, IMAGE_LIMIT } from '@wiki/shared';
import { fixture, png, labels, secret } from './helpers.ts';
import { processLabels, failLabels } from '../src/workers/labels.ts';
import { AuthService, seedAdmin } from '../src/services/auth.ts';
import { SignJWT } from 'jose';

test('staged upload materializes folders only after content and is immutable/idempotent', async t => {
  const f = await fixture(); t.after(f.close);
  const input = {name:'Assessment',slug:'assessment',folderPath:['Nursing','Fundamentals']};
  const a = await f.articles.create(input);
  assert.equal((await f.articles.explorer()).nodes.length,0);
  await assert.rejects(f.articles.read('assessment'),/not found/);
  assert.equal((await f.articles.create(input))._id,a._id);
  await assert.rejects(f.articles.create({...input,name:'Different'}),/already belongs/);
  await f.articles.upload(a._id,Buffer.from('# Assessment\n![scan](images/scan.png)'));
  assert.equal((await f.articles.explorer()).nodes.length,3);
  const read = await f.articles.read('assessment'); assert.equal(read.breadcrumb.length,2); assert.deepEqual(read.images,{});
  await f.articles.upload(a._id,Buffer.from(read.markdown));
  await assert.rejects(f.articles.upload(a._id,Buffer.from('# Changed')),/immutable/);
  await f.articles.image(a._id,'images/scan.png',png); await f.articles.image(a._id,'images/scan.png',png);
  assert.ok((await f.articles.read('assessment')).images['images/scan.png'].endsWith('/images/scan.png'));
  await assert.rejects(f.articles.image(a._id,'not-referenced.png',png),/not referenced/);
  await assert.rejects(f.articles.image(a._id,'images/scan.png',Buffer.concat([png,Buffer.from('changed')])),/immutable/);
});
test('deferred labels survive publication and metadata recovery', async t => {
  const f = await fixture(); t.after(f.close);
  const article = await f.articles.create({name:'Demo',slug:'demo',deferLabels:true});
  await f.articles.upload(article._id,Buffer.from('# Demo'));
  assert.equal((await f.repo.get(article._id))?.labelsDeferred,true);
  f.repo.articles.clear(); await f.articles.reconcile();
  assert.equal((await f.repo.get(article._id))?.labelsDeferred,true);
});
test('reconcile preserves metadata when object manifests are missing without a deletion intent', async t => { const f = await fixture(); t.after(f.close); const article = await f.publish('recoverable'); await unlink(join(f.root, 'articles', article._id, '.manifest.json')); await f.articles.reconcile(); assert.equal((await f.repo.get(article._id))?.slug, 'recoverable'); });
test('uploads reject excessive size, invalid UTF-8, unsafe paths and images before Markdown', async t => {
  const f = await fixture(); t.after(f.close); const a = await f.articles.create({name:'X',slug:'x'});
  await assert.rejects(f.articles.upload(a._id,Buffer.alloc(MARKDOWN_LIMIT+1)),/6 MB/);
  await assert.rejects(f.articles.upload(a._id,Buffer.from([255])),/UTF-8/);
  await assert.rejects(f.articles.upload(a._id,Buffer.from('![x](../scan.png)')),/relative/);
  await assert.rejects(f.articles.image(a._id,'scan.png',png),/before/);
  await assert.rejects(f.articles.image(a._id,'scan.png',Buffer.alloc(IMAGE_LIMIT+1)),/20 MB/);
  await assert.rejects(f.articles.upload(a._id,Buffer.alloc(0)),/1 byte/);
  assert.equal((await f.articles.explorer()).nodes.length,0);
});
test('concurrent identical creation and conflicting content remain consistent', async t => {
  const f = await fixture(); t.after(f.close);
  const [a,b] = await Promise.all([f.articles.create({name:'A',slug:'a'}),f.articles.create({name:'A',slug:'a'})]); assert.equal(a._id,b._id);
  const outcomes = await Promise.allSettled([f.articles.upload(a._id,Buffer.from('# One')),f.articles.upload(a._id,Buffer.from('# Two'))]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length,1);
  assert.equal((await f.repo.all()).length,1);
});
test('metadata write failures recover from disk without duplicating a reserved slug', async t => {
  const f = await fixture(); t.after(f.close);
  const put = f.repo.put.bind(f.repo); let broken = true;
  f.repo.put = async a => { if (broken) throw new Error('database write failed'); await put(a); };
  await assert.rejects(f.articles.create({name:'Retry',slug:'retry'}),/write failed/);
  const stored = await f.storage.loadAll(); assert.equal(stored.length,1);
  broken = false; const retried = await f.articles.create({name:'Retry',slug:'retry'});
  assert.equal(retried._id,stored[0]._id); assert.equal((await f.storage.loadAll()).length,1);
  broken = true; await assert.rejects(f.articles.upload(retried._id,Buffer.from('# Retry')),/write failed/);
  broken = false; await f.articles.reconcile(); assert.equal((await f.articles.read('retry')).markdown,'# Retry');
});
test('storage-full notifications and retryable disk deletion failures preserve recovery intent', async t => {
  const f = await fixture(); t.after(f.close); const draft = await f.articles.create({name:'Full',slug:'full'});
  const immutable = f.storage.immutable.bind(f.storage);
  f.storage.immutable = async () => { throw Object.assign(new Error('disk full'),{code:'ENOSPC'}); };
  await assert.rejects(f.articles.upload(draft._id,Buffer.from('# Full')),/disk full/);
  assert.equal((await f.repo.notifications())[0].type,'storage-full'); assert.equal((await f.articles.explorer()).nodes.length,0);
  f.storage.immutable = immutable; await f.articles.upload(draft._id,Buffer.from('# Full'));
  const remove = f.storage.remove.bind(f.storage);
  f.storage.remove = async () => { throw new Error('disk temporarily unavailable'); };
  await assert.rejects(f.articles.delete(draft._id),/temporarily unavailable/);
  assert.equal((await f.storage.intents()).length,1); await assert.rejects(f.articles.read('full'),/not found/);
  f.storage.remove = remove; await f.articles.reconcile(); assert.equal(await f.repo.get(draft._id),null);
});
test('storage-full while reserving metadata also notifies the owner', async t => {
  const f = await fixture(); t.after(f.close);
  f.storage.save = async () => { throw Object.assign(new Error('disk full'),{code:'ENOSPC'}); };
  await assert.rejects(f.articles.create({name:'No space',slug:'no-space'}),/storage is full/);
  assert.equal((await f.repo.notifications())[0].type,'storage-full'); assert.equal((await f.repo.all()).length,0);
});
test('a folder cannot be recreated until its pending deletion finishes', async t => {
  const f = await fixture(); t.after(f.close); const a = await f.publish('old','# Old',{folderPath:['Folder']});
  f.index.down = true; await f.articles.delete(a.ancestors[0].id);
  await assert.rejects(f.articles.create({name:'New',slug:'new',folderPath:['Folder']}),/being deleted/);
  f.index.down = false; await f.articles.reconcile();
  const b = await f.publish('new','# New',{folderPath:['Folder']}); await f.articles.delete(b.ancestors[0].id);
  assert.equal((await f.repo.notifications()).filter(n => n.type === 'delete-complete').length,2);
});
test('folder and non-leaf article deletion removes descendants, images, labels, drafts and indexes', async t => {
  const f = await fixture(); t.after(f.close);
  const parent = await f.publish('parent','# Parent',{folderPath:['Nursing']});
  const child = await f.publish('child','![x](scan.png)',{parentId:parent._id});
  await f.articles.image(child._id,'scan.png',png);
  await f.articles.create({name:'Draft',slug:'draft',parentId:child._id});
  await processLabels(f.articles,child._id,async () => labels); await f.articles.reconcile();
  assert.equal(f.index.docs.size,2);
  const result = await f.articles.delete(parent._id); assert.equal(result.deleted,3); assert.equal(result.pending,false);
  assert.equal((await f.repo.all()).length,0); assert.equal(f.index.docs.size,0);
  assert.equal(await f.storage.exists(child._id,'scan.png'),false); assert.equal((await f.articles.explorer()).nodes.length,0);
  assert.equal((await f.articles.delete(parent._id)).deleted,0);
  assert.equal((await f.repo.notifications()).filter(n => n.type === 'delete-complete').length,1);
  const another = await f.publish('another','# Another',{folderPath:['Folder']});
  await f.articles.delete(another.ancestors[0].id); assert.equal((await f.repo.all()).length,0);
});
test('failed search cleanup leaves a durable deletion intent and resumes without resurrection', async t => {
  const f = await fixture(); t.after(f.close); const a = await f.publish('delete-me'); await f.articles.reconcile();
  f.index.down = true;
  assert.equal((await f.articles.delete(a._id)).pending,true);
  assert.equal((await f.storage.intents()).length,1); assert.equal(await f.storage.exists(a._id),false);
  assert.deepEqual((await f.search.search('delete-me')).hits,[]);
  f.index.down = false; await f.articles.reconcile();
  assert.equal((await f.storage.intents()).length,0); assert.equal(f.index.docs.size,0);
});
test('search fallback honors precedence, excludes body and private drafts, checks file existence', async t => {
  const f = await fixture(); t.after(f.close);
  const exact = await f.publish('nursing'); const partial = await f.publish('nursing-basics'); const related = await f.publish('assessment');
  await processLabels(f.articles,related._id,async () => labels);
  await f.publish('body-only','nursing'); await f.articles.create({name:'Nursing draft',slug:'nursing-draft'}); await f.articles.reconcile();
  for (const down of [false,true]) {
    f.index.down = down; const result = await f.search.search('NURSING');
    assert.deepEqual(result.hits.map(h => h.id),[exact._id,partial._id,related._id]);
    assert.equal(result.source,down ? 'mongo' : 'elasticsearch');
  }
  await unlink(f.storage.path(exact._id,'content.md'));
  assert.equal((await f.search.search('nursing')).hits.some(h => h.id === exact._id),false);
  await assert.rejects(f.articles.read('nursing'),/not found/);
});
test('label success and failure preserve public content and never resurrect deleted articles', async t => {
  const f = await fixture(); t.after(f.close); const a = await f.publish('label-me');
  await assert.rejects(processLabels(f.articles,a._id,async () => { throw new Error('Gemini unavailable'); }));
  assert.equal((await f.repo.get(a._id))?.labelStatus,'pending'); assert.ok(await f.articles.read(a.slug));
  await processLabels(f.articles,a._id,async () => labels); await processLabels(f.articles,a._id,async () => { throw new Error('must not call twice'); });
  assert.equal((await f.repo.notifications()).length,1); assert.equal((await f.repo.get(a._id))?.labelStatus,'success');
  const failed = await f.publish('failed'); await failLabels(f.articles,failed._id); await failLabels(f.articles,failed._id);
  assert.equal((await f.repo.get(failed._id))?.labelStatus,'failed'); assert.ok(await f.articles.read(failed.slug));
  const racing = await f.publish('racing');
  await processLabels(f.articles,racing._id,async () => { await f.articles.delete(racing._id); return labels; });
  assert.equal(await f.repo.get(racing._id),null);
});
test('manifests rebuild missing metadata, ancestry, labels and search index', async t => {
  const f = await fixture(); t.after(f.close); const a = await f.publish('recover','# Recover',{folderPath:['Medicine']});
  await processLabels(f.articles,a._id,async () => labels); await f.articles.reconcile();
  f.repo.articles.clear(); f.index.docs.clear(); await f.articles.rebuildIndex();
  assert.equal((await f.articles.read(a.slug)).breadcrumb[0].name,'Medicine');
  assert.deepEqual((await f.repo.get(a._id))?.labels,labels); assert.equal(f.index.docs.size,1);
});
test('storage rejects symlink objects', async t => {
  const f = await fixture(); t.after(f.close); const a = await f.publish('symlink','![x](images/scan.png)');
  await mkdir(join(f.root,'other')); await symlink(join(f.root,'other'),join(f.root,'articles',a._id,'images'));
  await assert.rejects(f.articles.image(a._id,'images/scan.png',png),/Symlinks/);
  await writeFile(join(f.root,'other','content.md'),'outside object storage'); await unlink(join(f.root,'articles',a._id,'content.md')); await symlink(join(f.root,'other','content.md'),join(f.root,'articles',a._id,'content.md'));
  await assert.rejects(f.storage.read(a._id),/Symlinks/);
});
test('owner authentication rejects forged, expired and revoked tokens; seed never resets owner', async t => {
  const f = await fixture(); t.after(f.close);
  await seedAdmin(f.repo,'owner','a-strong-test-password');
  await seedAdmin(f.repo,'other','different-test-password'); assert.equal((await f.repo.admin())?.username,'owner');
  await assert.rejects(f.auth.login({username:'owner',password:'wrong'}),/Invalid/);
  const {token} = await f.auth.login({username:'owner',password:'a-strong-test-password'});
  assert.equal((await f.auth.authorize(`Bearer ${token}`))._id,'owner');
  await assert.rejects(f.auth.authorize(undefined),/required/);
  const key = new TextEncoder().encode(secret);
  const foreign = await new SignJWT({owner:false,version:0}).setProtectedHeader({alg:'HS256'}).setSubject('owner').setIssuer('nursing-wiki').setAudience('nursing-wiki-admin').setExpirationTime('7d').sign(key);
  await assert.rejects(f.auth.authorize(`Bearer ${foreign}`),/Owner access/);
  const expired = await new SignJWT({owner:true,version:0}).setProtectedHeader({alg:'HS256'}).setSubject('owner').setIssuer('nursing-wiki').setAudience('nursing-wiki-admin').setExpirationTime(1).sign(key);
  await assert.rejects(f.auth.authorize(`Bearer ${expired}`),/expired/);
  await f.auth.change({currentPassword:'a-strong-test-password',username:'renamed',password:'a-new-strong-password'});
  await assert.rejects(f.auth.authorize(`Bearer ${token}`),/revoked/);
  assert.ok(await f.auth.login({username:'renamed',password:'a-new-strong-password'}));
  await assert.rejects(new AuthService(f.repo,undefined).login({username:'renamed',password:'a-new-strong-password'}),/configured/);
});
