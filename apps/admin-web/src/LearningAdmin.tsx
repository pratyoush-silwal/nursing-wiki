import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import type { Article, ArticleDto, TreeNode } from '@wiki/shared';
import type { Question } from '../../../packages/shared/src/learning.ts';
import { Markdown } from '../../../packages/shared/src/ui/Markdown.tsx';
type Call = <T>(path: string, options?: RequestInit) => Promise<T>;
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function FlashcardGeneration({ articleId, call }: { articleId: string; call: Call }) {
    const [status, setStatus] = useState('loading'), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
    useEffect(() => {
        let stopped = false, timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const result = await call<{ status: string; error?: string }>(`/admin/articles/${articleId}/flashcards`);
                if (stopped) return;
                setStatus(result.status); setError(result.error ?? '');
                if (result.status === 'queued' || result.status === 'generating') timer = setTimeout(poll, 3000);
            } catch (e) { if (!stopped) { setStatus('unavailable'); setError((e as Error).message); } }
        };
        void poll();
        return () => { stopped = true; clearTimeout(timer); };
    }, [articleId, refresh]);
    async function generate() {
        setStatus('queued'); setError('');
        try {
            const result = await call<{ exists?: boolean }>(`/admin/articles/${articleId}/flashcards`, { method: 'POST' });
            if (result.exists) setStatus('ready');
            else setRefresh(value => value + 1);
        } catch (e) { setStatus('failed'); setError((e as Error).message); }
    }
    const pending = ['loading', 'queued', 'generating'].includes(status);
    return <div className="flashcard-generation"><button className="button secondary" disabled={pending || status === 'ready'} onClick={() => void generate()}>{status === 'ready' ? 'Flashcards ready' : status === 'generating' ? 'Generating flashcards…' : status === 'queued' ? 'Flashcards queued…' : status === 'loading' ? 'Checking flashcards…' : status === 'failed' ? 'Retry flashcards' : 'Generate flashcards'}</button><p role="status">{status === 'ready' ? 'Available in the premium client flashcard library.' : pending && status !== 'loading' ? 'This panel updates automatically.' : ''}</p>{error && <p className="error" role="alert">{error}</p>}</div>;
}
export function ArticleEditor({ article, nodes, call, done }: {
    article: Omit<Article, 'contentHash'>;
    nodes: TreeNode[];
    call: Call;
    done: () => void;
}) {
    const [name, setName] = useState(article.name), [parentId, setParent] = useState(article.parentId ?? ''), [text, setText] = useState(''), [preview, setPreview] = useState(false), [images, setImages] = useState<Record<string, string>>({}), [imagePaths, setImagePaths] = useState<string[]>([]), [files, setFiles] = useState<{
        file: File;
        path: string;
    }[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(true);
    useEffect(() => { void call<ArticleDto>(`/articles/${article.slug}`).then(a => { setText(a.markdown); setImages(a.images); setImagePaths(article.imagePaths); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }, [article._id]);
    async function save(e: FormEvent) { e.preventDefault(); setError(''); setBusy(true); try {
        await call(`/admin/articles/${article._id}`, json('PATCH', { name, parentId: parentId || null, markdown: text }));
        for (const image of files) {
            const form = new FormData();
            form.append('image', image.file, image.path);
            await call(`/admin/articles/${article._id}/images?replace=true`, { method: 'POST', body: form });
        }
        done();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="editor-panel"><div className="panel-heading"><h2>Edit article</h2><button className="text-button" onClick={done}>Close</button></div><p className="muted">Changes are published immediately. Labels and flashcards stay as they are. There is no revision history.</p>{error && <p className="error" role="alert">{error}</p>}<form onSubmit={save}><fieldset disabled={busy}><legend className="sr-only">Article editor</legend><label htmlFor="edit-name">Article name</label><input id="edit-name" value={name} onChange={e => setName(e.target.value)} required/><label htmlFor="edit-parent">Move to</label><select id="edit-parent" value={parentId} onChange={e => setParent(e.target.value)}><option value="">Library root</option>{nodes.filter(n => n.id !== article._id).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select><div className="editor-tabs"><button type="button" className="text-button" onClick={() => setPreview(!preview)}>{preview ? 'Edit Markdown' : 'Preview article'}</button></div>{preview ? <Markdown text={text} images={images}/> : <><label htmlFor="edit-markdown">Markdown</label><textarea id="edit-markdown" className="markdown-editor" value={text} onChange={e => setText(e.target.value)} required/></>}<label htmlFor="edit-images">Add or replace images</label><input id="edit-images" type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.avif" onChange={e => setFiles(Array.from(e.target.files ?? []).map(file => ({ file, path: file.name })))}/>{files.map((image, i) => <label key={i}>{image.file.name} — referenced path<input value={image.path} required onChange={e => setFiles(all => all.map((f, j) => i === j ? { ...f, path: e.target.value } : f))}/></label>)}<div className="image-list">{imagePaths.map(path => <div key={path}><span>{path}</span><button type="button" className="text-button" onClick={async () => { setBusy(true); setError(''); try {
        await call(`/admin/articles/${article._id}/image?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        setImagePaths(paths => paths.filter(p => p !== path));
        setImages(all => Object.fromEntries(Object.entries(all).filter(([p]) => p !== path)));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>Remove image</button></div>)}</div><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Publish changes'}</button></fieldset></form></section>;
}
export function QuizEditor({ call }: {
    call: Call;
}) {
    const [file, setFile] = useState<File | null>(null), [dragging, setDragging] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [live, setLive] = useState<{
        _id: string;
        title: string;
        expiresAt: string;
        questions: Question[];
    }[]>([]);
    const refresh = () => call<{
        quizzes: typeof live;
    }>('/admin/quizzes').then(r => setLive(r.quizzes)).catch(e => setError(e.message));
    useEffect(() => { void refresh(); }, []);
    function choose(file?: File) { setError(''); if (file && !file.name.toLowerCase().endsWith('.md')) { setFile(null); setError('Choose a Markdown (.md) file.'); return; } setFile(file ?? null); }
    function drop(e: DragEvent<HTMLLabelElement>) { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }
    async function submit(e: FormEvent) { e.preventDefault(); if (!file) return; setBusy(true); setError(''); try {
        const result = await call<{ title: string; questions: Question[] }>('/admin/quizzes/import', json('POST', { markdown: await file.text() }));
        setNotice(`“${result.title}” is live with ${result.questions.length} questions for 24 hours. The answer key stays private.`);
        setFile(null);
        await refresh();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="quiz-admin"><p className="eyebrow">Learning together</p><h1>Quizzes</h1><p className="muted">Upload one Markdown file containing the questions and answer key. Clients receive only the questions. Each quiz stays live for 24 hours, with one attempt per client.</p>
        {live.length > 0 && <section className="quiz-live-panel"><h2>Live quizzes</h2>{live.map(q => <article className="quiz-live-row" key={q._id}><div><strong>{q.title}</strong><p>{q.questions.length} questions</p></div><span>Closes {new Date(q.expiresAt).toLocaleString()}</span></article>)}</section>}
        {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
        <form className="quiz-upload-form" onSubmit={submit}><fieldset disabled={busy}><legend className="sr-only">Upload a quiz</legend><label htmlFor="quiz-markdown-file">Quiz Markdown file</label><label className={`quiz-dropzone${dragging ? ' is-dragging' : ''}`} htmlFor="quiz-markdown-file" onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={drop}><span className="quiz-drop-icon" aria-hidden="true">↑</span><strong>{file ? file.name : 'Drop your .md file here'}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · ready to publish` : 'or click to browse · maximum 200 KB'}</span><input id="quiz-markdown-file" className="sr-only" type="file" accept=".md,text/markdown" onChange={e => choose(e.target.files?.[0])}/></label>
            <p className="quiz-format-hint">Use the question format in <code>demo_quiz.md</code>. Put the JSON answer key after a <code>---</code> separator.</p><div className="actions"><button className="button" disabled={busy || !file}>{busy ? 'Publishing…' : 'Publish quiz for 24 hours'}</button>{file && <button className="text-button" type="button" onClick={() => choose()}>Remove file</button>}</div></fieldset></form>
    </section>;
}
