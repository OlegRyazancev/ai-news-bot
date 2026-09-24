import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { LlmProcessor } from './processor';

export class LlmProcessingScheduler {
  private readonly task: ScheduledTask;
  private started = false;

  constructor(
    private readonly processor: Pick<LlmProcessor, 'run' | 'waitForIdle'>,
    cronExpression: string
  ) {
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid LLM processing cron expression');
    }

    this.task = cron.createTask(
      cronExpression,
      async () => {
        await this.processor.run('scheduled');
      },
      {
        name: 'llm-processing',
        noOverlap: true,
        unref: true,
      }
    );
  }

  async start(runOnStartup: boolean): Promise<void> {
    if (this.started) return;

    await this.task.start();
    this.started = true;

    if (runOnStartup) {
      void this.processor.run('startup');
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    await this.task.destroy();
    this.started = false;
    await this.processor.waitForIdle();
  }
}
