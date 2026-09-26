import { z } from 'zod';

const topicSchema = z.string().trim().min(1).max(64);

export const llmEnrichmentSchema = z
  .object({
    summary: z.string().trim().min(1).max(1200),
    importance: z.number().min(0).max(1),
    topics: z.array(topicSchema).min(1).max(8),
  })
  .strict()
  .transform(value => ({
    ...value,
    topics: [...new Set(value.topics.map(topic => topic.toLowerCase()))],
  }));

export type LlmEnrichment = z.infer<typeof llmEnrichmentSchema>;

export interface LlmArticleInput {
  title: string;
  source: string;
  language: string;
  summary?: string | null;
  content?: string | null;
}

export interface LlmTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LlmProviderResult {
  enrichment: LlmEnrichment;
  usage: LlmTokenUsage;
}

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  enrich(article: LlmArticleInput): Promise<LlmProviderResult>;
}
