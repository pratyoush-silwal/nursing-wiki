import { readConfig } from '../apps/api/src/config/env.ts';
import { mongoClient, MongoRepository } from '../apps/api/src/models/mongo.ts';
import { seedAdmin } from '../apps/api/src/services/auth.ts';
const config = readConfig();
if (!config.ADMIN_USERNAME || !config.ADMIN_PASSWORD) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required');
const client = mongoClient(config.MONGO_URL);
try { await seedAdmin(new MongoRepository(client.db(config.MONGO_DB)),config.ADMIN_USERNAME,config.ADMIN_PASSWORD); console.log('Owner exists. Existing credentials were preserved.'); }
finally { await client.close(); }
