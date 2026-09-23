import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NewsArticleStore } from '../src/news/article-store';
import type { NormalizedArticle } from '../src/news/types';

type NewsArticleDelegate = Pick<PrismaClient['newsArticle'], 'createMany' | 'findMany'>;

function article(url: string, title = 'Article'): NormalizedArticle {
  return {
    sourceId: 'test-source',
    source: 'Test Source',
    title,
    url,
    publishedAt: new Date('2026-09-23T10:00:00.000Z'),
    author: 'Author',
    summary: 'Summary',
    content: 'Content',
    imageUrl: 'https://example.com/image.jpg',
    language: 'en',
    topics: ['AI'],
  };
}

describe('NewsArticleStore', () => {
  it('maps articles, removes batch duplicates, and reports all duplicates', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const store = new NewsArticleStore({
      createMany,
      findMany: vi.fn(),
    } as unknown as NewsArticleDelegate);

    const result = await store.save([
      article('https://example.com/article', 'First value'),
      article('https://example.com/article', 'Duplicate value'),
      article('https://example.com/existing', 'Existing value'),
    ]);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          title: 'First value',
          summary: 'Summary',
          content: 'Content',
          url: 'https://example.com/article',
          source: 'Test Source',
          author: 'Author',
          publishedAt: new Date('2026-09-23T10:00:00.000Z'),
          imageUrl: 'https://example.com/image.jpg',
          language: 'en',
          topics: ['AI'],
        },
        expect.objectContaining({
          title: 'Existing value',
          url: 'https://example.com/existing',
        }),
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({
      receivedArticleCount: 3,
      createdArticleCount: 1,
      duplicateArticleCount: 2,
    });
  });

  it('does not call the database for an empty batch', async () => {
    const createMany = vi.fn();
    const store = new NewsArticleStore({
      createMany,
      findMany: vi.fn(),
    } as unknown as NewsArticleDelegate);

    await expect(store.save([])).resolves.toEqual({
      receivedArticleCount: 0,
      createdArticleCount: 0,
      duplicateArticleCount: 0,
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('treats database conflicts as duplicates across calls', async () => {
    const savedUrls = new Set<string>();
    const createMany = vi.fn().mockImplementation(async ({ data }) => {
      let count = 0;
      for (const item of data) {
        if (!savedUrls.has(item.url)) {
          savedUrls.add(item.url);
          count += 1;
        }
      }
      return { count };
    });
    const store = new NewsArticleStore({
      createMany,
      findMany: vi.fn(),
    } as unknown as NewsArticleDelegate);
    const savedArticle = article('https://example.com/article');

    await expect(store.save([savedArticle])).resolves.toMatchObject({
      createdArticleCount: 1,
      duplicateArticleCount: 0,
    });
    await expect(store.save([{ ...savedArticle, title: 'Changed title' }])).resolves.toMatchObject({
      createdArticleCount: 0,
      duplicateArticleCount: 1,
    });
  });

  it('requests a bounded, deterministic latest-article list', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const store = new NewsArticleStore({
      createMany: vi.fn(),
      findMany,
    } as unknown as NewsArticleDelegate);

    await store.findLatest({ limit: 10 });

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        title: true,
        url: true,
        source: true,
        publishedAt: true,
      },
    });
  });
});
