import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { LlmProcessingLogger, LlmProcessingTrigger, LlmProcessor } from './processor';

type ScheduledTrigger = Exclude<LlmProcessingTrigger, 'targeted'>;

export async function runLlmProcessorSafely(
  processor: Pick<LlmProcessor, 'run'>,
  logger: LlmProcessingLogger,
  trigger: ScheduledTrigger
): Promise<void> {
  try {
    await processor.run(trigger);
  } catch (error) {
    logger.error('Unhandled LLM processor execution error was isolated', {
      trigger,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

export class LlmProcessingScheduler {
  private readonly task: ScheduledTask;
  private started = false;

  constructor(
    private readonly processor: Pick<LlmProcessor, 'run' | 'waitForIdle'>,
    cronExpression: string,
    private readonly logger: LlmProcessingLogger
  ) {
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid LLM processing cron expression');
    }

    this.task = cron.createTask(
      cronExpression,
      () => runLlmProcessorSafely(this.processor, this.logger, 'scheduled'),
      {
        name: 'llm-processing',
        noOverlap: true,
        unref: true,
      }
    );
  }

  async start(runOnStartup: boolean): Promise<boolean> {
    if (this.started) return true;

    try {
      await this.task.start();
      this.started = true;
    } catch (error) {
      this.logger.error('LLM processing scheduler failed to start and was disabled', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return false;
    }

    if (runOnStartup) {
      void runLlmProcessorSafely(this.processor, this.logger, 'startup');
    }
    return true;
  }

  async stop(): Promise<void> {
    if (this.started) {
      try {
        await this.task.destroy();
      } catch (error) {
        this.logger.error('LLM processing scheduler task failed to stop cleanly', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      } finally {
        this.started = false;
      }
    }

    try {
      await this.processor.waitForIdle();
    } catch (error) {
      this.logger.error('LLM processor shutdown wait failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}
