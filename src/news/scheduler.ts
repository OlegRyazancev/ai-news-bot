import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { NewsCollector } from './collector';
import type { CollectionReport, NormalizedArticle } from './types';

export type CollectionTrigger = 'startup' | 'scheduled';

export interface CollectionLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export type ArticleHandler = (
  articles: readonly NormalizedArticle[],
  report: CollectionReport
) => Promise<void> | void;

export class NewsCollectionRunner {
  private running = false;

  constructor(
    private readonly collector: Pick<NewsCollector, 'collect'>,
    private readonly logger: CollectionLogger,
    private readonly onArticles?: ArticleHandler
  ) {}

  async run(trigger: CollectionTrigger): Promise<CollectionReport | null> {
    if (this.running) {
      this.logger.warn('News collection skipped because a previous cycle is still running', {
        trigger,
      });
      return null;
    }

    this.running = true;
    this.logger.info('News collection started', { trigger });

    try {
      const report = await this.collector.collect();
      const failedSources = report.sources.filter(source => !source.success);
      const skippedItemCount = report.sources.reduce(
        (total, source) => total + source.skippedItemCount,
        0
      );

      for (const failedSource of failedSources) {
        this.logger.warn('News source collection failed', {
          sourceId: failedSource.source.id,
          error: failedSource.error,
        });
      }

      await this.onArticles?.(report.articles, report);

      this.logger.info('News collection completed', {
        trigger,
        sourceCount: report.sources.length,
        successfulSourceCount: report.sources.length - failedSources.length,
        failedSourceCount: failedSources.length,
        articleCount: report.articles.length,
        skippedItemCount,
        durationMs: report.completedAt.getTime() - report.startedAt.getTime(),
      });

      return report;
    } catch (error) {
      this.logger.error('News collection cycle failed', {
        trigger,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      this.running = false;
    }
  }
}

export class NewsCollectionScheduler {
  private readonly task: ScheduledTask;
  private started = false;

  constructor(
    private readonly runner: NewsCollectionRunner,
    cronExpression: string
  ) {
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid news collection cron expression');
    }

    this.task = cron.createTask(
      cronExpression,
      async () => {
        await this.runner.run('scheduled');
      },
      {
        name: 'news-collection',
        noOverlap: true,
        unref: true,
      }
    );
  }

  async start(runOnStartup: boolean): Promise<void> {
    if (this.started) return;

    await this.task.start();
    this.started = true;

    if (runOnStartup) {
      void this.runner.run('startup');
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    await this.task.destroy();
    this.started = false;
  }
}
