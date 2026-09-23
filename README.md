# AI News Bot

Персональный Telegram-бот для агрегации и доставки новостей об AI/LLM.

## Стек

- **TypeScript** + **Node.js** (v20+)
- **PostgreSQL** + **Prisma ORM**
- **grammY** - Telegram Bot Framework
- **rss-parser** + **node-cron** - Сбор RSS/Atom и планирование
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
│   ├── news/                   # Сбор, нормализация, хранение и форматирование новостей
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
- **NewsArticle** - Собранные статьи с insert-only дедупликацией по уникальному URL
- **NewsDigest** - История ежедневных дайджестов

## Автоматические сервисы

- Сбор и нормализация новостей из 8 RSS/Atom-источников.
- Startup-run и регулярный запуск через `node-cron`.
- Insert-only сохранение статей в PostgreSQL с пропуском повторных URL.
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

## Лицензия

MIT
