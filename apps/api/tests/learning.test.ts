import test from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import { SignJWT } from 'jose';
import { Learning } from '../src/services/learning.ts';
import { generateDeck, flashcardGemini } from '../src/services/flashcardGeneration.ts';
import { answersSchema, parseDeck, parseQuizMarkdown, replay, quizSchema, type ClientUser } from '../../../packages/shared/src/learning.ts';
import { readFile } from 'node:fs/promises';
import { fixture, secret, png, labels } from './helpers.ts';
import { buildApp } from '../src/routes/app.ts';
import { seedAdmin } from '../src/services/auth.ts';
// A small collection adapter exercises service behavior without external Mongo/Redis.
function memoryDb() {
    const collections = new Map<string, Map<string, any>>();
    function matches(doc: any, query: any): boolean { return Object.entries(query).every(([key, value]: [
        string,
        any
    ]) => { const actual = doc[key]; if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('$gt' in value)
            return actual > value.$gt;
        if ('$lte' in value)
            return actual <= value.$lte;
        if ('$ne' in value)
            return actual !== value.$ne;
        if ('$exists' in value)
            return (actual !== undefined) === value.$exists;
    } return actual === value; }); }
    return { collection(name: string) {
            if (!collections.has(name))
                collections.set(name, new Map());
            const docs = collections.get(name)!;
            const find = (query: any) => [...docs.values()].filter(doc => matches(doc, query));
            return { createIndex: async () => '', findOne: async (q: any) => structuredClone(find(q)[0] ?? null), find(q: any = {}) { let values = find(q); const cursor = { sort(sort: any) { const [key, dir] = Object.entries(sort)[0] as [
                        string,
                        number
                    ]; values.sort((a, b) => (+a[key] - +b[key]) * dir); return cursor; }, limit(n: number) { values = values.slice(0, n); return cursor; }, toArray: async () => structuredClone(values) }; return cursor; },
                async insertOne(doc: any) { if (docs.has(doc._id) || name === 'users' && find({ email: doc.email }).length)
                    throw Object.assign(new Error('duplicate'), { code: 11000 }); docs.set(doc._id, structuredClone(doc)); },
                async replaceOne(q: any, doc: any, options: any) { const old = find(q)[0]; if (old || options?.upsert)
                    docs.set(doc._id, structuredClone(doc)); return { matchedCount: old ? 1 : 0 }; },
                async updateOne(q: any, change: any, options: any) { const old = find(q)[0]; if (old) {
                    Object.assign(old, structuredClone(change.$set ?? {}));
                }
                else if (options?.upsert) {
                    const doc = { ...q, ...change.$setOnInsert, ...change.$set };
                    docs.set(doc._id, structuredClone(doc));
                } return { matchedCount: old ? 1 : 0 }; },
                async updateMany(q: any, change: any) { for (const doc of find(q)) {
                    if (Array.isArray(change))
                        doc.submittedAt = doc.deadlineAt;
                    else
                        Object.assign(doc, structuredClone(change.$set));
                } },
                async deleteOne(q: any) { const old = find(q)[0]; if (old)
                    docs.delete(old._id); }, async deleteMany(q: any) { for (const doc of find(q))
                    docs.delete(doc._id); }
            };
        } } as unknown as Db;
}
async function setup(t: {
    after: (fn: () => Promise<void>) => void;
}) { const f = await fixture(); t.after(f.close); let code = ''; const l = new Learning(memoryDb(), secret, async (_email, c) => { code = c; }, f.articles); await l.initialize(); return { ...f, l, code: () => code }; }
const questions = [{ id: 'a', stem: 'Question $x^2$', options: ['A', 'B'], correctIndex: 1, explanation: 'Because B.' }, { id: 'b', stem: 'Second', options: ['C', 'D'], correctIndex: 0, explanation: '' }];
async function client(l: Learning, code: () => string) { await l.register({ email: 'reader@example.com', password: 'correct-horse-battery' }); const { token } = await l.verify({ email: 'reader@example.com', code: code() }); return { token, user: await l.authorize(`Bearer ${token}`) }; }
test('registration creates no user before verification, codes are hashed and single use; roles cannot cross', async (t) => { const f = await setup(t); await f.l.register({ email: 'reader@example.com', password: 'correct-horse-battery' }); assert.equal(await f.l.users.findOne({ email: 'reader@example.com' }), null); const pending = await f.l.pending.findOne({ _id: 'reader@example.com' }); assert.ok(pending && !JSON.stringify(pending).includes(f.code())); await assert.rejects(f.l.verify({ email: 'reader@example.com', code: '000000' }), /Invalid/); const { token } = await f.l.verify({ email: 'reader@example.com', code: f.code() }); const user = await f.l.authorize(`Bearer ${token}`); assert.equal(user.role, 'client'); assert.equal(user.premium, false); await assert.rejects(f.l.verify({ email: user.email, code: f.code() }), /Invalid/); await assert.rejects(f.auth.authorize(`Bearer ${token}`), /invalid/); const forged = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user._id).setIssuer('nursing-wiki').setAudience('nursing-wiki-client').setExpirationTime('7d').sign(new TextEncoder().encode(secret)); await assert.rejects(f.l.authorize(`Bearer ${forged}`), /invalid/); assert.ok((await f.l.login({ email: user.email, password: 'correct-horse-battery' })).token); });
test('SMTP failure leaves no user or pending registration', async (t) => { const f = await setup(t); const l = new Learning(f.l.db, secret, async () => { throw new Error('SMTP down'); }, f.articles); await assert.rejects(l.register({ email: 'reader@example.com', password: 'correct-horse-battery' }), /SMTP/); assert.equal((await l.users.find({}).toArray()).length, 0); assert.equal((await l.pending.find({}).toArray()).length, 0); });
test('verification expires, caps guesses and does not let a second registration replace the password', async t => { const f = await setup(t); await f.l.register({ email: 'reader@example.com', password: 'correct-horse-battery' }); const correct = f.code(); const pending = await f.l.pending.findOne({ _id: 'reader@example.com' }); assert.ok(pending && pending.expiresAt > new Date() && pending.attempts === 0); await assert.rejects(f.l.register({ email: 'reader@example.com', password: 'attacker-chosen-password' }), /already pending/); const wrong = correct === '000000' ? '999999' : '000000'; for (let i = 0; i < 5; i++) await assert.rejects(f.l.verify({ email: 'reader@example.com', code: wrong }), /Invalid/); assert.equal(await f.l.pending.findOne({ _id: 'reader@example.com' }), null); await assert.rejects(f.l.verify({ email: 'reader@example.com', code: correct }), /Invalid/); await f.l.register({ email: 'reader@example.com', password: 'correct-horse-battery' }); const expired = f.code(); await f.l.pending.updateOne({ _id: 'reader@example.com' }, { $set: { expiresAt: new Date(0) } }); await assert.rejects(f.l.verify({ email: 'reader@example.com', code: expired }), /Invalid/); assert.equal(await f.l.pending.findOne({ _id: 'reader@example.com' }), null); });
test('FREE is the only premium mutation and repeated unlock is permanent/idempotent', async (t) => { const f = await setup(t); const { user } = await client(f.l, f.code); assert.throws(() => f.l.requirePremium(user), (e: any) => e.code === 'PREMIUM_REQUIRED'); await assert.rejects(f.l.unlock(user, { code: 'free' })); await f.l.unlock(user, { code: 'FREE' }); await f.l.unlock(user, { code: 'FREE' }); assert.equal((await f.l.users.findOne({ _id: user._id }))?.premium, true); assert.equal((await f.l.db.collection('notifications').find({}).toArray()).length, 1); });
test('quiz timing is authoritative, answers freeze at submit, grading is idempotent, keys disappear at expiry', async (t) => { const f = await setup(t), now = new Date('2026-01-01T00:00:00Z'); const quiz = await f.l.createQuiz({ title: 'Basics', questions }, 'owner', now); assert.equal(+quiz.expiresAt - +now, 86400000); const session = await f.l.start(quiz._id, 'reader', now); assert.equal(+session.deadlineAt - +now, 120000); assert.equal('correctIndex' in session.questions[0], false); assert.equal((await f.l.start(quiz._id, 'reader', new Date(+now + 5000)))._id, session._id); await assert.rejects(f.l.saveAnswers(quiz._id, 'reader', { answers: { fake: 0 } }, false, now), /Invalid/); await f.l.saveAnswers(quiz._id, 'reader', { answers: { a: 1, b: 0 } }, true, new Date(+now + 1000)); await f.l.saveAnswers(quiz._id, 'reader', { answers: { a: 0 } }, true, new Date(+now + 2000)); await Promise.all([f.l.gradeSession(session._id), f.l.gradeSession(session._id)]); assert.equal((await f.l.attempts.find({}).toArray()).length, 1); assert.equal((await f.l.attempts.findOne({ _id: session._id }))?.scorePercent, 100); await assert.rejects(f.l.start(quiz._id, 'reader', new Date(+now + 3000)), /already/); await f.l.tick(async () => { }, quiz.expiresAt); assert.equal(await f.l.quizzes.findOne({ _id: quiz._id }), null); assert.equal((await f.l.results('reader'))[0].attempt?.scorePercent, 100); assert.equal((await f.l.results('absent'))[0].attempt, null); });
test('deadline auto-submission queues grading and caps starts at quiz expiry', async (t) => { const f = await setup(t), now = new Date(); const quiz = await f.l.createQuiz({ title: 'Closing quiz', questions }, 'owner', now); const session = await f.l.start(quiz._id, 'reader', new Date(+quiz.expiresAt - 10000)); assert.equal(+session.deadlineAt, +quiz.expiresAt); await f.l.saveAnswers(quiz._id, 'reader', { answers: { a: 1 } }, false, new Date(+quiz.expiresAt - 5000)); await f.l.saveAnswers(quiz._id, 'reader', { answers: { a: 1, b: 0 } }, true, quiz.expiresAt); const enqueued: string[] = []; await f.l.tick(async (id) => { enqueued.push(id); }, quiz.expiresAt); assert.deepEqual(enqueued, [session._id]); assert.equal(await f.l.attempts.findOne({ _id: session._id }), null); await f.l.gradeSession(session._id); await f.l.tick(async () => { }, quiz.expiresAt); assert.equal((await f.l.attempts.findOne({ _id: session._id }))?.scorePercent, 50); assert.equal((await f.l.sessions.find({}).toArray()).length, 0); assert.equal(await f.l.quizzes.findOne({ _id: quiz._id }), null); });
test('deck parsing and deterministic browser scheduling; generation is idempotent', async (t) => { const text = '```front\nQuestion?\n```\n```back\nAnswer.\n```'; assert.deepEqual(parseDeck(text), [{ front: 'Question?', back: 'Answer.' }]); assert.throws(() => parseDeck('```front\nOnly one\n```')); assert.throws(() => parseDeck(text + '\nUnexpected')); assert.deepEqual(replay([0, 1, 2, 3], 'again'), [1, 0, 2, 3]); assert.deepEqual(replay([0, 1, 2, 3], 'hard'), [1, 2, 3, 0]); assert.deepEqual(replay([0, 1], 'good'), [1]); const f = await setup(t), article = await f.publish('cards'); let calls = 0; const generate = async () => { calls++; return text; }; await generateDeck(f.l, article._id, 'owner', generate); await generateDeck(f.l, article._id, 'owner', generate); assert.equal(calls, 1); await f.articles.delete(article._id); await f.l.tick(async () => { }); assert.equal((await f.l.decks.find({}).toArray()).length, 0); });
test('editing preserves labels, reparents descendants and recovers an interrupted edit', async (t) => { const f = await setup(t); const root = await f.publish('parent', '![x](x.png)'); await f.articles.image(root._id, 'x.png', png); await f.articles.commit({ ...root, labels, labelStatus: 'success' }); const child = await f.publish('child', '# Child', { parentId: root._id, folderPath: ['Nested'] }); const target = await f.publish('target'); await f.articles.edit(root._id, { name: 'Renamed', markdown: '# Edited', parentId: target._id }); const moved = (await f.repo.get(child._id))!; assert.deepEqual(moved.ancestors.map(a => a.name), ['target', 'Renamed', 'Nested']); assert.equal((await f.repo.get(root._id))?.labelStatus, 'success'); assert.equal(await f.storage.exists(root._id, 'x.png'), false); await assert.rejects(f.articles.edit(root._id, { parentId: child._id }), /inside itself/); const put = f.repo.put.bind(f.repo); f.repo.put = async () => { throw new Error('Mongo unavailable'); }; await assert.rejects(f.articles.edit(root._id, { markdown: '# Recoverable' }), /Mongo/); f.repo.put = put; await f.articles.reconcile(); assert.equal((await f.articles.read(root.slug)).markdown, '# Recoverable'); assert.equal((await f.storage.edits()).length, 0); });
test('HTTP typeahead matches full ranking and role gates protect mutations and decks', async (t) => { const f = await setup(t); await seedAdmin(f.repo, 'owner', 'correct-horse-battery'); for (let i = 0; i < 7; i++)
    await f.publish(`nursing-${i}`); const { token } = await client(f.l, f.code); const app = await buildApp({ articles: f.articles, auth: f.auth, search: f.search, learning: f.l, health: async () => ({ mongo: true, redis: true, storage: true, elasticsearch: true }) }); t.after(() => app.close()); assert.deepEqual((await app.inject('/search/suggest?q=nu')).json().hits, []); const full = (await app.inject('/search?q=nursing')).json(), suggest = (await app.inject('/search/suggest?q=nursing')).json(); assert.deepEqual(suggest.hits, full.hits.slice(0, 5)); const headers = { authorization: `Bearer ${token}` }; assert.equal((await app.inject({ method: 'POST', url: '/admin/quizzes', headers, payload: { title: 'Bad', questions } })).statusCode, 401); const gated = await app.inject({ url: '/flashcards', headers }); assert.equal(gated.statusCode, 403); assert.equal(gated.json().code, 'PREMIUM_REQUIRED'); assert.equal((await app.inject({ method: 'POST', url: '/premium/unlock', headers, payload: { code: 'FREE', role: 'admin' } })).statusCode, 400); });
