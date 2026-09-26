import { describe, expect, it, vi } from 'vitest';
import { LlmProcessingScheduler, runLlmProcessorSafely } from '../src/llm/scheduler';

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('LlmProcessingScheduler', () => {
  it('starts a startup run without awaiting the LLM cycle and waits during shutdown', async () => {
    let resolveRun!: () => void;
    const activeRun = new Promise<void>(resolve => {
      resolveRun = resolve;
    });
    const processor = {
      run: vi.fn().mockReturnValue(activeRun),
      waitForIdle: vi.fn().mockImplementation(() => activeRun),
    };
    const scheduler = new LlmProcessingScheduler(
      processor as never,
      '0 0 1 1 *',
      logger()
    );

    await expect(scheduler.start(true)).resolves.toBe(true);
    expect(processor.run).toHaveBeenCalledWith('startup');

    const stopping = scheduler.stop();
    await vi.waitFor(() => expect(processor.waitForIdle).toHaveBeenCalledOnce());
    resolveRun();
    await expect(stopping).resolves.toBeUndefined();
  });

  it('isolates rejected startup and scheduled executions', async () => {
    const processor = {
      run: vi.fn().mockRejectedValue(new Error('PostgreSQL unavailable')),
    };
    const testLogger = logger();

    await expect(
      runLlmProcessorSafely(processor as never, testLogger, 'startup')
    ).resolves.toBeUndefined();
    await expect(
      runLlmProcessorSafely(processor as never, testLogger, 'scheduled')
    ).resolves.toBeUndefined();
    expect(testLogger.error).toHaveBeenCalledTimes(2);
    expect(testLogger.error).toHaveBeenLastCalledWith(
      'Unhandled LLM processor execution error was isolated',
      { trigger: 'scheduled', errorName: 'Error' }
    );
  });

  it('disables the LLM scheduler when the cron task fails to start', async () => {
    const processor = { run: vi.fn(), waitForIdle: vi.fn() };
    const testLogger = logger();
    const scheduler = new LlmProcessingScheduler(
      processor as never,
      '0 0 1 1 *',
      testLogger
    );
    const task = (scheduler as unknown as { task: { start(): Promise<void> } }).task;
    vi.spyOn(task, 'start').mockRejectedValue(new Error('scheduler startup failed'));

    await expect(scheduler.start(true)).resolves.toBe(false);
    expect(processor.run).not.toHaveBeenCalled();
    expect(testLogger.error).toHaveBeenCalledWith(
      'LLM processing scheduler failed to start and was disabled',
      { errorName: 'Error' }
    );
  });

  it('logs task destruction and shutdown wait failures without rejecting shutdown', async () => {
    const processor = {
      run: vi.fn(),
      waitForIdle: vi.fn().mockRejectedValue(new Error('database disconnected')),
    };
    const testLogger = logger();
    const scheduler = new LlmProcessingScheduler(
      processor as never,
      '0 0 1 1 *',
      testLogger
    );

    await scheduler.start(false);
    const task = (scheduler as unknown as { task: { destroy(): Promise<void> } }).task;
    vi.spyOn(task, 'destroy').mockRejectedValue(new Error('destroy failed'));

    await expect(scheduler.stop()).resolves.toBeUndefined();
    expect(testLogger.error).toHaveBeenCalledWith(
      'LLM processing scheduler task failed to stop cleanly',
      { errorName: 'Error' }
    );
    expect(testLogger.error).toHaveBeenCalledWith('LLM processor shutdown wait failed', {
      errorName: 'Error',
    });
  });
});
