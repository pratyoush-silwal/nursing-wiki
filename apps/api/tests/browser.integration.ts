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
  await page.route('**/api/articles/nursing',route => route.fulfill({json:{id:'a',slug:'nursing',name:'Nursing fundamentals',size:100,uploadedAt:'2026-01-01',labels:['patient care'],labelStatus:'success',breadcrumb:[],images:{},markdown:'# Foundations\n\nReadable reference content.\n\n$E=mc^2$\n\n```mermaid\nflowchart LR\n  A[Read] --> B[Learn]\n```\n\n![missing](missing.png)\n\n<script>window.unsafeMarkdown = true</script>\n\n[Unsafe](javascript:alert(1))'}}));
  await page.goto(origin);
  assert.equal(await page.getByRole('heading',{name:'Nursing & medicine. Knowledge, organized.'}).count(),1);
  await page.waitForFunction(() => document.querySelector('.icon-sidebar')!.getBoundingClientRect().top >= document.querySelector('.navbar')!.getBoundingClientRect().bottom - 1);
  await mkdir('test-results',{recursive:true}); await page.screenshot({path:'test-results/public-desktop.png',fullPage:true});
  await page.getByRole('combobox',{name:'Search articles'}).fill('nursing');
  await page.evaluate(() => window.scrollTo({top:200,behavior:'instant'}));
  await page.locator('.search-navbar.search-compact').waitFor();
  await page.waitForTimeout(520);
  assert.ok(await page.evaluate(() => document.querySelector('.icon-sidebar')!.getBoundingClientRect().top >= document.querySelector('.navbar')!.getBoundingClientRect().bottom - 1));
  const searchBox = await page.locator('.navbar-search').boundingBox(), logoBox = await page.locator('.wordmark').boundingBox(), accountBox = await page.locator('.navbar>nav').boundingBox();
  assert.ok(searchBox && logoBox && accountBox);
  assert.ok(searchBox.x >= logoBox.x + logoBox.width && searchBox.x + searchBox.width <= accountBox.x);
  assert.equal(await page.getByRole('combobox',{name:'Search articles'}).inputValue(),'nursing');
  await page.getByRole('button',{name:'Search'}).click();
  await page.getByRole('link',{name:'Nursing fundamentals'}).click();
  await page.getByText('[no image]',{exact:true}).waitFor();
  await page.locator('.markdown mjx-container').waitFor();
  await page.locator('.diagram svg').waitFor();
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
  let published = false, deleted = false, labelsFailed = false;
  await page.route('**/api/**',async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/login')) return route.fulfill({json:{token:'test-token'}});
    assert.equal(request.headers().authorization,'Bearer test-token');
    if (path.endsWith('/tree')) return route.fulfill({json:{nodes:published && !deleted ? [{id:'a',name:'Nursing fundamentals',kind:'article',slug:'nursing',parentId:null}] : [],articles:published && !deleted ? [{_id:'a',name:'Nursing fundamentals',slug:'nursing',parentId:null,state:'published',labels:[],labelStatus:labelsFailed ? 'failed' : 'pending',size:100,uploadedAt:'2026-01-01',ancestors:[],imagePaths:[]}] : []}});
    if (path.endsWith('/notifications')) return route.fulfill({json:{notifications:[]}});
    if (path.endsWith('/labels/retry')) { labelsFailed = false; return route.fulfill({json:{retried:1}}); }
    if (request.method() === 'DELETE') { deleted = true; return route.fulfill({json:{pending:false,deleted:1}}); }
    if (path.endsWith('/articles')) { uploads.push('metadata'); return route.fulfill({status:201,json:{id:'a',slug:'nursing',objectKey:'articles/a/content.md'}}); }
    if (path.endsWith('/content')) { uploads.push('markdown'); published = true; labelsFailed = true; assert.ok(request.postData()?.includes('# Nursing')); return route.fulfill({status:202,json:{id:'a',labelStatus:'pending',imagePaths:[]}}); }
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
  await page.getByRole('button',{name:'Retry pending & failed labels'}).click();
  await page.getByRole('status').filter({hasText:'Queued 1 article'}).waitFor();
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
test('browser: verified client login, premium gate, local card replay and timed quiz submission', async t => {
  const server=await preview({root:resolve('apps/client-web'),preview:{host:'127.0.0.1',port:0}});
  t.after(()=>new Promise<void>(done=>server.httpServer.close(()=>done())));
  const origin=`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let premium=false,submitted=false,answerSaves=0,deckCalls=0;
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();
    if(path==='/api/auth/register')return route.fulfill({status:202,json:{message:'Check email'}});
    if(path==='/api/auth/verify'||path==='/api/auth/login')return route.fulfill({json:{token:'client-token'}});
    if(path==='/api/auth/me')return route.fulfill({json:{id:'reader',email:'reader@example.com',premium,role:'client'}});
    if(path==='/api/quizzes')return route.fulfill({json:{quizzes:[{_id:'quiz',title:'Clinical foundations',questionCount:1,expiresAt:new Date(Date.now()+86400000).toISOString()}]}});
    if(path==='/api/flashcards'){if(!premium)return route.fulfill({status:403,json:{code:'PREMIUM_REQUIRED',error:'upgrade to premium'}});return route.fulfill({json:{decks:[{_id:'deck',articleId:'article',title:'Review foundations'}]}});}
    if(path==='/api/premium/unlock'){assert.equal(body.code,'FREE');premium=true;return route.fulfill({json:{premium:true}});}
    if(path==='/api/flashcards/by-article/article'){deckCalls++;return route.fulfill({json:{_id:'deck',articleId:'article',title:'Review foundations',markdown:'```front\nWhat matters?\n```\n```back\nCareful observation.\n```'}});}
    if(path==='/api/quizzes/quiz/start')return route.fulfill({json:{quizId:'quiz',title:'Clinical foundations',questions:[{id:'q1',stem:'Choose the answer.',options:['First','Second']}],answers:{},deadlineAt:new Date(Date.now()+60000).toISOString(),serverNow:new Date().toISOString(),submittedAt:null}});
    if(path==='/api/quizzes/quiz/answers'){answerSaves++;return route.fulfill({json:{saved:true,submitted:false}});}
    if(path==='/api/quizzes/quiz/submit'){assert.deepEqual(body.answers,{q1:1});submitted=true;return route.fulfill({status:202,json:{queued:true}});}
    if(path==='/api/quizzes/attempts/me')return route.fulfill({json:{results:submitted?[{_id:'quiz',title:'Clinical foundations',activatedAt:new Date().toISOString(),attempt:{scorePercent:100,answers:{q1:1}}}]:[]}});
    return route.fulfill({status:404,json:{error:'Not found'}});
  });
  await page.goto(`${origin}/client/`);await page.getByRole('button',{name:'Create an account'}).click();await page.getByLabel('Email',{exact:true}).fill('reader@example.com');await page.getByLabel('Password',{exact:true}).fill('correct-horse-battery');await page.getByLabel('Confirm password',{exact:true}).fill('different-password');await page.getByRole('button',{name:'Send verification code'}).click();await page.getByText('Passwords do not match.',{exact:true}).waitFor();await page.getByLabel('Confirm password',{exact:true}).fill('correct-horse-battery');await page.getByRole('button',{name:'Send verification code'}).click();await page.getByLabel('Verification code').fill('123456');await page.getByRole('button',{name:'Verify email'}).click();await page.getByRole('heading',{name:'start learning',exact:true}).waitFor();
  await mkdir('test-results',{recursive:true});
  for(const width of [1440,1024,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`test-results/client-${width}.png`,fullPage:true});}
  await page.goto(`${origin}/client/flashcards`);await page.getByRole('dialog',{name:'upgrade to premium'}).waitFor();await page.getByRole('link',{name:'Go to upgrade'}).click();await page.getByLabel('Unlock code').fill('FREE');await page.getByRole('button',{name:'Unlock premium',exact:true}).click();await page.getByText('You’re a premium member.',{exact:false}).waitFor();
  await page.goto(`${origin}/client/flashcards/article`);const callsBeforeStudy=deckCalls;await page.getByRole('button',{name:'Flip card'}).click();await page.getByRole('button',{name:'Good',exact:true}).click();await page.getByRole('heading',{name:'That’s a good session.'}).waitFor();assert.equal(deckCalls,callsBeforeStudy);
  await page.goto(`${origin}/client/quizzes`);await page.getByRole('button',{name:'Join Quiz',exact:true}).click();await page.getByRole('radio',{name:'Second'}).check();await page.getByRole('button',{name:'Submit answers'}).click();await page.getByText('100%',{exact:true}).waitFor();assert.ok(answerSaves>=1);assert.equal(submitted,true);assert.deepEqual(errors,[]);
});

test('browser: submitted quiz review highlights selections, survives refresh and expires', async t => {
  const server = await preview({root:resolve('apps/client-web'),preview:{host:'127.0.0.1',port:0}});
  t.after(() => new Promise<void>(done => server.httpServer.close(() => done())));
  const origin = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.addInitScript(() => sessionStorage.setItem('wiki-client-token', 'test-token'));
  const result = { _id: 'review-quiz', title: 'Review practice', activatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), status: 'graded', attempt: { scorePercent: 0, answers: { a: 0 } }, review: { questions: [{ id: 'a', stem: 'Which answer is correct?', options: ['Wrong choice', 'Right choice'] }, { id: 'b', stem: 'Unanswered question', options: ['First', 'Second'] }], correctAnswers: { a: 1, b: 0 }, answers: { a: 0 } } };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({json:{id:'reader',email:'reader@example.com',premium:false}});
    if (path === '/api/quizzes') return route.fulfill({json:{quizzes:[]}});
    if (path === '/api/quizzes/attempts/me') return route.fulfill({json:{results:[result]}});
    return route.fulfill({status:404,json:{error:'Not found'}});
  });
  await page.goto(`${origin}/client/results`);
  await page.getByText('Review questions and answers', {exact:true}).click();
  await page.locator('.review-correct').first().waitFor();
  assert.equal(await page.locator('.review-correct').count(), 2);
  assert.equal(await page.locator('.review-incorrect').count(), 1);
  assert.match(await page.locator('.review-incorrect').innerText(), /Wrong choice/);
  assert.equal(await page.locator('.quiz-review input').count(), 0);
  await page.getByText('You did not answer this question.', {exact:true}).waitFor();
  assert.equal(await page.locator('.review-correct').filter({hasText:'Correct answer · No selection'}).count(), 1);
  assert.equal(await page.getByText('Correct answer · Your selection', {exact:true}).count(), 0);
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('wiki-quiz-review:reader:review-quiz')!));
  assert.deepEqual(stored.review.answers, {a:0});
  await page.reload();
  await page.getByText('Review questions and answers', {exact:true}).waitFor();
  await page.clock.install();
  await page.clock.fastForward(61000);
  await page.getByText('This quiz has ended. Question review is no longer available.', {exact:true}).waitFor();
  assert.equal(await page.locator('.quiz-review').count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('wiki-quiz-review:reader:review-quiz')), null);
});
