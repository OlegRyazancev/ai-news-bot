import { randomUUID } from 'node:crypto';
import {
  LlmProcessingStatus,
  Prisma,
  type NewsArticle,
  type PrismaClient,
} from '@prisma/client';
import type { LlmProviderResult } from './types';

export type ClaimedArticle = Pick<
  NewsArticle,
  'id' | 'title' | 'source' | 'language' | 'summary' | 'content' | 'llmAttemptCount'
> & {
  claimToken: string;
  previousStatus: LlmProcessingStatus;
  previousAttemptCount: number;
  previousNextRetryAt: Date | null;
  previousLastError: string | null;
};

export type AttemptedArticle = ClaimedArticle & {
  attemptProvider: string;
  attemptModel: string;
};

export interface ClaimOptions {
  now: Date;
  staleBefore: Date;
  maxAttempts: number;
  articleId?: bigint;
  allowCompleted?: boolean;
  allowFailed?: boolean;
}

export interface LlmFailureUpdate {
  code: string;
  nextRetryAt: Date | null;
}

export interface LlmArticleRepository {
  expireExhaustedStale(staleBefore: Date, maxAttempts: number): Promise<number>;
  claimNext(options: ClaimOptions): Promise<ClaimedArticle | null>;
  startAttempt(
    claim: ClaimedArticle,
    provider: string,
    model: string,
    now: Date
  ): Promise<AttemptedArticle | null>;
  release(claim: ClaimedArticle, retryAt: Date): Promise<boolean>;
  complete(
    claim: AttemptedArticle,
    result: LlmProviderResult,
    processedAt: Date
  ): Promise<boolean>;
  fail(claim: AttemptedArticle, failure: LlmFailureUpdate): Promise<boolean>;
}

type CandidateRow = Pick<
  NewsArticle,
  'id' | 'llmStatus' | 'llmAttemptCount' | 'llmNextRetryAt' | 'llmLastError'
>;

export class PrismaLlmArticleRepository implements LlmArticleRepository {
  constructor(private readonly client: PrismaClient) {}

  async expireExhaustedStale(staleBefore: Date, maxAttempts: number): Promise<number> {
    const result = await this.client.newsArticle.updateMany({
      where: {
        llmStatus: LlmProcessingStatus.PROCESSING,
        llmProcessingStartedAt: { lte: staleBefore },
        llmAttemptCount: { gte: maxAttempts },
      },
      data: {
        llmStatus: LlmProcessingStatus.FAILED,
        llmClaimToken: null,
        llmProcessingStartedAt: null,
        llmNextRetryAt: null,
        llmLastError: 'STALE_MAX_ATTEMPTS',
      },
    });

    return result.count;
  }

  async claimNext(options: ClaimOptions): Promise<ClaimedArticle | null> {
    if ((options.allowCompleted || options.allowFailed) && options.articleId === undefined) {
      throw new Error('Explicit retry flags require an articleId');
    }

    return this.client.$transaction(async transaction => {
      const targetFilter =
        options.articleId === undefined
          ? Prisma.empty
          : Prisma.sql`AND "id" = ${options.articleId}`;
      const completedFilter = options.allowCompleted
        ? Prisma.sql`OR "llmStatus" = 'COMPLETED'`
        : Prisma.empty;
      const failedFilter = options.allowFailed
        ? Prisma.sql`OR "llmStatus" = 'FAILED'`
        : Prisma.empty;

      const candidates = await transaction.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT "id", "llmStatus", "llmAttemptCount", "llmNextRetryAt", "llmLastError"
        FROM "NewsArticle"
        WHERE (
          "llmStatus" = 'PENDING'
          OR (
            "llmStatus" = 'FAILED'
            AND "llmNextRetryAt" IS NOT NULL
            AND "llmNextRetryAt" <= ${options.now}
            AND "llmAttemptCount" < ${options.maxAttempts}
          )
          OR (
            "llmStatus" = 'PROCESSING'
            AND "llmProcessingStartedAt" <= ${options.staleBefore}
            AND "llmAttemptCount" < ${options.maxAttempts}
          )
          ${completedFilter}
          ${failedFilter}
        )
        ${targetFilter}
        ORDER BY "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);

      const candidate = candidates[0];
      if (!candidate) return null;

      const claimToken = randomUUID();
      const resetAttempts =
        (options.allowCompleted && candidate.llmStatus === LlmProcessingStatus.COMPLETED) ||
        (options.allowFailed && candidate.llmStatus === LlmProcessingStatus.FAILED);
      const article = await transaction.newsArticle.update({
        where: { id: candidate.id },
        data: {
          llmStatus: LlmProcessingStatus.PROCESSING,
          llmAttemptCount: resetAttempts ? 0 : candidate.llmAttemptCount,
          llmClaimToken: claimToken,
          llmProcessingStartedAt: options.now,
          llmNextRetryAt: null,
        },
        select: {
          id: true,
          title: true,
          source: true,
          language: true,
          summary: true,
          content: true,
          llmAttemptCount: true,
        },
      });

      return {
        ...article,
        claimToken,
        previousStatus: candidate.llmStatus,
        previousAttemptCount: candidate.llmAttemptCount,
        previousNextRetryAt: candidate.llmNextRetryAt,
        previousLastError: candidate.llmLastError,
      };
    });
  }

