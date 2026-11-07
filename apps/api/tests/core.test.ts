import test from 'node:test';
import assert from 'node:assert/strict';
import { createArticleSchema, credentialsSchema, labelsSchema, MARKDOWN_LIMIT, IMAGE_LIMIT } from '@wiki/shared';
import { imagePath, markdownImages, validateImage } from '../src/lib/markdown.ts';
import { folderId, ancestry, descendants, tree } from '../src/lib/hierarchy.ts';
import { rankedQuery, rank } from '../src/services/search.ts';
import { Lock } from '../src/lib/lock.ts';
import { LABEL_ATTEMPTS, LABEL_RETRY_DELAY, LABEL_PROMPT, gemini } from '../src/workers/labels.ts';
import { fixture, png, labels } from './helpers.ts';

test('contracts reject invalid identities, paths, extra fields, and bcrypt truncation', () => {
  assert.equal(MARKDOWN_LIMIT,6*1024*1024); assert.equal(IMAGE_LIMIT,20*1024*1024);
  for (const slug of ['UPPER','/etc','../thing','', 'a b']) assert.equal(createArticleSchema.safeParse({name:'Name',slug}).success,false);
  assert.equal(createArticleSchema.safeParse({name:'Name',slug:'name',owner:true}).success,false);
  assert.equal(createArticleSchema.safeParse({name:'Name',slug:'name',folderPath:['..']}).success,false);
  assert.equal(credentialsSchema.safeParse({username:'x',currentPassword:'x',password:'😀'.repeat(20)}).success,false);
});
test('Markdown paths include reference-style images and ignore examples in code', () => {
  assert.deepEqual(markdownImages('![a](./images/heart.png)\n![b][ref]\n\n[ref]: scan.webp\n\n```md\n![not real](https://bad.invalid/a.png)\n```'),['images/heart.png','scan.webp']);
  assert.deepEqual(markdownImages('![a](scan.png) ![a](scan.png)'),['scan.png']);
  assert.throws(() => markdownImages('<img src="https://bad.invalid/x">'));
  assert.throws(() => markdownImages('![x](https://bad.invalid/x.png)'));
});
test('image paths reject traversal, protocols, hidden files, SVG and encoded escapes', () => {
  for (const path of ['../x.png','/x.png','a/../../x.png','a\\x.png','https://example.com/a.png','data:image/png','x.svg','%2e%2e/x.png','%252e%252e/x.png','x.png?foo','.manifest.json','a//x.png','a/.secret.png','a%00.png']) assert.throws(() => imagePath(path),path);
  assert.equal(imagePath('./images/heart%20scan.png'),'images/heart scan.png');
  assert.throws(() => imagePath(`${'😀'.repeat(70)}.png`));
  validateImage('scan.png',png); assert.throws(() => validateImage('scan.jpg',png)); assert.throws(() => validateImage('scan.png',Buffer.from('<script>')));
});
test('hierarchy IDs are stable, descendants are complete and cycles are rejected', () => {
  const folder = folderId(null,'Nursing'); assert.equal(folder,folderId(null,'Nursing')); assert.notEqual(folder,folderId(null,'Medicine'));
  const nodes = [{id:'root',parentId:null,name:'Root',kind:'folder' as const},{id:'a',parentId:'root',name:'A',kind:'article' as const},{id:'b',parentId:'a',name:'B',kind:'article' as const}];
  assert.deepEqual([...descendants(nodes,'root')].sort(),['a','b','root']); assert.deepEqual(ancestry(nodes,'b').map(n => n.id),['root','a','b']);
  assert.throws(() => ancestry([{...nodes[0],parentId:'root'}],'root'));
});
test('scoring uses maximum fixed tiers; labels cannot outscore slug matches', async t => {
  const f = await fixture(); t.after(f.close);
  const a = await f.publish('heart');
  assert.equal(rank({...a,labels:['heart']},'heart'),3);
  assert.equal(rank({...a,slug:'heart-care',labels:['heart']},'heart'),2);
  assert.equal(rank({...a,slug:'other',labels:['heart']},'heart'),1);
  assert.equal(rank({...a,slug:'other',name:'heart',labels:[]},'heart'),0);
  const query = rankedQuery('heart*');
  assert.equal(query.query.function_score.score_mode,'max'); assert.equal(query.query.function_score.boost_mode,'replace');
  assert.ok(!JSON.stringify(query).includes('markdown'));
  assert.deepEqual(tree([{...a,state:'draft'}]),[]);
});
test('label contract enforces six or seven distinct short strings', () => {
  assert.deepEqual(labelsSchema.parse(labels),labels);
  assert.throws(() => labelsSchema.parse(['one'])); assert.throws(() => labelsSchema.parse(Array(6).fill('same')));
  assert.equal(LABEL_ATTEMPTS,2); assert.equal(LABEL_RETRY_DELAY,12*60*60*1000);
  assert.ok(LABEL_PROMPT.includes('6 to 7'));
});
test('Gemini validates structured output and sends credentials in a header', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    assert.ok(!String(url).includes('test-key')); assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],'test-key');
    assert.ok(String(init?.body).includes(LABEL_PROMPT.split('\n')[0]));
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(labels)}]}}]}));
  };
  assert.deepEqual(await gemini('test-key','test-model')('# Article'),labels);
  globalThis.fetch = async () => new Response(JSON.stringify({candidates:[{content:{parts:[{text:'not json'}]}}]}));
  await assert.rejects(gemini('test-key','test-model')('Article'));
  await assert.rejects(gemini(undefined,'test-model')('Article'),/configured/);
});
test('mutation serialization survives a rejected operation', async () => {
  const lock = new Lock(), order: number[] = [];
  const first = lock.run(async () => { order.push(1); throw new Error('expected'); });
  const second = lock.run(async () => { order.push(2); });
  await assert.rejects(first); await second; assert.deepEqual(order,[1,2]);
});
