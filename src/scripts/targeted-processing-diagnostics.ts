import type { LlmProcessingReport } from '../llm/processor';

export type TargetedProcessingDiagnosticCode =
  | 'ARTICLE_NOT_ELIGIBLE'
  | 'DAILY_LIMIT'
  | 'PROVIDER_PAUSED'
  | 'RATE_LIMITED'
  | 'PROCESSOR_BUSY'
  | 'INFRASTRUCTURE_ERROR'
  | 'CLAIM_LOST'
  | 'PROCESSING_FAILED';

export interface TargetedProcessingDiagnostic {
  code: TargetedProcessingDiagnosticCode;
  message: string;
  pausedUntil?: Date;
}

function pauseDiagnostic(
  code: 'DAILY_LIMIT' | 'PROVIDER_PAUSED' | 'RATE_LIMITED',
  pausedUntil: Date | undefined
): TargetedProcessingDiagnostic {
  const resumeMessage = pausedUntil
    ? ` Processing can resume at ${pausedUntil.toISOString()}.`
    : '';

  return {
    code,
    message: `Targeted LLM processing was blocked (${code}).${resumeMessage}`,
    pausedUntil,
  };
}

export function diagnoseTargetedProcessing(
  report: LlmProcessingReport
): TargetedProcessingDiagnostic | null {
  if (report.completedCount === 1) return null;

  if (report.pauseReason === 'DAILY_LIMIT') {
    return pauseDiagnostic('DAILY_LIMIT', report.pausedUntil);
  }
  if (report.pauseReason === 'PROVIDER_PAUSE') {
    return pauseDiagnostic('PROVIDER_PAUSED', report.pausedUntil);
  }
  if (report.pauseReason === 'RATE_LIMITED') {
    return pauseDiagnostic('RATE_LIMITED', report.pausedUntil);
  }
  if (report.infrastructureError) {
    return {
      code: 'INFRASTRUCTURE_ERROR',
      message: 'Targeted LLM processing failed because an infrastructure operation was unavailable.',
    };
  }
  if (report.skipped) {
    return {
      code: 'PROCESSOR_BUSY',
      message: 'Targeted LLM processing was skipped because another processor run is active.',
    };
  }
  if (report.claimedCount === 0) {
    return {
      code: 'ARTICLE_NOT_ELIGIBLE',
      message:
        'Article is not eligible for targeted LLM processing (ARTICLE_NOT_ELIGIBLE). Use --reprocess for COMPLETED or --retry-failed for FAILED only when intentional.',
    };
  }
  if (report.lostClaimCount > 0) {
    return {
      code: 'CLAIM_LOST',
      message: 'Targeted LLM processing did not complete because the article claim was lost.',
    };
  }

  return {
    code: 'PROCESSING_FAILED',
    message: `Article processing did not complete successfully (${report.haltedErrorCode ?? 'FAILED'}).`,
  };
}

export class TargetedProcessingError extends Error {
  readonly code: TargetedProcessingDiagnosticCode;
  readonly pausedUntil?: Date;

  constructor(diagnostic: TargetedProcessingDiagnostic) {
    super(diagnostic.message);
    this.name = 'TargetedProcessingError';
    this.code = diagnostic.code;
    this.pausedUntil = diagnostic.pausedUntil;
  }
}
