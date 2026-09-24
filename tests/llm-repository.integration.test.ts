import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { LlmProcessingStatus, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '../src/llm/mock-provider';
import { LlmProcessor } from '../src/llm/processor';
import { PrismaLlmArticleRepository } from '../src/llm/repository';

describe('PrismaLlmArticleRepository integration', () => {
  const client = new PrismaClient();
  const repository = new PrismaLlmArticleRepository(client);
  const articleIds: bigint[] = [];

  beforeAll(async () => {
    await client.$connect();
  });

  afterAll(async () => {
    if (articleIds.length > 0) {
      await client.newsArticle.deleteMany({ where: { id: { in: articleIds } } });
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
    provider: 'mock',
    model: 'mock-v1',
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

    const recoveryNow = new Date('2026-09-24T12:02:00.000Z');
    const recovered = await repository.claimNext({
      ...options(recoveryNow),
      articleId: article.id,
    });

    expect(recovered?.claimToken).not.toBe(oldClaim?.claimToken);
    expect(recovered?.llmAttemptCount).toBe(2);

    const oldCompletion = await repository.complete(
      oldClaim!,
      {
        enrichment: { summary: 'Old', importance: 0.1, topics: ['old'] },
        usage: {},
      },
      recoveryNow
    );
    const currentCompletion = await repository.complete(
      recovered!,
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

    await repository.complete(
      claim!,
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

    await expect(processor.processArticle(article.id, false)).resolves.toMatchObject({
      claimedCount: 1,
      completedCount: 1,
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.COMPLETED,
      llmProvider: 'mock',
      llmModel: 'mock-v1',
      llmTopics: ['mock'],
      llmInputTokens: 10,
      llmOutputTokens: 5,
      llmTotalTokens: 15,
    });

    await expect(processor.processArticle(article.id, false)).resolves.toMatchObject({
      claimedCount: 0,
    });
    await expect(processor.processArticle(article.id, true)).resolves.toMatchObject({
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

    await expect(processor.processArticle(article.id, false)).resolves.toMatchObject({
      claimedCount: 1,
      failedCount: 1,
    });
    await expect(client.newsArticle.findUniqueOrThrow({ where: { id: article.id } })).resolves.toMatchObject({
      llmStatus: LlmProcessingStatus.FAILED,
      llmLastError: 'RATE_LIMITED',
      llmNextRetryAt: new Date('2026-09-24T14:01:00.000Z'),
      llmAttemptCount: 1,
    });

    await expect(processor.processArticle(article.id, false)).resolves.toMatchObject({
      claimedCount: 0,
    });
  });

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

    await expect(processor.processArticle(article.id, false)).resolves.toMatchObject({
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
});
