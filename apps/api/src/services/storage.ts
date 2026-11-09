import { mkdir, readFile, writeFile, rename, link, unlink, readdir, rm, access, lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { idSchema, type Article } from '@wiki/shared';
import { HttpError, isMissing } from '../lib/errors.ts';
import { imagePath } from '../lib/markdown.ts';

export interface EditIntent { id:string; changes:Article[]; markdown?:string; removedImages:string[] }
export interface DeleteIntent { id: string; articleIds: string[]; createdAt: string }
export class Storage {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
    if (this.root === '/') throw new Error('Object storage cannot be filesystem root');
  }
  async init() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('Object storage root cannot be a symlink');
    for (const dir of ['articles', '.drafts', '.deletions', '.edits']) await this.ensureDirectory(join(this.root, dir));
  }
  private async ensureDirectory(path: string) {
    let cursor = this.root;
    for (const part of path.slice(this.root.length + 1).split('/').filter(Boolean)) {
      cursor = join(cursor, part);
      try { await mkdir(cursor); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new HttpError(400, 'Symlinks are not valid object keys');
    }
  }
  private async syncDirectory(path: string) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
  private async writeDurable(path: string, bytes: Buffer | string, mode: number) {
    const handle = await open(path, 'wx', mode);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  }
  path(id: string, filename: string): string {
    idSchema.parse(id);
    return join(this.root, 'articles', id, filename === 'content.md' ? filename : imagePath(filename));
  }
  private manifestPath(id: string) { idSchema.parse(id); return join(this.root, 'articles', id, '.manifest.json'); }
  private draftPath(id: string) { idSchema.parse(id); return join(this.root, '.drafts', `${id}.json`); }
  private deletePath(id: string) { idSchema.parse(id); return join(this.root, '.deletions', `${id}.json`); }
  async atomic(path: string, value: unknown) {
    await this.ensureDirectory(dirname(path));
    const temp = `${path}.${randomUUID()}.tmp`;
    try { await this.writeDurable(temp, JSON.stringify(value), 0o600); await rename(temp, path); await this.syncDirectory(dirname(path)); }
    finally { await unlink(temp).catch(e => { if (!isMissing(e)) throw e; }); }
  }
  async save(article: Article) {
    await this.atomic(article.state === 'draft' ? this.draftPath(article._id) : this.manifestPath(article._id), article);
    if (article.state === 'published') await unlink(this.draftPath(article._id)).catch(e => { if (!isMissing(e)) throw e; });
  }
  async immutable(id: string, filename: string, bytes: Buffer) {
    const path = this.path(id, filename);
    await this.ensureDirectory(dirname(path));
    // Reject symlinks anywhere inside the object key, including existing targets.
    let cursor = this.root;
    for (const part of path.slice(this.root.length + 1).split('/')) {
      cursor = join(cursor, part);
      try { if ((await lstat(cursor)).isSymbolicLink()) throw new HttpError(400, 'Symlinks are not valid object keys'); }
      catch (e) { if (!isMissing(e)) throw e; }
    }
    const temp = join(this.root, 'articles', id, `.${randomUUID()}.tmp`);
    try {
      await this.writeDurable(temp, bytes, 0o644);
      try { await link(temp, path); await this.syncDirectory(dirname(path)); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        if (!(await readFile(path)).equals(bytes)) throw new HttpError(409, 'Uploaded content is immutable');
      }
    } finally { await unlink(temp).catch(e => { if (!isMissing(e)) throw e; }); }
  }
  async replace(id: string, filename: string, bytes: Buffer) {
    const path=this.path(id,filename); await this.ensureDirectory(dirname(path));
    try { if((await lstat(path)).isSymbolicLink()) throw new HttpError(400,'Symlinks are not valid object keys'); } catch(e){if(!isMissing(e))throw e;}
    const temp=join(dirname(path),`.${randomUUID()}.tmp`);
    try { await this.writeDurable(temp,bytes,0o644); await rename(temp,path); await this.syncDirectory(dirname(path)); }
    finally { await unlink(temp).catch(e=>{if(!isMissing(e))throw e;}); }
  }
  async removeImage(id:string,filename:string){const path=this.path(id,imagePath(filename));await this.ensureDirectory(dirname(path));await unlink(path).catch(e=>{if(!isMissing(e))throw e;});await this.syncDirectory(dirname(path));}
  read(id: string) { return readFile(this.path(id, 'content.md'), 'utf8'); }
  async exists(id: string, filename = 'content.md') {
    try { const s = await lstat(this.path(id, filename)); return s.isFile() && !s.isSymbolicLink(); }
    catch (e) { if (isMissing(e)) return false; throw e; }
  }
  async loadAll(): Promise<Article[]> {
    const records = new Map<string, Article>();
    for (const file of await readdir(join(this.root, '.drafts'))) {
      if (!file.endsWith('.json')) continue;
      const a = JSON.parse(await readFile(join(this.root, '.drafts', file), 'utf8')) as Article;
      idSchema.parse(a._id); records.set(a._id, a);
    }
    for (const entry of await readdir(join(this.root, 'articles'), { withFileTypes: true })) {
      if (!entry.isDirectory() || !idSchema.safeParse(entry.name).success) continue;
      try {
        const a = JSON.parse(await readFile(this.manifestPath(entry.name), 'utf8')) as Article;
        if (a._id !== entry.name) throw new Error('Storage manifest identity mismatch');
        if (await this.exists(a._id)) records.set(a._id, a);
      } catch (e) { if (!isMissing(e)) throw e; }
    }
    return [...records.values()];
  }
  async editIntent(intent:EditIntent){idSchema.parse(intent.id);await this.atomic(join(this.root,'.edits',`${intent.id}.json`),intent);}
  async edits():Promise<EditIntent[]>{const values:EditIntent[]=[];for(const name of await readdir(join(this.root,'.edits')))if(name.endsWith('.json'))values.push(JSON.parse(await readFile(join(this.root,'.edits',name),'utf8')));return values;}
  async finishEdit(id:string){idSchema.parse(id);await unlink(join(this.root,'.edits',`${id}.json`));await this.syncDirectory(join(this.root,'.edits'));}
  async intent(intent: DeleteIntent) { await this.atomic(this.deletePath(intent.id), intent); }
  async intents(): Promise<DeleteIntent[]> {
    const values: DeleteIntent[] = [];
    for (const name of await readdir(join(this.root, '.deletions'))) if (name.endsWith('.json')) {
      values.push(JSON.parse(await readFile(join(this.root, '.deletions', name), 'utf8')) as DeleteIntent);
    }
    return values;
  }
  async deletedIds() { return new Set((await this.intents()).flatMap(i => i.articleIds)); }
  async remove(id: string) {
    idSchema.parse(id);
    await rm(join(this.root, 'articles', id), { recursive: true, force: true });
    await unlink(this.draftPath(id)).catch(e => { if (!isMissing(e)) throw e; });
    await this.syncDirectory(join(this.root, 'articles'));
    await this.syncDirectory(join(this.root, '.drafts'));
  }
  async finishDelete(id: string) {
    await unlink(this.deletePath(id)).catch(e => { if (!isMissing(e)) throw e; });
    await this.syncDirectory(join(this.root, '.deletions'));
  }
  async writable() {
    await access(this.root, constants.W_OK);
    const probe = join(this.root, `.health-${randomUUID()}`);
    await writeFile(probe, '', { flag: 'wx' }); await unlink(probe);
  }
}
export function contentHash(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
