import { z } from 'zod';
export const emailSchema = z.email().max(254).transform(v => v.toLowerCase().trim());
export const clientPassword = z.string().min(12).max(72).refine(v => new TextEncoder().encode(v).length <= 72);
export const registrationSchema = z.object({ email: emailSchema, password: clientPassword }).strict();
export const questionSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), stem: z.string().min(1).max(20000), options: z.array(z.string().min(1).max(5000)).min(2).max(8), correctIndex: z.number().int().min(0), explanation: z.string().max(20000).default('') }).strict().refine(q => q.correctIndex < q.options.length);
export const quizSchema = z.object({ title: z.string().trim().min(1).max(160), questions: z.array(questionSchema).min(1).max(60) }).strict().refine(q => new Set(q.questions.map(x => x.id)).size === q.questions.length, 'Question IDs must be unique');
export const answersSchema = z.record(z.string().max(80), z.number().int().min(0).max(7)).refine(answers => Object.keys(answers).length <= 60, 'At most 60 answers are allowed');
export type Question = z.infer<typeof questionSchema>;
export function parseQuizMarkdown(markdown: string) {
    const key = markdown.match(/\n---\s*\n\s*```json\s*\n([\s\S]*?)\n```\s*$/);
    if (!key || markdown.length > 200000) throw new Error('Quiz Markdown must end with an answer key after a --- separator');
    const source = markdown.slice(0, key.index).replace(/^\uFEFF?---\s*/, '').trim();
    const headers = [...source.matchAll(/^\*\*(\d+)\.\s*(.+?)\*\*\s*$/gm)];
    if (!headers.length || headers.length > 60 || source.slice(0, headers[0].index).trim()) throw new Error('Quiz must contain numbered bold questions');
    const questions = headers.map((header, index) => {
        const start = header.index! + header[0].length;
        const body = source.slice(start, headers[index + 1]?.index ?? source.length);
        const options = [...body.matchAll(/^\s*- \[ \] (.+?)\s*$/gm)];
        if (options.length < 2 || options.length > 8) throw new Error(`Question ${header[1]} must have 2–8 unchecked options`);
        const stem = [header[2].trim(), body.slice(0, options[0].index).trim()].filter(Boolean).join('\n\n');
        return { id: `q-${header[1]}`, stem, options: options.map(option => option[1].trim()), correctIndex: 0, explanation: '' };
    });
    const answerKey = z.object({ quiz: z.string().trim().min(1).max(160), answers: z.array(z.object({ question: z.number().int().min(1), answer: z.string().trim().min(1) }).strict()).min(1).max(60) }).strict().parse(JSON.parse(key[1]));
    if (answerKey.answers.length !== questions.length || new Set(answerKey.answers.map(a => a.question)).size !== questions.length) throw new Error('Answer key must contain one entry for every question');
    for (const answer of answerKey.answers) {
        const question = questions[answer.question - 1];
        if (!question || question.id !== `q-${answer.question}`) throw new Error(`Answer key references missing question ${answer.question}`);
        const correctIndex = question.options.indexOf(answer.answer);
        if (correctIndex < 0) throw new Error(`Answer for question ${answer.question} does not match an option`);
        question.correctIndex = correctIndex;
    }
    return quizSchema.parse({ title: answerKey.quiz, questions });
}
export interface ClientUser {
    _id: string;
    email: string;
    passwordHash: string;
    role: 'client';
    premium: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface Quiz {
    _id: string;
    title: string;
    questions: Question[];
    activatedAt: Date;
    expiresAt: Date;
    createdBy: string;
}
export interface QuizSession {
    _id: string;
    quizId: string;
    userId: string;
    startedAt: Date;
    deadlineAt: Date;
    submittedAt: Date | null;
    answers: Record<string, number>;
}
export interface QuizAttempt {
    _id: string;
    quizId: string;
    userId: string;
    title: string;
    activatedAt: Date;
    startedAt: Date;
    submittedAt: Date;
    scorePercent: number;
    answers: Record<string, number>;
}
export interface Flashcard {
    front: string;
    back: string;
}
export interface Deck {
    _id: string;
    articleId: string;
    title: string;
    markdown: string;
    createdAt: Date;
    createdBy: string;
}
export function parseDeck(markdown: string): Flashcard[] {
    const blocks = [...markdown.matchAll(/^```(front|back)\s*\n([\s\S]*?)^```\s*$/gm)];
    if (!blocks.length || blocks.length % 2 || blocks.length > 100 || markdown.length > 200000)
        throw new Error('Deck must contain 1–50 front/back pairs');
    let rest = markdown;
    const cards: Flashcard[] = [];
    for (let i = 0; i < blocks.length; i += 2) {
        if (blocks[i][1] !== 'front' || blocks[i + 1][1] !== 'back' || !blocks[i][2].trim() || !blocks[i + 1][2].trim())
            throw new Error('Invalid front/back pair');
        cards.push({ front: blocks[i][2].trim(), back: blocks[i + 1][2].trim() });
        rest = rest.replace(blocks[i][0], '').replace(blocks[i + 1][0], '');
    }
    if (rest.trim())
        throw new Error('Only front/back blocks are allowed');
    return cards;
}
export function replay(queue: number[], rating: 'again' | 'hard' | 'good'): number[] {
    if (!queue.length)
        return [];
    const [current, ...rest] = queue;
    if (rating !== 'good')
        rest.splice(rating === 'again' ? Math.min(1, rest.length) : Math.min(3, rest.length), 0, current);
    return rest;
}
export function grade(questions: Question[], answers: Record<string, number>) {
    return Math.round(100 * questions.filter(q => answers[q.id] === q.correctIndex).length / questions.length);
}
