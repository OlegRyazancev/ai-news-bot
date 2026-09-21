# ARCHITECTURE.md

## Стек

| Слой | Технология | Версия | Статус |
|-------|------------|---------|--------|
| Runtime | Node.js | >=20.0.0 | IMPLEMENTED |
| Language | TypeScript | ^5.3.3 | IMPLEMENTED |
| Telegram Framework | grammY | ^1.21.1 | IMPLEMENTED |
| Conversations | @grammyjs/conversations | ^1.1.2 | IMPLEMENTED (unused) |
| Database | PostgreSQL | 16 (Docker) | SCHEMA DEFINED |
| ORM | Prisma | ^5.10.0 | IMPLEMENTED |
| Config Validation | Zod | ^3.22.4 | IMPLEMENTED |
| Environment | dotenv | ^16.4.5 | IMPLEMENTED |
| Dev Runtime | tsx | ^4.7.0 | IMPLEMENTED |
| Linting | ESLint + TypeScript ESLint | ^8.56.0 / ^7.0.0 | IMPLEMENTED |
| Testing | Vitest | ^1.2.0 | CONFIGURED (0 tests) |
| Containerization | Docker / Docker Compose | — | IMPLEMENTED |

## Структура проекта

```
ai-news-bot/
├── prisma/
│   └── schema.prisma          # Схема БД (5 моделей)
├── src/
│   ├── bot/                   # Логика Telegram-бота
│   │   ├── index.ts           # Фабрика бота, middleware, регистрация команд
│   │   └── commands.ts        # Обработчики команд (/start, /help, /settings, /latest)
│   ├── db/
│   │   └── client.ts          # PrismaClient singleton с dev-логированием
│   ├── utils/
│   │   ├── config.ts          # Zod-валидированная конфигурация окружения (кэшированная)
│   │   └── logger.ts          # Уровневый консольный логгер
│   └── index.ts               # Точка входа, graceful shutdown
├── Dockerfile                 # Multi-stage: deps → builder → runner
├── docker-compose.yml         # PostgreSQL + бот сервисы
└── Config files               # package.json, tsconfig, .eslintrc, .gitignore
```

## Зависимости компонентов

```
src/index.ts
    └── createBot() → src/bot/index.ts
        ├── session middleware (grammY)
        ├── conversations middleware (@grammyjs/conversations)
        ├── error handler → logger
        ├── command handlers → src/bot/commands.ts
        │   ├── logger
        │   └── Prisma Client → User + UserPreferences upsert
        └── env config → src/utils/config.ts
            └── zod schema validation
src/db/client.ts
    └── @prisma/client (singleton)
        └── DATABASE_URL from env
```

## Схема БД (Prisma)

| Модель | Назначение | Статус |
|-------|---------|--------|
| `User` | Профиль пользователя Telegram | `/start` UPSERT (runtime-verified) |
| `UserPreferences` | Настройки уведомлений | `/start` CREATE IF MISSING (runtime-verified) |
| `Subscription` | Тематические подписки пользователя | DEFINED (unused) |
| `NewsArticle` | Собранные новостные статьи | DEFINED (unused) |
| `NewsDigest` | История ежедневных дайджестов | DEFINED (unused) |

**Key Relations:** User 1:1 Preferences, User 1:N Subscriptions, User 1:N Digests, Digests хранят массив ID статей.

## Внешние интеграции

| Интеграция | Библиотека | Статус |
|-------------|---------|--------|
| Telegram Bot API | grammY | CONFIGURED (polling) |
| PostgreSQL | Prisma Client | SCHEMA APPLIED; `/start` INTEGRATION RUNTIME-VERIFIED |
| LLM (суммаризация, классификация) | — | PLANNED |
| News Sources (RSS, APIs) | — | PLANNED |
| Scheduler (cron) | — | PLANNED |

## Персистентность

- **Primary**: PostgreSQL через Prisma ORM
- **Connection**: `DATABASE_URL` env var (Zod принимает только `postgresql://` / `postgres://`)
- **Migrations**: Не созданы
- **Dev Logging**: Query/error/warn в development, только error в production

## Фоновые задачи / Шедулеры

**PLANNED** — Библиотека шедулера не установлена. Требуется для:
- Доставки ежедневного дайджеста
- Мониторинга breaking news
- Интервалов сбора новостей

## LLM Integration

**PLANNED** — LLM-клиент не настроен. Требуется для:
- Суммаризации статей
- Классификации важности
- Тематической категоризации
- Генерации закреплённой шпаргалки
- Будущего Q&A по истории

## Telegram Integration

- **Mode**: Long polling (`bot.start()`)
- **Middleware**: Session (пустой `SessionData`), Conversations (загружен, не используется)
- **Error Handling**: Global catch → logger.error с безопасными метаданными без полного grammY context
- **Unknown Commands**: Fallback-ответ с подсказкой help
- **Webhook**: Не реализован

## Потоки данных

### Current (Implemented)
```
User sends /command
       │
       ▼
Telegram → grammY → BotContext
       │
       ▼
Middleware: session → conversations → error handler
       │
       ▼
Command Handler (startCommand, helpCommand, etc.)
       │
       ├── logger.info/warn/error
       ├── /start → Prisma upsert → PostgreSQL
       └── ctx.reply() → Telegram
```

### Planned (News Collection)
```
Cron Scheduler → News Collector → RSS/API Sources
                      │
                      ▼
              Deduplication (URL)
                      │
                      ▼
              Importance Scoring
                      │
                      ▼
              LLM Summarization
                      │
                      ▼
              Save to NewsArticle
```

### Planned (Digest Delivery)
```
Cron Scheduler → Fetch recent articles → LLM Digest Generation
                      │
                      ▼
              Save to NewsDigest
                      │
                      ▼
              Telegram sendMessage (pinned or new)
```

## Запуск приложения

### Development
```bash
npm install
cp .env.example .env   # Add BOT_TOKEN, DATABASE_URL
docker-compose up -d postgres   # Or local PostgreSQL
npx prisma generate
npx prisma db push
npm run dev              # tsx watch src/index.ts
```

### Production (Docker)
```bash
cp .env.example .env   # Production values
docker-compose up -d --build
docker-compose logs -f bot
```

### Команды
| Команда | Назначение |
|---------|---------|
| `npm run dev` | Hot-reload development |
| `npm run build` | TypeScript → dist/ |
| `npm run start` | Run compiled JS |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Push schema to DB |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | ESLint check |
| `npm run test` | Vitest (no tests yet) |

## UNKNOWN / Undetermined

- LLM Provider (OpenAI, Anthropic, local, etc.)
- News Sources (конкретные RSS-фиды, API)
- Scheduler Library (`node-cron`, `bull`, in-bot `setInterval`)
- Webhook deployment configuration
- Production logging aggregation
- Health check endpoints
- Rate limiting strategy
- Multi-instance deployment (session store)
- Backup/restore strategy for PostgreSQL
- Article retention policy
- Pinned message update mechanism (editMessageText vs delete+send)
- Cheat-sheet content source and update frequency
