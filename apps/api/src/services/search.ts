import type { Article, SearchHit, SearchResult } from '@wiki/shared';
import type { Repository } from '../models/repository.ts';
import type { Storage } from './storage.ts';

export interface SearchIndex {
  index(article: Article): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(q: string): Promise<string[]>;
  ping(): Promise<void>;
}
export function rank(article: Article, query: string): number {
  const q = query.toLowerCase();
  return article.slug === q ? 3 : article.slug.includes(q) ? 2 : article.labels.some(l => l.toLowerCase().includes(q)) ? 1 : 0;
}
export function rankedQuery(q: string) {
  const wildcard = `*${q.replace(/[\\*?]/g, '\\$&')}*`;
  const exact = { term: { 'slug.keyword': q } };
  const partial = { wildcard: { 'slug.keyword': { value: wildcard, case_insensitive: true } } };
  const label = { wildcard: { labels: { value: wildcard, case_insensitive: true } } };
  return {
    size: 100, _source: ['id'],
    query: { function_score: {
      query: { bool: { should: [exact, partial, label], minimum_should_match: 1 } },
      functions: [{ filter: exact, weight: 3 }, { filter: partial, weight: 2 }, { filter: label, weight: 1 }],
      score_mode: 'max', boost_mode: 'replace'
    } },
    sort: [{ _score: 'desc' }, { 'slug.keyword': 'asc' }]
  };
}
export class Elasticsearch implements SearchIndex {
  constructor(private url: string, private indexName = 'articles') {}
  async request(path: string, init?: RequestInit) {
    const response = await fetch(`${this.url}/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Elasticsearch HTTP ${response.status}`);
    return response;
  }
  async initialize() {
    const r = await fetch(`${this.url}/${this.indexName}`, { method: 'HEAD', signal: AbortSignal.timeout(2500) });
    if (r.ok) return false;
    if (r.status !== 404) throw new Error(`Elasticsearch HTTP ${r.status}`);
    await this.request(this.indexName, { method: 'PUT', body: JSON.stringify({ mappings: { dynamic: 'strict', properties: {
      id: { type: 'keyword' }, slug: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      name: { type: 'text' }, labels: { type: 'keyword' }, parentId: { type: 'keyword' }, uploadedAt: { type: 'date' }
    } } }) });
    return true;
  }
  async index(a: Article) {
    await this.request(`${this.indexName}/_doc/${a._id}?refresh=wait_for`, { method: 'PUT', body: JSON.stringify({ id: a._id, slug: a.slug, name: a.name, labels: a.labels, parentId: a.parentId, uploadedAt: a.uploadedAt }) });
  }
  async remove(ids: string[]) {
    if (!ids.length) return;
    const response = await this.request('_bulk?refresh=wait_for', { method: 'POST', headers: { 'Content-Type': 'application/x-ndjson' }, body: ids.map(id => JSON.stringify({ delete: { _index: this.indexName, _id: id } })).join('\n') + '\n' });
    const body = await response.json() as { items: { delete: { status: number } }[] };
    if (body.items.some(item => item.delete.status >= 400 && item.delete.status !== 404)) throw new Error('Elasticsearch bulk deletion failed');
  }
  async search(q: string): Promise<string[]> {
    const body = await (await this.request(`${this.indexName}/_search`, { method: 'POST', body: JSON.stringify(rankedQuery(q)) })).json() as { hits: { hits: { _id: string }[] } };
    return body.hits.hits.map(h => h._id);
  }
  async ping() { await this.request('_cluster/health'); }
}
export class SearchService {
  constructor(private repo: Repository, private storage: Storage, private index: SearchIndex) {}
  async search(query: string): Promise<SearchResult> {
    const q = query.toLowerCase();
    if (!q) return { hits: [], source: 'mongo' };
    let source: SearchResult['source'] = 'elasticsearch';
    let candidates: Article[];
    try {
      const ids = await this.index.search(q);
      candidates = (await Promise.all(ids.map(id => this.repo.get(id)))).filter((a): a is Article => a !== null);
      // Pending index work stays searchable during Elasticsearch recovery.
      candidates.push(...(await this.repo.candidates(q)).filter(a => a.indexPending));
    } catch { source = 'mongo'; candidates = await this.repo.candidates(q); }
    const deleted = await this.storage.deletedIds();
    const unique = [...new Map(candidates.map(a => [a._id, a])).values()];
    const visible: Article[] = [];
    for (const a of unique) if (a.state === 'published' && !deleted.has(a._id) && rank(a, q) > 0 && await this.storage.exists(a._id)) visible.push(a);
    visible.sort((a,b) => rank(b,q) - rank(a,q) || a.slug.localeCompare(b.slug));
    const hits: SearchHit[] = visible.slice(0,100).map(a => ({ id: a._id, slug: a.slug, name: a.name, labels: a.labels, uploadedAt: a.uploadedAt, match: rank(a,q) === 3 ? 'exact' : rank(a,q) === 2 ? 'slug' : 'label' }));
    return { hits, source };
  }
}