test('quiz validation rejects duplicate question IDs, out-of-range keys and oversized answers', () => { assert.equal(quizSchema.safeParse({ title: 'X', questions: [questions[0], questions[0]] }).success, false); assert.equal(quizSchema.safeParse({ title: 'X', questions: [{ ...questions[0], correctIndex: 9 }] }).success, false); assert.equal(answersSchema.safeParse(Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`q${i}`, 0]))).success, false); });
test('demo quiz Markdown imports its answer key on the server', async () => { const source = await readFile(new URL('../../../demo_quiz.md', import.meta.url), 'utf8'); const quiz = parseQuizMarkdown(source); assert.equal(quiz.title, 'Nursing & Medicine Quiz'); assert.equal(quiz.questions.length, 15); assert.equal(quiz.questions[0].correctIndex, 1); assert.equal(quiz.questions[14].correctIndex, 1); assert.throws(() => parseQuizMarkdown(source.replace('"60–100 bpm"', '"not an option"')), /does not match an option/); });
test('percent-encoded admin paths still require owner authorization', async t => { const f = await setup(t); await seedAdmin(f.repo, 'owner', 'correct-horse-battery'); const { token: clientToken } = await client(f.l, f.code); const { token: ownerToken } = await f.auth.login({ username: 'owner', password: 'correct-horse-battery' }); const app = await buildApp({ articles: f.articles, auth: f.auth, search: f.search, learning: f.l, health: async () => ({ mongo: true, redis: true, storage: true, elasticsearch: true }) }); t.after(() => app.close()); for (const path of ['/%61dmin/tree', '/ad%6din/tree', '/a%64min/tree', '/%61%64%6din/tree']) assert.equal((await app.inject({ url: path, headers: { authorization: `Bearer ${clientToken}` } })).statusCode, 401); assert.equal((await app.inject({ url: '/%61dmin/tree', headers: { authorization: `Bearer ${ownerToken}` } })).statusCode, 200); assert.equal((await app.inject({ method: 'POST', url: '/%61dmin/articles', headers: { authorization: `Bearer ${clientToken}` }, payload: { name: 'forbidden', slug: 'forbidden' } })).statusCode, 401); });
test('owner migration preserves credentials and repeated initialization does not reset them', async () => {
    const { MongoRepository } = await import('../src/models/mongo.ts');
    let legacy: any = { username: 'existing-owner', passwordHash: 'existing-hash', tokenVersion: 7, updatedAt: new Date('2026-01-01') };
    let owner: any = null;
    const db = { listCollections() { return { hasNext: async () => false }; }, collection(name: string) { return { createIndex: async () => '', findOne: async () => name === 'admins' ? legacy : owner, deleteOne: async () => { if (name === 'admins')
                legacy = null; }, updateOne: async (_query: unknown, change: any) => { if (name === 'users')
                owner ??= change.$setOnInsert; } }; } } as unknown as Db;
    const repo = new MongoRepository(db);
    await repo.initialize();
    await repo.initialize();
    const saved = await repo.admin();
    assert.equal(saved?.username, 'existing-owner');
    assert.equal(saved?.passwordHash, 'existing-hash');
    assert.equal(saved?.tokenVersion, 7);
    assert.equal(owner.role, 'admin');
    assert.equal(legacy, null);
});

