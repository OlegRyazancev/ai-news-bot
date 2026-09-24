import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/utils/config';

const baseEnv = {
  BOT_TOKEN: 'test-token',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  NODE_ENV: 'test',
};

describe('LLM environment configuration', () => {
  it('keeps processing disabled and mock-backed by default', () => {
    expect(parseEnv(baseEnv)).toMatchObject({
      LLM_PROCESSING_ENABLED: false,
      LLM_PROVIDER: 'mock',
      LLM_MODEL: 'gemini-2.5-flash-lite',
      LLM_MAX_ATTEMPTS: 3,
    });
  });

  it('requires a Gemini API key only when Gemini processing is enabled', () => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        LLM_PROCESSING_ENABLED: 'true',
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: '',
      })
    ).toThrow('GEMINI_API_KEY is required when Gemini processing is enabled');

    expect(
      parseEnv({
        ...baseEnv,
        LLM_PROCESSING_ENABLED: 'true',
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'local-secret',
      }).GEMINI_API_KEY
    ).toBe('local-secret');
  });

  it('rejects a retry maximum below the base delay', () => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        LLM_RETRY_BASE_DELAY_MS: '60000',
        LLM_RETRY_MAX_DELAY_MS: '1000',
      })
    ).toThrow('LLM_RETRY_MAX_DELAY_MS must be greater than or equal to the base delay');
  });
});
