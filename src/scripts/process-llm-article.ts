import { prisma } from '../db/client';
import { createLlmProcessor } from '../llm/runtime';
import { env } from '../utils/config';
import { logger } from '../utils/logger';

function parseArguments(arguments_: readonly string[]): { articleId: bigint; reprocess: boolean } {
  const [articleIdValue, ...flags] = arguments_;
  if (!articleIdValue || flags.some(flag => flag !== '--reprocess')) {
    throw new Error('Usage: npm run llm:process-article -- <article-id> [--reprocess]');
  }

  let articleId: bigint;
  try {
    articleId = BigInt(articleIdValue);
  } catch {
    throw new Error('Article ID must be a positive integer');
  }
  if (articleId <= 0n) throw new Error('Article ID must be a positive integer');

  return { articleId, reprocess: flags.includes('--reprocess') };
}

async function main(): Promise<void> {
  const { articleId, reprocess } = parseArguments(process.argv.slice(2));
  const processor = createLlmProcessor(env, prisma, logger);
  const report = await processor.processArticle(articleId, reprocess);

  if (report.claimedCount === 0) {
    throw new Error(
      'Article was not eligible. Use an explicit article ID with --reprocess only when intentional.'
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
