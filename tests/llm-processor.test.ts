import { LlmProcessingStatus } from '@prisma/client';
import { ApiError } from '@google/genai';
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
    previousLastAttemptProvider: null,
    previousLastAttemptModel: null,
    previousLastAttemptAt: null,
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

  it('releases a claimed article when the daily budget is exhausted between check and reserve', async () => {
    const retryAt = new Date('2026-09-25T00:00:00.000Z');
    const article: ClaimedArticle = {
      ...claim(2),
      previousStatus: LlmProcessingStatus.FAILED,
      previousAttemptCount: 2,
      previousLastError: 'AUTHENTICATION',
    };
    const store = repository(article);
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({ available: true }),
      reserve: vi.fn().mockResolvedValue({
        reserved: false,
        reason: 'DAILY_LIMIT',
        retryAt,
      }),
      pauseUntil: vi.fn(),
    };
    const provider = new MockProvider();
    const enrich = vi.spyOn(provider, 'enrich');

    const report = await processor(store, provider, { requestQuota: quota }).run('scheduled');

    expect(report).toMatchObject({ claimedCount: 1, pauseReason: 'DAILY_LIMIT' });
    expect(quota.check).toHaveBeenCalledOnce();
    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(store.release).toHaveBeenCalledWith(article, retryAt);
    expect(store.startAttempt).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });

  it('best-effort releases the claim when quota reservation throws', async () => {
    const article = claim();
    const store = repository(article);
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({ available: true }),
      reserve: vi.fn().mockRejectedValue(new Error('quota database unavailable')),
      pauseUntil: vi.fn(),
    };
    const provider = new MockProvider();
    const enrich = vi.spyOn(provider, 'enrich');

    const report = await processor(store, provider, { requestQuota: quota }).run('scheduled');

    expect(report.infrastructureError).toBe(true);
    expect(store.release).toHaveBeenCalledWith(article, new Date('2026-09-24T12:00:01.000Z'));
    expect(store.startAttempt).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
    expect(quota.pauseUntil).not.toHaveBeenCalled();
  });

  it('falls back to stale recovery when startAttempt and claim release both fail', async () => {
    const article = claim();
    const store = repository(article);
    store.startAttempt = vi.fn().mockRejectedValue(new Error('attempt write unavailable'));
    store.release = vi.fn().mockRejectedValue(new Error('release unavailable'));
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({ available: true }),
      reserve: vi.fn().mockResolvedValue({ reserved: true, reservedRequests: 1 }),
      pauseUntil: vi.fn(),
    };
    const provider = new MockProvider();
    const enrich = vi.spyOn(provider, 'enrich');
    const testLogger = logger();

    const report = await processor(
      store,
      provider,
      { requestQuota: quota },
      testLogger
    ).run('scheduled');

    expect(report.infrastructureError).toBe(true);
    expect(store.release).toHaveBeenCalledWith(article, new Date('2026-09-24T12:00:01.000Z'));
    expect(enrich).not.toHaveBeenCalled();
    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(quota.pauseUntil).not.toHaveBeenCalled();
    expect(testLogger.error).toHaveBeenCalledWith(
      'LLM processing infrastructure operation failed',
      expect.objectContaining({ operation: 'release-after-attempt-error' })
    );
  });

  it('does not call the provider when the claim is lost before startAttempt completes', async () => {
    const article = claim();
    const store = repository(article);
    store.startAttempt = vi.fn().mockResolvedValue(null);
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({ available: true }),
      reserve: vi.fn().mockResolvedValue({ reserved: true, reservedRequests: 1 }),
      pauseUntil: vi.fn(),
    };
    const provider = new MockProvider();
    const enrich = vi.spyOn(provider, 'enrich');

    const report = await processor(store, provider, { requestQuota: quota }).run('scheduled');

    expect(report).toMatchObject({ lostClaimCount: 1, completedCount: 0 });
    expect(enrich).not.toHaveBeenCalled();
    expect(store.release).not.toHaveBeenCalled();
    expect(quota.reserve).toHaveBeenCalledOnce();
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

  it.each([
    { behavior: 'invalid-response', errorCode: 'INVALID_RESPONSE' },
    { behavior: 'timeout', errorCode: 'TIMEOUT' },
    { behavior: 'temporary-error', errorCode: 'TEMPORARY' },
  ] as const)(
    'continues the batch after a retryable $errorCode provider failure',
    async ({ behavior, errorCode }) => {
      const first = claim(0, 42n);
      const second = claim(0, 43n);
      const store = repository(null);
      store.claimNext = vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second)
        .mockResolvedValue(null);

      const report = await processor(store, new MockProvider('mock-v1', behavior), {
        batchSize: 2,
      }).run('scheduled');

      expect(report).toMatchObject({ claimedCount: 2, failedCount: 2 });
      expect(store.fail).toHaveBeenCalledTimes(2);
      expect(store.fail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: first.id, llmAttemptCount: 1 }),
        { code: errorCode, nextRetryAt: new Date('2026-09-24T12:00:01.000Z') }
      );
      expect(store.fail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: second.id, llmAttemptCount: 1 }),
        { code: errorCode, nextRetryAt: new Date('2026-09-24T12:00:01.000Z') }
      );
    }
  );

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

  it.each([
    {
      httpStatus: 400,
      providerStatus: 'INVALID_ARGUMENT',
      rawMessage:
        'Invalid responseJsonSchema; API_KEY=secret-400; authorization=secret-header; prompt=secret-prompt.',
      diagnosticCode: 'INVALID_JSON_SCHEMA',
    },
    {
      httpStatus: 404,
      providerStatus: 'NOT_FOUND',
      rawMessage:
        'Model is not found for generateContent; API_KEY=secret-404; response=secret-response.',
      diagnosticCode: 'MODEL_NOT_FOUND_OR_UNSUPPORTED',
    },
  ] as const)(
    'logs allowlisted diagnostics without raw HTTP $httpStatus provider data',
    async ({ httpStatus, providerStatus, rawMessage, diagnosticCode }) => {
      const article = claim();
      const store = repository(article);
      const testLogger = logger();
      const provider: LlmProvider = {
        id: 'gemini',
        model: 'gemini-3.5-flash-lite',
        enrich: vi.fn().mockRejectedValue(
          new ApiError({
            status: httpStatus,
            message: JSON.stringify({
              error: { code: httpStatus, status: providerStatus, message: rawMessage },
            }),
          })
        ),
      };

      await processor(store, provider, {}, testLogger).run('scheduled');

      expect(testLogger.warn).toHaveBeenCalledWith(
        'LLM article processing failed',
        expect.objectContaining({
          errorCode: 'CONFIGURATION',
          httpStatus,
          providerStatus,
          diagnosticCode,
        })
      );
      const serializedLogs = JSON.stringify(testLogger.warn.mock.calls);
      expect(serializedLogs).not.toContain(rawMessage);
      expect(serializedLogs).not.toContain('secret-');
      expect(serializedLogs).not.toContain('authorization');
      expect(serializedLogs).not.toContain('prompt');
      expect(serializedLogs).not.toContain('response=');
    }
  );

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
