import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Article, Notification } from '@wiki/shared';
import type { Admin, Repository } from '../src/models/repository.ts';
import { Articles } from '../src/services/articles.ts';
import { Storage } from '../src/services/storage.ts';
import { SearchService, rank, type SearchIndex } from '../src/services/search.ts';
import { AuthService } from '../src/services/auth.ts';

export class MemoryRepository implements Repository {
  articles = new Map<string,Article>(); notes = new Map<string,Notification>(); owner: Admin | null = null;
  down = false;
  async all() { if (this.down) throw new Error('Mongo down'); return structuredClone([...this.articles.values()]); }
  async get(id: string) { return structuredClone(this.articles.get(id) ?? null); }
  async bySlug(slug: string) { return (await this.all()).find(a => a.slug === slug) ?? null; }
  async put(a: Article) { if (this.down) throw new Error('Mongo down'); this.articles.set(a._id,structuredClone(a)); }
  async remove(ids: string[]) { for (const id of ids) this.articles.delete(id); }
  async candidates(q: string) { return (await this.all()).filter(a => a.state === 'published' && rank(a,q)); }
  async admin() { if (this.down) throw new Error('Mongo down'); return structuredClone(this.owner); }
  async saveAdmin(a: Admin) { this.owner = structuredClone(a); }
  async seedAdmin(a: Admin) { this.owner ??= structuredClone(a); }
  async notify(n: Notification) { if (!this.notes.has(n._id)) this.notes.set(n._id,structuredClone(n)); }
  async notifications() { return structuredClone([...this.notes.values()]); }
  async markRead(id: string) { const n = this.notes.get(id); if (n) n.read = true; return !!n; }
  async ping() { if (this.down) throw new Error('Mongo down'); }
}
export class MemoryIndex implements SearchIndex {
  docs = new Map<string,Article>(); down = false;
  async index(a: Article) { if (this.down) throw new Error('ES down'); this.docs.set(a._id,structuredClone(a)); }
  async remove(ids: string[]) { if (this.down) throw new Error('ES down'); for (const id of ids) this.docs.delete(id); }
  async search(q: string) { if (this.down) throw new Error('ES down'); return [...this.docs.values()].filter(a => rank(a,q)).sort((a,b) => rank(b,q)-rank(a,q)).map(a => a._id); }
  async ping() { if (this.down) throw new Error('ES down'); }
}
export const labels = ['patient care','nursing','assessment','medicine','clinical practice','education'];
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
export const secret = 'test-only-secret-with-at-least-32-bytes';
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(),'wiki-objects-test-'));
  const storage = new Storage(root); await storage.init();
  const repo = new MemoryRepository(), index = new MemoryIndex();
  const articles = new Articles(repo,storage,index);
  return { root,storage,repo,index,articles, auth:new AuthService(repo,secret), search:new SearchService(repo,storage,index),
    async publish(slug = 'test-article', markdown = '# Test article', options: Record<string,unknown> = {}) {
      const a = await articles.create({ name:slug,slug,...options }); await articles.upload(a._id,Buffer.from(markdown)); return (await repo.get(a._id))!;
    },
    async close() { await rm(root,{recursive:true,force:true}); }
  };
}
