import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';

test('browser: public search/reader, image fallback, safe Markdown and responsive layout', async t => {
  const server = await preview({root:resolve('apps/public-web'),preview:{host:'127.0.0.1',port:0}});
  t.after(() => new Promise<void>(done => server.httpServer.close(() => done())));
  const origin = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})}); t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors: string[] = []; page.on('pageerror',error => errors.push(error.message));
  await page.route('**/api/search?**',route => route.fulfill({json:{source:'mongo',hits:[{id:'a',slug:'nursing',name:'Nursing fundamentals',labels:['patient care'],uploadedAt:'2026-01-01',match:'exact'}]}}));
  await page.route('**/api/articles/nursing',route => route.fulfill({json:{id:'a',slug:'nursing',name:'Nursing fundamentals',size:100,uploadedAt:'2026-01-01',labels:['patient care'],labelStatus:'success',breadcrumb:[],images:{},markdown:'# Foundations\n\nReadable reference content.\n\n![missing](missing.png)\n\n<script>window.unsafeMarkdown = true</script>\n\n[Unsafe](javascript:alert(1))'}}));
  await page.goto(origin);
  assert.equal(await page.getByRole('heading',{name:'Nursing & medicine. Knowledge, organized.'}).count(),1);
  await mkdir('test-results',{recursive:true}); await page.screenshot({path:'test-results/public-desktop.png',fullPage:true});
  await page.getByRole('searchbox').fill('nursing'); await page.getByRole('button',{name:'Search'}).click();
  await page.getByRole('link',{name:'Nursing fundamentals'}).click();
  await page.getByText('[no image]',{exact:true}).waitFor();
  assert.equal(await page.evaluate(() => 'unsafeMarkdown' in window),false);
  assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
  await page.screenshot({path:'test-results/reader-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  await page.screenshot({path:'test-results/reader-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
});
test('browser: owner login, staged upload, notifications, delete confirmation and sign out', async t => {
  const server = await preview({root:resolve('apps/admin-web'),preview:{host:'127.0.0.1',port:0}});
  t.after(() => new Promise<void>(done => server.httpServer.close(() => done())));
  const origin = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}/admin/`;
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})}); t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors: string[] = [], uploads: string[] = []; page.on('pageerror',error => errors.push(error.message));
  let published = false, deleted = false;
  await page.route('**/api/**',async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/login')) return route.fulfill({json:{token:'test-token'}});
    assert.equal(request.headers().authorization,'Bearer test-token');
    if (path.endsWith('/tree')) return route.fulfill({json:{nodes:published && !deleted ? [{id:'a',name:'Nursing fundamentals',kind:'article',slug:'nursing',parentId:null}] : [],articles:published && !deleted ? [{_id:'a',name:'Nursing fundamentals',slug:'nursing',parentId:null,state:'published',labels:[],labelStatus:'pending',size:100,uploadedAt:'2026-01-01',ancestors:[],imagePaths:[]}] : []}});
    if (path.endsWith('/notifications')) return route.fulfill({json:{notifications:[]}});
    if (request.method() === 'DELETE') { deleted = true; return route.fulfill({json:{pending:false,deleted:1}}); }
    if (path.endsWith('/articles')) { uploads.push('metadata'); return route.fulfill({status:201,json:{id:'a',slug:'nursing',objectKey:'articles/a/content.md'}}); }
    if (path.endsWith('/content')) { uploads.push('markdown'); published = true; assert.ok(request.postData()?.includes('# Nursing')); return route.fulfill({status:202,json:{id:'a',labelStatus:'pending',imagePaths:[]}}); }
    return route.fulfill({status:404,json:{error:'Unexpected request'}});
  });
  await page.goto(origin); await page.getByLabel('Username',{exact:true}).fill('owner'); await page.getByLabel('Password',{exact:true}).fill('test-password'); await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Your library'}).waitFor();
  await mkdir('test-results',{recursive:true}); await page.screenshot({path:'test-results/admin-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'+ Upload article',exact:true}).click();
  await page.getByLabel('Article name',{exact:true}).fill('Nursing fundamentals'); await page.getByLabel('Permanent slug').fill('nursing');
  await page.getByLabel('Markdown article',{exact:false}).setInputFiles({name:'nursing.md',mimeType:'text/markdown',buffer:Buffer.from('# Nursing\n\nTest reference.')});
  await page.getByRole('button',{name:'Upload article',exact:true}).click();
  await page.getByRole('status').filter({hasText:'available in the library'}).waitFor();
  assert.deepEqual(uploads,['metadata','markdown']);
  await page.getByRole('button',{name:'Delete Nursing fundamentals',exact:true}).click();
  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('button',{name:'Keep content'}).press('Tab');
  assert.equal(await page.getByRole('button',{name:'Delete permanently'}).evaluate(el => el === document.activeElement),true);
  await page.getByRole('button',{name:'Delete permanently'}).click();
  await page.getByRole('heading',{name:'Your collection starts here'}).waitFor();
  await page.getByRole('button',{name:'Notifications'}).click(); await page.getByRole('heading',{name:'All quiet for now'}).waitFor();
  await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  await page.screenshot({path:'test-results/admin-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Sign out'}).click(); await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
});
