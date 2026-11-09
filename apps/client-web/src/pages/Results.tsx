import { useEffect, useRef, useState } from 'react';
import type { Question } from '../../../../packages/shared/src/learning.ts';
import { Markdown } from '../../../../packages/shared/src/ui/Markdown.tsx';
import { loadScript } from '../../../../packages/shared/src/ui/vendor.ts';
import type { Call } from '../api.ts';
export type Result = {
    status?: string;
    _id: string;
    title: string;
    activatedAt: string;
    attempt: null | {
        scorePercent: number;
        answers: Record<string, number>;
    };
};
function Confetti() { const [show, setShow] = useState(true); useEffect(() => { const t = setTimeout(() => setShow(false), 2400); return () => clearTimeout(t); }, []); return show ? <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${i * 4.2}%`, animationDelay: `${(i % 5) * .08}s`, background: i % 2 ? '#1A8917' : '#C89A16' }}/>)}</div> : null; }
export function Results({ results, call }: {
    results: Result[];
    call: Call;
}) {
    const canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState(''), [review, setReview] = useState<{
        title: string;
        questions: Question[];
    } | null>(null);
    useEffect(() => { let chart: {
        destroy: () => void;
    } | undefined, alive = true; void loadScript('chart').then(() => { if (!alive || !canvas.current)
        return; const Chart = (window as unknown as {
        Chart: new (el: HTMLCanvasElement, config: object) => {
            destroy: () => void;
        };
    }).Chart; chart = new Chart(canvas.current, { type: 'bar', data: { labels: results.map(r => new Date(r.activatedAt).toLocaleDateString()), datasets: [{ label: 'Quiz score (%)', data: results.map(r => r.attempt?.scorePercent ?? 0), backgroundColor: '#242424' }] }, options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, title: { display: true, text: 'Percentage' }, grid: { color: '#f2f2f2' } }, x: { title: { display: true, text: 'Date of quiz' }, grid: { display: false } } } } }); }).catch(e => setError(e.message)); return () => { alive = false; chart?.destroy(); }; }, [results]);
    const perfect = results.find(r => r.attempt?.scorePercent === 100 && !sessionStorage.getItem(`celebrated-${r._id}`));
    useEffect(() => { if (perfect)
        sessionStorage.setItem(`celebrated-${perfect._id}`, 'true'); }, [perfect?._id]);
    return <section><p className="eyebrow">Your progress</p><h1>Small steps. Lasting knowledge.</h1>{perfect && <Confetti />}<p className="muted">Every quiz, in perspective. Quizzes you haven’t attempted appear as 0%.</p>{error && <p role="status">{error}</p>}<div className="chart"><canvas ref={canvas} role="img" aria-label="Quiz scores by date; exact scores listed below"/></div>{results.length === 0 && <div className="empty">Your results will appear after the first quiz is published.</div>}<div className="result-list">{results.map(r => <article key={r._id}><div><h2>{r.title}</h2><time>{new Date(r.activatedAt).toLocaleDateString()}</time><p>{r.attempt ? `${r.attempt.scorePercent}%` : r.status === 'grading' ? 'Grading your answers…' : r.status === 'in-progress' ? 'In progress' : 'Not attempted · 0%'}</p>{r.attempt && <button className="text-button" onClick={() => void call<{
        title: string;
        questions: Question[];
    }>(`/quizzes/${r._id}/review`).then(setReview).catch(e => setError(e.message))}>Review while live</button>}</div></article>)}</div>{review && <section><h2>{review.title} — review</h2>{review.questions.map(q => <div className="question" key={q.id}><Markdown text={q.stem}/><p className="eyebrow">Correct answer</p><Markdown text={q.options[q.correctIndex]}/><Markdown text={q.explanation}/></div>)}</section>}</section>;
}
