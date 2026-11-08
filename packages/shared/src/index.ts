import { z } from 'zod';

export const MARKDOWN_LIMIT = 6 * 1024 * 1024;
export const IMAGE_LIMIT = 20 * 1024 * 1024;
export const idSchema = z.uuid();
export const slugSchema = z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const nameSchema = z.string().trim().min(1).max(160).refine(v => !/[\x00-\x1f/\\]/.test(v) && v !== '.' && v !== '..', 'Invalid name');
export const createArticleSchema = z.object({
  name: nameSchema, slug: slugSchema, parentId: idSchema.nullable().default(null),
  folderPath: z.array(nameSchema).max(20).default([]), deferLabels: z.boolean().default(false)
}).strict();
export const loginSchema = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 bytes') }).strict();
export const credentialsSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  username: z.string().trim().min(1).max(80),
  password: z.string().min(12).max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 bytes')
}).strict();
export const searchSchema = z.object({ q: z.string().trim().max(160).default('') });
export const labelsSchema = z.array(z.string().trim().min(1).max(60)).min(6).max(7)
  .transform(labels => labels.map(v => v.toLowerCase()))
  .refine(labels => new Set(labels).size === labels.length, 'Labels must be unique');

export type CreateArticle = z.infer<typeof createArticleSchema>;
export interface TreeNode { id: string; parentId: string | null; name: string; kind: 'folder' | 'article'; slug?: string }
export interface Article {
  _id: string; slug: string; name: string; parentId: string | null; objectKey: string;
  size: number; uploadedAt: string | null; createdAt: string; updatedAt: string;
  labelStatus: 'pending' | 'success' | 'failed'; labels: string[];
  labelsDeferred?: boolean;
  state: 'draft' | 'published'; ancestors: TreeNode[]; contentHash: string | null;
  imagePaths: string[]; indexPending: boolean;
}
export interface ArticleDto {
  id: string; slug: string; name: string; size: number; uploadedAt: string | null;
  labels: string[]; labelStatus: Article['labelStatus']; markdown: string;
  breadcrumb: TreeNode[]; images: Record<string, string>;
}
export interface SearchHit { id: string; slug: string; name: string; labels: string[]; uploadedAt: string | null; match: 'exact' | 'slug' | 'label' }
export interface SearchResult { hits: SearchHit[]; source: 'elasticsearch' | 'mongo'; }
export interface Notification { _id: string; type: 'label-success' | 'label-failed' | 'storage-full' | 'delete-complete'; articleId: string | null; message: string; read: boolean; createdAt: string }
