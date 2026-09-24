import type { Env } from '../utils/config';
import { GeminiProvider } from './gemini-provider';
import { MockProvider } from './mock-provider';
import type { LlmProvider } from './types';

type LlmProviderConfig = Pick<
  Env,
  'LLM_PROVIDER' | 'LLM_MODEL' | 'GEMINI_API_KEY' | 'LLM_REQUEST_TIMEOUT_MS'
>;

export function createLlmProvider(config: LlmProviderConfig): LlmProvider {
  if (config.LLM_PROVIDER === 'mock') {
    return new MockProvider();
  }

  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required for GeminiProvider');
  }

  return new GeminiProvider({
    apiKey: config.GEMINI_API_KEY,
    model: config.LLM_MODEL,
    timeoutMs: config.LLM_REQUEST_TIMEOUT_MS,
  });
}
