import { createHash } from 'node:crypto';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { Article, Notification } from '@wiki/shared';
import type { Admin, Repository } from './repository.ts';

type StoredArticle = Omit<Article, 'uploadedAt' | 'createdAt' | 'updatedAt'> & { uploadedAt: Date | null; createdAt: Date; updatedAt: Date };
type StoredAdmin = Omit<Admin, '_id' | 'updatedAt'> & { _id: ObjectId; updatedAt: Date };
type StoredNotification = Omit<Notification, '_id' | 'createdAt'> & { _id: ObjectId; createdAt: Date };
const ownerId = new ObjectId('000000000000000000000001');
function articleDto(a: StoredArticle): Article {
  return { ...a, uploadedAt: a.uploadedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() };
}
function adminDocument(a: Admin): StoredAdmin { return { ...a, _id: ownerId, updatedAt: new Date(a.updatedAt) }; }
export class MongoRepository implements Repository {
  constructor(readonly db: Db) {}
  private get articles() { return this.db.collection<StoredArticle>('articles'); }
  async initialize() {
    await Promise.all([
      this.articles.createIndex({ slug: 1 }, { unique: true }),
      this.articles.createIndex({ parentId: 1 }), this.articles.createIndex({ labelStatus: 1 }),
      this.db.collection('notifications').createIndex({ createdAt: -1 })
    ]);
  }
  async all() { return (await this.articles.find({}).toArray()).map(articleDto); }
  async get(id: string) { const a = await this.articles.findOne({ _id: id }); return a ? articleDto(a) : null; }
  async bySlug(slug: string) { const a = await this.articles.findOne({ slug }); return a ? articleDto(a) : null; }
  async put(a: Article) {
    await this.articles.replaceOne({ _id: a._id }, { ...a, uploadedAt: a.uploadedAt ? new Date(a.uploadedAt) : null, createdAt: new Date(a.createdAt), updatedAt: new Date(a.updatedAt) }, { upsert: true });
  }
  async remove(ids: string[]) { if (ids.length) await this.articles.deleteMany({ _id: { $in: ids } }); }
  async candidates(q: string) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (await this.articles.find({ state: 'published', $or: [{ slug: { $regex: escaped, $options: 'i' } }, { labels: { $regex: escaped, $options: 'i' } }] }).toArray()).map(articleDto);
  }
  async admin(): Promise<Admin | null> {
    const a = await this.db.collection<StoredAdmin>('admins').findOne({ _id: ownerId });
    return a ? { ...a, _id: 'owner', updatedAt: a.updatedAt.toISOString() } : null;
  }
  async saveAdmin(a: Admin) { await this.db.collection<StoredAdmin>('admins').replaceOne({ _id: ownerId }, adminDocument(a)); }
  async seedAdmin(a: Admin) { await this.db.collection<StoredAdmin>('admins').updateOne({ _id: ownerId }, { $setOnInsert: adminDocument(a) }, { upsert: true }); }
  async notify(n: Notification) {
    const _id = new ObjectId(createHash('sha256').update(n._id).digest('hex').slice(0,24));
    await this.db.collection<StoredNotification>('notifications').updateOne({ _id }, { $setOnInsert: { ...n, _id, createdAt: new Date(n.createdAt) } }, { upsert: true });
  }
  async notifications(): Promise<Notification[]> {
    return (await this.db.collection<StoredNotification>('notifications').find({}).sort({ createdAt: -1 }).limit(200).toArray()).map(n => ({ ...n, _id: n._id.toHexString(), createdAt: n.createdAt.toISOString() }));
  }
  async markRead(id: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) return false;
    return (await this.db.collection<StoredNotification>('notifications').updateOne({ _id: new ObjectId(id) }, { $set: { read: true } })).matchedCount === 1;
  }
  async ping() { await this.db.command({ ping: 1 }); }
}
export function mongoClient(url: string) {
  return new MongoClient(url, { serverSelectionTimeoutMS: 2500, connectTimeoutMS: 2500, socketTimeoutMS: 5000 });
}