  async startAttempt(
    claim: ClaimedArticle,
    provider: string,
    model: string,
    now: Date
  ): Promise<AttemptedArticle | null> {
    const updated = await this.client.newsArticle.updateMany({
      where: {
        id: claim.id,
        llmStatus: LlmProcessingStatus.PROCESSING,
        llmClaimToken: claim.claimToken,
      },
      data: {
        llmAttemptCount: { increment: 1 },
        llmLastAttemptProvider: provider,
        llmLastAttemptModel: model,
        llmLastAttemptAt: now,
        llmLastError: null,
      },
    });

    return updated.count === 1
      ? {
          ...claim,
          llmAttemptCount: claim.llmAttemptCount + 1,
          attemptProvider: provider,
          attemptModel: model,
        }
      : null;
  }

  async release(claim: ClaimedArticle, retryAt: Date): Promise<boolean> {
    const restoreCompleted = claim.previousStatus === LlmProcessingStatus.COMPLETED;
    const restorePending = claim.previousStatus === LlmProcessingStatus.PENDING;
    const updated = await this.client.newsArticle.updateMany({
      where: {
        id: claim.id,
        llmStatus: LlmProcessingStatus.PROCESSING,
        llmClaimToken: claim.claimToken,
      },
      data: {
        llmStatus: restoreCompleted
          ? LlmProcessingStatus.COMPLETED
          : restorePending
            ? LlmProcessingStatus.PENDING
            : LlmProcessingStatus.FAILED,
        llmAttemptCount: claim.previousAttemptCount,
        llmClaimToken: null,
        llmProcessingStartedAt: null,
        llmNextRetryAt:
          restoreCompleted || restorePending ? claim.previousNextRetryAt : retryAt,
        llmLastError:
          claim.previousStatus === LlmProcessingStatus.PROCESSING
            ? 'CLAIM_RELEASED'
            : claim.previousLastError,
      },
    });

    return updated.count === 1;
  }

  async complete(
    claim: AttemptedArticle,
    result: LlmProviderResult,
    processedAt: Date
  ): Promise<boolean> {
    const updated = await this.client.newsArticle.updateMany({
      where: {
        id: claim.id,
        llmStatus: LlmProcessingStatus.PROCESSING,
        llmClaimToken: claim.claimToken,
      },
      data: {
        llmSummary: result.enrichment.summary,
        llmImportance: result.enrichment.importance,
        llmTopics: result.enrichment.topics,
        llmProvider: claim.attemptProvider,
        llmModel: claim.attemptModel,
        llmStatus: LlmProcessingStatus.COMPLETED,
        llmClaimToken: null,
        llmProcessingStartedAt: null,
        llmProcessedAt: processedAt,
        llmNextRetryAt: null,
        llmLastError: null,
        llmInputTokens: result.usage.inputTokens ?? null,
        llmOutputTokens: result.usage.outputTokens ?? null,
        llmTotalTokens: result.usage.totalTokens ?? null,
      },
    });

    return updated.count === 1;
  }

  async fail(claim: AttemptedArticle, failure: LlmFailureUpdate): Promise<boolean> {
    const updated = await this.client.newsArticle.updateMany({
      where: {
        id: claim.id,
        llmStatus: LlmProcessingStatus.PROCESSING,
        llmClaimToken: claim.claimToken,
      },
      data: {
        llmStatus: LlmProcessingStatus.FAILED,
        llmClaimToken: null,
        llmProcessingStartedAt: null,
        llmNextRetryAt: failure.nextRetryAt,
        llmLastError: failure.code,
      },
    });

    return updated.count === 1;
  }
}