test('Gemini structured flashcards preserve Markdown and ignore thought text', async t => {
    const cards = Array.from({ length: 5 }, (_, i) => ({ front: `Question ${i}`, back: '```mermaid\ngraph LR; A-->B\n```' }));
    t.mock.method(globalThis, 'fetch', async (_url: unknown, options: any) => {
        const request = JSON.parse(options.body);
        assert.equal(request.generationConfig.responseMimeType, 'application/json');
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'not a deck' }, { text: JSON.stringify(cards) }] } }] }));
    });
    const markdown = await flashcardGemini('test-key', 'test-model')('# Article');
    const deck = parseDeck(markdown);
    assert.equal(deck.length, 5);
    assert.match(deck[0].back, /~~~mermaid/);
});

test('admin flashcard status reports queue progress, failures, retries, and saved decks', async t => {
    const f = await setup(t), article = await f.publish('flashcard-status');
    await seedAdmin(f.repo, 'owner', 'correct-horse-battery');
    const { token } = await f.auth.login({ username: 'owner', password: 'correct-horse-battery' });
    let state = 'waiting', submitted = 0;
    const queue = { flashcards: { getJob: async () => ({ getState: async () => state, failedReason: 'Gemini HTTP 429' }) }, generate: async () => { submitted++; state = 'waiting'; } };
    const app = await buildApp({ articles: f.articles, auth: f.auth, search: f.search, learning: f.l, learningQueues: () => queue as any, health: async () => ({ mongo: true, redis: true, storage: true, elasticsearch: true }) });
    t.after(() => app.close());
    const url = `/admin/articles/${article._id}/flashcards`, headers = { authorization: `Bearer ${token}` };
    assert.equal((await app.inject({ url })).statusCode, 401);
    assert.equal((await app.inject({ url, headers })).json().status, 'queued');
    state = 'active'; assert.equal((await app.inject({ url, headers })).json().status, 'generating');
    state = 'failed'; const failed = (await app.inject({ url, headers })).json(); assert.equal(failed.status, 'failed'); assert.match(failed.error, /quota/);
    assert.equal((await app.inject({ url, headers, method: 'POST' })).statusCode, 202); assert.equal(submitted, 1);
    await generateDeck(f.l, article._id, 'owner', async () => '```front\nQ\n```\n```back\nA\n```');
    assert.equal((await app.inject({ url, headers })).json().status, 'ready');
    assert.equal((await app.inject({ url, headers, method: 'POST' })).json().exists, true); assert.equal(submitted, 1);
    const reader = await client(f.l, f.code);
    const clientHeaders = { authorization: `Bearer ${reader.token}` };
    assert.equal((await app.inject({ url: '/flashcards', headers: clientHeaders })).statusCode, 403);
    await f.l.unlock(reader.user, { code: 'FREE' });
    const visible = await app.inject({ url: '/flashcards', headers: clientHeaders });
    assert.equal(visible.statusCode, 200); assert.equal(visible.json().decks[0].articleId, article._id);
    const deck = await app.inject({ url: `/flashcards/by-article/${article._id}`, headers: clientHeaders });
    assert.equal(parseDeck(deck.json().markdown).length, 1);

});

