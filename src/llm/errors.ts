export type LlmProviderErrorCode =
  | 'AUTHENTICATION'
  | 'CONFIGURATION'
  | 'INVALID_RESPONSE'
  | 'RATE_LIMITED'
  | 'TEMPORARY'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class LlmProviderError extends Error {
  constructor(
    readonly code: LlmProviderErrorCode,
    readonly retryable: boolean,
    readonly status?: number,
    readonly retryAfterMs?: number
  ) {
    super(`LLM provider error: ${code}`);
    this.name = 'LlmProviderError';
  }
}

function objectValue(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function positiveMilliseconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return undefined;
}

function parseRetryAfterValue(value: unknown, nowMs: number): number | undefined {
  if (typeof value === 'number') return positiveMilliseconds(value * 1000);
  if (typeof value !== 'string') return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}

function headerValue(headers: unknown, name: string): unknown {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (typeof headers !== 'object' || headers === null) return undefined;

  const entries = Object.entries(headers as Record<string, unknown>);
  return entries.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

export function extractRetryAfterMs(error: unknown, nowMs = Date.now()): number | undefined {
  const direct = positiveMilliseconds(objectValue(error, 'retryAfterMs'));
  if (direct !== undefined) return direct;

  const fromHeaders = parseRetryAfterValue(
    headerValue(objectValue(error, 'headers'), 'retry-after'),
    nowMs
  );
  if (fromHeaders !== undefined) return fromHeaders;

  const message = objectValue(error, 'message');
  if (typeof message === 'string') {
    const retryDelay = message.match(/(?:retryDelay|retry-after)["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s?/i);
    if (retryDelay) return Math.round(Number(retryDelay[1]) * 1000);
  }

  const cause = objectValue(error, 'cause');
  return cause && cause !== error ? extractRetryAfterMs(cause, nowMs) : undefined;
}

function statusOf(error: unknown): number | undefined {
  const status = objectValue(error, 'status');
  return typeof status === 'number' ? status : undefined;
}

export function normalizeProviderError(error: unknown): LlmProviderError {
  if (error instanceof LlmProviderError) return error;

  const status = statusOf(error);
  const retryAfterMs = extractRetryAfterMs(error);

  if (status === 401 || status === 403) {
    return new LlmProviderError('AUTHENTICATION', false, status);
  }
  if (status === 400 || status === 404) {
    return new LlmProviderError('CONFIGURATION', false, status);
  }
  if (status === 429) {
    return new LlmProviderError('RATE_LIMITED', true, status, retryAfterMs);
  }
  if (status === 408) {
    return new LlmProviderError('TIMEOUT', true, status, retryAfterMs);
  }
  if (status !== undefined && status >= 500) {
    return new LlmProviderError('TEMPORARY', true, status, retryAfterMs);
  }

  const name = objectValue(error, 'name');
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new LlmProviderError('TIMEOUT', true);
  }
  if (error instanceof TypeError) {
    return new LlmProviderError('TEMPORARY', true);
  }

  return new LlmProviderError('UNKNOWN', false, status);
}

export function isGlobalPermanentError(error: LlmProviderError): boolean {
  return error.code === 'AUTHENTICATION' || error.code === 'CONFIGURATION';
}
