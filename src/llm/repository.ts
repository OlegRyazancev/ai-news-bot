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
};

export interface ClaimOptions {
  provider: string;
  model: string;
  now: Date;
  staleBefore: Date;
  maxAttempts: number;
  articleId?: bigint;
  allowCompleted?: boolean;
}

export interface LlmFailureUpdate {
  code: string;
  nextRetryAt: Date | null;
}

export interface LlmArticleRepository {
  expireExhaustedStale(staleBefore: Date, maxAttempts: number): Promise<number>;
  claimNext(options: ClaimOptions): Promise<ClaimedArticle | null>;
  complete(claim: ClaimedArticle, result: LlmProviderResult, processedAt: Date): Promise<boolean>;
  fail(claim: ClaimedArticle, failure: LlmFailureUpdate): Promise<boolean>;
}

type CandidateRow = Pick<NewsArticle, 'id' | 'llmStatus'>;

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
    if (options.allowCompleted && options.articleId === undefined) {
      throw new Error('allowCompleted requires an explicit articleId');
    }

    return this.client.$transaction(async transaction => {
      const targetFilter =
        options.articleId === undefined
          ? Prisma.empty
          : Prisma.sql`AND "id" = ${options.articleId}`;
      const completedFilter = options.allowCompleted
        ? Prisma.sql`OR "llmStatus" = 'COMPLETED'`
        : Prisma.empty;

      const candidates = await transaction.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT "id", "llmStatus"
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
        options.allowCompleted && candidate.llmStatus === LlmProcessingStatus.COMPLETED;
      const article = await transaction.newsArticle.update({
        where: { id: candidate.id },
        data: {
          llmStatus: LlmProcessingStatus.PROCESSING,
          llmProvider: options.provider,
          llmModel: options.model,
          llmAttemptCount: resetAttempts ? 1 : { increment: 1 },
          llmClaimToken: claimToken,
          llmProcessingStartedAt: options.now,
          llmNextRetryAt: null,
          llmLastError: null,
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

      return { ...article, claimToken };
    });
  }

  async complete(
    claim: ClaimedArticle,
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

  async fail(claim: ClaimedArticle, failure: LlmFailureUpdate): Promise<boolean> {
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
