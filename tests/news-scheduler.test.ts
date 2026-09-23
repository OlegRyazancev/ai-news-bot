import { describe, expect, it, vi } from 'vitest';
import { NewsCollectionRunner } from '../src/news/scheduler';
import type { CollectionReport } from '../src/news/types';

const emptyReport: CollectionReport = {
  startedAt: new Date('2026-09-22T10:00:00.000Z'),
  completedAt: new Date('2026-09-22T10:00:01.000Z'),
  articles: [],
  sources: [],
};

describe('NewsCollectionRunner', () => {
  it('skips an overlapping collection cycle', async () => {
    let resolveCollection: ((report: CollectionReport) => void) | undefined;
    const collector = {
      collect: () =>
        new Promise<CollectionReport>(resolve => {
          resolveCollection = resolve;
        }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runner = new NewsCollectionRunner(collector, logger);

    const firstRun = runner.run('startup');
    const overlappingRun = await runner.run('scheduled');

    expect(overlappingRun).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'News collection skipped because a previous cycle is still running',
      { trigger: 'scheduled' }
    );

    resolveCollection?.(emptyReport);
    await expect(firstRun).resolves.toEqual(emptyReport);
  });
});
