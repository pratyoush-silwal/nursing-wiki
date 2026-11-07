import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root, RootContent, Definition } from 'mdast';
import { HttpError } from './errors.ts';

export function imagePath(value: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { throw new HttpError(400, 'Invalid image path encoding'); }
  if (decoded.startsWith('./')) decoded = decoded.slice(2);
  if (decoded.length > 240 || !decoded || /[\\:?#%\x00-\x1f\x7f]/.test(decoded) ||
      decoded.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || Buffer.byteLength(part) > 255) ||
      !/\.(png|jpe?g|gif|webp|avif)$/i.test(decoded)) {
    throw new HttpError(400, 'Images must use safe relative PNG, JPEG, GIF, WebP or AVIF paths');
  }
  return decoded;
}

export function markdownImages(markdown: string): string[] {
  const root = unified().use(remarkParse).parse(markdown) as Root;
  const definitions = new Map<string, Definition>();
  const refs = new Set<string>();
  function walk(nodes: readonly RootContent[], collect: boolean) {
    for (const node of nodes) {
      if (node.type === 'definition') definitions.set(node.identifier, node);
      if (collect && node.type === 'html' && /<\s*(img|picture|source)\b/i.test(node.value)) {
        throw new HttpError(400, 'Use Markdown image syntax instead of HTML images');
      }
      if (collect && node.type === 'image') refs.add(imagePath(node.url));
      if (collect && node.type === 'imageReference') {
        const def = definitions.get(node.identifier);
        if (def) refs.add(imagePath(def.url));
      }
      if ('children' in node) walk(node.children as RootContent[], collect);
    }
  }
  walk(root.children, false);
  walk(root.children, true);
  return [...refs];
}

export function validateImage(path: string, data: Buffer): void {
  const ext = path.split('.').at(-1)!.toLowerCase();
  const valid = ext === 'png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : ['jpg', 'jpeg'].includes(ext) ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : ext === 'gif' ? ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))
    : ext === 'webp' ? data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
    : ext === 'avif' && data.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(data.toString('ascii', 8, 32));
  if (!valid) throw new HttpError(400, 'Image bytes do not match the filename format');
}
