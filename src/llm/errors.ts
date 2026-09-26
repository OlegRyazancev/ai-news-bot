export type LlmProviderErrorCode =
  | 'AUTHENTICATION'
  | 'CONFIGURATION'
  | 'INVALID_RESPONSE'
  | 'RATE_LIMITED'
  | 'TEMPORARY'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type LlmProviderStatus =
  | 'INVALID_ARGUMENT'
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RESOURCE_EXHAUSTED'
  | 'DEADLINE_EXCEEDED'
  | 'INTERNAL'
  | 'UNAVAILABLE';

export type LlmProviderDiagnosticCode =
  | 'INVALID_API_KEY'
  | 'API_KEY_BLOCKED'
  | 'INVALID_JSON_SCHEMA'
  | 'INVALID_REQUEST'
  | 'MODEL_ACCESS_RESTRICTED'
  | 'MODEL_NOT_FOUND_OR_UNSUPPORTED'
  | 'RESOURCE_NOT_FOUND'
  | 'AUTHENTICATION_REJECTED'
  | 'RATE_LIMIT_REACHED'
  | 'REQUEST_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE';

export class LlmProviderError extends Error {
  constructor(
    readonly code: LlmProviderErrorCode,
    readonly retryable: boolean,
    readonly httpStatus?: number,
    readonly retryAfterMs?: number,
    readonly providerStatus?: LlmProviderStatus,
    readonly diagnosticCode?: LlmProviderDiagnosticCode
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

const ALLOWED_PROVIDER_STATUSES = new Set<LlmProviderStatus>([
  'INVALID_ARGUMENT',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'RESOURCE_EXHAUSTED',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'UNAVAILABLE',
]);

interface ProviderErrorDetails {
  providerStatus?: LlmProviderStatus;
  providerMessage?: string;
}

function providerErrorDetails(error: unknown): ProviderErrorDetails {
  if (objectValue(error, 'name') !== 'ApiError') return {};

  const rawMessage = objectValue(error, 'message');
  if (typeof rawMessage !== 'string') return {};

  try {
    const parsed: unknown = JSON.parse(rawMessage);
    const providerError = objectValue(parsed, 'error');
    const status = objectValue(providerError, 'status');
    const message = objectValue(providerError, 'message');
    return {
      providerStatus:
        typeof status === 'string' && ALLOWED_PROVIDER_STATUSES.has(status as LlmProviderStatus)
          ? (status as LlmProviderStatus)
          : undefined,
      providerMessage: typeof message === 'string' ? message : undefined,
    };
  } catch {
    return {};
  }
}

function diagnosticCodeFor(
  status: number | undefined,
  providerMessage: string | undefined
): LlmProviderDiagnosticCode | undefined {
  const message = providerMessage?.toLowerCase() ?? '';

  if (status === 400) {
    if (message.includes('api key not valid') || message.includes('api_key_invalid')) {
      return 'INVALID_API_KEY';
    }
    if (message.includes('api key was reported as leaked') || message.includes('api key is blocked')) {
      return 'API_KEY_BLOCKED';
    }
    if (
      message.includes('responsejsonschema') ||
      message.includes('response_json_schema') ||
      message.includes('response schema')
    ) {
      return 'INVALID_JSON_SCHEMA';
    }
    return 'INVALID_REQUEST';
  }

  if (status === 404) {
    if (message.includes('no longer available to new users')) {
      return 'MODEL_ACCESS_RESTRICTED';
    }
    if (
      message.includes('model') &&
      (message.includes('not found') || message.includes('not supported for generatecontent'))
    ) {
      return 'MODEL_NOT_FOUND_OR_UNSUPPORTED';
    }
    return 'RESOURCE_NOT_FOUND';
  }

  if (status === 401 || status === 403) return 'AUTHENTICATION_REJECTED';
  if (status === 429) return 'RATE_LIMIT_REACHED';
  if (status === 408) return 'REQUEST_TIMEOUT';
  if (status !== undefined && status >= 500) return 'PROVIDER_UNAVAILABLE';
  return undefined;
}

export function normalizeProviderError(error: unknown): LlmProviderError {
  if (error instanceof LlmProviderError) return error;

  const status = statusOf(error);
  const retryAfterMs = extractRetryAfterMs(error);
  const details = providerErrorDetails(error);
  const diagnosticCode = diagnosticCodeFor(status, details.providerMessage);

  if (status === 401 || status === 403) {
    return new LlmProviderError(
      'AUTHENTICATION',
      false,
      status,
      undefined,
      details.providerStatus,
      diagnosticCode
    );
  }
  if (status === 400 || status === 404) {
    return new LlmProviderError(
      'CONFIGURATION',
      false,
      status,
      undefined,
      details.providerStatus,
      diagnosticCode
    );
  }
  if (status === 429) {
    return new LlmProviderError(
      'RATE_LIMITED',
      true,
      status,
      retryAfterMs,
      details.providerStatus,
      diagnosticCode
    );
  }
  if (status === 408) {
    return new LlmProviderError(
      'TIMEOUT',
      true,
      status,
      retryAfterMs,
      details.providerStatus,
      diagnosticCode
    );
  }
  if (status !== undefined && status >= 500) {
    return new LlmProviderError(
      'TEMPORARY',
      true,
      status,
      retryAfterMs,
      details.providerStatus,
      diagnosticCode
    );
  }

  const name = objectValue(error, 'name');
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new LlmProviderError('TIMEOUT', true);
  }
  if (error instanceof TypeError) {
    return new LlmProviderError('TEMPORARY', true);
  }

  return new LlmProviderError(
    'UNKNOWN',
    false,
    status,
    undefined,
    details.providerStatus,
    diagnosticCode
  );
}

export function isGlobalPermanentError(error: LlmProviderError): boolean {
  return error.code === 'AUTHENTICATION' || error.code === 'CONFIGURATION';
}
