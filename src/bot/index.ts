import { Bot, session } from 'grammy';
import type { Context, SessionFlavor } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import type { ConversationFlavor, createConversation } from '@grammyjs/conversations';
import { env } from '../utils/config';
import { logger } from '../utils/logger';
import { startCommand, helpCommand, settingsCommand, latestCommand } from './commands';

// Session data type
export interface SessionData {}

// Extend context with session and conversation support
export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
export type BotConversation = ReturnType<typeof createConversation<BotContext>>;

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // Middleware
  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());

  // Error handler
  bot.catch((err) => {
    logger.error('Bot error', { error: err.error, ctx: err.ctx });
  });

  // Commands
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('settings', settingsCommand);
  bot.command('latest', latestCommand);

  // Handle unknown commands
  bot.on('message:text', async (ctx) => {
    await ctx.reply(
      '🤔 I don\'t understand that command. Use /help to see available commands.'
    );
  });

  return bot;
}