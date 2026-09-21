import { createBot } from './bot';
import { logger } from './utils/logger';
import { env } from './utils/config';

async function main() {
  logger.info('Starting AI News Bot...', { env: env.NODE_ENV });

  try {
    const bot = createBot();

    // Start the bot
    if (env.NODE_ENV === 'production') {
      // In production, you might want to use webhook
      logger.info('Bot started in production mode (polling)');
      await bot.start();
    } else {
      // In development, use long polling
      logger.info('Bot started in development mode (polling)');
      await bot.start();
    }

    logger.info('Bot is running!');
  } catch (error) {
    logger.error('Failed to start bot', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

void main();