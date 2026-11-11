import { z } from 'zod';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  return z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000), HOST: z.string().default('127.0.0.1'),
    MONGO_URL: z.string().min(1), MONGO_DB: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('nursing_wiki'),
    REDIS_URL: z.url().default('redis://redis:6379'),
    ELASTICSEARCH_URL: z.url().default('http://elasticsearch:9200'),
    OBJECT_ROOT: z.string().default('/data/objects'), JWT_SECRET: z.string().optional(),
    ADMIN_USERNAME: z.string().optional(), ADMIN_PASSWORD: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(), GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true','false']).default('false').transform(v=>v==='true'),
    SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), SMTP_FROM: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info')
  }).parse(env);
}
