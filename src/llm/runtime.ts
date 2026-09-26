import type { PrismaClient } from '@prisma/client';
import type { Env } from '../utils/config';
import { createLlmProvider } from './factory';
import { LlmProcessor, type LlmProcessingLogger } from './processor';
import { NoopLlmRequestQuota, PrismaLlmRequestQuota } from './quota';
import { PrismaLlmArticleRepository } from './repository';

export function createLlmProcessor(
  config: Env,
  client: PrismaClient,
  logger: LlmProcessingLogger
): LlmProcessor {
  const provider = createLlmProvider(config);
  const requestQuota =
    provider.id === 'mock'
      ? new NoopLlmRequestQuota()
      : new PrismaLlmRequestQuota(
          client,
          provider.id,
          provider.model,
          config.LLM_DAILY_REQUEST_LIMIT
        );

  return new LlmProcessor(
    new PrismaLlmArticleRepository(client),
    provider,
    logger,
    {
      batchSize: config.LLM_PROCESSING_BATCH_SIZE,
      maxAttempts: config.LLM_MAX_ATTEMPTS,
      retryBaseDelayMs: config.LLM_RETRY_BASE_DELAY_MS,
      retryMaxDelayMs: config.LLM_RETRY_MAX_DELAY_MS,
      staleProcessingMs: config.LLM_STALE_PROCESSING_MS,
      requestQuota,
    }
  );
}
