import { GoogleGenAI } from '@google/genai';
import { LlmProviderError, normalizeProviderError } from './errors';
import { buildEnrichmentPrompt, LLM_SYSTEM_INSTRUCTION } from './prompt';
import {
  llmEnrichmentSchema,
  type LlmArticleInput,
  type LlmProvider,
  type LlmProviderResult,
} from './types';

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'importance', 'topics'],
  properties: {
    summary: {
      type: 'string',
      description: 'Factual concise summary in the language of the article.',
    },
    importance: {
      type: 'number',
      description: 'Importance to an AI-news reader from 0 to 1.',
      minimum: 0,
      maximum: 1,
    },
    topics: {
      type: 'array',
      description: 'One to eight concise topic labels.',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string' },
    },
  },
} as const;

type GeminiClient = Pick<GoogleGenAI, 'models'>;

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  client?: GeminiClient;
}

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';
  readonly model: string;
  private readonly client: GeminiClient;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.client =
      options.client ??
      new GoogleGenAI({
        apiKey: options.apiKey,
        apiVersion: 'v1',
        httpOptions: {
          timeout: options.timeoutMs,
          retryOptions: { attempts: 1 },
        },
      });
  }

  async enrich(article: LlmArticleInput): Promise<LlmProviderResult> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: buildEnrichmentPrompt(article),
        config: {
          systemInstruction: LLM_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text ?? '');
      } catch {
        throw new LlmProviderError('INVALID_RESPONSE', true);
      }

      const validated = llmEnrichmentSchema.safeParse(parsed);
      if (!validated.success) {
        throw new LlmProviderError('INVALID_RESPONSE', true);
      }

      return {
        enrichment: validated.data,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
          totalTokens: response.usageMetadata?.totalTokenCount,
        },
      };
    } catch (error) {
      throw normalizeProviderError(error);
    }
  }
}
