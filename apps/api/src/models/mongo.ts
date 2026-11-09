import { createHash } from 'node:crypto';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { Article, Notification } from '@wiki/shared';
import type { Admin, Repository } from './repository.ts';

type StoredArticle = Omit<Article, 'uploadedAt' | 'createdAt' | 'updatedAt'> & { uploadedAt: Date | null; createdAt: Date; updatedAt: Date };
type StoredAdmin = Omit<Admin, 'updatedAt'> & { email:string; role:'admin'; premium:false; createdAt:Date; updatedAt: Date };
const userOwnerId = '00000000-0000-4000-8000-000000000001';
type StoredNotification = Omit<Notification, '_id' | 'createdAt'> & { _id: ObjectId; createdAt: Date };
const ownerId = new ObjectId('000000000000000000000001');
function articleDto(a: StoredArticle): Article {
  return { ...a, uploadedAt: a.uploadedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() };
}
function adminDocument(a: Admin): StoredAdmin { return { ...a, _id: userOwnerId, email:a.username.toLowerCase(),role:'admin',premium:false,createdAt:new Date(a.updatedAt), updatedAt: new Date(a.updatedAt) }; }
export class MongoRepository implements Repository {
  constructor(readonly db: Db) {}
  private get articles() { return this.db.collection<StoredArticle>('articles'); }
  async initialize() {
    const legacy = await this.db.collection('admins').findOne({_id:ownerId});
    if(legacy) {
      await this.db.collection<StoredAdmin>('users').updateOne({_id:userOwnerId},{$setOnInsert:adminDocument({_id:'owner',username:legacy.username,passwordHash:legacy.passwordHash,tokenVersion:legacy.tokenVersion,updatedAt:legacy.updatedAt.toISOString()})},{upsert:true});
      await this.db.collection('admins').deleteOne({_id:ownerId});
    }
    const users = this.db.collection('users');
    if (await this.db.listCollections({name:'users'}, {nameOnly:true}).hasNext()) {
      const oldEmailIndex = (await users.listIndexes().toArray()).find(index => index.unique && !index.partialFilterExpression && Object.keys(index.key).join(',') === 'email');
      if (oldEmailIndex) await users.dropIndex(oldEmailIndex.name);
    }
    await users.createIndex({email:1},{unique:true,partialFilterExpression:{role:'client'}});
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
    const a = await this.db.collection<StoredAdmin>('users').findOne({ _id: userOwnerId, role:'admin' });
    return a ? { ...a, _id: 'owner', updatedAt: a.updatedAt.toISOString() } : null;
  }
  async saveAdmin(a: Admin) { await this.db.collection<StoredAdmin>('users').updateOne({ _id: userOwnerId,role:'admin' }, {$set:{username:a.username,email:a.username.toLowerCase(),passwordHash:a.passwordHash,tokenVersion:a.tokenVersion,updatedAt:new Date(a.updatedAt)}}); }
  async seedAdmin(a: Admin) { await this.db.collection<StoredAdmin>('users').updateOne({ _id: userOwnerId,role:'admin' }, { $setOnInsert: adminDocument(a) }, { upsert: true }); }
  async notify(n: Notification) {
    const _id = new ObjectId(createHash('sha256').update(n._id).digest('hex').slice(0,24));
    await this.db.collection<StoredNotification>('notifications').updateOne({ _id }, { $setOnInsert: { ...n, _id, createdAt: new Date(n.createdAt) } }, { upsert: true });
  }
  async notifications(): Promise<Notification[]> {
    return (await this.db.collection<StoredNotification>('notifications').find({ userId: { $exists: false } }).sort({ createdAt: -1 }).limit(200).toArray()).map(n => ({ ...n, _id: n._id.toHexString(), createdAt: n.createdAt.toISOString() }));
  }
  async markRead(id: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) return false;
    return (await this.db.collection<StoredNotification>('notifications').updateOne({ _id: new ObjectId(id), userId: { $exists: false } }, { $set: { read: true } })).matchedCount === 1;
  }
  async ping() { await this.db.command({ ping: 1 }); }
}
export function mongoClient(url: string) {
  return new MongoClient(url, { serverSelectionTimeoutMS: 2500, connectTimeoutMS: 2500, socketTimeoutMS: 5000 });
}
