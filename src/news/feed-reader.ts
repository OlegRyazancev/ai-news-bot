import Parser from 'rss-parser';
import type { NewsSource, RawFeedItem, RawMediaNode } from './types';

interface ParserItem extends RawFeedItem {
  mediaContent?: RawMediaNode | RawMediaNode[];
  mediaThumbnail?: RawMediaNode | RawMediaNode[];
}

export interface FeedReader {
  fetch(source: NewsSource): Promise<RawFeedItem[]>;
}

export interface RssFeedReaderOptions {
  timeoutMs: number;
}

export class RssFeedReader implements FeedReader {
  private readonly parser: Parser<Record<string, never>, ParserItem>;

  constructor(options: RssFeedReaderOptions) {
    this.parser = new Parser({
      timeout: options.timeoutMs,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'User-Agent': 'AI-News-Bot/1.0 RSS Collector',
      },
      customFields: {
        item: [
          ['media:content', 'mediaContent', { keepArray: true }],
          ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
        ],
      },
    });
  }

  async fetch(source: NewsSource): Promise<RawFeedItem[]> {
    const feed = await this.parser.parseURL(source.feedUrl);
    return feed.items;
  }
}
