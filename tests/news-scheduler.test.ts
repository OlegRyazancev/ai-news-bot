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

  it('allows a later cycle after the article handler fails', async () => {
    const collector = {
      collect: vi.fn().mockResolvedValue(emptyReport),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const onArticles = vi
      .fn()
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValueOnce(undefined);
    const runner = new NewsCollectionRunner(collector, logger, onArticles);

    await expect(runner.run('startup')).resolves.toBeNull();
    await expect(runner.run('scheduled')).resolves.toEqual(emptyReport);

    expect(collector.collect).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('News collection cycle failed', {
      trigger: 'startup',
      error: 'Database unavailable',
    });
  });
});
