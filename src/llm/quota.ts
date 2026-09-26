import { Prisma, type PrismaClient } from '@prisma/client';

export type LlmQuotaBlockReason = 'DAILY_LIMIT' | 'PROVIDER_PAUSE';

export type LlmQuotaReservation =
  | { reserved: true; reservedRequests: number }
  | { reserved: false; reason: LlmQuotaBlockReason; retryAt: Date };

export type LlmQuotaAvailability =
  | { available: true }
  | { available: false; reason: LlmQuotaBlockReason; retryAt: Date };

export interface LlmRequestQuota {
  check(now: Date): Promise<LlmQuotaAvailability>;
  reserve(now: Date): Promise<LlmQuotaReservation>;
  pauseUntil(until: Date, now: Date): Promise<void>;
}

interface QuotaRow {
  provider: string;
  model: string | null;
  quotaDate: Date;
  reservedRequests: number;
  pausedUntil: Date | null;
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function nextUtcDay(now: Date): Date {
  const start = utcDayStart(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export class NoopLlmRequestQuota implements LlmRequestQuota {
  check(): Promise<LlmQuotaAvailability> {
    return Promise.resolve({ available: true });
  }

  reserve(): Promise<LlmQuotaReservation> {
    return Promise.resolve({ reserved: true, reservedRequests: 0 });
  }

  pauseUntil(): Promise<void> {
    return Promise.resolve();
  }
}

export class PrismaLlmRequestQuota implements LlmRequestQuota {
  constructor(
    private readonly client: PrismaClient,
    private readonly provider: string,
    private readonly model: string,
    private readonly dailyLimit: number
  ) {}

  async check(now: Date): Promise<LlmQuotaAvailability> {
    const state = await this.client.llmProviderQuota.findUnique({
      where: { provider: this.provider },
    });
    if (!state) return { available: true };
    if (state.pausedUntil && state.pausedUntil > now) {
      return { available: false, reason: 'PROVIDER_PAUSE', retryAt: state.pausedUntil };
    }

    const quotaDate = utcDayStart(now);
    const sameDay = state.quotaDate.getTime() === quotaDate.getTime();
    if (sameDay && state.reservedRequests >= this.dailyLimit) {
      return { available: false, reason: 'DAILY_LIMIT', retryAt: nextUtcDay(now) };
    }
    return { available: true };
  }

  async reserve(now: Date): Promise<LlmQuotaReservation> {
    const quotaDate = utcDayStart(now);

    return this.client.$transaction(async transaction => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "LlmProviderQuota"
          ("provider", "model", "quotaDate", "reservedRequests", "pausedUntil", "updatedAt")
        VALUES (${this.provider}, ${this.model}, ${quotaDate}, 0, NULL, ${now})
        ON CONFLICT ("provider") DO NOTHING
      `);

      const rows = await transaction.$queryRaw<QuotaRow[]>(Prisma.sql`
        SELECT "provider", "model", "quotaDate", "reservedRequests", "pausedUntil"
        FROM "LlmProviderQuota"
        WHERE "provider" = ${this.provider}
        FOR UPDATE
      `);
      const state = rows[0];
      if (!state) throw new Error('LLM provider quota state was not created');

      if (state.pausedUntil && state.pausedUntil > now) {
        return { reserved: false, reason: 'PROVIDER_PAUSE', retryAt: state.pausedUntil };
      }

      const sameDay = state.quotaDate.getTime() === quotaDate.getTime();
      const currentCount = sameDay ? state.reservedRequests : 0;
      if (currentCount >= this.dailyLimit) {
        return { reserved: false, reason: 'DAILY_LIMIT', retryAt: nextUtcDay(now) };
      }

      const reservedRequests = currentCount + 1;
      await transaction.llmProviderQuota.update({
        where: { provider: this.provider },
        data: {
          model: this.model,
          quotaDate,
          reservedRequests,
          pausedUntil: state.pausedUntil && state.pausedUntil > now ? state.pausedUntil : null,
        },
      });

      return { reserved: true, reservedRequests };
    });
  }

  async pauseUntil(until: Date, now: Date): Promise<void> {
    const quotaDate = utcDayStart(now);

    await this.client.$transaction(async transaction => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "LlmProviderQuota"
          ("provider", "model", "quotaDate", "reservedRequests", "pausedUntil", "updatedAt")
        VALUES (${this.provider}, ${this.model}, ${quotaDate}, 0, ${until}, ${now})
        ON CONFLICT ("provider") DO NOTHING
      `);
      const rows = await transaction.$queryRaw<Pick<QuotaRow, 'pausedUntil'>[]>(Prisma.sql`
        SELECT "pausedUntil"
        FROM "LlmProviderQuota"
        WHERE "provider" = ${this.provider}
        FOR UPDATE
      `);
      const currentPause = rows[0]?.pausedUntil;
      if (!currentPause || currentPause < until) {
        await transaction.llmProviderQuota.update({
          where: { provider: this.provider },
          data: { model: this.model, pausedUntil: until },
        });
      }
    });
  }
}
