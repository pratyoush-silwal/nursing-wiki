import { useEffect, useRef, useState } from 'react';
import type { Question } from '../../../../packages/shared/src/learning.ts';
import { Markdown } from '../../../../packages/shared/src/ui/Markdown.tsx';
import { json, type Call } from '../api.ts';
export type Session = {
    quizId: string;
    title: string;
    questions: Omit<Question, 'correctIndex' | 'explanation'>[];
    answers: Record<string, number>;
    deadlineAt: string;
    serverNow: string;
    submittedAt: string | null;
};
export function QuizRun({ session, call, finished }: {
    session: Session;
    call: Call;
    finished: () => void;
}) {
    const [answers, setAnswers] = useState(session.answers), [remaining, setRemaining] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const answersRef = useRef(answers), submitted = useRef(!!session.submittedAt), saveChain = useRef(Promise.resolve()), autoSubmitted = useRef(false);
    const end = useRef(performance.now() + Math.max(0, Date.parse(session.deadlineAt) - Date.parse(session.serverNow)));
    async function submit() { if (submitted.current)
        return; submitted.current = true; setBusy(true); try {
        await saveChain.current;
        await call(`/quizzes/${session.quizId}/submit`, json('POST', { answers: answersRef.current }));
        finished();
    }
    catch (e) {
        submitted.current = false;
        setError((e as Error).message);
        setBusy(false);
    } }
    useEffect(() => { if (session.submittedAt) {
        finished();
        return;
    } const update = () => { const seconds = Math.max(0, Math.ceil((end.current - performance.now()) / 1000)); setRemaining(seconds); if (!seconds && !autoSubmitted.current) {
        autoSubmitted.current = true;
        void submit();
    } }; update(); const timer = setInterval(update, 500); return () => clearInterval(timer); }, []);
    function choose(id: string, index: number) { if (busy || remaining <= 0)
        return; const next = { ...answersRef.current, [id]: index }; answersRef.current = next; setAnswers(next); setError(''); saveChain.current = saveChain.current.catch(() => { }).then(async () => { const result = await call<{
        submitted: boolean;
    }>(`/quizzes/${session.quizId}/answers`, json('PUT', { answers: next })); if (result.submitted)
        finished(); }).catch(e => setError(`Answer not saved: ${e.message}. Submit retries all selected answers.`)); }
    return <section className="quiz-run"><div className="quiz-heading"><div><p className="eyebrow">One attempt · answers save as you go</p><h1>{session.title}</h1></div><p className="timer" role="timer" aria-label="Time remaining">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p></div>{error && <p className="error" role="alert">{error}</p>}<form onSubmit={e => { e.preventDefault(); void submit(); }}>{session.questions.map((q, i) => <fieldset className="question" key={q.id} disabled={busy || remaining === 0}><legend>Question {i + 1}</legend><Markdown text={q.stem}/>{q.options.map((option, index) => <label className="answer" key={index}><input type="radio" name={q.id} checked={answers[q.id] === index} onChange={() => choose(q.id, index)}/><Markdown text={option}/></label>)}</fieldset>)}<p className="muted">Submission is final. Unanswered questions count as incorrect.</p><button className="button" disabled={busy}>{busy ? 'Submitting…' : 'Submit answers'}</button></form></section>;
}
