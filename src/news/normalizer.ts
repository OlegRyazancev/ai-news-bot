import type { NewsSource, NormalizedArticle, RawFeedItem, RawMediaNode } from './types';
import { stripWrappingMarkdownEmphasis } from './text';

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned : undefined;
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;

  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function mediaUrl(
  node: RawMediaNode | RawMediaNode[] | undefined,
  requireImageMetadata: boolean
): string | undefined {
  const nodes = Array.isArray(node) ? node : node ? [node] : [];

  for (const entry of nodes) {
    const medium = entry.$?.medium?.toLowerCase();
    const type = entry.$?.type?.toLowerCase();
    if (
      requireImageMetadata &&
      ((medium !== undefined && medium !== 'image') ||
        (type !== undefined && !type.startsWith('image/')))
    ) {
      continue;
    }

    const url = normalizeHttpUrl(entry.$?.url ?? entry.url);
    if (url) return url;
  }

  return undefined;
}

function imageUrl(item: RawFeedItem): string | undefined {
  const enclosureType = item.enclosure?.type?.toLowerCase();
  const enclosureUrl = enclosureType?.startsWith('image/')
    ? normalizeHttpUrl(item.enclosure?.url)
    : undefined;

  return (
    enclosureUrl ??
    mediaUrl(item.mediaContent, true) ??
    mediaUrl(item.mediaThumbnail, false)
  );
}

function validDate(...values: Array<string | undefined>): Date | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;

    const date = new Date(cleaned);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

export function normalizeFeedItem(
  item: RawFeedItem,
  source: NewsSource
): NormalizedArticle | null {
  const rawTitle = cleanText(item.title);
  const title = rawTitle ? stripWrappingMarkdownEmphasis(rawTitle) : undefined;
  const url = normalizeHttpUrl(item.link) ?? normalizeHttpUrl(item.guid);
  const publishedAt = validDate(item.isoDate, item.pubDate);

  if (!title || !url || !publishedAt) {
    return null;
  }

  const topics = [...new Set((item.categories ?? []).map(cleanText).filter(Boolean))] as string[];

  return {
    sourceId: source.id,
    source: source.name,
    title,
    url,
    publishedAt,
    author: cleanText(item.creator),
    summary: cleanText(item.contentSnippet ?? item.summary),
    content: cleanText(item.content),
    imageUrl: imageUrl(item),
    language: source.language,
    topics,
  };
}
