import { readConfig } from '../apps/api/src/config/env.ts';
import { mongoClient, MongoRepository } from '../apps/api/src/models/mongo.ts';
import { Storage } from '../apps/api/src/services/storage.ts';
import { Elasticsearch } from '../apps/api/src/services/search.ts';
import { Articles } from '../apps/api/src/services/articles.ts';
const config = readConfig();
const client = mongoClient(config.MONGO_URL);
try {
  const repo = new MongoRepository(client.db(config.MONGO_DB)); await repo.initialize();
  const storage = new Storage(config.OBJECT_ROOT); await storage.init();
  const index = new Elasticsearch(config.ELASTICSEARCH_URL); await index.initialize();
  await new Articles(repo,storage,index).rebuildIndex();
  console.log('Rebuilt derived article metadata and search documents from object storage.');
} finally { await client.close(); }
