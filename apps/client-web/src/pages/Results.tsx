import { useEffect, useRef, useState } from 'react';
import { Markdown } from '../../../../packages/shared/src/ui/Markdown.tsx';
import type { Question } from '../../../../packages/shared/src/learning.ts';
import { loadScript } from '../../../../packages/shared/src/ui/vendor.ts';
export type Result = {
    status?: string;
    expiresAt: string;
    review: null | {
        questions: Omit<Question, 'correctIndex' | 'explanation'>[];
        correctAnswers: Record<string, number>;
        answers: Record<string, number>;
    };
    _id: string;
    title: string;
    activatedAt: string;
    attempt: null | {
        scorePercent: number;
    };
};
export function storedResults(userId: string): Result[] {
    const results: Result[] = [];
    try {
        for (const key of Object.keys(sessionStorage)) {
            if (!key.startsWith('wiki-quiz-review:')) continue;
            try {
                const result = JSON.parse(sessionStorage.getItem(key)!) as Result;
                if (!result.review || !(Date.parse(result.expiresAt) > Date.now())) sessionStorage.removeItem(key);
                else if (key.startsWith(`wiki-quiz-review:${userId}:`)) results.push(result);
            } catch { sessionStorage.removeItem(key); }
        }
    } catch { /* Review still works when browser storage is unavailable. */ }
    return results;
}
function Confetti() { const [show, setShow] = useState(true); useEffect(() => { const t = setTimeout(() => setShow(false), 2400); return () => clearTimeout(t); }, []); return show ? <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${i * 4.2}%`, animationDelay: `${(i % 5) * .08}s`, background: i % 2 ? '#1A8917' : '#C89A16' }}/>)}</div> : null; }
export function Results({ results, userId }: {
    results: Result[];
    userId: string;
}) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => { setNow(Date.now()); storedResults(userId); }, 1000);
        return () => clearInterval(timer);
    }, [userId]);
    useEffect(() => {
        for (const result of results) {
            const key = `wiki-quiz-review:${userId}:${result._id}`;
            try {
                if (Date.parse(result.expiresAt) <= Date.now() || !result.review) sessionStorage.removeItem(key);
                else sessionStorage.setItem(key, JSON.stringify(result));
            } catch { /* Storage may be unavailable; the server can restore the review. */ }
        }
    }, [results, userId]);
    const canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState('');
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
    return <section><p className="eyebrow">Your progress</p><h1>Small steps. Lasting knowledge.</h1>{perfect && <Confetti />}<p className="muted">Every quiz, in perspective. Quizzes you haven’t attempted appear as 0%.</p>{error && <p role="status">{error}</p>}<div className="chart"><canvas ref={canvas} role="img" aria-label="Quiz scores by date; exact scores listed below"/></div>{results.length === 0 && <div className="empty">Your results will appear after the first quiz is published.</div>}<div className="result-list">{results.map(r => <article key={r._id}><div><h2>{r.title}</h2><time>{new Date(r.activatedAt).toLocaleDateString()}</time><p>{r.attempt ? `${r.attempt.scorePercent}%` : r.status === 'grading' ? 'Grading your answers…' : r.status === 'in-progress' ? 'In progress' : 'Not attempted · 0%'}</p>{Date.parse(r.expiresAt) > now && r.review && <details className="quiz-review"><summary>Review questions and answers</summary><p className="muted">Read only · Available until {new Date(r.expiresAt).toLocaleString()}</p>{r.review.questions.map((question, index) => <section className="question" key={question.id}><h3>Question {index + 1}</h3><Markdown text={question.stem}/>{question.options.map((option, optionIndex) => {
        const correct = r.review!.correctAnswers[question.id] === optionIndex;
        const selected = r.review!.answers[question.id] === optionIndex;
        return <div key={optionIndex} className={`answer review-answer${correct ? ' review-correct' : selected ? ' review-incorrect' : ''}`}><div><Markdown text={option}/>{(correct || selected) && <strong>{correct ? selected ? 'Correct answer · Your selection' : r.review!.answers[question.id] === undefined ? 'Correct answer · No selection' : 'Correct answer' : 'Your selection · Incorrect'}</strong>}</div></div>;
    })}{r.review!.answers[question.id] === undefined && <p className="muted">You did not answer this question.</p>}</section>)}</details>}{r.attempt && Date.parse(r.expiresAt) <= now && <p className="muted">This quiz has ended. Question review is no longer available.</p>}</div></article>)}</div></section>;
}
