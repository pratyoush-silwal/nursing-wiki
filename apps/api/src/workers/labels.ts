import { labelsSchema } from '@wiki/shared';
import type { Articles } from '../services/articles.ts';

export const LABEL_PROMPT = `You are a medical and nursing taxonomy expert.
Read the following Markdown article and output ONLY a JSON array of 6 to 7 short, precise labels (strings) that best describe the clinical content.
No explanations, no markdown, no extra text.
Article:
`;
export const LABEL_ATTEMPTS = 2;
export const LABEL_RETRY_DELAY = 12 * 60 * 60 * 1000;
export type GenerateLabels = (markdown: string) => Promise<string[]>;

export function gemini(apiKey: string | undefined, model: string): GenerateLabels {
  return async markdown => {
    if (!apiKey) throw new Error('Gemini is not configured');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: LABEL_PROMPT + markdown }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', minItems: 6, maxItems: 7, items: { type: 'STRING' } } } }),
      signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('');
    if (!text) throw new Error('Gemini returned no labels');
    return labelsSchema.parse(JSON.parse(text));
  };
}
export async function processLabels(articles: Articles, articleId: string, generate: GenerateLabels) {
  const a = await articles.repo.get(articleId);
  if (!a || a.state !== 'published' || a.labelStatus !== 'pending' || (await articles.storage.deletedIds()).has(articleId)) return;
  const markdown = await articles.storage.read(articleId);
  const labels = labelsSchema.parse(await generate(markdown));
  await articles.lock.run(async () => {
    await articles.recoverEdits();
    const current = await articles.repo.get(articleId);
    if (!current || current.labelStatus !== 'pending' || (await articles.storage.deletedIds()).has(articleId) || !await articles.storage.exists(articleId)) return;
    const updatedAt = new Date().toISOString();
    await articles.commit({ ...current, labels, labelStatus: 'success', indexPending: true, updatedAt });
    await articles.notification('label-success', articleId, `Labels are ready for “${current.name}”.`, `labels-success-${articleId}-${updatedAt}`);
  });
}
export async function failLabels(articles: Articles, articleId: string) {
  await articles.lock.run(async () => {
    await articles.recoverEdits();
    const a = await articles.repo.get(articleId);
    if (!a || a.labelStatus !== 'pending' || (await articles.storage.deletedIds()).has(articleId)) return;
    const updatedAt = new Date().toISOString();
    await articles.commit({ ...a, labelStatus: 'failed', updatedAt });
    await articles.notification('label-failed', articleId, `Label generation failed after two attempts for “${a.name}”. The article remains readable and searchable by slug.`, `labels-failed-${articleId}-${updatedAt}`);
  });
}
