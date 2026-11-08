import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { MARKDOWN_LIMIT, IMAGE_LIMIT, createArticleSchema, credentialsSchema, type Article, type TreeNode, type Notification } from '@wiki/shared';
import '../../../packages/shared/src/styles.css';
import './style.css';

type Explorer = { nodes: TreeNode[]; articles: Omit<Article,'contentHash'>[] };
type Call = <T>(path: string, options?: RequestInit) => Promise<T>;
function json(method: string, body: unknown): RequestInit { return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function Brand() { return <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">n</span><span><strong>Nursing & Medicine</strong><small>Library administration</small></span></a>; }
function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error,setError] = useState(''), [busy,setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/login', json('POST', { username: data.get('username'), password: data.get('password') }));
      const body = await r.json(); if (!r.ok) throw new Error(body.error ?? 'Could not sign in');
      onLogin(body.token);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not sign in'); } finally { setBusy(false); }
  }
  return <div className="login-shell"><Brand/><main className="login"><p className="eyebrow">Owner access</p><h1 className="serif">Welcome to your library.</h1><p className="muted">Sign in to organize articles and manage the collection.</p><form onSubmit={submit}><div className="field"><label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required maxLength={80}/></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={72}/></div>{error && <p className="error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><a href="/" className="return-link">← Return to the public library</a></main><p className="login-footer">Nursing & Medicine Wiki · Single-owner workspace</p></div>;
}
function Tree({ nodes, parent = null, selected, choose, depth = 0 }: { nodes: TreeNode[]; parent?: string | null; selected: string | null; choose: (id: string | null) => void; depth?: number }) {
  return <ul className="tree-list">{nodes.filter(n => n.parentId === parent).map(node => <li key={node.id}><button className={selected === node.id ? 'selected' : ''} aria-current={selected === node.id ? 'location' : undefined} onClick={() => choose(node.id)} style={{ paddingLeft: `${12+depth*16}px` }}><span aria-hidden="true">{node.kind === 'folder' ? '▱' : '≡'}</span>{node.name}</button>{depth < 100 && <Tree nodes={nodes} parent={node.id} selected={selected} choose={choose} depth={depth+1}/>}</li>)}</ul>;
}
function Upload({ call, parentId, parentName, finished, cancel, draft }: { call: Call; parentId: string | null; parentName: string; finished: (message: string) => void; cancel: () => void; draft?: Omit<Article,'contentHash'> }) {
  const [name,setName] = useState(draft?.name ?? ''), [slug,setSlug] = useState(draft?.slug ?? ''), [path,setPath] = useState('');
  const [slugEdited,setSlugEdited] = useState(!!draft);
  const [markdown,setMarkdown] = useState<File | null>(null), [images,setImages] = useState<{ file: File; path: string }[]>([]);
  const [busy,setBusy] = useState(false), [status,setStatus] = useState(''), [error,setError] = useState('');
  const [articleId,setArticleId] = useState(draft?._id ?? '');
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      if (!markdown && draft?.state !== 'published') throw new Error('Choose a Markdown file.');
      if (markdown && (markdown.size > MARKDOWN_LIMIT || markdown.size === 0)) throw new Error('Markdown must be between 1 byte and 6 MB.');
      if (images.some(i => i.file.size > IMAGE_LIMIT || i.file.size === 0)) throw new Error('Each image must be between 1 byte and 20 MB.');
      const data = createArticleSchema.parse({ name, slug, parentId, folderPath: path ? path.split('/').map(v => v.trim()) : [] });
      let id = articleId;
      if (!id) { setStatus('Creating article…'); const response = await call<{id:string}>('/admin/articles',json('POST',data)); id = response.id; setArticleId(id); }
      if (markdown) { setStatus('Uploading Markdown…'); await call(`/admin/articles/${id}/content`,{ method:'PUT', headers:{'Content-Type':'text/markdown'}, body:markdown }); }
      for (const [index,image] of images.entries()) {
        setStatus(`Uploading image ${index+1} of ${images.length}…`);
        const form = new FormData(); form.append('image',image.file,image.path);
        await call(`/admin/articles/${id}/images`,{method:'POST',body:form});
      }
      finished(`“${name}” is available in the library. Labels are generated in the background.`);
    } catch(e) { setError(e instanceof Error ? e.message : 'Upload failed. You can retry safely.'); setStatus('Upload incomplete. Retry with the same files to resume.'); }
    finally { setBusy(false); }
  }
  return <section className="upload-panel"><div className="panel-heading"><div><p className="eyebrow">{draft ? 'Resume upload' : 'Add to the collection'}</p><h2 className="serif">{draft?.state === 'published' ? 'Complete article images' : 'Upload an article'}</h2></div><button className="text-button" onClick={cancel} disabled={busy}>Close</button></div><p className="muted">Destination: {parentName}. New folders appear after the Markdown uploads successfully.</p>
    <form onSubmit={submit}><fieldset disabled={busy}><legend className="sr-only">Article files and details</legend><div className="form-grid"><div className="field"><label htmlFor="article-name">Article name</label><input id="article-name" value={name} disabled={!!articleId} onChange={e => { setName(e.target.value); if (!slugEdited) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')); }} required maxLength={160}/></div><div className="field"><label htmlFor="article-slug">Permanent slug</label><input id="article-slug" value={slug} disabled={!!articleId} onChange={e => { setSlug(e.target.value); setSlugEdited(true); }} pattern="[a-z0-9]+(-[a-z0-9]+)*" required maxLength={160}/><small>Lowercase words separated by hyphens.</small></div></div>
      {!draft && <div className="field"><label htmlFor="folder-path">New folders within this location <span className="muted">(optional)</span></label><input id="folder-path" value={path} disabled={!!articleId} onChange={e => setPath(e.target.value)} placeholder="For example: Fundamentals / Patient care"/></div>}
      <div className="file-area"><div className="field"><label htmlFor="markdown">Markdown article · up to 6 MB{draft?.state === 'published' ? ' (already uploaded)' : ''}</label><input id="markdown" type="file" accept=".md,.markdown,text/markdown,text/plain" required={draft?.state !== 'published'} onChange={e => setMarkdown(e.target.files?.[0] ?? null)}/></div><div className="field"><label htmlFor="images">Article images · up to 20 MB each</label><input id="images" type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.avif" multiple onChange={e => setImages(Array.from(e.target.files ?? []).map(file => ({file,path:file.name})))}/><small>Match the relative image paths used in the Markdown, including subfolders.</small></div></div>
      {draft?.imagePaths.length ? <p className="muted">Referenced images: {draft.imagePaths.join(', ')}</p> : null}
      {images.map((image,index) => <div className="image-path" key={`${image.file.name}-${index}`}><label htmlFor={`image-${index}`}>{image.file.name}</label><input id={`image-${index}`} value={image.path} required onChange={e => setImages(current => current.map((item,i) => i === index ? {...item,path:e.target.value} : item))}/></div>)}
      <p className="upload-policy">Published articles and images cannot be edited. You can add missing referenced images or delete an article and upload it again.</p>
      {error && <p className="error" role="alert">{error}</p>}<p aria-live="polite">{status}</p><div className="actions"><button className="button" disabled={busy}>{busy ? 'Uploading…' : articleId ? 'Resume upload' : 'Upload article'}</button><button className="button secondary" type="button" onClick={cancel} disabled={busy}>Cancel</button></div></fieldset></form>
  </section>;
}
function Credentials({ call, changed }: { call: Call; changed: () => void }) {
  const [error,setError] = useState(''), [busy,setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setError(''); setBusy(true);
    try { const body = credentialsSchema.parse(Object.fromEntries(form)); await call('/admin/credentials',json('PUT',body)); changed(); }
    catch(e) { setError(e instanceof Error ? e.message : 'Could not update credentials'); } finally { setBusy(false); }
  }
  return <section className="settings-panel"><p className="eyebrow">Account security</p><h1 className="serif">Owner credentials</h1><p className="muted">Changing credentials signs out all existing sessions.</p><form onSubmit={submit}><div className="field"><label htmlFor="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required/></div><div className="field"><label htmlFor="new-username">Username</label><input id="new-username" name="username" autoComplete="username" required maxLength={80}/></div><div className="field"><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required/><small>At least 12 characters; maximum 72 UTF-8 bytes.</small></div>{error && <p className="error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Saving…' : 'Update credentials'}</button></form></section>;
}
function App() {
  const [token,setToken] = useState(() => sessionStorage.getItem('wiki-token') ?? '');
  const [tab,setTab] = useState<'library'|'notifications'|'credentials'>('library');
  const [explorer,setExplorer] = useState<Explorer>({nodes:[],articles:[]}), [notifications,setNotifications] = useState<Notification[]>([]);
  const [selected,setSelected] = useState<string|null>(null), [upload,setUpload] = useState(false), [draft,setDraft] = useState<Omit<Article,'contentHash'>>();
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [loading,setLoading] = useState(false);
  const [retryingLabels,setRetryingLabels] = useState(false);
  const [deleting,setDeleting] = useState<TreeNode | null>(null), [busy,setBusy] = useState(false);
  function signIn(value: string) { sessionStorage.setItem('wiki-token',value); setToken(value); setError(''); }
  function signOut() { sessionStorage.removeItem('wiki-token'); setToken(''); setExplorer({nodes:[],articles:[]}); setNotifications([]); setUpload(false); setDeleting(null); }
  const call: Call = async (path,options = {}) => {
    const response = await fetch(`/api${path}`,{ ...options, cache:'no-store', headers:{...options.headers, Authorization:`Bearer ${token}`} });
    if (response.status === 401) signOut();
    if (response.status === 204) return undefined as never;
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Request failed');
    return body;
  };
  async function refresh(quiet = false) {
    if (!quiet) { setLoading(true); setError(''); }
    try { const [data,notes] = await Promise.all([call<Explorer>('/admin/tree'),call<{notifications:Notification[]}>('/admin/notifications')]); setExplorer(data); setNotifications(notes.notifications); }
    catch(e) { setError(e instanceof Error ? e.message : 'Could not load the workspace'); } finally { if (!quiet) setLoading(false); }
  }
  useEffect(() => { if (!token) return; void refresh(); const timer = setInterval(() => void refresh(true),30_000); return () => clearInterval(timer); }, [token]);
  async function remove() {
    if (!deleting) return; setBusy(true); setError('');
    try { const result = await call<{pending:boolean}>(`/admin/articles/${deleting.id}`,{method:'DELETE'}); setNotice(result.pending ? 'Content removed. Search cleanup will complete automatically when the search service recovers.' : 'Article collection deleted.'); setDeleting(null); setSelected(null); await refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : 'Deletion failed; retry to resume.'); } finally { setBusy(false); }
  }
  async function retryLabels() {
    setRetryingLabels(true); setError(''); setNotice('');
    try {
      const result = await call<{retried:number}>('/admin/labels/retry',{method:'POST'});
      setNotice(result.retried ? `Queued ${result.retried} article(s) for label retry.` : 'No pending or failed label generations are ready to retry.');
      await refresh(true);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not retry label generations.'); }
    finally { setRetryingLabels(false); }
  }
  if (!token) return <Login onLogin={signIn}/>;
  const current = explorer.nodes.find(n => n.id === selected);
  const children = explorer.nodes.filter(n => n.parentId === selected);
  const drafts = explorer.articles.filter(a => a.state === 'draft');
  const unread = notifications.filter(n => !n.read).length;
  const selectedArticle = explorer.articles.find(a => a._id === selected);
  const ancestorNames = selectedArticle?.ancestors.map(n => n.name) ?? [];
  return <><a className="skip" href="#main">Skip to content</a><header className="admin-header" inert={deleting ? true : undefined}><Brand/><div className="actions"><a href="/" className="public-link">View public library ↗</a><button className="text-button" onClick={signOut}>Sign out</button></div></header>
    <div className="workspace" inert={deleting ? true : undefined}><aside className="sidebar"><p className="eyebrow">Workspace</p><nav aria-label="Workspace"><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><span aria-hidden="true">▱</span>Library</button><button className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}><span aria-hidden="true">○</span>Notifications {unread > 0 && <span className="count">{unread}</span>}</button><button className={tab === 'credentials' ? 'active' : ''} onClick={() => setTab('credentials')}><span aria-hidden="true">⌘</span>Credentials</button></nav><div className="sidebar-tree"><p className="eyebrow">Collection</p><button className={`root-button ${selected === null ? 'selected' : ''}`} onClick={() => { setSelected(null); setTab('library'); setUpload(false); }}>All articles</button><Tree nodes={explorer.nodes} selected={selected} choose={id => { setSelected(id); setTab('library'); setUpload(false); }}/>{!explorer.nodes.length && <p className="sidebar-empty">Your folders will appear here after your first upload.</p>}</div><div className="sidebar-bottom"><span className="status-dot"/>Single-owner library<br/><span className="muted">Public reading · Private management</span></div></aside>
      <main id="main" className="admin-main">
        {error && <div className="error" role="alert">{error} <button className="text-button" onClick={() => void refresh()}>Retry</button></div>}
        {notice && <div className="notice" role="status">{notice} <button className="text-button" onClick={() => setNotice('')}>Dismiss</button></div>}
        {tab === 'library' && <><div className="page-heading"><div><p className="eyebrow">Content management</p><h1 className="serif">{current?.name ?? 'Your library'}</h1><p className="muted">{current ? 'Browse this location or add an article within it.' : 'An organized home for your nursing and medical knowledge.'}</p></div><div className="actions"><button className="button secondary" onClick={() => void retryLabels()} disabled={retryingLabels}>{retryingLabels ? 'Retrying labels…' : 'Retry pending & failed labels'}</button><button className="button" onClick={() => { setDraft(undefined); setUpload(true); }}>+ Upload article</button></div></div>
          <div className="library-stats"><span><strong>{explorer.articles.filter(a => a.state === 'published').length}</strong> articles</span><span><strong>{explorer.nodes.filter(n => n.kind === 'folder').length}</strong> folders</span><span><strong>{explorer.articles.filter(a => a.state === 'published' && a.labelStatus === 'pending').length}</strong> awaiting labels</span></div>
          {loading && <p role="status">Loading library…</p>}
          {upload && <Upload key={draft?._id ?? selected ?? 'root'} call={call} parentId={draft?.parentId ?? selected} parentName={current?.name ?? 'Library root'} draft={draft} cancel={() => { setUpload(false); void refresh(); }} finished={message => { setNotice(message); setUpload(false); void refresh(); }}/>}
          {!upload && <>
            <div className="explorer-toolbar"><div><button className="text-button" onClick={() => setSelected(null)}>Library</button>{current && <span className="muted"> / {ancestorNames.join(' / ')}{ancestorNames.length ? ' / ' : ''}{current.name}</span>}</div><button className="text-button" onClick={() => void refresh()}>Refresh</button></div>
            {selectedArticle && <div className="article-detail"><div><p className="eyebrow">Article · {selectedArticle.labelStatus === 'pending' ? 'Labels pending' : selectedArticle.labelStatus === 'failed' ? 'Labels failed' : 'Labels ready'}</p><h2 className="serif">{selectedArticle.name}</h2><div className="tags">{selectedArticle.labels.map(label => <span key={label} className="tag">{label}</span>)}</div></div><div className="actions"><a className="button secondary" href={`/article/${selectedArticle.slug}`}>Read article ↗</a><button className="button secondary" onClick={() => { setDraft(selectedArticle); setUpload(true); }}>Add missing images</button></div></div>}
            {children.length > 0 ? <div className="table-scroll"><table className="file-table"><thead><tr><th scope="col">Name</th><th scope="col">Labels</th><th scope="col">Added</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{children.map(node => { const a = explorer.articles.find(a => a._id === node.id); return <tr key={node.id}><td><button className="file-name" onClick={() => setSelected(node.id)}><span className="file-icon" aria-hidden="true">{node.kind === 'folder' ? '▱' : '≡'}</span><span>{node.name}<small>{node.kind === 'folder' ? 'Folder' : `${Math.max(1,Math.ceil((a?.size ?? 0)/1024))} KB · Markdown`}</small></span></button></td><td>{a ? <span className={`status ${a.labelStatus}`}>{a.labelStatus === 'success' ? 'Ready' : a.labelStatus === 'failed' ? 'Failed' : 'Pending'}</span> : '—'}</td><td className="muted">{a?.uploadedAt ? new Date(a.uploadedAt).toLocaleDateString() : '—'}</td><td><button className="text-button delete-link" onClick={() => setDeleting(node)} aria-label={`Delete ${node.name}`}>Delete</button></td></tr>; })}</tbody></table></div> : !loading && <div className="empty"><span className="empty-icon" aria-hidden="true">▱</span><h2 className="serif">{current ? 'No articles inside this location' : 'Your collection starts here'}</h2><p>Upload a Markdown article and its images.<br/>Organize it into folders as you go.</p><button className="button secondary" onClick={() => { setDraft(undefined); setUpload(true); }}>Upload your first article</button></div>}
            {current && <p className="delete-location"><button className="text-button delete-link" onClick={() => setDeleting(current)}>Delete this {current.kind} and all its contents</button></p>}
            {drafts.length > 0 && <section className="draft-list"><h2 className="serif">Unfinished uploads</h2><p className="muted">These articles are private until their Markdown is uploaded.</p>{drafts.map(a => <div key={a._id}><span>{a.name}</span><div className="actions"><button className="text-button" onClick={() => { setDraft(a); setUpload(true); }}>Resume</button><button className="text-button delete-link" onClick={() => setDeleting({id:a._id,name:a.name,kind:'article',parentId:a.parentId})}>Delete</button></div></div>)}</section>}
          </>}
        </>}
        {tab === 'notifications' && <section><div className="page-heading"><div><p className="eyebrow">Activity</p><h1 className="serif">Notifications</h1><p className="muted">Label generation, storage notices, and completed deletions.</p></div><button className="button secondary" onClick={() => void refresh()}>Refresh</button></div>{!notifications.length ? <div className="empty"><h2 className="serif">All quiet for now</h2><p>Updates from your library will appear here.</p></div> : <div className="notification-list">{notifications.map(n => <article key={n._id} className={n.read ? 'read' : ''}><div><span className="eyebrow">{n.type.replaceAll('-',' ')}</span><p>{n.message}</p><time className="muted" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time></div>{!n.read && <button className="text-button" onClick={async () => { try { await call(`/admin/notifications/${encodeURIComponent(n._id)}/read`,{method:'PATCH'}); await refresh(true); } catch(e) { setError((e as Error).message); } }}>Mark read</button>}</article>)}</div>}</section>}
        {tab === 'credentials' && <Credentials call={call} changed={signOut}/>}
      </main>
    </div>
    {deleting && <div className="dialog-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" onKeyDown={e => { if (e.key === 'Escape' && !busy) setDeleting(null); if (e.key === 'Tab') { const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1)?.focus(); } else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0]?.focus(); } } }}><p className="eyebrow">Permanent deletion</p><h2 id="delete-title" className="serif">Delete “{deleting.name}”?</h2><p id="delete-description">This removes the selected item, every article beneath it, their images, and search labels. This cannot be undone.</p>{error && <p className="error" role="alert">{error}</p>}<div className="actions"><button className="button secondary" autoFocus disabled={busy} onClick={() => setDeleting(null)}>Keep content</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete permanently'}</button></div></section></div>}
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
