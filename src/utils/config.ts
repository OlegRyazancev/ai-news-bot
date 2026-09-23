import 'dotenv/config';
import cron from 'node-cron';
import { z } from 'zod';

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid URL')
    .regex(
      /^postgres(?:ql)?:\/\//,
      'DATABASE_URL must start with postgresql:// or postgres://'
    ),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NEWS_COLLECTION_CRON: z
    .string()
    .default('*/30 * * * *')
    .refine(value => cron.validate(value), 'NEWS_COLLECTION_CRON must be a valid cron expression'),
  NEWS_COLLECTION_RUN_ON_STARTUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform(value => value === 'true'),
  NEWS_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  NEWS_MAX_ITEMS_PER_SOURCE: z.coerce.number().int().min(1).max(200).default(50),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const env = getEnv();
