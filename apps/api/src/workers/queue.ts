import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Articles } from '../services/articles.ts';
import { processLabels, failLabels, LABEL_ATTEMPTS, LABEL_RETRY_DELAY, type GenerateLabels } from './labels.ts';

export interface LabelJob { articleId: string; markdownText: string }
export class LabelQueue {
  private connection: Redis;
  private workerConnection: Redis;
  readonly queue: Queue<LabelJob>;
  readonly dlq: Queue<LabelJob>;
  private worker: Worker<LabelJob>;
  constructor(url: string, private articles: Articles, generate: GenerateLabels, onError: (error: Error) => void) {
    this.connection = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000 });
    this.workerConnection = new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 2000 });
    this.queue = new Queue('label-generation', { connection: this.connection });
    this.dlq = new Queue('label-generation-dlq', { connection: this.connection });
    this.worker = new Worker('label-generation', job => processLabels(articles, job.data.articleId, generate), { connection: this.workerConnection, concurrency: 1 });
    this.connection.on('error', onError); this.workerConnection.on('error', onError);
    this.queue.on('error', onError); this.dlq.on('error', onError); this.worker.on('error', onError);
  }
  async dispatch() {
    const deleted = await this.articles.storage.deletedIds();
    const articles = await this.articles.repo.all();
    const alive = new Set(articles.filter(a => !deleted.has(a._id)).map(a => a._id));
    for (const queue of [this.queue, this.dlq]) {
      for (const job of await queue.getJobs(['wait', 'delayed', 'completed', 'failed'])) {
        if (!alive.has(job.data.articleId)) await job.remove();
      }
    }
    for (const a of articles) {
      if (a.state !== 'published' || deleted.has(a._id) || !await this.articles.storage.exists(a._id)) continue;
      if (a.labelStatus !== 'pending') {
        await this.articles.notification(a.labelStatus === 'success' ? 'label-success' : 'label-failed', a._id,
          a.labelStatus === 'success' ? `Labels are ready for “${a.name}”.` : `Label generation failed after two attempts for “${a.name}”.`, `labels-${a.labelStatus}-${a._id}-${a.updatedAt}`);
        continue;
      }
      if (a.labelsDeferred) continue;
      const job = await this.queue.getJob(a._id);
      if (job) {
        const state = await job.getState();
        if (state === 'failed') {
          await this.dlq.add('generate-labels', job.data, { jobId: a._id });
          await failLabels(this.articles, a._id);
        } else if (state === 'completed') {
          // Recovery of metadata from an older manifest must not strand a completed job.
          await job.remove();
        }
        continue;
      }
      await this.queue.add('generate-labels', { articleId: a._id, markdownText: await this.articles.storage.read(a._id) }, {
        jobId: a._id, attempts: LABEL_ATTEMPTS, backoff: { type: 'fixed', delay: LABEL_RETRY_DELAY },
        removeOnComplete: { count: 1000 }, removeOnFail: false
      });
    }
  }
  async retryAll() {
    const [articles, failedJobs, deadJobs] = await Promise.all([
      this.articles.repo.all(), this.queue.getJobs(['failed']), this.dlq.getJobs(['wait', 'delayed', 'completed', 'failed'])
    ]);
    const retryIds = new Set([...failedJobs, ...deadJobs].map(job => job.data.articleId));
    for (const article of articles) if (article.labelStatus === 'failed' || article.labelStatus === 'pending') retryIds.add(article._id);
    let retried = 0;
    for (const articleId of retryIds) {
      const success = await this.articles.lock.run(async () => {
        const article = await this.articles.repo.get(articleId);
        if (!article || article.state !== 'published' || article.labelStatus === 'success'
          || (await this.articles.storage.deletedIds()).has(articleId) || !await this.articles.storage.exists(articleId)) return false;
        const job = await this.queue.getJob(articleId);
        if (job && await job.getState() === 'active') return false;
        const deadJob = await this.dlq.getJob(articleId);
        if (deadJob && await deadJob.getState() === 'active') return false;
        await job?.remove();
        await deadJob?.remove();
        const markdownText = await this.articles.storage.read(articleId);
        await this.articles.commit({ ...article, labelStatus: 'pending', labelsDeferred: false, updatedAt: new Date().toISOString() });
        await this.queue.add('generate-labels', { articleId, markdownText }, {
          jobId: articleId, attempts: LABEL_ATTEMPTS, backoff: { type: 'fixed', delay: LABEL_RETRY_DELAY },
          removeOnComplete: { count: 1000 }, removeOnFail: false
        });
        return true;
      });
      if (success) retried++;
    }
    return { retried };
  }
  async ping() { await this.connection.ping(); }
  async close() {
    await this.worker.close();
    await Promise.all([this.queue.close(), this.dlq.close()]);
    this.connection.disconnect(); this.workerConnection.disconnect();
  }
}
