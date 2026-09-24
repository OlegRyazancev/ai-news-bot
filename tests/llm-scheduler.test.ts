import { describe, expect, it, vi } from 'vitest';
import { LlmProcessingScheduler } from '../src/llm/scheduler';

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
    const scheduler = new LlmProcessingScheduler(processor as never, '0 0 1 1 *');

    await expect(scheduler.start(true)).resolves.toBeUndefined();
    expect(processor.run).toHaveBeenCalledWith('startup');

    const stopping = scheduler.stop();
    await vi.waitFor(() => expect(processor.waitForIdle).toHaveBeenCalledOnce());
    resolveRun();
    await expect(stopping).resolves.toBeUndefined();
  });
});
