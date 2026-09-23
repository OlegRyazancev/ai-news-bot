import { createBot } from './bot';
import { prisma } from './db/client';
import { NewsArticleStore } from './news/article-store';
import { NewsCollector } from './news/collector';
import { RssFeedReader } from './news/feed-reader';
import { NewsCollectionRunner, NewsCollectionScheduler } from './news/scheduler';
import { NEWS_SOURCES } from './news/sources';
import { logger } from './utils/logger';
import { env } from './utils/config';

async function main() {
  logger.info('Starting AI News Bot...', { env: env.NODE_ENV });

  const bot = createBot();
  const feedReader = new RssFeedReader({ timeoutMs: env.NEWS_FETCH_TIMEOUT_MS });
  const collector = new NewsCollector(NEWS_SOURCES, feedReader, {
    maxItemsPerSource: env.NEWS_MAX_ITEMS_PER_SOURCE,
  });
  const articleStore = new NewsArticleStore(prisma.newsArticle);
  const collectionRunner = new NewsCollectionRunner(collector, logger, async articles => {
    logger.info('Normalized news articles are ready for downstream processing', {
      articleCount: articles.length,
    });

    try {
      const persistenceResult = await articleStore.save(articles);
      logger.info('News articles persisted', { ...persistenceResult });
    } catch (error) {
      logger.error('News article persistence failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new Error('News article persistence failed');
    }
  });
  const collectionScheduler = new NewsCollectionScheduler(
    collectionRunner,
    env.NEWS_COLLECTION_CRON
  );
  let shuttingDown = false;

  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Received ${signal}, shutting down gracefully...`);
    await collectionScheduler.stop();

    if (bot.isRunning()) {
      await bot.stop();
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT').catch((error: unknown) => {
      logger.error('Graceful shutdown failed', {
        signal: 'SIGINT',
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    });
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').catch((error: unknown) => {
      logger.error('Graceful shutdown failed', {
        signal: 'SIGTERM',
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    });
  });

  try {
    await collectionScheduler.start(env.NEWS_COLLECTION_RUN_ON_STARTUP);
    logger.info('News collection scheduler started', {
      cron: env.NEWS_COLLECTION_CRON,
      sourceCount: NEWS_SOURCES.length,
      runOnStartup: env.NEWS_COLLECTION_RUN_ON_STARTUP,
    });

    await bot.start({
      onStart: () => {
        logger.info(`Bot started in ${env.NODE_ENV} mode (polling)`);
      },
    });
  } finally {
    await collectionScheduler.stop();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  logger.error('Failed to run bot', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
