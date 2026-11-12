import { useEffect, useRef, useState, useId } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { loadScript, vendorPath } from './vendor.ts';
type MathEngine = {
    startup?: {
        promise: Promise<unknown>;
    };
    typesetPromise: (elements: HTMLElement[]) => Promise<void>;
    typesetClear: (elements: HTMLElement[]) => void;
};
const mathWindow = window as unknown as {
    MathJax?: MathEngine | Record<string, unknown>;
};
let mathWork = Promise.resolve();
function Mermaid({ text }: {
    text: string;
}) {
    const ref = useRef<HTMLDivElement>(null), id = useId().replace(/[^a-z0-9]/gi, '');
    const [error, setError] = useState('');
    useEffect(() => {
        let alive = true;
        setError('');
        void (async () => {
            const path = vendorPath('mermaid/mermaid.esm.min.mjs');
            const { default: mermaid } = await import(/* @vite-ignore */ path);
            mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', suppressErrorRendering: true, maxTextSize: 50000, flowchart: { htmlLabels: false } });
            const { svg } = await mermaid.render(`diagram${id}`, text);
            if (alive && ref.current)
                ref.current.innerHTML = svg;
        })().catch(() => { if (alive)
            setError('This diagram could not be rendered.'); });
        return () => { alive = false; };
    }, [text, id]);
    return <div className="diagram">{error ? <><p role="status">{error}</p><pre>{text}</pre></> : <div ref={ref} role="img" aria-label="Article diagram"/>}</div>;
}
function Image({ src, alt, images }: {
    src?: string;
    alt?: string;
    images: Record<string, string>;
}) { const [failed, setFailed] = useState(false); let key = ''; try {
    key = decodeURIComponent(src ?? '').replace(/^\.\//, '');
}
catch { } return images[key] && !failed ? <img loading="lazy" src={images[key]} alt={alt ?? ''} onError={() => setFailed(true)}/> : <span>[no image]</span>; }
export function Markdown({ text, images = {}, client = false }: {
    text: string;
    images?: Record<string, string>;
    client?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        let alive = true;
        setError('');
        if (!/\$/.test(text))
            return;
        if (!mathWindow.MathJax)
            mathWindow.MathJax = { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']], packages: ['base', 'ams'], maxBuffer: 20000 }, svg: { fontCache: 'none' }, startup: { typeset: false }, options: { enableMenu: false, skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] } };
        mathWork = mathWork.catch(() => { }).then(async () => { await loadScript('mathjax/tex-svg'); await (mathWindow.MathJax as MathEngine).startup?.promise; if (alive)
            await (mathWindow.MathJax as MathEngine).typesetPromise([el]); }).catch(() => { if (alive)
            setError('Math rendering is unavailable. The formula source remains visible.'); });
        return () => { alive = false; const math = mathWindow.MathJax as MathEngine; math?.typesetClear?.([el]); };
    }, [text]);
    return <>{error && <p role="status" className="muted">{error}</p>}<div className="markdown" key={text} ref={ref}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} skipHtml components={{ h1: ({ children }) => <h2>{children}</h2>, img: ({ src, alt }) => <Image key={src} src={src} alt={alt} images={images}/>, a: ({ href, children }) => <a href={client && href?.startsWith('/article/') ? `/client${href}` : href}>{children}</a>, pre: ({ children }) => <div className="code-block">{children}</div>, code: ({ className, children, ...props }) => className?.includes('language-math') ? <span className="math-source">{className.includes('math-display') ? `\\[${String(children)}\\]` : `\\(${String(children)}\\)`}</span> : className === 'language-mermaid' ? <Mermaid text={String(children)}/> : <code className={className} {...props}>{children}</code> }}>{text}</ReactMarkdown></div></>;
}
