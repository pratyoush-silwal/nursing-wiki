import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Learning } from '../services/learning.ts';
import { generateDeck } from '../services/flashcardGeneration.ts';
export class LearningQueues {
    private connection: Redis;
    private workerConnection: Redis;
    private workers: Worker[];
    readonly grading: Queue;
    readonly flashcards: Queue;
    constructor(url: string, learning: Learning, generate: (text: string) => Promise<string>, onError: (e: Error) => void) {
        this.connection = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000 });
        this.connection.on('error', onError);
        this.workerConnection = new Redis(url, { maxRetriesPerRequest: null });
        this.workerConnection.on('error', onError);
        this.grading = new Queue('quiz-grading', { connection: this.connection });
        this.flashcards = new Queue('generate-flashcards', { connection: this.connection });
        this.workers = [new Worker('quiz-grading', job => learning.gradeSession(job.data.sessionId), { connection: this.workerConnection }), new Worker('generate-flashcards', job => generateDeck(learning, job.data.articleId, job.data.createdBy, generate), { connection: this.workerConnection, concurrency: 1 })];
        for (const worker of this.workers)
            { worker.on('error', onError); worker.on('failed', (_job, error) => onError(error)); }
        this.grading.on('error', onError);
        this.flashcards.on('error', onError);
    }
    async grade(sessionId: string) { const job = await this.grading.getJob(sessionId); if (job && await job.getState() === 'failed')
        await job.remove(); await this.grading.add('grade', { sessionId }, { jobId: sessionId, attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: 100 }); }
    async generate(articleId: string, createdBy: string) { const job = await this.flashcards.getJob(articleId); if (job && await job.getState() === 'failed')
        await job.remove(); await this.flashcards.add('generate', { articleId, createdBy }, { jobId: articleId, attempts: 2, backoff: { type: 'fixed', delay: 5000 }, removeOnComplete: true, removeOnFail: 100 }); }
    async close() { await Promise.all(this.workers.map(w => w.close())); await Promise.all([this.grading.close(), this.flashcards.close()]); this.connection.disconnect(); this.workerConnection.disconnect(); }
}
