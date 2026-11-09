import { readFile } from 'node:fs/promises';
import { nameSchema, slugSchema } from '../packages/shared/src/index.ts';
import { parseDeck } from '../packages/shared/src/learning.ts';
import { demoArticles } from './demo-content.ts';
import { demoFlashcards } from './demo-flashcards.ts';

type Existing = { _id: string; name: string; slug: string; parentId: string | null; state: 'draft' | 'published' };
const ordered = new Map<string, number>();
for (const [index, article] of demoArticles.entries()) {
  nameSchema.parse(article.name); slugSchema.parse(article.slug);
  if (ordered.has(article.slug) || (article.parentSlug && !ordered.has(article.parentSlug))) throw new Error(`Invalid demo hierarchy at ${article.slug}`);
  ordered.set(article.slug, index);
}
if (process.argv.includes('--check')) {
  const slugs = new Set(demoArticles.map(article => article.slug));
  if (Object.keys(demoFlashcards).length !== 6 || Object.entries(demoFlashcards).some(([slug, markdown]) => !slugs.has(slug) || parseDeck(markdown).length < 8)) throw new Error('Invalid demo flashcard fixtures');
  console.log(`Demo collection validated: ${demoArticles.length} articles and ${Object.keys(demoFlashcards).length} flashcard decks.`);
} else {
  let input = '';
  for await (const chunk of process.stdin) input += chunk.toString();
  const [username, password] = input.replace(/\n$/, '').split('\n');
  if (!username || !password) throw new Error('Admin username and password must be supplied on stdin');
  const base = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!login.ok) throw new Error(`Admin login failed (${login.status}); check the current owner credentials`);
  const { token } = await login.json() as { token: string };
  async function request<T>(method: string, path: string, body?: BodyInit, contentType?: string): Promise<T> {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(contentType ? { 'Content-Type': contentType } : {}) }, body });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(`${method} ${path}: ${response.status} ${detail.error ?? response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
  const tree = await request<{ articles: Existing[] }>('GET', '/admin/tree');
  const known = new Map(tree.articles.map(article => [article.slug, article]));
  let created = 0, resumed = 0, skipped = 0;
  for (const article of demoArticles) {
    const parent = article.parentSlug ? known.get(article.parentSlug) : undefined;
    if (article.parentSlug && !parent) throw new Error(`Missing parent ${article.parentSlug}`);
    const parentId = parent?._id ?? null;
    let current = known.get(article.slug);
    if (current && (current.name !== article.name || current.parentId !== parentId)) throw new Error(`Slug belongs to another article: ${article.slug}`);
    if (!current) {
      const result = await request<{ id: string }>('POST', '/admin/articles', JSON.stringify({ name: article.name, slug: article.slug, parentId, deferLabels: true }), 'application/json');
      current = { _id: result.id, name: article.name, slug: article.slug, parentId, state: 'draft' };
      known.set(article.slug, current); created++;
    } else if (current.state === 'draft') resumed++;
    else skipped++;
    if (current.state === 'draft') {
      await request('PUT', `/admin/articles/${current._id}/content`, article.markdown, 'text/markdown');
      current.state = 'published';
    }
    if (article.image) {
      const bytes = await readFile(new URL(`./demo-assets/library-map.png`, import.meta.url));
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), article.image);
      await request('POST', `/admin/articles/${current._id}/images`, form);
    }
    if ((created + resumed + skipped) % 20 === 0) console.log(`Processed ${created + resumed + skipped}/${demoArticles.length} demo articles`);
  }
  let decksCreated = 0, decksPresent = 0;
  for (const [slug, markdown] of Object.entries(demoFlashcards)) {
    const article = known.get(slug);
    if (!article || article.state !== 'published') throw new Error(`Demo flashcard article is not published: ${slug}`);
    const result = await request<{ seeded: boolean }>('PUT', `/admin/articles/${article._id}/flashcards`, JSON.stringify({ markdown }), 'application/json');
    if (result.seeded) decksCreated++; else decksPresent++;
  }
  console.log(`Demo import complete: ${created} created, ${resumed} resumed, ${skipped} already present; ${decksCreated} sample decks added, ${decksPresent} existing decks preserved.`);
}
