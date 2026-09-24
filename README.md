# AI News Bot

Персональный Telegram-бот для агрегации и доставки новостей об AI/LLM.

## Стек

- **TypeScript** + **Node.js** (v20+)
- **PostgreSQL** + **Prisma ORM**
- **grammY** - Telegram Bot Framework
- **rss-parser** + **node-cron** - Сбор RSS/Atom и планирование
- **Google Gen AI SDK** - Provider-independent LLM enrichment с Gemini и Mock adapters
- **Vitest** - Unit-тесты
- **Docker Compose** - Оркестрация контейнеров

## Структура проекта

```
ai-news-bot/
├── prisma/
│   └── schema.prisma          # Схема базы данных
├── src/
│   ├── bot/                   # Логика бота
│   │   ├── index.ts           # Настройка бота и middleware
│   │   └── commands.ts        # Обработчики команд
│   ├── db/
│   │   └── client.ts          # Prisma клиент
│   ├── llm/                    # Providers, processor, PostgreSQL claims и scheduler
│   ├── news/                   # Сбор, нормализация, хранение и форматирование новостей
│   ├── scripts/                # Targeted operational scripts
│   ├── utils/
│   │   ├── config.ts          # Валидация окружения
│   │   └── logger.ts          # Утилита логирования
│   └── index.ts               # Точка входа
├── tests/                      # Unit-тесты news pipeline
├── docs/                       # Архитектура, roadmap, состояние и checklists
├── Dockerfile                 # Multi-stage Docker сборка
├── docker-compose.yml         # Оркестрация сервисов
├── package.json
└── tsconfig.json
```

## Начало работы

### Предварительные требования

