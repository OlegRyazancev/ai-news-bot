import { describe, expect, it } from 'vitest';
import { escapeTelegramHtml, formatLatestArticles } from '../src/news/latest';

describe('latest news formatting', () => {
  it('escapes Telegram HTML in external values', () => {
    expect(escapeTelegramHtml('<AI> & "ML"')).toBe('&lt;AI&gt; &amp; &quot;ML&quot;');

    const message = formatLatestArticles([
      {
        title: '<New> & improved',
        url: 'https://example.com/article?one=1&two=2',
        source: 'Research <Lab>',
        publishedAt: new Date('2026-09-23T10:00:00.000Z'),
      },
    ]);

    expect(message).toContain('&lt;New&gt; &amp; improved');
    expect(message).toContain('https://example.com/article?one=1&amp;two=2');
    expect(message).toContain('Research &lt;Lab&gt;');
    expect(message).toContain('2026-09-23');
  });

  it('returns a useful empty state', () => {
    expect(formatLatestArticles([])).toContain('No saved articles yet');
  });

  it('removes Markdown emphasis saved in an existing title', () => {
    const message = formatLatestArticles([
      {
        title: '**Formatted article title**',
        url: 'https://example.com/formatted-article',
        source: 'Example Source',
        publishedAt: new Date('2026-09-23T10:00:00.000Z'),
      },
    ]);

    expect(message).toContain('Formatted article title');
    expect(message).not.toContain('**');
  });

  it('keeps the response within the Telegram message limit', () => {
    const articles = Array.from({ length: 20 }, (_, index) => ({
      title: `Article ${index} ${'x'.repeat(500)}`,
      url: `https://example.com/${index}/${'y'.repeat(1500)}`,
      source: `Source ${'z'.repeat(200)}`,
      publishedAt: new Date('2026-09-23T10:00:00.000Z'),
    }));

    expect(formatLatestArticles(articles).length).toBeLessThanOrEqual(4096);
  });
});
