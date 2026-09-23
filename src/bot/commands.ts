import type { CommandContext } from 'grammy';
import type { BotContext } from './index';
import { prisma } from '../db/client';
import { NewsArticleStore } from '../news/article-store';
import { formatLatestArticles, LATEST_ARTICLE_LIMIT } from '../news/latest';
import { logger } from '../utils/logger';

const articleStore = new NewsArticleStore(prisma.newsArticle);

export async function startCommand(ctx: CommandContext<BotContext>) {
  const user = ctx.from;
  if (!user) return;

  logger.info('User started the bot', { userId: user.id, username: user.username });

  const userData = {
    username: user.username ?? null,
    firstName: user.first_name,
    lastName: user.last_name ?? null,
    languageCode: user.language_code ?? null,
    isActive: true,
  };

  await prisma.user.upsert({
    where: { telegramId: BigInt(user.id) },
    create: {
      telegramId: BigInt(user.id),
      ...userData,
      preferences: { create: {} },
    },
    update: {
      ...userData,
      preferences: {
        upsert: {
          create: {},
          update: {},
        },
      },
    },
  });

  const welcomeMessage = `
🤖 <b>Welcome to AI News Bot!</b>

I'll keep you updated with the latest AI news and developments.

<b>Available commands:</b>
/start - Show this welcome message
/help - Show help information
/settings - Configure your preferences
/subscribe - Manage your topic subscriptions
/digest - Configure daily digest
/latest - Get the latest AI news

<b>Getting started:</b>
Use /subscribe to choose topics you're interested in, then I'll send you relevant news!
  `.trim();

  await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
}

export async function helpCommand(ctx: CommandContext<BotContext>) {
  const helpMessage = `
<b>🤖 AI News Bot - Help</b>

<b>Commands:</b>
/start - Start the bot and see welcome message
/help - Show this help message
/settings - Configure your notification preferences
/subscribe - Subscribe to AI topics (LLM, Computer Vision, Robotics, etc.)
/unsubscribe - Unsubscribe from topics
/digest - Configure daily digest settings
/latest - Get the latest AI news articles
/status - Check your subscription status

<b>Features:</b>
• Personalized AI news based on your interests
• Daily digest at your preferred time
• Multiple language support
• Relevance scoring for articles

<b>Need help?</b>
Contact the developer or check the documentation.
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'HTML' });
}

export async function settingsCommand(ctx: CommandContext<BotContext>) {
  const settingsMessage = `
<b>⚙️ Settings</b>

Configure your notification preferences:

• <b>Receive News</b> - Get real-time news notifications
• <b>Daily Digest</b> - Receive a summary once per day
• <b>Digest Time</b> - Set when to receive daily digest
• <b>Timezone</b> - Your local timezone
• <b>Min Relevance</b> - Minimum relevance score (0.0-1.0)
• <b>Max News/Day</b> - Maximum articles per day

<i>Settings management coming soon...</i>
  `.trim();

  await ctx.reply(settingsMessage, { parse_mode: 'HTML' });
}

export async function latestCommand(ctx: CommandContext<BotContext>) {
  try {
    const articles = await articleStore.findLatest({ limit: LATEST_ARTICLE_LIMIT });
    await ctx.reply(formatLatestArticles(articles), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    logger.error('Failed to load latest news articles', {
      userId: ctx.from?.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    await ctx.reply('⚠️ Unable to load the latest news right now. Please try again later.');
  }
}
