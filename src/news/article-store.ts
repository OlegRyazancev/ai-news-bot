import type { NewsArticle, Prisma, PrismaClient } from '@prisma/client';
import type { NormalizedArticle } from './types';

type NewsArticleDelegate = Pick<PrismaClient['newsArticle'], 'createMany' | 'findMany'>;

export interface ArticlePersistenceResult {
  receivedArticleCount: number;
  createdArticleCount: number;
  duplicateArticleCount: number;
}

export interface FindLatestArticlesOptions {
  limit: number;
}

export type LatestStoredArticle = Pick<
  NewsArticle,
  'title' | 'url' | 'source' | 'publishedAt'
>;

function toCreateInput(article: NormalizedArticle): Prisma.NewsArticleCreateManyInput {
  return {
    title: article.title,
    summary: article.summary ?? null,
    content: article.content ?? null,
    url: article.url,
    source: article.source,
    author: article.author ?? null,
    publishedAt: article.publishedAt,
    imageUrl: article.imageUrl ?? null,
    language: article.language,
    topics: article.topics,
  };
}

export class NewsArticleStore {
  constructor(private readonly newsArticles: NewsArticleDelegate) {}

  async save(articles: readonly NormalizedArticle[]): Promise<ArticlePersistenceResult> {
    if (articles.length === 0) {
      return {
        receivedArticleCount: 0,
        createdArticleCount: 0,
        duplicateArticleCount: 0,
      };
    }

    const articlesByUrl = new Map<string, NormalizedArticle>();
    for (const article of articles) {
      if (!articlesByUrl.has(article.url)) {
        articlesByUrl.set(article.url, article);
      }
    }

    const uniqueArticles = [...articlesByUrl.values()];
    const result = await this.newsArticles.createMany({
      data: uniqueArticles.map(toCreateInput),
      skipDuplicates: true,
    });

    return {
      receivedArticleCount: articles.length,
      createdArticleCount: result.count,
      duplicateArticleCount: articles.length - result.count,
    };
  }

  async findLatest(options: FindLatestArticlesOptions): Promise<LatestStoredArticle[]> {
    return this.newsArticles.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
      select: {
        title: true,
        url: true,
        source: true,
        publishedAt: true,
      },
    });
  }
}
