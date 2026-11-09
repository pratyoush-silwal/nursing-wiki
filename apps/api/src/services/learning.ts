import { randomUUID, randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Db } from 'mongodb';
import { registrationSchema, emailSchema, quizSchema, answersSchema, grade, type ClientUser, type Quiz, type QuizSession, type QuizAttempt, type Deck } from '../../../../packages/shared/src/learning.ts';
import { HttpError } from '../lib/errors.ts';
import { Lock } from '../lib/lock.ts';
import type { Articles } from './articles.ts';
interface Pending {
    _id: string;
    passwordHash: string;
    codeHash: string;
}
interface History {
    _id: string;
    title: string;
    activatedAt: Date;
    expiresAt: Date;
}
export class Learning {
    readonly lock = new Lock();
    constructor(readonly db: Db, private secret: string | undefined, private send: (email: string, code: string) => Promise<void>, readonly articles: Articles) { }
    get users() { return this.db.collection<ClientUser>('users'); }
    get pending() { return this.db.collection<Pending>('pendingRegistrations'); }
    get quizzes() { return this.db.collection<Quiz>('quizzes'); }
    get sessions() { return this.db.collection<QuizSession>('quizSessions'); }
    get attempts() { return this.db.collection<QuizAttempt>('quizAttempts'); }
    get history() { return this.db.collection<History>('quizHistory'); }
    get decks() { return this.db.collection<Deck>('flashcardDecks'); }
    async initialize() { await Promise.all([this.users.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { role: 'client' } }), this.users.createIndex({ role: 1 }), this.sessions.createIndex({ quizId: 1, userId: 1 }, { unique: true }), this.attempts.createIndex({ quizId: 1, userId: 1 }, { unique: true }), this.decks.createIndex({ articleId: 1 }, { unique: true }), this.quizzes.createIndex({ expiresAt: 1 }), this.sessions.createIndex({ submittedAt: 1, deadlineAt: 1 }), this.attempts.createIndex({ userId: 1 }), this.db.collection('notifications').createIndex({ userId: 1, createdAt: -1 })]); }
    private key() { if (!this.secret || this.secret.startsWith('replace-') || Buffer.byteLength(this.secret) < 32)
        throw new HttpError(503, 'Authentication is not configured'); return new TextEncoder().encode(this.secret); }
    private hash(email: string, code: string) { return createHmac('sha256', this.key()).update(`${email}:${code}`).digest('hex'); }
    private async token(user: ClientUser) { return { token: await new SignJWT({ role: 'client' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user._id).setIssuer('nursing-wiki').setAudience('nursing-wiki-client').setIssuedAt().setExpirationTime('7d').sign(this.key()) }; }
    async register(input: unknown) {
        const body = registrationSchema.parse(input);
        this.key();
        return this.lock.run(async () => {
            if (await this.users.findOne({ email: body.email }))
                throw new HttpError(409, 'An account already exists for this email');
            const code = String(randomInt(100000, 1000000));
            const pending = { _id: body.email, passwordHash: await bcrypt.hash(body.password, 12), codeHash: this.hash(body.email, code) };
            await this.send(body.email, code);
            await this.pending.replaceOne({ _id: body.email }, pending, { upsert: true });
            return { message: 'Check your email for the verification code' };
        });
    }
    async verify(input: unknown) {
        const body = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(input);
        return this.lock.run(async () => {
            const pending = await this.pending.findOne({ _id: body.email });
            if (!pending || !timingSafeEqual(Buffer.from(pending.codeHash, 'hex'), Buffer.from(this.hash(body.email, body.code), 'hex')))
                throw new HttpError(400, 'Invalid verification code');
            const now = new Date();
            const user: ClientUser = { _id: randomUUID(), email: body.email, passwordHash: pending.passwordHash, role: 'client', premium: false, createdAt: now, updatedAt: now };
            try {
                await this.users.insertOne(user);
            }
            catch (e) {
                if ((e as {
                    code?: number;
                }).code === 11000)
                    throw new HttpError(409, 'Account already verified; sign in');
                throw e;
            }
            await this.pending.deleteOne({ _id: body.email });
            return this.token(user);
        });
    }
    async login(input: unknown) { const body = z.object({ email: emailSchema, password: z.string().max(72) }).strict().parse(input); this.key(); const user = await this.users.findOne({ email: body.email, role: 'client' }); if (!user || !await bcrypt.compare(body.password, user.passwordHash))
        throw new HttpError(401, 'Invalid email or password'); return this.token(user); }
    async authorize(header: string | undefined) { if (!header?.startsWith('Bearer '))
        throw new HttpError(401, 'Sign in to continue'); let sub: string | undefined; try {
        const { payload } = await jwtVerify(header.slice(7), this.key(), { algorithms: ['HS256'], issuer: 'nursing-wiki', audience: 'nursing-wiki-client' });
        if (payload.role !== 'client')
            throw new Error();
        sub = payload.sub;
    }
    catch {
        throw new HttpError(401, 'Session expired or invalid; sign in again');
    } const user = sub ? await this.users.findOne({ _id: sub, role: 'client' }) : null; if (!user)
        throw new HttpError(401, 'Client account required'); return user; }
    async unlock(user: ClientUser, input: unknown) { z.object({ code: z.literal('FREE') }).strict().parse(input); await this.users.updateOne({ _id: user._id, role: 'client' }, { $set: { premium: true, updatedAt: new Date() } }); await this.notify(user._id, 'premium-unlocked', 'Premium is now unlocked.', `premium-${user._id}`); return { premium: true }; }
    requirePremium(user: ClientUser) { if (!user.premium)
        throw Object.assign(new HttpError(403, 'upgrade to premium'), { code: 'PREMIUM_REQUIRED' }); }
    async notify(userId: string, type: string, message: string, id: string) { await this.db.collection<{
        _id: string;
        userId: string;
        type: string;
        message: string;
        createdAt: Date;
        read: boolean;
    }>('notifications').updateOne({ _id: id }, { $setOnInsert: { _id: id, userId, type, message, createdAt: new Date(), read: false } }, { upsert: true }); }
    async createQuiz(input: unknown, createdBy: string, now = new Date()) { const body = quizSchema.parse(input); const quiz: Quiz = { ...body, _id: randomUUID(), createdBy, activatedAt: now, expiresAt: new Date(+now + 86400000) }; await this.quizzes.insertOne(quiz); await this.history.updateOne({ _id: quiz._id }, { $setOnInsert: { _id: quiz._id, title: quiz.title, activatedAt: now, expiresAt: quiz.expiresAt } }, { upsert: true }); return quiz; }
    async live(id: string, now = new Date()) { const quiz = await this.quizzes.findOne({ _id: id, expiresAt: { $gt: now } }); if (!quiz)
        throw new HttpError(404, 'This quiz has ended'); return quiz; }
    async start(id: string, userId: string, now = new Date()) { return this.lock.run(async () => { const quiz = await this.live(id, now); if (await this.attempts.findOne({ quizId: id, userId }))
        throw new HttpError(409, 'You already completed this quiz'); const session: QuizSession = { _id: randomUUID(), quizId: id, userId, startedAt: now, deadlineAt: new Date(Math.min(+quiz.expiresAt, +now + quiz.questions.length * 60000)), submittedAt: null, answers: {} }; await this.sessions.updateOne({ quizId: id, userId }, { $setOnInsert: session }, { upsert: true }); const saved = (await this.sessions.findOne({ quizId: id, userId }))!; return { ...saved, serverNow: now, questions: quiz.questions.map(({ correctIndex, explanation, ...q }) => q), title: quiz.title }; }); }
    async saveAnswers(id: string, userId: string, input: unknown, submit: boolean, now = new Date()) {
        return this.lock.run(async () => {
            const { answers } = z.object({ answers: answersSchema }).strict().parse(input);
            const session = await this.sessions.findOne({ quizId: id, userId });
            if (!session)
                throw new HttpError(409, 'Start the quiz first');
            if (session.submittedAt)
                return session;
            if (+session.deadlineAt <= +now) {
                await this.sessions.updateOne({ _id: session._id, submittedAt: null }, { $set: { submittedAt: session.deadlineAt } });
                return { ...session, submittedAt: session.deadlineAt };
            }
            const quiz = await this.live(id, now);
            for (const [key, value] of Object.entries(answers)) {
                const q = quiz.questions.find(q => q.id === key);
                if (!q || value >= q.options.length)
                    throw new HttpError(400, 'Invalid answer');
            }
            const submittedAt = submit ? now : null;
            const savedAnswers = { ...session.answers, ...answers };
            await this.sessions.updateOne({ _id: session._id, submittedAt: null }, { $set: { answers: savedAnswers, submittedAt } });
            return { ...session, answers: savedAnswers, submittedAt };
        });
    }
    async gradeSession(sessionId: string) {
        return this.lock.run(async () => {
            const session = await this.sessions.findOne({ _id: sessionId });
            if (!session?.submittedAt)
                return;
            const existing = await this.attempts.findOne({ quizId: session.quizId, userId: session.userId });
            if (existing) {
                await this.notify(existing.userId, 'quiz-result', `${existing.title}: ${existing.scorePercent}%`, `quiz-${existing._id}`);
                return existing;
            }
            const quiz = await this.quizzes.findOne({ _id: session.quizId });
            if (!quiz)
                return;
            const attempt: QuizAttempt = { _id: session._id, quizId: session.quizId, userId: session.userId, title: quiz.title, activatedAt: quiz.activatedAt, startedAt: session.startedAt, submittedAt: session.submittedAt, answers: session.answers, scorePercent: grade(quiz.questions, session.answers) };
            await this.attempts.updateOne({ quizId: session.quizId, userId: session.userId }, { $setOnInsert: attempt }, { upsert: true });
            await this.notify(session.userId, 'quiz-result', `${quiz.title}: ${attempt.scorePercent}%`, `quiz-${session._id}`);
            return attempt;
        });
    }
    async tick(enqueue: (id: string) => Promise<unknown>, now = new Date()) {
        for (const q of await this.quizzes.find({}).toArray())
            await this.history.updateOne({ _id: q._id }, { $setOnInsert: { _id: q._id, title: q.title, activatedAt: q.activatedAt, expiresAt: q.expiresAt } }, { upsert: true });
        await this.sessions.updateMany({ submittedAt: null, deadlineAt: { $lte: now } }, [{ $set: { submittedAt: '$deadlineAt' } }]);
        for (const session of await this.sessions.find({ submittedAt: { $ne: null } }).toArray())
            if (!await this.attempts.findOne({ _id: session._id }))
                await enqueue(session._id);
        for (const quiz of await this.quizzes.find({ expiresAt: { $lte: now } }).toArray()) {
            let graded = true;
            for (const session of await this.sessions.find({ quizId: quiz._id }).toArray()) {
                if (!await this.attempts.findOne({ _id: session._id })) graded = false;
            }
            if (!graded) continue;
            await this.history.updateOne({ _id: quiz._id }, { $setOnInsert: { _id: quiz._id, title: quiz.title, activatedAt: quiz.activatedAt, expiresAt: quiz.expiresAt } }, { upsert: true });
            await this.quizzes.deleteOne({ _id: quiz._id });
            await this.sessions.deleteMany({ quizId: quiz._id });
        }
        for (const deck of await this.decks.find({}).toArray())
            if (!await this.articles.repo.get(deck.articleId) || !await this.articles.storage.exists(deck.articleId))
                await this.decks.deleteOne({ _id: deck._id });
    }
    async results(userId: string) { const [history, attempts, sessions] = await Promise.all([this.history.find({}).sort({ activatedAt: 1 }).toArray(), this.attempts.find({ userId }).toArray(), this.sessions.find({ userId }).toArray()]); return history.map(q => { const attempt = attempts.find(a => a.quizId === q._id) ?? null; const session = sessions.find(s => s.quizId === q._id); return { ...q, attempt, status: attempt ? 'graded' : session?.submittedAt ? 'grading' : session ? 'in-progress' : 'not-attempted' }; }); }
}
