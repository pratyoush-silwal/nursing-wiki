import type { Article, Notification } from '@wiki/shared';

export interface Admin { _id: string; username: string; passwordHash: string; tokenVersion: number; updatedAt: string }
export interface Repository {
  all(): Promise<Article[]>;
  get(id: string): Promise<Article | null>;
  bySlug(slug: string): Promise<Article | null>;
  put(article: Article): Promise<void>;
  remove(ids: string[]): Promise<void>;
  candidates(q: string): Promise<Article[]>;
  admin(): Promise<Admin | null>;
  saveAdmin(admin: Admin): Promise<void>;
  seedAdmin(admin: Admin): Promise<void>;
  notify(notification: Notification): Promise<void>;
  notifications(): Promise<Notification[]>;
  markRead(id: string): Promise<boolean>;
  ping(): Promise<void>;
}
