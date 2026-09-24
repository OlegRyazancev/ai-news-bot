import { describe, expect, it, vi } from 'vitest';
import { MockProvider } from '../src/llm/mock-provider';
import { LlmProcessor } from '../src/llm/processor';
import type { ClaimedArticle, LlmArticleRepository } from '../src/llm/repository';

const now = new Date('2026-09-24T12:00:00.000Z');

function claim(attempt = 1): ClaimedArticle {
  return {
    id: 42n,
    title: 'AI model release',
    source: 'Test',
    language: 'en',
    summary: 'Summary',
    content: 'Content',
    llmAttemptCount: attempt,
    claimToken: 'claim-token',
  };
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function repository(article: ClaimedArticle | null): LlmArticleRepository {
  return {
    expireExhaustedStale: vi.fn().mockResolvedValue(0),
    claimNext: vi.fn().mockResolvedValueOnce(article).mockResolvedValue(null),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
  };
}

function processor(
  store: LlmArticleRepository,
  provider = new MockProvider(),
  batchSize = 5
): LlmProcessor {
  return new LlmProcessor(store, provider, logger(), {
    batchSize,
    maxAttempts: 3,
    retryBaseDelayMs: 1000,
    retryMaxDelayMs: 120_000,
    staleProcessingMs: 60_000,
    now: () => now,
  });
}

describe('LlmProcessor', () => {
  it('completes a claimed article with provider and token metadata', async () => {
    const store = repository(claim());

    const report = await processor(store).run('scheduled');

    expect(report).toMatchObject({ claimedCount: 1, completedCount: 1, failedCount: 0 });
    expect(store.complete).toHaveBeenCalledWith(
      claim(),
      expect.objectContaining({
        enrichment: expect.objectContaining({ topics: ['mock'] }),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      now
    );
  });

  it('persists delayed retry using Retry-After without sleeping in the worker', async () => {
    const store = repository(claim(1));

    const report = await processor(store, new MockProvider('mock-v1', 'rate-limited')).run(
      'scheduled'
    );

    expect(report.failedCount).toBe(1);
    expect(store.fail).toHaveBeenCalledWith(claim(1), {
      code: 'RATE_LIMITED',
      nextRetryAt: new Date('2026-09-24T12:01:00.000Z'),
    });
  });

  it('does not schedule another retry after the maximum attempt', async () => {
    const store = repository(claim(3));

    await processor(store, new MockProvider('mock-v1', 'temporary-error')).run('scheduled');

    expect(store.fail).toHaveBeenCalledWith(claim(3), {
      code: 'TEMPORARY',
      nextRetryAt: null,
    });
  });

  it('stops automatic cycles after a permanent provider error', async () => {
    const store = repository(claim());
    const runner = processor(store, new MockProvider('mock-v1', 'permanent-error'));

    const first = await runner.run('scheduled');
    const second = await runner.run('scheduled');

    expect(first.haltedErrorCode).toBe('AUTHENTICATION');
    expect(second).toMatchObject({ skipped: true, haltedErrorCode: 'AUTHENTICATION' });
    expect(store.claimNext).toHaveBeenCalledTimes(1);
    expect(store.fail).toHaveBeenCalledWith(claim(), {
      code: 'AUTHENTICATION',
      nextRetryAt: null,
    });
  });

  it('skips an overlapping run independently of the database claim', async () => {
    let resolveClaim!: (value: ClaimedArticle | null) => void;
    const pendingClaim = new Promise<ClaimedArticle | null>(resolve => {
      resolveClaim = resolve;
    });
    const store = repository(null);
    store.claimNext = vi.fn(() => pendingClaim);
    const runner = processor(store, new MockProvider(), 1);

    const firstRun = runner.run('startup');
    await vi.waitFor(() => expect(store.claimNext).toHaveBeenCalledTimes(1));
    const overlap = await runner.run('scheduled');
    resolveClaim(null);
    await firstRun;

    expect(overlap).toMatchObject({ skipped: true, claimedCount: 0 });
    expect(store.claimNext).toHaveBeenCalledTimes(1);
  });

  it('requires an explicit flag before claiming a completed target', async () => {
    const store = repository(null);

    await processor(store).processArticle(99n, true);

    expect(store.claimNext).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 99n, allowCompleted: true })
    );
  });
});
