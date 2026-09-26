import { LlmProcessingStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { LlmProviderError } from '../src/llm/errors';
import { MockProvider } from '../src/llm/mock-provider';
import { LlmProcessor } from '../src/llm/processor';
import type { LlmRequestQuota } from '../src/llm/quota';
import type { AttemptedArticle, ClaimedArticle, LlmArticleRepository } from '../src/llm/repository';
import type { LlmProvider } from '../src/llm/types';

const now = new Date('2026-09-24T12:00:00.000Z');

function claim(attempt = 0, id = 42n): ClaimedArticle {
  return {
    id,
    title: 'AI model release',
    source: 'Test',
    language: 'en',
    summary: 'Summary',
    content: 'Content',
    llmAttemptCount: attempt,
    claimToken: `claim-${id}`,
    previousStatus: LlmProcessingStatus.PENDING,
    previousAttemptCount: attempt,
    previousNextRetryAt: null,
    previousLastError: null,
  };
}

function attempted(article: ClaimedArticle): AttemptedArticle {
  return {
    ...article,
    llmAttemptCount: article.llmAttemptCount + 1,
    attemptProvider: 'mock',
    attemptModel: 'mock-v1',
  };
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function repository(article: ClaimedArticle | null): LlmArticleRepository {
  return {
    expireExhaustedStale: vi.fn().mockResolvedValue(0),
    claimNext: vi.fn().mockResolvedValueOnce(article).mockResolvedValue(null),
    startAttempt: vi.fn().mockImplementation(async value => attempted(value)),
    release: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
  };
}

function processor(
  store: LlmArticleRepository,
  provider: LlmProvider = new MockProvider(),
  options: { batchSize?: number; requestQuota?: LlmRequestQuota } = {},
  testLogger = logger()
): LlmProcessor {
  return new LlmProcessor(store, provider, testLogger, {
    batchSize: options.batchSize ?? 5,
    maxAttempts: 3,
    retryBaseDelayMs: 1000,
    retryMaxDelayMs: 120_000,
    staleProcessingMs: 60_000,
    requestQuota: options.requestQuota,
    now: () => now,
  });
}

describe('LlmProcessor', () => {
  it('completes a claimed article with provider and token metadata', async () => {
    const article = claim();
    const store = repository(article);

    const report = await processor(store).run('scheduled');

    expect(report).toMatchObject({ claimedCount: 1, completedCount: 1, failedCount: 0 });
    expect(store.complete).toHaveBeenCalledWith(
      attempted(article),
      expect.objectContaining({
        enrichment: expect.objectContaining({ topics: ['mock'] }),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      now
    );
  });

  it('stops the batch on 429 and does not cap Retry-After by the local retry maximum', async () => {
    const first = claim(0, 42n);
    const second = claim(0, 43n);
    const store = repository(null);
    store.claimNext = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({ available: true }),
      reserve: vi.fn().mockResolvedValue({ reserved: true, reservedRequests: 1 }),
      pauseUntil: vi.fn().mockResolvedValue(undefined),
    };
    const provider: LlmProvider = {
      id: 'gemini',
      model: 'gemini-test',
      enrich: vi.fn().mockRejectedValue(new LlmProviderError('RATE_LIMITED', true, 429, 300_000)),
    };

    const runner = processor(store, provider, { requestQuota: quota });
    const report = await runner.run('scheduled');
    const pausedRun = await runner.run('scheduled');

    expect(report).toMatchObject({
      claimedCount: 1,
      failedCount: 1,
      pauseReason: 'RATE_LIMITED',
      pausedUntil: new Date('2026-09-24T12:05:00.000Z'),
    });
    expect(store.claimNext).toHaveBeenCalledTimes(1);
    expect(pausedRun).toMatchObject({ skipped: true, pauseReason: 'RATE_LIMITED' });
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42n, llmAttemptCount: 1 }),
      { code: 'RATE_LIMITED', nextRetryAt: new Date('2026-09-24T12:05:00.000Z') }
    );
    expect(quota.pauseUntil).toHaveBeenCalledWith(new Date('2026-09-24T12:05:00.000Z'), now);
  });

  it('keeps the processor globally paused before claiming when the daily budget is exhausted', async () => {
    const article = claim();
    const store = repository(article);
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({
        available: false,
        reason: 'DAILY_LIMIT',
        retryAt: new Date('2026-09-25T00:00:00.000Z'),
      }),
      reserve: vi.fn(),
      pauseUntil: vi.fn(),
    };
    const provider = new MockProvider();
    const enrich = vi.spyOn(provider, 'enrich');

    const report = await processor(store, provider, { requestQuota: quota }).run('scheduled');

    expect(report).toMatchObject({
      claimedCount: 0,
      completedCount: 0,
      pauseReason: 'DAILY_LIMIT',
      skipped: true,
    });
    expect(store.claimNext).not.toHaveBeenCalled();
    expect(store.release).not.toHaveBeenCalled();
    expect(store.startAttempt).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });

  it('does not schedule another retry after the maximum attempt', async () => {
    const article = claim(2);
    const store = repository(article);

    await processor(store, new MockProvider('mock-v1', 'temporary-error')).run('scheduled');

    expect(store.fail).toHaveBeenCalledWith(expect.objectContaining({ llmAttemptCount: 3 }), {
      code: 'TEMPORARY',
      nextRetryAt: null,
    });
  });

  it('stops automatic cycles after a permanent provider error but permits explicit failed retry', async () => {
    const article = claim();
    const store = repository(article);
    const runner = processor(store, new MockProvider('mock-v1', 'permanent-error'));

    const first = await runner.run('scheduled');
    const second = await runner.run('scheduled');

    expect(first.haltedErrorCode).toBe('AUTHENTICATION');
    expect(second).toMatchObject({ skipped: true, haltedErrorCode: 'AUTHENTICATION' });
    expect(store.claimNext).toHaveBeenCalledTimes(1);

    const retryStore = repository(article);
    await processor(retryStore).processArticle(42n, { retryFailed: true });
    expect(retryStore.claimNext).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 42n, allowFailed: true })
    );
  });

  it('skips an overlapping run independently of the database claim', async () => {
    let resolveClaim!: (value: ClaimedArticle | null) => void;
    const pendingClaim = new Promise<ClaimedArticle | null>(resolve => {
      resolveClaim = resolve;
    });
    const store = repository(null);
    store.claimNext = vi.fn(() => pendingClaim);
    const runner = processor(store, new MockProvider(), { batchSize: 1 });

    const firstRun = runner.run('startup');
    await vi.waitFor(() => expect(store.claimNext).toHaveBeenCalledTimes(1));
    const overlap = await runner.run('scheduled');
    resolveClaim(null);
    await firstRun;

    expect(overlap).toMatchObject({ skipped: true, claimedCount: 0 });
    expect(store.claimNext).toHaveBeenCalledTimes(1);
  });

  it('isolates PostgreSQL failures without rejecting the background run', async () => {
    const store = repository(null);
    store.expireExhaustedStale = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const testLogger = logger();

    await expect(processor(store, new MockProvider(), {}, testLogger).run('scheduled')).resolves.toMatchObject({
      infrastructureError: true,
      completedCount: 0,
    });
    expect(testLogger.error).toHaveBeenCalledWith(
      'LLM processing infrastructure operation failed',
      expect.objectContaining({ operation: 'expire-stale', errorName: 'Error' })
    );
  });

  it('does not misclassify a PostgreSQL completion error as a provider failure', async () => {
    const store = repository(claim());
    store.complete = vi.fn().mockRejectedValue(new Error('write failed'));

    const report = await processor(store).run('scheduled');

    expect(report.infrastructureError).toBe(true);
    expect(store.fail).not.toHaveBeenCalled();
  });
});
