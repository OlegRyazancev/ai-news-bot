import { describe, expect, it } from 'vitest';
import { NewsCollector } from '../src/news/collector';
import type { FeedReader } from '../src/news/feed-reader';
import type { NewsSource } from '../src/news/types';

const successfulSource: NewsSource = {
  id: 'working',
  name: 'Working Feed',
  feedUrl: 'https://example.com/working.xml',
  category: 'official',
  language: 'en',
};

const failingSource: NewsSource = {
  id: 'failing',
  name: 'Failing Feed',
  feedUrl: 'https://example.com/failing.xml',
  category: 'independent',
  language: 'en',
};

describe('NewsCollector', () => {
  it('keeps successful articles when another source fails', async () => {
    const feedReader: FeedReader = {
      fetch: async source => {
        if (source.id === failingSource.id) {
          throw new Error('Source unavailable');
        }

        return [
          {
            title: 'Older article',
            link: 'https://example.com/older',
            isoDate: '2026-09-21T10:00:00.000Z',
          },
          {
            title: 'Newer article',
            link: 'https://example.com/newer',
            isoDate: '2026-09-22T10:00:00.000Z',
          },
          {
            title: 'Invalid article without URL',
            isoDate: '2026-09-22T11:00:00.000Z',
          },
        ];
      },
    };
    const collector = new NewsCollector(
      [successfulSource, failingSource],
      feedReader,
      { maxItemsPerSource: 10 }
    );

    const report = await collector.collect();

    expect(report.articles.map(article => article.title)).toEqual([
      'Newer article',
      'Older article',
    ]);
    expect(report.sources).toHaveLength(2);
    expect(report.sources[0]).toMatchObject({
      success: true,
      articleCount: 2,
      skippedItemCount: 1,
    });
    expect(report.sources[1]).toMatchObject({
      success: false,
      articleCount: 0,
      error: 'Source unavailable',
    });
  });

  it('limits the number of processed items per source', async () => {
    const feedReader: FeedReader = {
      fetch: async () => [
        { title: 'First', link: 'https://example.com/first', isoDate: '2026-09-22' },
        { title: 'Second', link: 'https://example.com/second', isoDate: '2026-09-21' },
      ],
    };
    const collector = new NewsCollector([successfulSource], feedReader, {
      maxItemsPerSource: 1,
    });

    const report = await collector.collect();

    expect(report.articles).toHaveLength(1);
    expect(report.articles[0]?.title).toBe('First');
  });
});
