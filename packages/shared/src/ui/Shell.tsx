import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
export function Icon({ name }: {
    name: 'home' | 'quiz' | 'cards';
}) { return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'home' ? <path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3Z"/> : name === 'quiz' ? <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h4"/></> : <><rect x="6" y="6" width="15" height="15" rx="2"/><path d="M17 3H3v14M10 11h7M10 15h4"/></>}</svg>; }
export function Sidebar({ client = false, activeQuiz = false }: {
    client?: boolean;
    activeQuiz?: boolean;
}) { const base = '/client'; return <nav className="icon-sidebar" aria-label="Learning"><a href={client ? '/client/' : '/'} aria-current={location.pathname === (client ? '/client/' : '/') ? 'page' : undefined} title="Home"><Icon name="home"/><span>Home</span></a><a href={`${base}/quizzes`} aria-current={location.pathname.endsWith('/quizzes') ? 'page' : undefined} title={activeQuiz ? 'Join Quiz' : 'Quizzes'}><Icon name="quiz"/><span>{activeQuiz ? 'Join Quiz' : 'Quizzes'}</span>{activeQuiz && <i className="live-dot"/>}</a><a href={`${base}/flashcards`} aria-current={location.pathname.includes('/flashcards') ? 'page' : undefined} title="Flashcards"><Icon name="cards"/><span>Flashcards</span></a></nav>; }
export function Navbar({ children, landing = false, search }: {
    children?: ReactNode;
    landing?: boolean;
    search?: ReactNode;
}) {
    const headerRef = useRef<HTMLElement>(null);
    useLayoutEffect(() => {
        const header = headerRef.current;
        if (!header) return;
        const update = () => document.documentElement.style.setProperty('--current-nav-height', `${header.getBoundingClientRect().height}px`);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(header);
        return () => { observer.disconnect(); document.documentElement.style.removeProperty('--current-nav-height'); };
    }, []);
    const [compact, setCompact] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const previousRect = useRef<DOMRect | null>(null);
    useEffect(() => {
        if (!search) return;
        const scroll = () => setCompact(current => {
            const next = current ? window.scrollY > 40 : window.scrollY > 160;
            if (next !== current) previousRect.current = searchRef.current?.getBoundingClientRect() ?? null;
            return next;
        });
        scroll(); window.addEventListener('scroll', scroll, { passive: true });
        return () => window.removeEventListener('scroll', scroll);
    }, [!!search]);
    useLayoutEffect(() => {
        const node = searchRef.current, before = previousRect.current;
        previousRect.current = null;
        if (!node || !before || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const after = node.getBoundingClientRect();
        const animation = node.animate([
            { transform: `translate(${before.left-after.left}px, ${before.top-after.top}px)`, width: `${before.width}px` },
            { transform: 'translate(0, 0)', width: `${after.width}px` }
        ], { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        return () => animation.cancel();
    }, [compact]);
    const [dark, setDark] = useState(() => localStorage.getItem('wiki-theme') === 'dark'); useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('wiki-theme', dark ? 'dark' : 'light'); }, [dark]); return <header ref={headerRef} className={`navbar ${landing ? 'marketing-nav' : ''} ${search ? 'search-navbar' : ''} ${compact ? 'search-compact' : ''}`} ><a className="wordmark" href="/">Nursing & Medicine<span className="wordmark-dot">.</span></a>{search && <div ref={searchRef} className="navbar-search">{search}</div>}<nav aria-label="Account">{children}{!landing && <button className="icon-button" aria-label={dark ? 'Use light theme' : 'Use dark theme'} onClick={() => setDark(!dark)}>{dark ? '☀' : '☾'}</button>}</nav></header>; }
export function Modal({ title, children, close }: {
    title: string;
    children: ReactNode;
    close: () => void;
}) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { const previous = document.activeElement as HTMLElement; const siblings = Array.from(document.getElementById('root')?.children ?? []).filter(el => !el.contains(ref.current)) as HTMLElement[]; const inert = siblings.map(el => el.inert); siblings.forEach(el => el.inert = true); ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => { siblings.forEach((el, i) => el.inert = inert[i]); previous?.focus(); }; }, []); return <div className="modal-backdrop"><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape')
    close(); if (e.key === 'Tab') {
    const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea')).filter(el => !el.hasAttribute('disabled'));
    if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
    }
    else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
    }
} }}><button className="icon-button modal-close" aria-label="Close" onClick={close}>×</button><h2>{title}</h2>{children}</div></div>; }
export function Footer() { return <footer className="landing-footer">copyright by pratyoush silwal</footer>; }
