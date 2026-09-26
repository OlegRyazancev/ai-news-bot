import { prisma } from '../db/client';
import { createLlmProcessor } from '../llm/runtime';
import { env } from '../utils/config';
import { logger } from '../utils/logger';

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

  if (report.claimedCount === 0) {
    throw new Error(
      'Article was not eligible. Use --reprocess for COMPLETED or --retry-failed for FAILED only when intentional.'
    );
  }
  if (report.completedCount !== 1) {
    throw new Error(`Article processing did not complete successfully (${report.haltedErrorCode ?? 'FAILED'})`);
  }
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    logger.error('Targeted LLM processing failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
