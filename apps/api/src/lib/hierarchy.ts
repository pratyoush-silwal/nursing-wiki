import { createHash } from 'node:crypto';
import type { Article, TreeNode } from '@wiki/shared';
import { HttpError } from './errors.ts';

export function folderId(parentId: string | null, name: string): string {
  const hash = createHash('sha256').update(JSON.stringify([parentId, name])).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export function tree(articles: Article[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const a of articles.filter(a => a.state === 'published')) {
    for (const ancestor of a.ancestors) nodes.set(ancestor.id, ancestor);
    nodes.set(a._id, { id: a._id, name: a.name, parentId: a.parentId, kind: 'article', slug: a.slug });
  }
  return [...nodes.values()].sort((a,b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}
export function ancestry(nodes: TreeNode[], parentId: string | null): TreeNode[] {
  const result: TreeNode[] = [];
  const seen = new Set<string>();
  while (parentId) {
    if (seen.has(parentId) || seen.size >= 100) throw new HttpError(409, 'Invalid or excessively deep hierarchy');
    seen.add(parentId);
    const node = nodes.find(n => n.id === parentId);
    if (!node) throw new HttpError(404, 'Parent does not exist');
    result.unshift(node);
    parentId = node.parentId;
  }
  return result;
}
export function descendants(nodes: TreeNode[], id: string): Set<string> {
  const result = new Set([id]);
  const pending = [id];
  while (pending.length) {
    const parent = pending.pop();
    for (const node of nodes) if (node.parentId === parent && !result.has(node.id)) {
      result.add(node.id); pending.push(node.id);
    }
  }
  return result;
}