test('quiz review is private, read only, available after submission and hidden at expiry', async t => {
    const f = await setup(t), now = new Date();
    const quiz = await f.l.createQuiz({ title: 'Review quiz', questions }, 'owner', now);
    await f.l.start(quiz._id, 'reader', now);
    assert.equal((await f.l.results('reader', now))[0].review, null);
    await f.l.saveAnswers(quiz._id, 'reader', { answers: { a: 0 } }, true, now);
    const review = (await f.l.results('reader', now))[0].review!;
    assert.deepEqual(review.answers, { a: 0 });
    assert.equal(review.correctAnswers.a, 1);
    assert.equal(review.questions[0].stem, questions[0].stem);
    assert.equal((await f.l.results('other-reader', now))[0].review, null);
    await f.l.saveAnswers(quiz._id, 'reader', { answers: { a: 1 } }, true, now);
    assert.deepEqual((await f.l.results('reader', now))[0].review!.answers, { a: 0 });
    const session = await f.l.sessions.findOne({ quizId: quiz._id, userId: 'reader' });
    await f.l.gradeSession(session!._id);
    await assert.rejects(f.l.start(quiz._id, 'reader', now), /already/);
    assert.deepEqual((await f.l.results('reader', now))[0].review!.answers, { a: 0 });
    const expired = (await f.l.results('reader', quiz.expiresAt))[0];
    assert.equal(expired.review, null);
    assert.ok(expired.attempt);
    assert.equal('answers' in expired.attempt, false);
});
