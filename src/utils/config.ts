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
  LLM_PROCESSING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true'),
  LLM_PROVIDER: z.enum(['mock', 'gemini']).default('mock'),
  LLM_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_API_KEY: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional()
  ),
  LLM_PROCESSING_CRON: z
    .string()
    .default('*/2 * * * *')
    .refine(value => cron.validate(value), 'LLM_PROCESSING_CRON must be a valid cron expression'),
  LLM_PROCESSING_RUN_ON_STARTUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform(value => value === 'true'),
  LLM_PROCESSING_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  LLM_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(100000).default(20),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  LLM_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  LLM_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  LLM_RETRY_MAX_DELAY_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(21600000),
  LLM_STALE_PROCESSING_MS: z.coerce
    .number()
    .int()
    .min(60000)
    .max(86400000)
    .default(600000),
}).superRefine((value, context) => {
  if (value.LLM_PROCESSING_ENABLED && value.LLM_PROVIDER === 'gemini' && !value.GEMINI_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message: 'GEMINI_API_KEY is required when Gemini processing is enabled',
    });
  }

  if (value.LLM_RETRY_MAX_DELAY_MS < value.LLM_RETRY_BASE_DELAY_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LLM_RETRY_MAX_DELAY_MS'],
      message: 'LLM_RETRY_MAX_DELAY_MS must be greater than or equal to the base delay',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  cachedEnv = parseEnv(process.env);
  return cachedEnv;
}

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }

  return result.data;
}

export const env = getEnv();
