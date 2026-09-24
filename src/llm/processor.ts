import { isGlobalPermanentError, normalizeProviderError } from './errors';
import type { ClaimedArticle, LlmArticleRepository } from './repository';
import type { LlmProvider } from './types';

export type LlmProcessingTrigger = 'startup' | 'scheduled' | 'targeted';

export interface LlmProcessingLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface LlmProcessorOptions {
  batchSize: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  staleProcessingMs: number;
  now?: () => Date;
}

export interface LlmProcessingReport {
  trigger: LlmProcessingTrigger;
  claimedCount: number;
  completedCount: number;
  failedCount: number;
  lostClaimCount: number;
  skipped: boolean;
  haltedErrorCode?: string;
}

function articleInput(article: ClaimedArticle) {
  return {
    title: article.title,
    source: article.source,
    language: article.language,
    summary: article.summary,
    content: article.content,
  };
}

export class LlmProcessor {
  private running = false;
  private currentRun: Promise<LlmProcessingReport> | null = null;
  private haltedErrorCode: string | undefined;
  private readonly now: () => Date;

  constructor(
    private readonly repository: LlmArticleRepository,
    private readonly provider: LlmProvider,
    private readonly logger: LlmProcessingLogger,
    private readonly options: LlmProcessorOptions
  ) {
    this.now = options.now ?? (() => new Date());
  }

  run(trigger: Exclude<LlmProcessingTrigger, 'targeted'>): Promise<LlmProcessingReport> {
    if (this.running) {
      this.logger.warn('LLM processing skipped because a previous cycle is still running', {
        trigger,
      });
      return Promise.resolve(this.emptyReport(trigger, true));
    }
    if (this.haltedErrorCode) {
      this.logger.warn('LLM processing is halted until restart after a permanent provider error', {
        trigger,
        errorCode: this.haltedErrorCode,
      });
      return Promise.resolve(this.emptyReport(trigger, true));
    }

    return this.startRun(() => this.processBatch(trigger));
  }

  processArticle(articleId: bigint, allowCompleted: boolean): Promise<LlmProcessingReport> {
    if (this.running) return Promise.resolve(this.emptyReport('targeted', true));
    return this.startRun(() => this.processTarget(articleId, allowCompleted));
  }

  async waitForIdle(): Promise<void> {
    await this.currentRun;
  }

  private startRun(work: () => Promise<LlmProcessingReport>): Promise<LlmProcessingReport> {
    this.running = true;
    const run = work().finally(() => {
      this.running = false;
      this.currentRun = null;
    });
    this.currentRun = run;
    return run;
  }

  private emptyReport(trigger: LlmProcessingTrigger, skipped: boolean): LlmProcessingReport {
    return {
      trigger,
      claimedCount: 0,
      completedCount: 0,
      failedCount: 0,
      lostClaimCount: 0,
      skipped,
      haltedErrorCode: this.haltedErrorCode,
    };
  }

  private claimOptions(now: Date) {
    return {
      provider: this.provider.id,
      model: this.provider.model,
      now,
      staleBefore: new Date(now.getTime() - this.options.staleProcessingMs),
      maxAttempts: this.options.maxAttempts,
    };
  }

  private async processBatch(
    trigger: Exclude<LlmProcessingTrigger, 'targeted'>
  ): Promise<LlmProcessingReport> {
    const report = this.emptyReport(trigger, false);
    const startedAt = this.now();
    const staleBefore = new Date(startedAt.getTime() - this.options.staleProcessingMs);
    const expiredCount = await this.repository.expireExhaustedStale(
      staleBefore,
      this.options.maxAttempts
    );

    this.logger.info('LLM processing started', {
      trigger,
      provider: this.provider.id,
      model: this.provider.model,
      batchSize: this.options.batchSize,
      expiredStaleCount: expiredCount,
    });

    for (let index = 0; index < this.options.batchSize; index += 1) {
      const now = this.now();
      const article = await this.repository.claimNext(this.claimOptions(now));
      if (!article) break;

      report.claimedCount += 1;
      await this.processClaim(article, report);
      if (this.haltedErrorCode) break;
    }

    this.logCompletion(report, startedAt);
    return report;
  }

  private async processTarget(
    articleId: bigint,
    allowCompleted: boolean
  ): Promise<LlmProcessingReport> {
    const report = this.emptyReport('targeted', false);
    const startedAt = this.now();
    const now = this.now();
    const article = await this.repository.claimNext({
      ...this.claimOptions(now),
      articleId,
      allowCompleted,
    });

    if (article) {
      report.claimedCount = 1;
      await this.processClaim(article, report);
    }

    this.logCompletion(report, startedAt, articleId);
    return report;
  }

  private async processClaim(
    article: ClaimedArticle,
    report: LlmProcessingReport
  ): Promise<void> {
    try {
      const result = await this.provider.enrich(articleInput(article));
      const completed = await this.repository.complete(article, result, this.now());
      if (completed) {
        report.completedCount += 1;
      } else {
        report.lostClaimCount += 1;
        this.logger.warn('LLM result discarded because the database claim was lost', {
          articleId: article.id.toString(),
          provider: this.provider.id,
          model: this.provider.model,
        });
      }
    } catch (cause) {
      const error = normalizeProviderError(cause);
      const canRetry = error.retryable && article.llmAttemptCount < this.options.maxAttempts;
      const nextRetryAt = canRetry ? this.nextRetryAt(article.llmAttemptCount, error.retryAfterMs) : null;
      const failed = await this.repository.fail(article, {
        code: error.code,
        nextRetryAt,
      });

      if (failed) report.failedCount += 1;
      else report.lostClaimCount += 1;

      this.logger.warn('LLM article processing failed', {
        articleId: article.id.toString(),
        provider: this.provider.id,
        model: this.provider.model,
        attempt: article.llmAttemptCount,
        errorCode: error.code,
        retryScheduled: nextRetryAt !== null,
        nextRetryAt: nextRetryAt?.toISOString(),
      });

      if (isGlobalPermanentError(error)) {
        this.haltedErrorCode = error.code;
        report.haltedErrorCode = error.code;
      }
    }
  }

  private nextRetryAt(attempt: number, providerDelayMs?: number): Date {
    const exponent = Math.max(0, attempt - 1);
    const exponentialDelay = this.options.retryBaseDelayMs * 2 ** exponent;
    const requestedDelay = Math.max(exponentialDelay, providerDelayMs ?? 0);
    const boundedDelay = Math.min(requestedDelay, this.options.retryMaxDelayMs);
    return new Date(this.now().getTime() + boundedDelay);
  }

  private logCompletion(
    report: LlmProcessingReport,
    startedAt: Date,
    articleId?: bigint
  ): void {
    this.logger.info('LLM processing completed', {
      ...report,
      articleId: articleId?.toString(),
      provider: this.provider.id,
      model: this.provider.model,
      durationMs: this.now().getTime() - startedAt.getTime(),
    });
  }
}
