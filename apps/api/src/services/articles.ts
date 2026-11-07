import { randomUUID } from 'node:crypto';
import { createArticleSchema, MARKDOWN_LIMIT, IMAGE_LIMIT, type Article, type ArticleDto, type Notification } from '@wiki/shared';
import type { Repository } from '../models/repository.ts';
import { Storage, contentHash, type DeleteIntent } from './storage.ts';
import type { SearchIndex } from './search.ts';
import { Lock } from '../lib/lock.ts';
import { HttpError, isFull, isMissing } from '../lib/errors.ts';
import { ancestry, descendants, folderId, tree } from '../lib/hierarchy.ts';
import { imagePath, markdownImages, validateImage } from '../lib/markdown.ts';

export class Articles {
  readonly lock = new Lock();
  constructor(readonly repo: Repository, readonly storage: Storage, readonly index: SearchIndex) {}
  async notification(type: Notification['type'], articleId: string | null, message: string, id: string = randomUUID()) {
    await this.repo.notify({ _id: id, type, articleId, message, read: false, createdAt: new Date().toISOString() });
  }
  async commit(a: Article) {
    try { await this.storage.save(a); }
    catch (e) {
      if (!isFull(e)) throw e;
      await this.notification('storage-full', a._id, 'Object storage is full. Metadata could not be saved; free space and retry.');
      throw new HttpError(507, 'Object storage is full');
    }
    await this.repo.put(a);
  }
  async visible() {
    const deleted = await this.storage.deletedIds();
    const values: Article[] = [];
    for (const a of await this.repo.all()) if (a.state === 'published' && !deleted.has(a._id) && await this.storage.exists(a._id)) values.push(a);
    return values;
  }
  async explorer() {
    const published = await this.visible();
    const deleted = await this.storage.deletedIds();
    const drafts = (await this.repo.all()).filter(a => a.state === 'draft' && !deleted.has(a._id));
    return { nodes: tree(published), articles: [...published, ...drafts].map(({ contentHash: _hash, ...a }) => a) };
  }
  async create(input: unknown) {
    const body = createArticleSchema.parse(input);
    return this.lock.run(async () => {
      let chain = ancestry(tree(await this.visible()), body.parentId);
      let parentId = body.parentId;
      for (const name of body.folderPath) {
        const id = folderId(parentId, name);
        chain.push({ id, parentId, name, kind: 'folder' }); parentId = id;
      }
      const pendingDeletes = await this.storage.intents();
      if (chain.some(n => pendingDeletes.some(i => i.id === n.id || i.articleIds.includes(n.id)))) throw new HttpError(409, 'This location is being deleted; retry after cleanup completes');
      if (chain.length > 100) throw new HttpError(400, 'Hierarchy is too deep');
      const existing = (await this.storage.loadAll()).find(a => a.slug === body.slug) ?? await this.repo.bySlug(body.slug);
      if (existing) {
        if ((await this.storage.deletedIds()).has(existing._id)) throw new HttpError(409, 'This slug is being deleted');
        if (existing.name === body.name && existing.parentId === parentId) { await this.repo.put(existing); return existing; }
        throw new HttpError(409, 'This slug already belongs to another article');
      }
      const id = randomUUID(), now = new Date().toISOString();
      const article: Article = { _id: id, slug: body.slug, name: body.name, parentId, ancestors: chain,
        objectKey: `articles/${id}/content.md`, size: 0, uploadedAt: null, createdAt: now, updatedAt: now,
        state: 'draft', labelStatus: 'pending', labels: [], contentHash: null, imagePaths: [], indexPending: true };
      await this.commit(article); return article;
    });
  }
  private async active(id: string) {
    const a = await this.repo.get(id);
    if (!a || (await this.storage.deletedIds()).has(id)) throw new HttpError(404, 'Article not found');
    return a;
  }
  async upload(id: string, bytes: Buffer) {
    if (!bytes.length || bytes.length > MARKDOWN_LIMIT) throw new HttpError(bytes.length ? 413 : 400, 'Markdown must be between 1 byte and 6 MB');
    let markdown: string;
    try { markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new HttpError(400, 'Markdown must be valid UTF-8'); }
    const images = markdownImages(markdown);
    return this.lock.run(async () => {
      const a = await this.active(id);
      const hash = contentHash(bytes);
      if (a.contentHash && a.contentHash !== hash) throw new HttpError(409, 'Articles are immutable; delete and upload a new article');
      if (a.state === 'published') { await this.storage.immutable(id, 'content.md', bytes); return a; }
      const nodes = tree(await this.visible());
      for (const parent of a.ancestors.filter(n => n.kind === 'article')) if (!nodes.some(n => n.id === parent.id)) throw new HttpError(409, 'An ancestor article was deleted; recreate the draft');
      try {
        await this.storage.immutable(id, 'content.md', bytes);
        const now = new Date().toISOString();
        const published: Article = { ...a, state: 'published', contentHash: hash, size: bytes.length, uploadedAt: now, updatedAt: now, imagePaths: images, indexPending: true };
        await this.commit(published);
        return published;
      } catch (e) { if (isFull(e)) await this.notification('storage-full', id, 'Object storage is full. Free space and retry the upload.'); throw e; }
    });
  }
  async image(id: string, filename: string, bytes: Buffer) {
    const path = imagePath(filename);
    if (!bytes.length || bytes.length > IMAGE_LIMIT) throw new HttpError(bytes.length ? 413 : 400, 'Each image must be between 1 byte and 20 MB');
    validateImage(path, bytes);
    return this.lock.run(async () => {
      const a = await this.active(id);
      if (a.state !== 'published') throw new HttpError(409, 'Upload Markdown before its images');
      if (!a.imagePaths.includes(path)) throw new HttpError(400, 'Image is not referenced by this article');
      try { await this.storage.immutable(id, path, bytes); }
      catch (e) { if (isFull(e)) await this.notification('storage-full', id, 'Object storage is full. Free space and retry the image.'); throw e; }
      return { path };
    });
  }
  async read(slug: string): Promise<ArticleDto> {
    const a = await this.repo.bySlug(slug);
    if (!a || a.state !== 'published' || (await this.storage.deletedIds()).has(a._id)) throw new HttpError(404, 'Article not found');
    let markdown: string;
    try { markdown = await this.storage.read(a._id); }
    catch (e) { if (isMissing(e)) throw new HttpError(404, 'Article not found'); throw e; }
    const images: Record<string,string> = {};
    for (const path of a.imagePaths) if (await this.storage.exists(a._id, path)) images[path] = `/objects/articles/${a._id}/${path.split('/').map(encodeURIComponent).join('/')}`;
    return { id: a._id, slug: a.slug, name: a.name, labels: a.labels, labelStatus: a.labelStatus, size: a.size, uploadedAt: a.uploadedAt, markdown, breadcrumb: a.ancestors, images };
  }
  async delete(id: string) {
    return this.lock.run(async () => {
      const articles = [...new Map([...(await this.repo.all()), ...(await this.storage.loadAll())].map(a => [a._id, a])).values()];
      const nodes = tree(articles);
      const ids = descendants(nodes, id);
      const articleIds = articles.filter(a => ids.has(a._id) || a.ancestors.some(n => ids.has(n.id))).map(a => a._id);
      if (!articleIds.length) return { deleted: 0, pending: (await this.storage.intents()).some(i => i.id === id) };
      const previous = (await this.storage.intents()).find(i => i.id === id);
      const intent: DeleteIntent = { id, articleIds: [...new Set([...(previous?.articleIds ?? []), ...articleIds])], createdAt: previous?.createdAt ?? new Date().toISOString() };
      await this.storage.intent(intent);
      const complete = await this.finishDelete(intent);
      return { deleted: articleIds.length, pending: !complete };
    });
  }
  async finishDelete(intent: DeleteIntent) {
    for (const id of intent.articleIds) await this.storage.remove(id);
    await this.repo.remove(intent.articleIds);
    try { await this.index.remove(intent.articleIds); } catch { return false; }
    await this.notification('delete-complete', intent.id, `Deleted ${intent.articleIds.length} article(s) and their images.`, `delete-${intent.id}-${intent.createdAt}`);
    await this.storage.finishDelete(intent.id);
    return true;
  }
  async reconcile() {
    return this.lock.run(async () => {
      for (const intent of await this.storage.intents()) await this.finishDelete(intent);
      const deleted = await this.storage.deletedIds();
      const stored = (await this.storage.loadAll()).filter(a => !deleted.has(a._id));
      const storedIds = new Set(stored.map(a => a._id));
      const stale = (await this.repo.all()).filter(a => !storedIds.has(a._id)).map(a => a._id);
      if (stale.length) { await this.repo.remove(stale); await this.index.remove(stale); }
      for (const a of stored) {
        await this.repo.put(a);
      }
      for (const a of stored) {
        if (a.state === 'published' && a.indexPending) {
          try { await this.index.index(a); } catch { break; }
          await this.commit({ ...a, indexPending: false });
        }
      }
    });
  }
  async rebuildIndex() {
    await this.lock.run(async () => {
      for (const a of await this.storage.loadAll()) if (a.state === 'published') await this.commit({ ...a, indexPending: true });
    });
    await this.reconcile();
  }
}
