export type NewsSourceCategory = 'official' | 'independent';

export interface NewsSource {
  id: string;
  name: string;
  feedUrl: string;
  category: NewsSourceCategory;
  language: string;
}

export interface RawMediaNode {
  $?: {
    url?: string;
    medium?: string;
    type?: string;
  };
  url?: string;
}

export interface RawFeedItem {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  summary?: string;
  content?: string;
  contentSnippet?: string;
  categories?: string[];
  enclosure?: {
    url: string;
    type?: string;
  };
  mediaContent?: RawMediaNode | RawMediaNode[];
  mediaThumbnail?: RawMediaNode | RawMediaNode[];
}

export interface NormalizedArticle {
  sourceId: string;
  source: string;
  title: string;
  url: string;
  publishedAt: Date;
  author?: string;
  summary?: string;
  content?: string;
  imageUrl?: string;
  language: string;
  topics: string[];
}

export interface SourceCollectionResult {
  source: NewsSource;
  success: boolean;
  articleCount: number;
  skippedItemCount: number;
  durationMs: number;
  error?: string;
}

export interface CollectionReport {
  startedAt: Date;
  completedAt: Date;
  articles: NormalizedArticle[];
  sources: SourceCollectionResult[];
}
