import { useEffect, useState, type FormEvent } from 'react';
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
const blank = (): Question => ({ id: crypto.randomUUID(), stem: '', options: ['', ''], correctIndex: 0, explanation: '' });
export function QuizEditor({ call }: {
    call: Call;
}) {
    const [title, setTitle] = useState(''), [questions, setQuestions] = useState<Question[]>([blank()]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [live, setLive] = useState<{
        _id: string;
        title: string;
        expiresAt: string;
    }[]>([]);
    const refresh = () => call<{
        quizzes: typeof live;
    }>('/admin/quizzes').then(r => setLive(r.quizzes)).catch(e => setError(e.message));
    useEffect(() => { void refresh(); }, []);
    function update(index: number, patch: Partial<Question>) { setQuestions(all => all.map((q, i) => i === index ? { ...q, ...patch } : q)); }
    async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try {
        await call('/admin/quizzes', json('POST', { title, questions }));
        setNotice('Quiz is live for 24 hours. It cannot be edited.');
        setTitle('');
        setQuestions([blank()]);
        await refresh();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section><p className="eyebrow">Learning together</p><h1>Quizzes</h1><p className="muted">Publish a global quiz for 24 hours. Each client gets one attempt, with one minute per question.</p>{live.map(q => <div className="quiz-live-row" key={q._id}><strong>{q.title}</strong><span>Closes {new Date(q.expiresAt).toLocaleString()}</span></div>)}{notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}<form onSubmit={submit}><fieldset disabled={busy}><legend className="sr-only">Create quiz</legend><label htmlFor="quiz-title">Quiz title</label><input id="quiz-title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={160}/>{questions.map((q, i) => <section className="quiz-editor-question" key={q.id}><h2>Question {i + 1}</h2><label>Question Markdown<textarea value={q.stem} onChange={e => update(i, { stem: e.target.value })} required/></label>{q.options.map((option, j) => <div className="option-editor" key={j}><label><input type="radio" name={`correct-${q.id}`} checked={q.correctIndex === j} onChange={() => update(i, { correctIndex: j })}/> Correct</label><label>Option {j + 1}<input value={option} onChange={e => update(i, { options: q.options.map((v, k) => j === k ? e.target.value : v) })} required/></label>{q.options.length > 2 && <button type="button" className="text-button" onClick={() => update(i, { options: q.options.filter((_, k) => k !== j), correctIndex: 0 })}>Remove option</button>}</div>)}{q.options.length < 8 && <button className="text-button" type="button" onClick={() => update(i, { options: [...q.options, ''] })}>Add option</button>}<label>Explanation Markdown<textarea value={q.explanation} onChange={e => update(i, { explanation: e.target.value })}/></label><details><summary>Preview question</summary><Markdown text={q.stem}/><Markdown text={q.explanation}/></details>{questions.length > 1 && <button className="text-button" type="button" onClick={() => setQuestions(all => all.filter((_, j) => i !== j))}>Remove question</button>}</section>)}<div className="actions"><button className="button secondary" type="button" disabled={questions.length >= 60} onClick={() => setQuestions(all => [...all, blank()])}>Add question</button><button className="button" disabled={busy}>{busy ? 'Publishing…' : 'Publish quiz for 24 hours'}</button></div></fieldset></form></section>;
}
