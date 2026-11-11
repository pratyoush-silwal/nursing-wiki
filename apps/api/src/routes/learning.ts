import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { idSchema } from '@wiki/shared';
import { parseDeck, parseQuizMarkdown } from '../../../../packages/shared/src/learning.ts';
import type { Learning } from '../services/learning.ts';
import type { LearningQueues } from '../workers/learning.ts';
import { HttpError } from '../lib/errors.ts';
export async function learningRoutes(app: FastifyInstance, l: Learning, queues: () => LearningQueues | undefined) {
    const jobs = () => { const q = queues(); if (!q)
        throw new HttpError(503, 'Learning jobs are not available yet'); return q; };
    app.post('/auth/register', async (req, reply) => reply.code(202).send(await l.register(req.body)));
    app.post('/auth/verify', req => l.verify(req.body));
    app.post('/auth/login', req => l.login(req.body));
    app.get('/auth/me', async (req) => { const { _id, email, premium } = await l.authorize(req.headers.authorization); return { id: _id, email, premium, role: 'client' }; });
    app.post('/premium/unlock', async (req) => l.unlock(await l.authorize(req.headers.authorization), req.body));
    app.post('/admin/quizzes', async (req, reply) => reply.code(201).send(await l.createQuiz(req.body, '00000000-0000-4000-8000-000000000001')));
    app.post('/admin/quizzes/import', async (req, reply) => {
        const { markdown } = z.object({ markdown: z.string().max(200000) }).strict().parse(req.body);
        let quiz;
        try { quiz = parseQuizMarkdown(markdown); }
        catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid quiz Markdown'); }
        return reply.code(201).send(await l.createQuiz(quiz, '00000000-0000-4000-8000-000000000001'));
    });
    app.get('/admin/quizzes', async () => ({ quizzes: await l.quizzes.find({ expiresAt: { $gt: new Date() } }).sort({ activatedAt: -1 }).toArray() }));
    app.get('/quizzes', async (req) => { await l.authorize(req.headers.authorization); return { quizzes: (await l.quizzes.find({ expiresAt: { $gt: new Date() } }).toArray()).map(({ questions, ...q }) => ({ ...q, questionCount: questions.length })), serverNow: new Date() }; });
    app.get('/quizzes/attempts/me', async (req) => ({ results: await l.results((await l.authorize(req.headers.authorization))._id) }));
    app.post<{
        Params: {
            id: string;
        };
    }>('/quizzes/:id/start', async (req) => { const s = await l.start(idSchema.parse(req.params.id), (await l.authorize(req.headers.authorization))._id); return { quizId: s.quizId, title: s.title, questions: s.questions, answers: s.answers, startedAt: s.startedAt, deadlineAt: s.deadlineAt, submittedAt: s.submittedAt, serverNow: s.serverNow }; });
    app.put<{
        Params: {
            id: string;
        };
    }>('/quizzes/:id/answers', { bodyLimit: 16 * 1024 }, async (req) => { const session = await l.saveAnswers(idSchema.parse(req.params.id), (await l.authorize(req.headers.authorization))._id, req.body, false); return { saved: true, submitted: !!session.submittedAt, deadlineAt: session.deadlineAt, serverNow: new Date() }; });
    app.post<{
        Params: {
            id: string;
        };
    }>('/quizzes/:id/submit', { bodyLimit: 16 * 1024 }, async (req, reply) => { const session = await l.saveAnswers(idSchema.parse(req.params.id), (await l.authorize(req.headers.authorization))._id, req.body, true); void queues()?.grade(session._id).catch(e => app.log.warn({ err: e }, 'Grading dispatch will retry')); return reply.code(202).send({ queued: true }); });
    app.post<{
        Params: {
            id: string;
        };
    }>('/admin/articles/:id/flashcards', async (req, reply) => { const id = idSchema.parse(req.params.id); const a = await l.articles.repo.get(id); if (!a || a.state !== 'published')
        throw new HttpError(404, 'Article not found'); if (await l.decks.findOne({ articleId: id }))
        return { exists: true }; await jobs().generate(id, '00000000-0000-4000-8000-000000000001'); return reply.code(202).send({ queued: true }); });
    app.put<{ Params: { id: string } }>('/admin/articles/:id/flashcards', async (req, reply) => {
        const id = idSchema.parse(req.params.id);
        const article = await l.articles.repo.get(id);
        if (!article || article.state !== 'published' || !await l.articles.storage.exists(id)) throw new HttpError(404, 'Article not found');
        const { markdown } = z.object({ markdown: z.string().max(200000) }).strict().parse(req.body);
        try { parseDeck(markdown); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid flashcard deck'); }
        const result = await l.articles.lock.run(() => l.decks.updateOne({ articleId: id }, { $setOnInsert: { _id: randomUUID(), articleId: id, title: article.name, markdown, createdBy: 'demo-seed', createdAt: new Date() } }, { upsert: true }));
        return reply.code(result.upsertedCount ? 201 : 200).send({ seeded: !!result.upsertedCount, exists: !result.upsertedCount });
    });
    app.get<{ Params: { id: string } }>('/admin/articles/:id/flashcards', async req => {
        const articleId = idSchema.parse(req.params.id);
        const article = await l.articles.repo.get(articleId);
        if (!article || article.state !== 'published') throw new HttpError(404, 'Article not found');
        if (await l.decks.findOne({ articleId })) return { status: 'ready' };
        const job = await jobs().flashcards.getJob(articleId);
        if (!job) return { status: 'none' };
        const state = await job.getState();
        if (state === 'failed') {
            const reason = job.failedReason ?? '';
            const error = reason.includes('429') ? 'Gemini quota or rate limit reached. Wait before retrying.'
                : /HTTP (400|401|403)/.test(reason) ? 'Gemini rejected the request. Check the API key and model configuration.'
                : reason.includes('404') ? 'The configured Gemini model was not found.'
                : reason.includes('not configured') ? 'Set GEMINI_API_KEY before generating flashcards.'
                : 'Generation failed. You can retry; details are in the API logs.';
            return { status: 'failed', error };
        }
        if (state === 'completed') return { status: 'none' };
        return { status: state === 'active' ? 'generating' : 'queued' };
    });
    app.get('/flashcards', async (req) => { l.requirePremium(await l.authorize(req.headers.authorization)); const decks = await l.decks.find({}, { projection: { markdown: 0 } }).toArray(); const visible = []; for (const deck of decks) { const article = await l.articles.repo.get(deck.articleId);
        if (article?.state === 'published' && await l.articles.storage.exists(deck.articleId) && !(await l.articles.storage.deletedIds()).has(deck.articleId)) visible.push(deck); } return { decks: visible }; });
    app.get<{
        Params: {
            articleId: string;
        };
    }>('/flashcards/by-article/:articleId', async (req) => { l.requirePremium(await l.authorize(req.headers.authorization)); const articleId = idSchema.parse(req.params.articleId); const article = await l.articles.repo.get(articleId); if (article?.state !== 'published' || !await l.articles.storage.exists(articleId) || (await l.articles.storage.deletedIds()).has(articleId))
        throw new HttpError(404, 'Article not found'); const deck = await l.decks.findOne({ articleId }); if (!deck)
        throw new HttpError(404, 'No flashcards for this article yet'); return deck; });
    app.patch<{
        Params: {
            id: string;
        };
    }>('/notifications/:id/read', async (req, reply) => { const user = await l.authorize(req.headers.authorization); await l.db.collection<{
        _id: string;
        userId: string;
        read: boolean;
    }>('notifications').updateOne({ _id: req.params.id, userId: user._id }, { $set: { read: true } }); return { read: true }; });
    app.get('/notifications', async (req) => { const user = await l.authorize(req.headers.authorization); const notes = await l.db.collection('notifications').find({ userId: user._id }).sort({ createdAt: -1 }).limit(100).toArray(); const active = await l.quizzes.find({ expiresAt: { $gt: new Date() } }).toArray(); return { notifications: [...active.map(q => ({ _id: q._id, type: 'quiz-active', message: `${q.title} is live. Join Quiz`, quizId: q._id })), ...notes] }; });
}
