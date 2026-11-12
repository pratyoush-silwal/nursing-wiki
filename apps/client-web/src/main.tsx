import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { ArticleDto, SearchResult } from '@wiki/shared';
import { type Deck } from '../../../packages/shared/src/learning.ts';
import { Navbar, Sidebar, Footer, Modal } from '../../../packages/shared/src/ui/Shell.tsx';
import { Markdown } from '../../../packages/shared/src/ui/Markdown.tsx';
import { Search } from '../../../packages/shared/src/ui/Search.tsx';
import { QuizRun, type Session } from './pages/Quizzes.tsx';
import { Results, storedResults, type Result } from './pages/Results.tsx';
import { Study } from './pages/Flashcards.tsx';
import { json, type Call } from './api.ts';
import '../../../packages/shared/src/styles.css';
import './style.css';
type User = {
    id: string;
    email: string;
    premium: boolean;
};
type Live = {
    _id: string;
    title: string;
    questionCount: number;
    expiresAt: string;
};
function Authentication({ done }: {
    done: (token: string) => void;
}) {
    const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login'), [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError(''); try {
        if (mode === 'register' && data.get('password') !== data.get('confirmPassword')) throw new Error('Passwords do not match.');
        const body = mode === 'verify' ? { email, code: data.get('code') } : { email, password: data.get('password') };
        const response = await fetch(`/api/auth/${mode}`, json('POST', body));
        const result = await response.json();
        if (!response.ok)
            throw new Error(result.error ?? 'Could not sign in');
        if (mode === 'register')
            setMode('verify');
        else
            done(result.token);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <main id="main" className="auth-page"><p className="eyebrow">Your learning space</p><h1>{mode === 'login' ? 'Welcome back.' : mode === 'register' ? 'A little learning, every day.' : 'Check your inbox.'}</h1><p className="muted">{mode === 'verify' ? `Enter the code sent to ${email}.` : 'Read, test your knowledge, and keep the important things close.'}</p><form onSubmit={submit}><label htmlFor="email">Email</label><input id="email" type="email" value={email} disabled={mode === 'verify'} autoComplete="email" required onChange={e => setEmail(e.target.value)}/>{mode === 'verify' ? <><label htmlFor="code">Verification code</label><input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required/></> : <><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : 1} maxLength={72} required/>{mode === 'register' && <><small>At least 12 characters.</small><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required/></>}</>}{error && <p className="error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Send verification code' : 'Verify email'}</button></form><button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Back to sign in'}</button></main>;
}
function App() {
    const [token, setToken] = useState(() => sessionStorage.getItem('wiki-client-token') ?? ''), [user, setUser] = useState<User | null>(null), [error, setError] = useState(''), [gate, setGate] = useState(false), [busy, setBusy] = useState(false);
    const [quizzes, setQuizzes] = useState<Live[]>([]), [session, setSession] = useState<Session | null>(null), [results, setResults] = useState<Result[]>([]), [decks, setDecks] = useState<Deck[]>([]), [deck, setDeck] = useState<Deck | null>(null), [article, setArticle] = useState<ArticleDto | null>(null), [search, setSearch] = useState<SearchResult | null>(null), [notice, setNotice] = useState('');
    const [notes, setNotes] = useState<{
        _id: string;
        type: string;
        message: string;
        read?: boolean;
        quizId?: string;
    }[]>([]);
    const path = location.pathname.replace(/^\/client/, '') || '/', query = new URLSearchParams(location.search).get('q') ?? '';
    function signOut() { for (const key of Object.keys(sessionStorage)) if (key.startsWith('wiki-quiz-review:')) sessionStorage.removeItem(key); sessionStorage.removeItem('wiki-client-token'); setToken(''); setUser(null); setResults([]); setDeck(null); setDecks([]); setArticle(null); setSession(null); setQuizzes([]); setNotes([]); }
    const call: Call = async (path, options = {}) => { const response = await fetch(`/api${path}`, { signal: AbortSignal.timeout(15000), ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } }); const body = await response.json(); if (response.status === 401)
        signOut(); if (body.code === 'PREMIUM_REQUIRED')
        setGate(true); if (!response.ok)
        throw new Error(body.error ?? 'Please try again'); return body; };
    async function load() {
        setBusy(true);
        setError('');
        try {
            const current = await call<User>('/auth/me');
            setUser(current);
            const cachedResults = storedResults(current.id);
            if (path === '/results') setResults(cachedResults);
            setQuizzes((await call<{
                quizzes: Live[];
            }>('/quizzes')).quizzes);
            if (path.startsWith('/article/'))
                setArticle(await call<ArticleDto>(`/articles/${encodeURIComponent(decodeURIComponent(path.slice(9)))}`));
            else if (path === '/notifications')
                setNotes((await call<{
                    notifications: typeof notes;
                }>('/notifications')).notifications);
            else if (path === '/results')
                setResults((await call<{
                    results: Result[];
                }>('/quizzes/attempts/me')).results);
            else if (path.startsWith('/flashcards')) {
                if (path.slice(12))
                    setDeck(await call<Deck>(`/flashcards/by-article/${encodeURIComponent(path.slice(12))}`));
                else
                    setDecks((await call<{
                        decks: Deck[];
                    }>('/flashcards')).decks);
            }
            else if (query)
                setSearch(await call<SearchResult>(`/search?q=${encodeURIComponent(query)}`));
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    useEffect(() => { if (!token)
        return; void load(); }, [token]);
    useEffect(() => { if (!token || !user)
        return; const timer = setInterval(() => { storedResults(user.id); void call<{
        quizzes: Live[];
    }>('/quizzes').then(r => setQuizzes(r.quizzes)).catch(() => { });
    if ((path === '/flashcards' || path === '/flashcards/') && user.premium)
        void call<{ decks: Deck[] }>('/flashcards').then(r => setDecks(r.decks)).catch(() => {});
    if (path === '/results')
        void call<{
            results: Result[];
        }>('/quizzes/attempts/me').then(r => setResults(r.results)).catch(() => { }); }, 5000); return () => clearInterval(timer); }, [token, !!user, user?.premium]);
    async function start(id: string) { setError(''); setBusy(true); try {
        const next = await call<Session>(`/quizzes/${id}/start`, { method: 'POST' });
        if (next.submittedAt)
            location.assign('/client/results');
        else
            setSession(next);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <><a className="skip" href="#main">Skip to content</a><Navbar homeHref={token ? "/client/" : "/"} search={<Search base={token ? "/client" : ""} initial={query}/>}>{token ? <><a href="/client/notifications" aria-label="Notifications">◌</a><a href="/client/results">Results</a><a href="/client/upgrade" className="premium-link">{user?.premium ? 'Premium member' : 'Upgrade'}</a><button className="text-button" onClick={signOut}>Sign out</button></> : <a href="/">Library</a>}</Navbar>{!token ? <Authentication done={value => { sessionStorage.setItem('wiki-client-token', value); setToken(value); }}/> : <><Sidebar client activeQuiz={quizzes.length > 0}/><main id="main" className="client-main">{error && <p className="error" role="alert">{error} <button className="text-button" onClick={() => void load()}>Try again</button></p>}{busy && <p role="status"><span className="spinner"/> Loading…</p>}{notice && <p role="status" className="notice">{notice}</p>}
    {path === '/' && !query && <><section className="learning-hero"><p className="eyebrow">A little curiosity goes a long way</p><h1>start learning</h1><p>Find a question. Follow an idea. Make it yours.</p></section>{quizzes.length > 0 && <aside className="quiz-notice" role="status"><IconQuiz /><div><strong>A new challenge is waiting.</strong><p>{quizzes[0].title}</p></div><a className="button secondary" href="/client/quizzes">Join Quiz</a></aside>}<section className="learning-links"><a href="/client/?q=nursing"><span>01</span><h2>Nursing practice</h2><p>The essentials of thoughtful patient care.</p></a><a href="/client/quizzes"><span>02</span><h2>Test your understanding</h2><p>One quiz. A fresh perspective.</p></a><a href="/client/flashcards"><span>03</span><h2>Make it stick</h2><p>Return to the ideas worth remembering.</p></a></section></>}
    {query && <section><h1>Results for “{query}”</h1>{search?.hits.length === 0 && <div className="empty">Nothing found. Try another topic.</div>}<div className="result-list">{search?.hits.map(hit => <article key={hit.id}><a href={`/client/article/${hit.slug}`}><h2>{hit.name}</h2><p className="muted">{hit.labels.join(' · ')}</p></a></article>)}</div></section>}
    {article && <article className="reader"><nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/client/">Library</a>{article.breadcrumb.filter(n => n.slug).map(n => <span key={n.id}> / <a href={`/client/article/${n.slug}`}>{n.name}</a></span>)}</nav><h1>{article.name}</h1><div className="article-tools"><span>{Math.max(1, Math.ceil(article.markdown.split(/\s+/).length / 220))} min read</span><button className="button secondary" onClick={() => { if (!user?.premium)
            setGate(true);
        else
            location.assign(`/client/flashcards/${article.id}`); }}>Study flashcards</button></div><Markdown text={article.markdown} images={article.images} client/><div className="tags">{article.labels.map(label => <a className="tag" key={label} href={`/client/?q=${encodeURIComponent(label)}`}>{label}</a>)}</div></article>}
    {path === '/quizzes' && (session ? <QuizRun key={session.quizId} session={session} call={call} finished={() => location.assign('/client/results')}/> : <section><p className="eyebrow">A daily challenge</p><h1>Put your knowledge to work.</h1><p className="muted">One attempt per quiz. One minute per question, up to the quiz’s closing time.</p>{quizzes.length === 0 ? <div className="empty">No active quizzes. Check back soon.</div> : quizzes.map(q => <article className="quiz-row" key={q._id}><div><h2>{q.title}</h2><p>{q.questionCount} questions · Closes {new Date(q.expiresAt).toLocaleString()}</p></div><button className="button" disabled={busy} onClick={() => void start(q._id)}>Join Quiz</button></article>)}<a href="/client/results">View your results →</a></section>)}
    {path === '/notifications' && <section><p className="eyebrow">Your learning activity</p><h1>Notifications</h1>{notes.length === 0 ? <div className="empty">You’re all caught up.</div> : notes.map(n => <article className="quiz-row" key={n._id}><div><p>{n.message}</p>{n.quizId && <a href="/client/quizzes">Join Quiz →</a>}{n.type === 'quiz-result' && <a href="/client/results">View results →</a>}</div>{!n.quizId && !n.read && <button className="text-button" onClick={() => void call(`/notifications/${encodeURIComponent(n._id)}/read`, { method: 'PATCH' }).then(() => setNotes(all => all.map(note => note._id === n._id ? { ...note, read: true } : note))).catch(e => setError(e.message))}>Mark read</button>}</article>)}</section>}
    {path === '/results' && <Results results={results} userId={user?.id ?? ''}/>}
    {path.startsWith('/flashcards') && (deck ? <Study key={deck._id} deck={deck}/> : <section><p className="eyebrow">A practice in remembering</p><h1>Your flashcards.</h1>{decks.length === 0 ? <div className="empty"><h2>No decks yet.</h2><p>New flashcard collections will appear here when published.</p></div> : decks.map(d => <article className="quiz-row" key={d._id}><h2>{d.title}</h2><a className="button secondary" href={`/client/flashcards/${d.articleId}`}>Study deck</a></article>)}</section>)}
    {path === '/upgrade' && <section className="upgrade"><p className="eyebrow">More ways to learn</p><h1>Good ideas deserve<br />to stay with you.</h1><p>Unlock article flashcards and build a practice of remembering.</p>{user?.premium ? <p className="notice">You’re a premium member. Your access is permanent.</p> : <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try {
            await call('/premium/unlock', json('POST', { code: new FormData(e.currentTarget).get('code') }));
            setUser(u => u ? { ...u, premium: true } : u);
            setNotice('Premium is unlocked, permanently.');
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        } }}><label htmlFor="premium-code">Unlock code</label><input id="premium-code" name="code" placeholder="Enter FREE" required/><button className="button green" disabled={busy}>Unlock premium</button></form>}<ul><li>Flashcards drawn from your articles</li><li>A simple again, hard, good review rhythm</li><li>Permanent access. No subscription.</li></ul></section>}
    {!['/', '/quizzes', '/results', '/notifications', '/upgrade', '/flashcards'].includes(path) && !path.startsWith('/article/') && !path.startsWith('/flashcards/') && <section className="empty"><h1>Page not found.</h1><a className="button" href="/client/">Go home</a></section>}
  </main>{path === '/' && !query && <Footer />}</>}{gate && <Modal title="upgrade to premium" close={() => setGate(false)}><p>Unlock flashcards to keep learning beyond the page.</p><a className="button green" href="/client/upgrade">Go to upgrade</a></Modal>}</>;
}
function IconQuiz() { return <span className="notification-mark" aria-hidden="true">?</span>; }
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
