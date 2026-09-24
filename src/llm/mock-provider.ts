import { LlmProviderError } from './errors';
import type { LlmArticleInput, LlmProvider, LlmProviderResult } from './types';

export type MockProviderBehavior =
  | 'success'
  | 'invalid-response'
  | 'timeout'
  | 'rate-limited'
  | 'temporary-error'
  | 'permanent-error';

export class MockProvider implements LlmProvider {
  readonly id = 'mock';

  constructor(
    readonly model = 'mock-v1',
    private readonly behavior: MockProviderBehavior = 'success'
  ) {}

  enrich(article: LlmArticleInput): Promise<LlmProviderResult> {
    switch (this.behavior) {
      case 'invalid-response':
        return Promise.reject(new LlmProviderError('INVALID_RESPONSE', true));
      case 'timeout':
        return Promise.reject(new LlmProviderError('TIMEOUT', true));
      case 'rate-limited':
        return Promise.reject(new LlmProviderError('RATE_LIMITED', true, 429, 60_000));
      case 'temporary-error':
        return Promise.reject(new LlmProviderError('TEMPORARY', true, 503));
      case 'permanent-error':
        return Promise.reject(new LlmProviderError('AUTHENTICATION', false, 401));
      default:
        return Promise.resolve({
          enrichment: {
            summary: `Mock summary: ${article.title}`.slice(0, 1200),
            importance: 0.5,
            topics: ['mock'],
          },
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
          },
        });
    }
  }
}