- Node.js 20+
- PostgreSQL (или Docker)
- Telegram Bot Token (от [@BotFather](https://t.me/BotFather))

### Локальная разработка

1. **Клонируй и установи зависимости:**
   ```bash
   cd ai-news-bot
   npm install
   ```

2. **Настрой окружение:**
   ```bash
   cp .env.example .env
   # Отредактируй .env: добавь BOT_TOKEN и DATABASE_URL
   ```

3. **Настрой базу данных:**
   ```bash
   # С Docker
   docker-compose up -d postgres

   # Или локальный PostgreSQL
   npx prisma db push
   ```

4. **Сгенерируй Prisma клиент:**
   ```bash
   npx prisma generate
   ```

5. **Запусти в режиме разработки:**
   ```bash
   npm run dev
   ```

### Docker деплой

> Конфигурация Docker реализована, но production image и совместный container runtime пока не прошли полную проверку; актуальный статус указан в [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md).

1. **Настрой окружение:**
   ```bash
   cp .env.example .env
   # Отредактируй .env: продакшн значения
   ```

2. **Собери и запусти:**
   ```bash
   docker-compose up -d --build
   ```

3. **Смотри логи:**
   ```bash
   docker-compose logs -f bot
   ```

## Telegram-команды

### Реализовано (Runtime-Verified)

| Команда | Описание |
|---------|-------------|
| `/start` | Приветственное сообщение и введение в бота |
| `/help` | Показать справку |
| `/settings` | Настройка предпочтений уведомлений (заглушка) |
| `/latest` | Получить последние сохранённые новости из PostgreSQL |

### Планируется (ещё не реализовано)

| Команда | Описание |
|---------|-------------|
| `/subscribe` | Подписаться на темы AI |
| `/unsubscribe` | Отписаться от тем |
| `/digest` | Настроить ежедневный дайджест |
| `/status` | Проверить статус подписок |
| `/ask` | Запросить накопленную историю новостей |

## Схема базы данных

- **User** - Информация о пользователе Telegram
- **UserPreferences** - Настройки уведомлений на пользователя
- **Subscription** - Тематические подписки пользователя
- **NewsArticle** - Собранные статьи и отдельные LLM enrichment/processing-поля
- **NewsDigest** - История ежедневных дайджестов

## Автоматические сервисы

- Сбор и нормализация новостей из 8 RSS/Atom-источников.
- Startup-run и регулярный запуск через `node-cron`.
- Insert-only сохранение статей в PostgreSQL с пропуском повторных URL.
- Независимый LLM processor: атомарно получает сохранённые статьи из PostgreSQL, не блокируя RSS collection и Telegram polling.
- Mock provider для разработки и тестов; Gemini adapter реализован, но реальная API-проверка этапа 4 ещё ожидается.
- Persisted retries с exponential backoff, `Retry-After`, stale claim recovery и ограничением попыток.
- Агрегированная статистика сбора и persistence без вывода полного содержимого статей.

## Команды разработки

```bash
npm run dev          # Запуск с hot reload (tsx watch)
npm run build        # Компиляция TypeScript
npm run start        # Запуск скомпилированного JS
npm run db:generate  # Генерация Prisma клиента
npm run db:push      # Применение схемы к БД
npm run db:studio    # Открыть Prisma Studio
npm run lint         # Запуск ESLint
npm run test         # Запуск тестов
npm run test:integration # PostgreSQL integration tests (требуется актуальная локальная схема)
npm run llm:process-article -- <id> [--reprocess] # Явная обработка одной статьи
```

## Переменные окружения

| Переменная | Описание | Обязательна |
|----------|-------------|----------|
| `BOT_TOKEN` | Токен бота от BotFather | Да |
| `DATABASE_URL` | Строка подключения к PostgreSQL | Да |
| `DB_USER` | Пользователь PostgreSQL для Docker Compose | Нет |
| `DB_PASSWORD` | Пароль PostgreSQL для Docker Compose | Нет |
| `DB_NAME` | Имя базы PostgreSQL для Docker Compose | Нет |
| `NODE_ENV` | Окружение (development/production) | Нет |
| `LOG_LEVEL` | Уровень логов (debug/info/warn/error) | Нет |
| `NEWS_COLLECTION_CRON` | Cron-расписание сбора (по умолчанию каждые 30 минут) | Нет |
| `NEWS_COLLECTION_RUN_ON_STARTUP` | Запускать сбор при старте приложения | Нет |
| `NEWS_FETCH_TIMEOUT_MS` | Timeout одного RSS/Atom-запроса | Нет |
| `NEWS_MAX_ITEMS_PER_SOURCE` | Максимум элементов из одного источника за цикл | Нет |
| `LLM_PROCESSING_ENABLED` | Включить независимый LLM processor | Нет (`false`) |
| `LLM_PROVIDER` | Активный provider: `mock` или `gemini` | Нет (`mock`) |
| `LLM_MODEL` | Модель реального provider | Нет (`gemini-2.5-flash-lite`) |
| `GEMINI_API_KEY` | Server-side key из Google AI Studio; обязателен только для включённого Gemini | Условно |
| `LLM_PROCESSING_CRON` | Отдельное расписание enrichment | Нет (`*/2 * * * *`) |
| `LLM_PROCESSING_RUN_ON_STARTUP` | Запуск processor при старте | Нет (`true`) |
| `LLM_PROCESSING_BATCH_SIZE` | Максимум статей за цикл | Нет (`5`) |
| `LLM_REQUEST_TIMEOUT_MS` | Timeout одного provider request | Нет (`30000`) |
| `LLM_MAX_ATTEMPTS` | Максимум внешних попыток на статью | Нет (`3`) |
| `LLM_RETRY_BASE_DELAY_MS` | Начальная задержка exponential backoff | Нет (`60000`) |
| `LLM_RETRY_MAX_DELAY_MS` | Максимальная отложенная retry-задержка | Нет (`21600000`) |
| `LLM_STALE_PROCESSING_MS` | Возраст claim для stale recovery | Нет (`600000`) |

## Настройка Gemini

1. Создай API key в [Google AI Studio](https://aistudio.google.com/apikey).
2. Не публикуй key и добавь его только в локальный `.env`:
   ```dotenv
   LLM_PROVIDER=gemini
   LLM_MODEL=gemini-2.5-flash-lite
   GEMINI_API_KEY=your_private_key
   ```
3. Сначала оставь `LLM_PROCESSING_ENABLED=false` и примени схему: `npx prisma db push`.
4. Для безопасной проверки выбери конкретный article ID и выполни:
   ```bash
   npm run llm:process-article -- <article-id>
   ```
   Для намеренной повторной обработки только этой завершённой статьи добавь `--reprocess`.
5. После проверки можно включить фоновый processor: `LLM_PROCESSING_ENABLED=true`.

RSS title/summary/content считаются недоверенными данными. API key не включается в prompts, логи или test fixtures.

## Лицензия

MIT
