import { prisma } from '../db/client';
import { createLlmProcessor } from '../llm/runtime';
import { env } from '../utils/config';
import { logger } from '../utils/logger';
import {
  diagnoseTargetedProcessing,
  TargetedProcessingError,
} from './targeted-processing-diagnostics';

function parseArguments(arguments_: readonly string[]): {
  articleId: bigint;
  reprocessCompleted: boolean;
  retryFailed: boolean;
} {
  const [articleIdValue, ...flags] = arguments_;
  const allowedFlags = new Set(['--reprocess', '--retry-failed']);
  if (
    !articleIdValue ||
    flags.some(flag => !allowedFlags.has(flag)) ||
    (flags.includes('--reprocess') && flags.includes('--retry-failed'))
  ) {
    throw new Error(
      'Usage: npm run llm:process-article -- <article-id> [--reprocess | --retry-failed]'
    );
  }

  let articleId: bigint;
  try {
    articleId = BigInt(articleIdValue);
  } catch {
    throw new Error('Article ID must be a positive integer');
  }
  if (articleId <= 0n) throw new Error('Article ID must be a positive integer');

  return {
    articleId,
    reprocessCompleted: flags.includes('--reprocess'),
    retryFailed: flags.includes('--retry-failed'),
  };
}

async function main(): Promise<void> {
  const { articleId, reprocessCompleted, retryFailed } = parseArguments(process.argv.slice(2));
  const processor = createLlmProcessor(env, prisma, logger);
  const report = await processor.processArticle(articleId, { reprocessCompleted, retryFailed });
  const diagnostic = diagnoseTargetedProcessing(report);
  if (diagnostic) throw new TargetedProcessingError(diagnostic);
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    const targetedError = error instanceof TargetedProcessingError ? error : undefined;
    logger.error('Targeted LLM processing failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      diagnosticCode: targetedError?.code,
      pausedUntil: targetedError?.pausedUntil?.toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
