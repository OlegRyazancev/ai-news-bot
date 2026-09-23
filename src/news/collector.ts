import type { FeedReader } from './feed-reader';
import { normalizeFeedItem } from './normalizer';
import type {
  CollectionReport,
  NewsSource,
  NormalizedArticle,
  SourceCollectionResult,
} from './types';

export interface NewsCollectorOptions {
  maxItemsPerSource: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class NewsCollector {
  constructor(
    private readonly sources: readonly NewsSource[],
    private readonly feedReader: FeedReader,
    private readonly options: NewsCollectorOptions
  ) {}

  async collect(): Promise<CollectionReport> {
    const startedAt = new Date();
    const sourceRuns = await Promise.all(this.sources.map(source => this.collectSource(source)));
    const articles = sourceRuns
      .flatMap(run => run.articles)
      .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());

    return {
      startedAt,
      completedAt: new Date(),
      articles,
      sources: sourceRuns.map(run => run.result),
    };
  }

  private async collectSource(source: NewsSource): Promise<{
    articles: NormalizedArticle[];
    result: SourceCollectionResult;
  }> {
    const startedAt = Date.now();

    try {
      const items = await this.feedReader.fetch(source);
      const limitedItems = items.slice(0, this.options.maxItemsPerSource);
      const articles = limitedItems
        .map(item => normalizeFeedItem(item, source))
        .filter((article): article is NormalizedArticle => article !== null);

      return {
        articles,
        result: {
          source,
          success: true,
          articleCount: articles.length,
          skippedItemCount: limitedItems.length - articles.length,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      return {
        articles: [],
        result: {
          source,
          success: false,
          articleCount: 0,
          skippedItemCount: 0,
          durationMs: Date.now() - startedAt,
          error: errorMessage(error),
        },
      };
    }
  }
}
