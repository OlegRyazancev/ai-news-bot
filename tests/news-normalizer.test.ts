import { describe, expect, it } from 'vitest';
import { normalizeFeedItem } from '../src/news/normalizer';
import type { NewsSource } from '../src/news/types';

const source: NewsSource = {
  id: 'test-source',
  name: 'Test Source',
  feedUrl: 'https://example.com/feed.xml',
  category: 'official',
  language: 'en',
};

describe('normalizeFeedItem', () => {
  it('normalizes required and optional RSS fields', () => {
    const article = normalizeFeedItem(
      {
        title: '  New   model released  ',
        link: 'https://example.com/news/model',
        isoDate: '2026-09-22T10:00:00.000Z',
        creator: '  Example Author ',
        contentSnippet: ' A concise   summary. ',
        content: ' Full   article text. ',
        categories: ['LLM', 'LLM', 'Research'],
        mediaContent: [{ $: { url: 'https://example.com/image.jpg' } }],
      },
      source
    );

    expect(article).toEqual({
      sourceId: 'test-source',
      source: 'Test Source',
      title: 'New model released',
      url: 'https://example.com/news/model',
      publishedAt: new Date('2026-09-22T10:00:00.000Z'),
      author: 'Example Author',
      summary: 'A concise summary.',
      content: 'Full article text.',
      imageUrl: 'https://example.com/image.jpg',
      language: 'en',
      topics: ['LLM', 'Research'],
    });
  });

  it('falls back to a valid guid and publication date', () => {
    const article = normalizeFeedItem(
      {
        title: 'Article',
        link: 'not-a-url',
        guid: 'https://example.com/article',
        isoDate: 'not-a-date',
        pubDate: 'Tue, 22 Sep 2026 10:00:00 GMT',
      },
      source
    );

    expect(article?.url).toBe('https://example.com/article');
    expect(article?.publishedAt).toEqual(new Date('2026-09-22T10:00:00.000Z'));
  });

  it('removes wrapping Markdown emphasis from a title', () => {
    const article = normalizeFeedItem(
      {
        title: '**Formatted article title**',
        link: 'https://example.com/formatted-article',
        isoDate: '2026-09-22T10:00:00.000Z',
      },
      source
    );

    expect(article?.title).toBe('Formatted article title');
  });

  it.each([
    { title: undefined, link: 'https://example.com/article', isoDate: '2026-09-22' },
    { title: 'Article', link: 'not-a-url', isoDate: '2026-09-22' },
    { title: 'Article', link: 'https://example.com/article', isoDate: 'not-a-date' },
  ])('rejects an item without valid required fields', item => {
    expect(normalizeFeedItem(item, source)).toBeNull();
  });
});
