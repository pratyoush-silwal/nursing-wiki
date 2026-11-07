import { StrictMode, useEffect, useState, type FormEvent, type ImgHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ArticleDto, SearchResult } from '@wiki/shared';
import '../../../packages/shared/src/styles.css';
import './style.css';

async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api${url}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? 'This article could not be found. It may have been removed.' : 'The library is temporarily unavailable. Please try again.');
  return response.json();
}
function ArticleImage({ src, alt, images }: ImgHTMLAttributes<HTMLImageElement> & { images: ArticleDto['images'] }) {
  const [failed, setFailed] = useState(false);
  let path = '';
  try { path = decodeURIComponent(typeof src === 'string' ? src : '').replace(/^\.\//, ''); } catch { /* Invalid references render the required fallback. */ }
  const resolved = images[path];
  return !resolved || failed ? <span className="missing-image">[no image]</span> : <img src={resolved} alt={alt ?? ''} loading="lazy" onError={() => setFailed(true)} />;
}
function App() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const url = new URL(location, window.location.origin);
  const query = url.searchParams.get('q') ?? '';
  let slug = url.pathname.startsWith('/article/') ? url.pathname.slice(9) : '';
  try { slug = decodeURIComponent(slug); } catch { /* Invalid slugs are rejected by the API. */ }
  const [input, setInput] = useState(query);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [article, setArticle] = useState<ArticleDto | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  function navigate(path: string) { history.pushState(null, '', path); setLocation(path); window.scrollTo(0,0); }
  useEffect(() => { const pop = () => setLocation(window.location.pathname + window.location.search); window.addEventListener('popstate',pop); return () => window.removeEventListener('popstate',pop); }, []);
  useEffect(() => {
    setInput(query); setError(''); setArticle(null); setResult(null);
    if (!slug && !query) { setLoading(false); document.title = 'Nursing & Medicine Wiki'; return; }
    const controller = new AbortController(); setLoading(true);
    const request = slug
      ? get<ArticleDto>(`/articles/${encodeURIComponent(slug)}`, controller.signal).then(a => { setArticle(a); document.title = `${a.name} · Nursing & Medicine`; })
      : get<SearchResult>(`/search?q=${encodeURIComponent(query)}`, controller.signal).then(setResult);
    void request.catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, query, reload]);
  function search(e: FormEvent) { e.preventDefault(); if (input.trim()) navigate(`/?q=${encodeURIComponent(input.trim())}`); }
  const home = !query && !slug;
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/" onClick={e => { e.preventDefault(); navigate('/'); }}><span className="brand-mark" aria-hidden="true">n</span><span><strong>Nursing & Medicine</strong><small>The knowledge library</small></span></a>
      <nav aria-label="Main"><a href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>Library</a><a href="/admin/">Owner access <span aria-hidden="true">↗</span></a></nav>
    </div></header>
    <main id="main" className={home ? 'home-main' : 'content-main'}>
      {home && <section className="intro"><p className="eyebrow">A focused reference library</p><h1 className="serif">Nursing & medicine.<br/>Knowledge, organized.</h1><p className="intro-copy">Find the topic you need. Read without distraction.<br className="desktop-break"/> A considered space for nursing and medical learning.</p></section>}
      <form className={`search-form ${home ? 'large' : ''}`} onSubmit={search} role="search"><label className="sr-only" htmlFor="search">Search articles</label><span className="search-icon" aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search a topic or keyword…" value={input} onChange={e => setInput(e.target.value)} maxLength={160} required/><button className="button" type="submit">Search <span aria-hidden="true">↗</span></button></form>
      {home && <>
        <p className="search-note">Search article names and clinical labels.</p>
        <section className="starting-points"><div className="section-heading"><h2 className="serif">A place to begin</h2><span className="eyebrow">Explore by keyword</span></div>
          <div className="topic-list">{[['01','Nursing','nursing','Principles, practice, and patient care'],['02','Medicine','medicine','Clinical subjects and medical knowledge'],['03','Anatomy','anatomy','Structures, systems, and foundations']].map(([number,title,q,copy]) => <a key={q} href={`/?q=${q}`} onClick={e => { e.preventDefault(); navigate(`/?q=${q}`); }}><span className="topic-number">{number}</span><span><h3>{title}</h3><p>{copy}</p></span><span className="topic-arrow" aria-hidden="true">↗</span></a>)}</div>
        </section><div className="library-note"><span className="eyebrow">Built for focused reading</span><p>Follow related labels and article breadcrumbs to move through the library. Each article has a permanent place in the collection.</p></div>
      </>}
      <div aria-live="polite">{loading && <p className="loading">Loading {slug ? 'article' : 'search results'}…</p>}{error && <div className="error"><p>{error}</p><button className="text-button" onClick={() => setReload(v => v+1)}>Try again</button></div>}</div>
      {result && <section className="results"><p className="eyebrow">Library search</p><h1 className="serif">Results for “{query}”</h1><p className="muted">{result.hits.length} {result.hits.length === 1 ? 'article' : 'articles'}{result.hits.length === 100 ? ' shown · refine your search for more specific results' : ''}</p>
        {!result.hits.length ? <div className="empty"><h2 className="serif">No matching articles yet</h2><p>Try a shorter topic, another keyword, or a different spelling.</p><button className="text-button" onClick={() => navigate('/')}>Back to the library</button></div> : <div className="result-list">{result.hits.map(hit => <article key={hit.id}><div><span className="eyebrow">{hit.match === 'label' ? 'Related label' : 'Article match'}</span><h2><a href={`/article/${hit.slug}`} onClick={e => { e.preventDefault(); navigate(`/article/${hit.slug}`); }}>{hit.name}</a></h2><div className="tags">{hit.labels.map(label => <a className="tag" key={label} href={`/?q=${encodeURIComponent(label)}`} onClick={e => { e.preventDefault(); navigate(`/?q=${encodeURIComponent(label)}`); }}>{label}</a>)}</div><p className="result-slug">{hit.slug}</p></div><span aria-hidden="true">↗</span></article>)}</div>}
      </section>}
      {article && <div className="reading-layout"><article className="reader">
        <nav aria-label="Breadcrumb" className="breadcrumbs"><a href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>Library</a>{article.breadcrumb.map(n => <span key={n.id}><span aria-hidden="true"> / </span>{n.slug ? <a href={`/article/${n.slug}`} onClick={e => { e.preventDefault(); navigate(`/article/${n.slug}`); }}>{n.name}</a> : n.name}</span>)}</nav>
        <header className="article-header"><p className="eyebrow">Reference article</p><h1 className="serif">{article.name}</h1><p className="muted">Added {article.uploadedAt ? new Date(article.uploadedAt).toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' }) : 'to the library'}<span aria-hidden="true"> · </span>{Math.max(1, Math.ceil(article.markdown.split(/\s+/).length / 220))} min read</p></header>
        <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: props => <ArticleImage key={props.src} src={props.src} alt={props.alt} images={article.images}/> }}>{article.markdown}</ReactMarkdown></div>
      </article><aside className="reading-aside"><h2 className="eyebrow">In this collection</h2><p>Follow a label to find related reading.</p><div className="tags">{article.labels.map(label => <a className="tag" key={label} href={`/?q=${encodeURIComponent(label)}`} onClick={e => { e.preventDefault(); navigate(`/?q=${encodeURIComponent(label)}`); }}>{label}</a>)}</div>{!article.labels.length && <p className="muted">No labels available yet.</p>}<hr/><p className="eyebrow">Article reference</p><p className="reference-slug">{article.slug}</p><a className="text-button" href="#main">Back to top ↑</a></aside></div>}
    </main>
    <footer className="site-footer"><span>Nursing & Medicine Wiki</span><span>A library for learning. Follow local clinical guidance in practice.</span></footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
