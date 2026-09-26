import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { LlmProcessingStatus, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '../src/llm/mock-provider';
import { LlmProcessor } from '../src/llm/processor';
import { PrismaLlmRequestQuota, type LlmRequestQuota } from '../src/llm/quota';
import { PrismaLlmArticleRepository } from '../src/llm/repository';
import type { LlmProvider } from '../src/llm/types';

describe('PrismaLlmArticleRepository integration', () => {
  const client = new PrismaClient();
  const repository = new PrismaLlmArticleRepository(client);
  const articleIds: bigint[] = [];
  const quotaProviders: string[] = [];

  beforeAll(async () => {
    await client.$connect();
  });

  afterAll(async () => {
    if (articleIds.length > 0) {
      await client.newsArticle.deleteMany({ where: { id: { in: articleIds } } });
    }
    if (quotaProviders.length > 0) {
      await client.llmProviderQuota.deleteMany({ where: { provider: { in: quotaProviders } } });
    }
    await client.$disconnect();
  });

  async function createArticle() {
    const suffix = randomUUID();
    const article = await client.newsArticle.create({
      data: {
        title: `Integration article ${suffix}`,
        url: `https://example.com/llm-integration/${suffix}`,
        source: 'Integration Test',
        publishedAt: new Date('2026-09-24T10:00:00.000Z'),
        language: 'en',
        topics: ['test'],
      },
    });
    articleIds.push(article.id);
    return article;
  }

  const options = (now: Date) => ({
    now,
    staleBefore: new Date(now.getTime() - 60_000),
    maxAttempts: 3,
  });

  it('atomically claims an article only once across overlapping workers', async () => {
    const article = await createArticle();
    const now = new Date('2026-09-24T12:00:00.000Z');

    const [first, second] = await Promise.all([
      repository.claimNext({ ...options(now), articleId: article.id }),
      repository.claimNext({ ...options(now), articleId: article.id }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((first ?? second)?.id).toBe(article.id);
  });

  it('recovers a stale claim and rejects completion from the old claim token', async () => {
    const article = await createArticle();
    const firstNow = new Date('2026-09-24T12:00:00.000Z');
    const oldClaim = await repository.claimNext({ ...options(firstNow), articleId: article.id });
    expect(oldClaim).not.toBeNull();
    const oldAttempt = await repository.startAttempt(oldClaim!, 'mock', 'mock-v1', firstNow);
    expect(oldAttempt?.llmAttemptCount).toBe(1);

    const recoveryNow = new Date('2026-09-24T12:02:00.000Z');
    const recovered = await repository.claimNext({
      ...options(recoveryNow),
      articleId: article.id,
    });
    const recoveredAttempt = await repository.startAttempt(recovered!, 'mock', 'mock-v1', recoveryNow);

    expect(recovered?.claimToken).not.toBe(oldClaim?.claimToken);
    expect(recoveredAttempt?.llmAttemptCount).toBe(2);

    const oldCompletion = await repository.complete(
      oldAttempt!,
      {
        enrichment: { summary: 'Old', importance: 0.1, topics: ['old'] },
        usage: {},
      },
      recoveryNow
    );
    const currentCompletion = await repository.complete(
      recoveredAttempt!,
      {
        enrichment: { summary: 'Current', importance: 0.9, topics: ['current'] },
        usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
      },
      recoveryNow
    );

    expect(oldCompletion).toBe(false);
    expect(currentCompletion).toBe(true);
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.COMPLETED,
      llmSummary: 'Current',
      llmTopics: ['current'],
      llmTotalTokens: 14,
    });
  });

  it('keeps original RSS fields and relevance unchanged on completion', async () => {
    const article = await client.newsArticle.create({
      data: {
        title: 'Original fields',
        summary: 'RSS summary',
        content: 'RSS content',
        url: `https://example.com/llm-integration/${randomUUID()}`,
        source: 'Integration Test',
        publishedAt: new Date('2026-09-24T10:00:00.000Z'),
        language: 'en',
        relevance: 0.25,
        topics: ['rss-topic'],
      },
    });
    articleIds.push(article.id);
    const claim = await repository.claimNext({
      ...options(new Date('2026-09-24T12:00:00.000Z')),
      articleId: article.id,
    });
    const currentAttempt = await repository.startAttempt(
      claim!,
      'mock',
      'mock-v1',
      new Date('2026-09-24T12:00:00.000Z')
    );

    await repository.complete(
      currentAttempt!,
      {
        enrichment: { summary: 'LLM summary', importance: 0.8, topics: ['llm-topic'] },
        usage: {},
      },
      new Date('2026-09-24T12:00:01.000Z')
    );

    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      summary: 'RSS summary',
      content: 'RSS content',
      topics: ['rss-topic'],
      relevance: 0.25,
      llmSummary: 'LLM summary',
      llmImportance: 0.8,
      llmTopics: ['llm-topic'],
    });
  });

  it('runs the processor against PostgreSQL and stores explicit mock metadata', async () => {
    const article = await createArticle();
    const fixedNow = new Date('2026-09-24T13:00:00.000Z');
    const processor = new LlmProcessor(
      repository,
      new MockProvider(),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => fixedNow,
      }
    );

    await expect(processor.processArticle(article.id)).resolves.toMatchObject({
      claimedCount: 1,
      completedCount: 1,
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.COMPLETED,
      llmProvider: 'mock',
      llmModel: 'mock-v1',
      llmLastAttemptProvider: 'mock',
      llmLastAttemptModel: 'mock-v1',
      llmTopics: ['mock'],
      llmInputTokens: 10,
      llmOutputTokens: 5,
      llmTotalTokens: 15,
    });

    await expect(processor.processArticle(article.id)).resolves.toMatchObject({
      claimedCount: 0,
    });
    await expect(
      processor.processArticle(article.id, { reprocessCompleted: true })
    ).resolves.toMatchObject({
      claimedCount: 1,
      completedCount: 1,
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.COMPLETED,
      llmAttemptCount: 1,
      llmProvider: 'mock',
    });
  });

  it('persists a delayed retry after a mocked 429 without a tight loop', async () => {
    const article = await createArticle();
    const fixedNow = new Date('2026-09-24T14:00:00.000Z');
    const processor = new LlmProcessor(
      repository,
      new MockProvider('mock-v1', 'rate-limited'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 120_000,
        staleProcessingMs: 60_000,
        now: () => fixedNow,
      }
    );

    await expect(processor.processArticle(article.id)).resolves.toMatchObject({
      claimedCount: 1,
      failedCount: 1,
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmLastError: 'RATE_LIMITED',
      llmNextRetryAt: new Date('2026-09-24T14:01:00.000Z'),
      llmAttemptCount: 1,
    });

    await expect(processor.processArticle(article.id)).resolves.toMatchObject({
      claimedCount: 0,
    });
  });

  it.each([
    { behavior: 'invalid-response', errorCode: 'INVALID_RESPONSE' },
    { behavior: 'timeout', errorCode: 'TIMEOUT' },
    { behavior: 'temporary-error', errorCode: 'TEMPORARY' },
  ] as const)(
    'persists retry metadata for a mocked $errorCode provider failure',
    async ({ behavior, errorCode }) => {
      const article = await createArticle();
      const fixedNow = new Date('2026-09-24T14:30:00.000Z');
      const processor = new LlmProcessor(
        repository,
        new MockProvider(`mock-${behavior}`, behavior),
        { info: () => undefined, warn: () => undefined, error: () => undefined },
        {
          batchSize: 1,
          maxAttempts: 3,
          retryBaseDelayMs: 1000,
          retryMaxDelayMs: 60_000,
          staleProcessingMs: 60_000,
          now: () => fixedNow,
        }
      );

      await expect(processor.processArticle(article.id)).resolves.toMatchObject({
        claimedCount: 1,
        failedCount: 1,
      });
      await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
        llmStatus: LlmProcessingStatus.FAILED,
        llmLastError: errorCode,
        llmNextRetryAt: new Date('2026-09-24T14:30:01.000Z'),
        llmAttemptCount: 1,
        llmLastAttemptProvider: 'mock',
        llmLastAttemptModel: `mock-${behavior}`,
        llmLastAttemptAt: fixedNow,
      });
    }
  );

  it('halts the in-process worker after a permanent authentication error', async () => {
    const article = await createArticle();
    const fixedNow = new Date('2026-09-24T15:00:00.000Z');
    const processor = new LlmProcessor(
      repository,
      new MockProvider('mock-v1', 'permanent-error'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => fixedNow,
      }
    );

    await expect(processor.processArticle(article.id)).resolves.toMatchObject({
      haltedErrorCode: 'AUTHENTICATION',
      failedCount: 1,
    });
    await expect(processor.run('scheduled')).resolves.toMatchObject({
      skipped: true,
      haltedErrorCode: 'AUTHENTICATION',
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmLastError: 'AUTHENTICATION',
      llmNextRetryAt: null,
      llmAttemptCount: 1,
    });
  });

  it('keeps last successful provider metadata when reprocessing fails with another model', async () => {
    const article = await createArticle();
    const firstNow = new Date('2026-09-24T16:00:00.000Z');
    const successProcessor = new LlmProcessor(
      repository,
      new MockProvider('mock-success'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => firstNow,
      }
    );
    await successProcessor.processArticle(article.id);

    const failingProvider: LlmProvider = {
      id: 'gemini',
      model: 'gemini-new',
      enrich: () => Promise.reject(new Error('provider failure')),
    };
    const failedNow = new Date('2026-09-24T16:05:00.000Z');
    const failingProcessor = new LlmProcessor(
      repository,
      failingProvider,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => failedNow,
      }
    );

    await failingProcessor.processArticle(article.id, { reprocessCompleted: true });

    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmSummary: expect.stringContaining('Mock summary'),
      llmProvider: 'mock',
      llmModel: 'mock-success',
      llmProcessedAt: firstNow,
      llmLastAttemptProvider: 'gemini',
      llmLastAttemptModel: 'gemini-new',
      llmLastAttemptAt: failedNow,
    });
  });

  it('explicitly retries a permanent FAILED article without enabling automatic retries', async () => {
    const article = await createArticle();
    const failedAt = new Date('2026-09-24T17:00:00.000Z');
    const failingProcessor = new LlmProcessor(
      repository,
      new MockProvider('mock-auth', 'permanent-error'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => failedAt,
      }
    );
    await failingProcessor.processArticle(article.id);
    await expect(failingProcessor.run('scheduled')).resolves.toMatchObject({ skipped: true });

    const retryProcessor = new LlmProcessor(
      repository,
      new MockProvider('mock-fixed'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => new Date('2026-09-24T17:05:00.000Z'),
      }
    );

    await retryProcessor.run('scheduled');
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmLastError: 'AUTHENTICATION',
      llmNextRetryAt: null,
    });

    await expect(
      retryProcessor.processArticle(article.id, { retryFailed: true })
    ).resolves.toMatchObject({ completedCount: 1 });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.COMPLETED,
      llmProvider: 'mock',
      llmModel: 'mock-fixed',
      llmAttemptCount: 1,
    });
  });

  it('recovers a permanent configuration failure only through an explicit retry', async () => {
    const article = await createArticle();
    const failedAt = new Date('2026-09-24T17:30:00.000Z');
    const failingProcessor = new LlmProcessor(
      repository,
      new MockProvider('mock-bad-config', 'configuration-error'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => failedAt,
      }
    );

    await expect(failingProcessor.processArticle(article.id)).resolves.toMatchObject({
      failedCount: 1,
      haltedErrorCode: 'CONFIGURATION',
    });
    await expect(failingProcessor.run('scheduled')).resolves.toMatchObject({
      skipped: true,
      haltedErrorCode: 'CONFIGURATION',
    });

    const recoveredAt = new Date('2026-09-24T17:35:00.000Z');
    const recoveredProcessor = new LlmProcessor(
      repository,
      new MockProvider('mock-fixed-config'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => recoveredAt,
      }
    );

    await expect(recoveredProcessor.processArticle(article.id)).resolves.toMatchObject({
      claimedCount: 0,
    });
    await expect(
      recoveredProcessor.processArticle(article.id, { retryFailed: true })
    ).resolves.toMatchObject({ completedCount: 1 });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.COMPLETED,
      llmProvider: 'mock',
      llmModel: 'mock-fixed-config',
      llmLastError: null,
      llmAttemptCount: 1,
    });
  });

  it('targeted processing leaves every non-target article unchanged', async () => {
    const target = await createArticle();
    const untouched = await createArticle();
    const untouchedBefore = await client.newsArticle.findUniqueOrThrow({
      where: { id: untouched.id },
    });
    const processor = new LlmProcessor(
      repository,
      new MockProvider('mock-targeted'),
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 5,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        now: () => new Date('2026-09-24T17:45:00.000Z'),
      }
    );

    await expect(processor.processArticle(target.id)).resolves.toMatchObject({
      claimedCount: 1,
      completedCount: 1,
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: target.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.COMPLETED,
      llmModel: 'mock-targeted',
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: untouched.id } })).resolves.toEqual(
      untouchedBefore
    );
  });

  it('atomically enforces the daily budget and resets it on the next UTC day', async () => {
    const provider = `quota-${randomUUID()}`;
    quotaProviders.push(provider);
    const first = new PrismaLlmRequestQuota(client, provider, 'model-a', 1);
    const restarted = new PrismaLlmRequestQuota(client, provider, 'model-a', 1);
    const dayOne = new Date('2026-09-24T23:59:00.000Z');

    const reservations = await Promise.all([first.reserve(dayOne), restarted.reserve(dayOne)]);
    expect(reservations.filter(result => result.reserved)).toHaveLength(1);
    expect(reservations.find(result => !result.reserved)).toMatchObject({
      reserved: false,
      reason: 'DAILY_LIMIT',
      retryAt: new Date('2026-09-25T00:00:00.000Z'),
    });

    await expect(restarted.reserve(new Date('2026-09-25T00:00:00.000Z'))).resolves.toMatchObject({
      reserved: true,
      reservedRequests: 1,
    });
  });

  it('persists a 429 pause across processor restart and restores after Retry-After', async () => {
    const providerId = `gemini-${randomUUID()}`;
    quotaProviders.push(providerId);
    const article = await createArticle();
    const limitedAt = new Date('2026-09-24T18:00:00.000Z');
    const quota = new PrismaLlmRequestQuota(client, providerId, 'gemini-test', 10);
    const provider: LlmProvider = {
      id: providerId,
      model: 'gemini-test',
      enrich: () =>
        Promise.reject({ status: 429, headers: { 'retry-after': '300' }, message: 'limited' }),
    };
    const limitedProcessor = new LlmProcessor(
      repository,
      provider,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 2,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        requestQuota: quota,
        now: () => limitedAt,
      }
    );

    await expect(limitedProcessor.processArticle(article.id)).resolves.toMatchObject({
      pauseReason: 'RATE_LIMITED',
      pausedUntil: new Date('2026-09-24T18:05:00.000Z'),
    });

    const restartedQuota = new PrismaLlmRequestQuota(client, providerId, 'gemini-test', 10);
    await expect(restartedQuota.reserve(new Date('2026-09-24T18:04:59.000Z'))).resolves.toMatchObject({
      reserved: false,
      reason: 'PROVIDER_PAUSE',
    });
    await expect(restartedQuota.reserve(new Date('2026-09-24T18:05:00.000Z'))).resolves.toMatchObject({
      reserved: true,
      reservedRequests: 2,
    });
  });

  it('blocks targeted FAILED retry at the daily limit without changing the article or calling the provider', async () => {
    const providerId = `targeted-daily-limit-${randomUUID()}`;
    quotaProviders.push(providerId);
    const article = await createArticle();
    const attemptedAt = new Date('2026-09-26T14:25:00.517Z');
    const retryAt = new Date('2026-09-26T14:26:00.517Z');
    await client.newsArticle.update({
      where: { id: article.id },
      data: {
        llmStatus: LlmProcessingStatus.FAILED,
        llmAttemptCount: 1,
        llmNextRetryAt: retryAt,
        llmLastError: 'TIMEOUT',
        llmLastAttemptProvider: providerId,
        llmLastAttemptModel: 'gemini-3.5-flash-lite',
        llmLastAttemptAt: attemptedAt,
      },
    });
    const before = await client.newsArticle.findUniqueOrThrow({ where: { id: article.id } });
    const now = new Date('2026-09-26T14:30:00.000Z');
    const quota = new PrismaLlmRequestQuota(client, providerId, 'gemini-3.5-flash-lite', 1);
    await expect(quota.reserve(now)).resolves.toMatchObject({ reserved: true, reservedRequests: 1 });
    let providerCalls = 0;
    const mockProvider = new MockProvider('gemini-3.5-flash-lite');
    const provider: LlmProvider = {
      id: providerId,
      model: mockProvider.model,
      enrich: input => {
        providerCalls += 1;
        return mockProvider.enrich(input);
      },
    };
    const processor = new LlmProcessor(
      repository,
      provider,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        requestQuota: quota,
        now: () => now,
      }
    );

    await expect(
      processor.processArticle(article.id, { retryFailed: true })
    ).resolves.toMatchObject({
      claimedCount: 0,
      skipped: true,
      pauseReason: 'DAILY_LIMIT',
      pausedUntil: new Date('2026-09-27T00:00:00.000Z'),
    });
    expect(providerCalls).toBe(0);
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toEqual(
      before
    );
  });

  it('blocks targeted processing during a persisted provider pause without an attempt or provider call', async () => {
    const providerId = `targeted-provider-pause-${randomUUID()}`;
    quotaProviders.push(providerId);
    const article = await createArticle();
    const now = new Date('2026-09-26T15:00:00.000Z');
    const pausedUntil = new Date('2026-09-26T15:30:00.000Z');
    const quota = new PrismaLlmRequestQuota(client, providerId, 'gemini-3.5-flash-lite', 5);
    await quota.pauseUntil(pausedUntil, now);
    const before = await client.newsArticle.findUniqueOrThrow({ where: { id: article.id } });
    let providerCalls = 0;
    const mockProvider = new MockProvider('gemini-3.5-flash-lite');
    const provider: LlmProvider = {
      id: providerId,
      model: mockProvider.model,
      enrich: input => {
        providerCalls += 1;
        return mockProvider.enrich(input);
      },
    };
    const processor = new LlmProcessor(
      repository,
      provider,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        requestQuota: quota,
        now: () => now,
      }
    );

    await expect(processor.processArticle(article.id)).resolves.toMatchObject({
      claimedCount: 0,
      skipped: true,
      pauseReason: 'PROVIDER_PAUSE',
      pausedUntil,
    });
    expect(providerCalls).toBe(0);
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toEqual(
      before
    );
  });

  it('preserves permanent FAILED retry policy when quota is exhausted after availability check', async () => {
    const providerId = `quota-race-${randomUUID()}`;
    quotaProviders.push(providerId);
    const article = await createArticle();
    const previousAttemptAt = new Date('2026-09-24T18:30:00.000Z');
    await client.newsArticle.update({
      where: { id: article.id },
      data: {
        llmStatus: LlmProcessingStatus.FAILED,
        llmAttemptCount: 2,
        llmNextRetryAt: null,
        llmLastError: 'AUTHENTICATION',
        llmLastAttemptProvider: 'gemini',
        llmLastAttemptModel: 'gemini-old',
        llmLastAttemptAt: previousAttemptAt,
      },
    });

    const now = new Date('2026-09-24T19:00:00.000Z');
    const persistedQuota = new PrismaLlmRequestQuota(client, providerId, 'gemini-test', 1);
    const racingQuota: LlmRequestQuota = {
      check: currentTime => persistedQuota.check(currentTime),
      reserve: async currentTime => {
        await persistedQuota.reserve(currentTime);
        return persistedQuota.reserve(currentTime);
      },
      pauseUntil: (until, currentTime) => persistedQuota.pauseUntil(until, currentTime),
    };
    let providerCalls = 0;
    const provider: LlmProvider = {
      id: providerId,
      model: 'gemini-test',
      enrich: () => {
        providerCalls += 1;
        return Promise.resolve({
          enrichment: { summary: 'Unexpected', importance: 0.5, topics: ['unexpected'] },
          usage: {},
        });
      },
    };
    const processor = new LlmProcessor(
      repository,
      provider,
      { info: () => undefined, warn: () => undefined, error: () => undefined },
      {
        batchSize: 1,
        maxAttempts: 3,
        retryBaseDelayMs: 1000,
        retryMaxDelayMs: 60_000,
        staleProcessingMs: 60_000,
        requestQuota: racingQuota,
        now: () => now,
      }
    );

    await expect(
      processor.processArticle(article.id, { retryFailed: true })
    ).resolves.toMatchObject({
      claimedCount: 1,
      completedCount: 0,
      pauseReason: 'DAILY_LIMIT',
    });
    expect(providerCalls).toBe(0);
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmAttemptCount: 2,
      llmNextRetryAt: null,
      llmLastError: 'AUTHENTICATION',
      llmLastAttemptProvider: 'gemini',
      llmLastAttemptModel: 'gemini-old',
      llmLastAttemptAt: previousAttemptAt,
      llmClaimToken: null,
    });
  });

  it('restores the later of the previous retry and the current provider pause', async () => {
    const first = await createArticle();
    const second = await createArticle();
    const dueRetry = new Date('2026-09-24T20:00:00.000Z');
    const laterPreviousRetry = new Date('2026-09-24T20:10:00.000Z');
    await client.newsArticle.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: {
        llmStatus: LlmProcessingStatus.FAILED,
        llmAttemptCount: 1,
        llmLastError: 'TEMPORARY',
      },
    });
    await client.newsArticle.update({
      where: { id: first.id },
      data: { llmNextRetryAt: dueRetry },
    });
    await client.newsArticle.update({
      where: { id: second.id },
      data: { llmNextRetryAt: laterPreviousRetry },
    });

    const claimTime = new Date('2026-09-24T20:01:00.000Z');
    const providerPause = new Date('2026-09-24T20:05:00.000Z');
    const firstClaim = await repository.claimNext({
      ...options(claimTime),
      articleId: first.id,
    });
    const secondClaim = await repository.claimNext({
      ...options(claimTime),
      articleId: second.id,
      allowFailed: true,
    });

    expect(
      await repository.release({ ...firstClaim!, claimToken: 'lost-claim-token' }, providerPause)
    ).toBe(false);
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.PROCESSING,
      llmClaimToken: firstClaim!.claimToken,
    });
    expect(await repository.release(firstClaim!, providerPause)).toBe(true);
    expect(await repository.release(secondClaim!, providerPause)).toBe(true);
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmNextRetryAt: providerPause,
      llmAttemptCount: 1,
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmNextRetryAt: laterPreviousRetry,
      llmAttemptCount: 1,
    });
  });
});
