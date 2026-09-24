# ARCHITECTURE.md

## Стек

| Слой | Технология | Версия | Статус |
|-------|------------|---------|--------|
| Runtime | Node.js | >=20.0.0 | IMPLEMENTED |
| Language | TypeScript | ^5.3.3 | IMPLEMENTED |
| Telegram Framework | grammY | ^1.21.1 | IMPLEMENTED; RUNTIME-VERIFIED |
| Conversations | @grammyjs/conversations | ^1.1.2 | IMPLEMENTED (unused) |
| Database | PostgreSQL | 16 (Docker) | IMPLEMENTED; RUNTIME-VERIFIED |
| ORM | Prisma | ^5.10.0 | IMPLEMENTED |
| Config Validation | Zod | ^3.22.4 | IMPLEMENTED |
| Environment | dotenv | ^16.4.5 | IMPLEMENTED |
| Dev Runtime | tsx | ^4.7.0 | IMPLEMENTED |
| Linting | ESLint + TypeScript ESLint | ^8.56.0 / ^7.0.0 | IMPLEMENTED |
| Testing | Vitest | ^1.2.0 | IMPLEMENTED (35 unit + 6 PostgreSQL integration tests) |
| Containerization | Docker / Docker Compose | — | IMPLEMENTED |
| Feed Parsing | rss-parser | ^3.13.0 | IMPLEMENTED; RUNTIME-VERIFIED |
| Scheduler | node-cron | ^4.6.0 | IMPLEMENTED; RUNTIME-VERIFIED |
| LLM SDK | `@google/genai` | 2.24.0 (exact pin; Node.js 20 compatible) | IMPLEMENTED; GEMINI RUNTIME NOT YET VERIFIED |

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
│   ├── llm/                    # Provider contract, Gemini/Mock, DB repository, processor и scheduler
│   ├── news/                   # Сбор, нормализация, persistence, latest formatting и scheduler
│   ├── scripts/                # Targeted обработка одной статьи
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
src/index.ts
    └── NewsCollectionScheduler → node-cron
        └── NewsCollectionRunner
            ├── NewsCollector
            │   └── RssFeedReader → 8 RSS/Atom sources
            └── NewsArticleStore → Prisma Client → PostgreSQL
src/bot/commands.ts
    └── /latest → NewsArticleStore → Prisma Client → PostgreSQL
src/index.ts
    └── LlmProcessingScheduler (independent cron)
        └── LlmProcessor
            ├── PrismaLlmArticleRepository → atomic claim / persisted retry
            └── LlmProvider
                ├── MockProvider
                └── GeminiProvider → @google/genai
```

## Схема БД (Prisma)

| Модель | Назначение | Статус |
|-------|---------|--------|
| `User` | Профиль пользователя Telegram | `/start` UPSERT (runtime-verified) |
| `UserPreferences` | Настройки уведомлений | `/start` CREATE IF MISSING (runtime-verified) |
| `Subscription` | Тематические подписки пользователя | DEFINED (unused) |
| `NewsArticle` | Собранные статьи + dedicated LLM enrichment/state metadata | INSERT-ONLY RSS + LLM SCHEMA APPLIED; MOCK/POSTGRESQL INTEGRATION-VERIFIED |
| `NewsDigest` | История ежедневных дайджестов | DEFINED (unused) |

**Key Relations:** User 1:1 Preferences, User 1:N Subscriptions, User 1:N Digests, Digests хранят массив ID статей.

## Внешние интеграции

| Интеграция | Библиотека | Статус |
|-------------|---------|--------|
| Telegram Bot API | grammY | RUNTIME-VERIFIED (polling) |
| PostgreSQL | Prisma Client | SCHEMA APPLIED; USER AND ARTICLE PERSISTENCE RUNTIME-VERIFIED |
| LLM (суммаризация, классификация) | Provider-independent `LlmProvider`; `@google/genai` + Mock | IMPLEMENTED; MOCK/DB VERIFIED, GEMINI RUNTIME PENDING |
| News Sources | Curated RSS mix (8 feeds) | RUNTIME-VERIFIED |
| Scheduler | `node-cron` (embedded) | RUNTIME-VERIFIED |

## Персистентность

- **Primary**: PostgreSQL через Prisma ORM
- **Connection**: `DATABASE_URL` env var (Zod принимает только `postgresql://` / `postgres://`)
- **Article writes**: Batch `createMany` с `skipDuplicates` и уникальным `url`; повторные записи не обновляются
- **Latest reads**: До 10 статей по `publishedAt DESC`, затем `id DESC`
- **LLM claims**: PostgreSQL transaction с `FOR UPDATE SKIP LOCKED`, claim token и условными final writes
- **LLM retries**: `FAILED` + persisted `llmNextRetryAt`, exponential backoff, bounded attempts и stale `PROCESSING` recovery
- **Source preservation**: RSS `summary`/`topics` и `relevance` не перезаписываются LLM-результатами
- **Migrations**: Не созданы
- **Dev Logging**: Query/error/warn в development, только error в production

## Фоновые задачи / Шедулеры

**IMPLEMENTED** — Два независимых встроенных `node-cron` scheduler: RSS collection (по умолчанию каждые 30 минут) и LLM processing (по умолчанию каждые 2 минуты, выключен конфигурацией). Медленный LLM cycle не ожидается collection handler или Telegram polling. Оба scheduler имеют local overlap guard; LLM дополнительно защищён DB claim. Будущие задачи:
- Доставка ежедневного дайджеста
- Мониторинг breaking news

## LLM Integration

**IMPLEMENTED; GEMINI RUNTIME PENDING** — provider-independent `LlmProvider`, `GeminiProvider` через официальный `@google/genai` и `MockProvider`. Active provider/model задаются env. Gemini запрашивает structured JSON, результат повторно проверяется Zod; RSS помещается в явно недоверенную data boundary. Processor сохраняет dedicated summary/importance/topics, provider/model/status/attempt/timestamp/token metadata. Timeout, 429/`Retry-After`, временные и permanent auth/config errors классифицируются без вывода сырого ответа. Mock + PostgreSQL подтверждены автоматическими integration tests; реальный Gemini API ещё не запускался.
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

### Current (News Collection)
```
node-cron → NewsCollectionRunner → NewsCollector → 8 RSS/Atom Sources
                   │                    │
                   │                    ├── timeout + source error isolation
                   │                    └── normalized articles
                   ▼
          NewsArticleStore → PostgreSQL
                   │
                   └── insert-only URL deduplication + aggregate statistics
```

### Current (Stage 4 LLM Enrichment)
```
RSS/Atom collection → insert-only NewsArticle persistence
                                      │
                                      ▼
                         Select pending/stale articles
                                      │
                                      ▼
                  LlmProvider → GeminiProvider / MockProvider
                                      │
                                      ▼
                     Structured JSON → Zod validation
                                      │
                                      ▼
             Dedicated enrichment + processing/token metadata
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
| `npm run test` | Vitest unit tests |
| `npm run test:integration` | PostgreSQL integration tests |
| `npm run llm:process-article -- <id> [--reprocess]` | Targeted LLM processing одной явно выбранной статьи |

## UNKNOWN / Undetermined

- Webhook deployment configuration
- Production logging aggregation
- Health check endpoints
- Rate limiting strategy
- Multi-instance deployment (session store)
- Backup/restore strategy for PostgreSQL
- Article retention policy
- Pinned message update mechanism (editMessageText vs delete+send)
- Cheat-sheet content source and update frequency
