import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { idSchema, slugSchema, searchSchema, MARKDOWN_LIMIT, IMAGE_LIMIT } from '@wiki/shared';
import type { Articles } from '../services/articles.ts';
import type { AuthService } from '../services/auth.ts';
import type { SearchService } from '../services/search.ts';
import { isFull } from '../lib/errors.ts';

export interface AppServices {
  articles: Articles; auth: AuthService; search: SearchService;
  retryLabels?: () => Promise<{ retried: number }>;
  health: () => Promise<{ mongo: boolean; redis: boolean; storage: boolean; elasticsearch: boolean }>;
}
export async function buildApp(services: AppServices, logLevel: string = 'silent') {
  const app = Fastify({ logger: logLevel === 'silent' ? false : { level: logLevel, redact: ['req.headers.authorization', 'req.body.password', 'req.body.currentPassword'] }, bodyLimit: MARKDOWN_LIMIT, requestTimeout: 120_000 });
  await app.register(multipart, { limits: { fileSize: IMAGE_LIMIT, files: 1, fields: 0, parts: 1 }, preservePath: true });
  app.addContentTypeParser(['text/markdown', 'text/plain'], { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    const path = request.url.split('?')[0];
    const publicRead = ['GET','HEAD'].includes(request.method) && (/^\/articles\/[^/]+$/.test(path) || path === '/search' || ['/health/live','/health/ready'].includes(path));
    if (!(request.method === 'POST' && path === '/admin/login') && !publicRead) await services.auth.authorize(request.headers.authorization);
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid request', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    const status = isFull(error) ? 507 : (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    return reply.code(status).send({ error: status === 507 ? 'Object storage is full' : status >= 500 ? 'Service temporarily unavailable' : (error as Error).message });
  });
  app.post('/admin/login', async request => services.auth.login(request.body));
  app.put('/admin/credentials', async (request, reply) => { await services.auth.change(request.body); return reply.code(204).send(); });
  app.get('/admin/tree', async () => services.articles.explorer());
  app.post('/admin/labels/retry', async (_request, reply) => {
    if (!services.retryLabels) return reply.code(503).send({ error: 'Label generation is not available yet' });
    return services.retryLabels();
  });
  app.post('/admin/articles', async (request, reply) => {
    const a = await services.articles.create(request.body);
    return reply.code(201).send({ id: a._id, slug: a.slug, objectKey: a.objectKey });
  });
  app.put<{ Params: { id: string } }>('/admin/articles/:id/content', { bodyLimit: MARKDOWN_LIMIT }, async (request, reply) => {
    const id = idSchema.parse(request.params.id);
    if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'Use Content-Type: text/markdown' });
    const a = await services.articles.upload(id, request.body);
    return reply.code(202).send({ id: a._id, labelStatus: a.labelStatus, imagePaths: a.imagePaths });
  });
  app.post<{ Params: { id: string } }>('/admin/articles/:id/images', async (request, reply) => {
    const id = idSchema.parse(request.params.id);
    if (!request.isMultipart()) return reply.code(415).send({ error: 'Use multipart/form-data' });
    const files: { name: string; bytes: Buffer }[] = [];
    for await (const part of request.parts()) {
      if (part.type !== 'file') return reply.code(400).send({ error: 'Send one image file per request' });
      files.push({ name: part.filename, bytes: await part.toBuffer() });
    }
    if (files.length !== 1) return reply.code(400).send({ error: 'Send one image file per request' });
    return reply.code(201).send(await services.articles.image(id, files[0].name, files[0].bytes));
  });
  app.delete<{ Params: { id: string } }>('/admin/articles/:id', async (request, reply) => {
    const result = await services.articles.delete(idSchema.parse(request.params.id));
    return reply.code(result.pending ? 202 : 200).send(result);
  });
  app.get<{ Params: { slug: string } }>('/articles/:slug', async request => services.articles.read(slugSchema.parse(request.params.slug)));
  app.get('/search', async request => services.search.search(searchSchema.parse(request.query).q));
  app.get('/admin/notifications', async () => ({ notifications: await services.articles.repo.notifications() }));
  app.patch<{ Params: { id: string } }>('/admin/notifications/:id/read', async (request, reply) => {
    if (request.params.id.length > 100) return reply.code(400).send({ error: 'Invalid notification ID' });
    const found = await services.articles.repo.markRead(request.params.id);
    return reply.code(found ? 204 : 404).send(found ? undefined : { error: 'Notification not found' });
  });
  app.get('/health/live', async () => ({ status: 'alive' }));
  app.get('/health/ready', async (_request, reply) => {
    const checks = await services.health();
    const available = checks.mongo && checks.storage;
    return reply.code(available ? 200 : 503).send({ status: !available ? 'unavailable' : Object.values(checks).every(Boolean) ? 'ready' : 'degraded', checks });
  });
  return app;
}
