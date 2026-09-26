import { LlmProcessingStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MockProvider } from '../src/llm/mock-provider';
import { LlmProcessor, type LlmProcessingReport } from '../src/llm/processor';
import type { LlmRequestQuota } from '../src/llm/quota';
import type { ClaimedArticle, LlmArticleRepository } from '../src/llm/repository';
import {
  diagnoseTargetedProcessing,
  type TargetedProcessingDiagnostic,
} from '../src/scripts/targeted-processing-diagnostics';

const now = new Date('2026-09-26T14:30:00.000Z');

function report(overrides: Partial<LlmProcessingReport>): LlmProcessingReport {
  return {
    trigger: 'targeted',
    claimedCount: 0,
    completedCount: 0,
    failedCount: 0,
    lostClaimCount: 0,
    skipped: false,
    ...overrides,
  };
}

function failedClaim(): ClaimedArticle {
  return {
    id: 15n,
    title: 'Timed out article',
    source: 'Test',
    language: 'en',
    summary: 'Summary',
    content: 'Content',
    llmAttemptCount: 1,
    claimToken: 'claim-15',
    previousStatus: LlmProcessingStatus.FAILED,
    previousAttemptCount: 1,
    previousNextRetryAt: new Date('2026-09-26T14:26:00.517Z'),
    previousLastError: 'TIMEOUT',
    previousLastAttemptProvider: 'gemini',
    previousLastAttemptModel: 'gemini-3.5-flash-lite',
    previousLastAttemptAt: new Date('2026-09-26T14:25:00.517Z'),
  };
}

function repository(article: ClaimedArticle | null): LlmArticleRepository {
  return {
    expireExhaustedStale: vi.fn().mockResolvedValue(0),
    claimNext: vi.fn().mockResolvedValue(article),
    startAttempt: vi.fn(),
    release: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
}

function processor(
  store: LlmArticleRepository,
  provider: MockProvider,
  requestQuota: LlmRequestQuota
): LlmProcessor {
  return new LlmProcessor(
    store,
    provider,
    { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    {
      batchSize: 1,
      maxAttempts: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 60_000,
      staleProcessingMs: 60_000,
      requestQuota,
      now: () => now,
    }
  );
}

function expectDiagnostic(
  diagnostic: TargetedProcessingDiagnostic | null,
  code: TargetedProcessingDiagnostic['code'],
  pausedUntil?: Date
): void {
  expect(diagnostic).toMatchObject({ code, ...(pausedUntil ? { pausedUntil } : {}) });
  expect(diagnostic?.message).toContain(code);
  if (pausedUntil) expect(diagnostic?.message).toContain(pausedUntil.toISOString());
}

describe('targeted LLM processing diagnostics', () => {
  it('reports DAILY_LIMIT with the safe resume time', () => {
    const pausedUntil = new Date('2026-09-27T00:00:00.000Z');

    expectDiagnostic(
      diagnoseTargetedProcessing(
        report({ skipped: true, pauseReason: 'DAILY_LIMIT', pausedUntil })
      ),
      'DAILY_LIMIT',
      pausedUntil
    );
  });

  it('maps the persisted provider pause to PROVIDER_PAUSED with its resume time', () => {
    const pausedUntil = new Date('2026-09-26T15:00:00.000Z');

    expectDiagnostic(
      diagnoseTargetedProcessing(
        report({ skipped: true, pauseReason: 'PROVIDER_PAUSE', pausedUntil })
      ),
      'PROVIDER_PAUSED',
      pausedUntil
    );
  });

  it('reports ARTICLE_NOT_ELIGIBLE only when no stronger skip reason exists', async () => {
    const store = repository(null);
    const provider = new MockProvider();
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({ available: true }),
      reserve: vi.fn(),
      pauseUntil: vi.fn(),
    };

    const result = await processor(store, provider, quota).processArticle(15n);

    expectDiagnostic(diagnoseTargetedProcessing(result), 'ARTICLE_NOT_ELIGIBLE');
    expect(store.claimNext).toHaveBeenCalledWith(expect.objectContaining({ articleId: 15n }));
  });

  it('reports DAILY_LIMIT for FAILED + --retry-failed without claiming or attempting it', async () => {
    const store = repository(failedClaim());
    const provider = new MockProvider();
    const enrich = vi.spyOn(provider, 'enrich');
    const pausedUntil = new Date('2026-09-27T00:00:00.000Z');
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({
        available: false,
        reason: 'DAILY_LIMIT',
        retryAt: pausedUntil,
      }),
      reserve: vi.fn(),
      pauseUntil: vi.fn(),
    };

    const result = await processor(store, provider, quota).processArticle(15n, {
      retryFailed: true,
    });

    expectDiagnostic(diagnoseTargetedProcessing(result), 'DAILY_LIMIT', pausedUntil);
    expect(store.claimNext).not.toHaveBeenCalled();
    expect(store.startAttempt).not.toHaveBeenCalled();
    expect(quota.reserve).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });

  it('reports PROVIDER_PAUSED without additional attempts or provider calls', async () => {
    const store = repository(failedClaim());
    const provider = new MockProvider();
    const enrich = vi.spyOn(provider, 'enrich');
    const pausedUntil = new Date('2026-09-26T15:00:00.000Z');
    const quota: LlmRequestQuota = {
      check: vi.fn().mockResolvedValue({
        available: false,
        reason: 'PROVIDER_PAUSE',
        retryAt: pausedUntil,
      }),
      reserve: vi.fn(),
      pauseUntil: vi.fn(),
    };

    const result = await processor(store, provider, quota).processArticle(15n, {
      retryFailed: true,
    });

    expectDiagnostic(diagnoseTargetedProcessing(result), 'PROVIDER_PAUSED', pausedUntil);
    expect(store.claimNext).not.toHaveBeenCalled();
    expect(store.startAttempt).not.toHaveBeenCalled();
    expect(quota.reserve).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });
});
