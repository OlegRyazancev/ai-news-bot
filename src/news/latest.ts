import type { NewsArticle } from '@prisma/client';
import { stripWrappingMarkdownEmphasis } from './text';

export const LATEST_ARTICLE_LIMIT = 10;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_TITLE_LENGTH = 180;
const MAX_SOURCE_LENGTH = 80;
const MAX_LINK_LENGTH = 1000;

export type LatestArticle = Pick<NewsArticle, 'title' | 'url' | 'source' | 'publishedAt'>;

export function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatArticle(article: LatestArticle, index: number): string {
  const cleanTitle = stripWrappingMarkdownEmphasis(article.title);
  const title = escapeTelegramHtml(truncate(cleanTitle, MAX_TITLE_LENGTH));
  const source = escapeTelegramHtml(truncate(article.source, MAX_SOURCE_LENGTH));
  const url = escapeTelegramHtml(article.url);
  const titleWithLink = url.length <= MAX_LINK_LENGTH ? `<a href="${url}">${title}</a>` : title;
  const publishedDate = article.publishedAt.toISOString().slice(0, 10);

  return `<b>${index}.</b> ${titleWithLink}\n${source} • ${publishedDate}`;
}

export function formatLatestArticles(articles: readonly LatestArticle[]): string {
  const header = '📰 <b>Latest AI News</b>';

  if (articles.length === 0) {
    return `${header}\n\nNo saved articles yet. News collection will populate this list soon.`;
  }

  let message = header;
  let includedArticleCount = 0;

  for (const article of articles) {
    const entry = formatArticle(article, includedArticleCount + 1);
    const candidate = `${message}\n\n${entry}`;
    if (candidate.length > TELEGRAM_MESSAGE_LIMIT) break;

    message = candidate;
    includedArticleCount += 1;
  }

  if (includedArticleCount === 0) {
    return `${header}\n\nThe latest article could not fit in a Telegram message.`;
  }

  return message;
}
