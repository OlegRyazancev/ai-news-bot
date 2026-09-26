import { isGlobalPermanentError, normalizeProviderError } from './errors';
import { NoopLlmRequestQuota, type LlmQuotaBlockReason, type LlmRequestQuota } from './quota';
import type { AttemptedArticle, ClaimedArticle, LlmArticleRepository } from './repository';
import type { LlmProvider } from './types';

export type LlmProcessingTrigger = 'startup' | 'scheduled' | 'targeted';

export interface TargetedProcessingOptions {
  reprocessCompleted?: boolean;
  retryFailed?: boolean;
}

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
  requestQuota?: LlmRequestQuota;
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
  pauseReason?: LlmQuotaBlockReason | 'RATE_LIMITED';
  pausedUntil?: Date;
  infrastructureError?: boolean;
}

type ProcessingDecision = 'continue' | 'stop';

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
  private localPauseReason: LlmQuotaBlockReason | 'RATE_LIMITED' | undefined;
  private localPausedUntil: Date | undefined;
  private readonly now: () => Date;
  private readonly requestQuota: LlmRequestQuota;

  constructor(
    private readonly repository: LlmArticleRepository,
    private readonly provider: LlmProvider,
    private readonly logger: LlmProcessingLogger,
    private readonly options: LlmProcessorOptions
  ) {
    this.now = options.now ?? (() => new Date());
    this.requestQuota = options.requestQuota ?? new NoopLlmRequestQuota();
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

    return this.startRun(trigger, () => this.processBatch(trigger));
  }

  processArticle(
    articleId: bigint,
    targetOptions: TargetedProcessingOptions = {}
  ): Promise<LlmProcessingReport> {
    if (this.running) return Promise.resolve(this.emptyReport('targeted', true));
    return this.startRun('targeted', () => this.processTarget(articleId, targetOptions));
  }

  async waitForIdle(): Promise<void> {
    await this.currentRun;
  }

  private startRun(
    trigger: LlmProcessingTrigger,
    work: () => Promise<LlmProcessingReport>
  ): Promise<LlmProcessingReport> {
    this.running = true;
    const run = work()
      .catch((error: unknown) => {
        const report = this.emptyReport(trigger, false);
        this.recordInfrastructureError(report, 'processor-run', error);
        return report;
      })
      .finally(() => {
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
    let expiredCount: number;
    try {
      expiredCount = await this.repository.expireExhaustedStale(
        staleBefore,
        this.options.maxAttempts
      );
    } catch (error) {
      this.recordInfrastructureError(report, 'expire-stale', error);
      return report;
    }

    this.logger.info('LLM processing started', {
      trigger,
      provider: this.provider.id,
      model: this.provider.model,
      batchSize: this.options.batchSize,
      expiredStaleCount: expiredCount,
    });

    for (let index = 0; index < this.options.batchSize; index += 1) {
      if (!(await this.quotaAvailable(report))) break;

      let article: ClaimedArticle | null;
      try {
        article = await this.repository.claimNext(this.claimOptions(this.now()));
      } catch (error) {
        this.recordInfrastructureError(report, 'claim-next', error);
        break;
      }
      if (!article) break;

      report.claimedCount += 1;
      const decision = await this.processClaim(article, report);
      if (decision === 'stop' || this.haltedErrorCode) break;
    }

    this.logCompletion(report, startedAt);
    return report;
  }

  private async processTarget(
    articleId: bigint,
    targetOptions: TargetedProcessingOptions
  ): Promise<LlmProcessingReport> {
    const report = this.emptyReport('targeted', false);
    const startedAt = this.now();
    if (!(await this.quotaAvailable(report))) {
      this.logCompletion(report, startedAt, articleId);
      return report;
    }

    let article: ClaimedArticle | null;
    try {
      article = await this.repository.claimNext({
        ...this.claimOptions(this.now()),
        articleId,
        allowCompleted: targetOptions.reprocessCompleted,
        allowFailed: targetOptions.retryFailed,
      });
    } catch (error) {
      this.recordInfrastructureError(report, 'claim-target', error, articleId);
      return report;
    }

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
  ): Promise<ProcessingDecision> {
    const reservationTime = this.now();
    let reservation;
    try {
      reservation = await this.requestQuota.reserve(reservationTime);
    } catch (error) {
      this.recordInfrastructureError(report, 'reserve-provider-quota', error, article.id);
      return 'stop';
    }

    if (!reservation.reserved) {
      this.applyPause(report, reservation.reason, reservation.retryAt);
      try {
        const released = await this.repository.release(article, reservation.retryAt);
        if (!released) report.lostClaimCount += 1;
      } catch (error) {
        this.recordInfrastructureError(report, 'release-quota-blocked-claim', error, article.id);
      }
      this.logger.warn('LLM processing paused by provider request budget', {
        provider: this.provider.id,
        model: this.provider.model,
        reason: reservation.reason,
        pausedUntil: reservation.retryAt.toISOString(),
      });
      return 'stop';
    }

    let attemptedArticle: AttemptedArticle | null;
    try {
      attemptedArticle = await this.repository.startAttempt(
        article,
        this.provider.id,
        this.provider.model,
        reservationTime
      );
    } catch (error) {
      this.recordInfrastructureError(report, 'start-attempt', error, article.id);
      return 'stop';
    }
    if (!attemptedArticle) {
      report.lostClaimCount += 1;
      return 'continue';
    }

    try {
      const result = await this.provider.enrich(articleInput(attemptedArticle));
      try {
        const completed = await this.repository.complete(attemptedArticle, result, this.now());
        if (completed) {
          report.completedCount += 1;
        } else {
          report.lostClaimCount += 1;
          this.logger.warn('LLM result discarded because the database claim was lost', {
            articleId: attemptedArticle.id.toString(),
            provider: this.provider.id,
            model: this.provider.model,
          });
        }
      } catch (error) {
        this.recordInfrastructureError(report, 'complete-article', error, attemptedArticle.id);
        return 'stop';
      }
      return 'continue';
    } catch (cause) {
      return this.handleProviderFailure(attemptedArticle, cause, report);
    }
  }

  private async quotaAvailable(report: LlmProcessingReport): Promise<boolean> {
    const now = this.now();
    if (this.localPausedUntil && this.localPausedUntil > now) {
      this.applyPause(
        report,
        this.localPauseReason ?? 'PROVIDER_PAUSE',
        this.localPausedUntil
      );
      report.skipped = report.claimedCount === 0;
      return false;
    }
    this.localPausedUntil = undefined;
    this.localPauseReason = undefined;

    try {
      const availability = await this.requestQuota.check(now);
      if (availability.available) return true;

      this.applyPause(report, availability.reason, availability.retryAt);
      report.skipped = report.claimedCount === 0;
      this.logger.warn('LLM processing remains paused by provider request budget', {
        provider: this.provider.id,
        model: this.provider.model,
        reason: availability.reason,
        pausedUntil: availability.retryAt.toISOString(),
      });
      return false;
    } catch (error) {
      this.recordInfrastructureError(report, 'check-provider-quota', error);
      return false;
    }
  }

  private async handleProviderFailure(
    article: AttemptedArticle,
    cause: unknown,
    report: LlmProcessingReport
  ): Promise<ProcessingDecision> {
    const error = normalizeProviderError(cause);
    const canRetry = error.retryable && article.llmAttemptCount < this.options.maxAttempts;
    const nextRetryAt = canRetry
      ? this.nextRetryAt(article.llmAttemptCount, error.retryAfterMs)
      : null;

    if (error.code === 'RATE_LIMITED') {
      const pausedUntil = nextRetryAt ?? this.nextRetryAt(article.llmAttemptCount, error.retryAfterMs);
      this.applyPause(report, 'RATE_LIMITED', pausedUntil);
      try {
        await this.requestQuota.pauseUntil(pausedUntil, this.now());
      } catch (pauseError) {
        this.recordInfrastructureError(report, 'persist-provider-pause', pauseError, article.id);
      }
    }

    try {
      const failed = await this.repository.fail(article, {
        code: error.code,
        nextRetryAt,
      });
      if (failed) report.failedCount += 1;
      else report.lostClaimCount += 1;
    } catch (repositoryError) {
      this.recordInfrastructureError(report, 'fail-article', repositoryError, article.id);
      return 'stop';
    }

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
      return 'stop';
    }

    return error.code === 'RATE_LIMITED' ? 'stop' : 'continue';
  }

  private nextRetryAt(attempt: number, providerDelayMs?: number): Date {
    const exponent = Math.max(0, attempt - 1);
    const exponentialDelay = this.options.retryBaseDelayMs * 2 ** exponent;
    const boundedLocalDelay = Math.min(exponentialDelay, this.options.retryMaxDelayMs);
    const delay = Math.max(boundedLocalDelay, providerDelayMs ?? 0);
    return new Date(this.now().getTime() + delay);
  }

  private applyPause(
    report: LlmProcessingReport,
    reason: LlmQuotaBlockReason | 'RATE_LIMITED',
    until: Date
  ): void {
    this.localPauseReason = reason;
    this.localPausedUntil = until;
    report.pauseReason = reason;
    report.pausedUntil = until;
  }

  private recordInfrastructureError(
    report: LlmProcessingReport,
    operation: string,
    error: unknown,
    articleId?: bigint
  ): void {
    report.infrastructureError = true;
    this.logger.error('LLM processing infrastructure operation failed', {
      operation,
      articleId: articleId?.toString(),
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
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
      pausedUntil: report.pausedUntil?.toISOString(),
      durationMs: this.now().getTime() - startedAt.getTime(),
    });
  }
}
