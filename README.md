# AI News Bot

Персональный Telegram-бот для агрегации и доставки новостей об AI/LLM.

## Стек

- **TypeScript** + **Node.js** (v20+)
- **PostgreSQL** + **Prisma ORM**
- **grammY** - Telegram Bot Framework
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
│   ├── utils/
│   │   ├── config.ts          # Валидация окружения
│   │   └── logger.ts          # Утилита логирования
│   └── index.ts               # Точка входа
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

### Реализовано (Build-Verified)

| Команда | Описание |
|---------|-------------|
| `/start` | Приветственное сообщение и введение в бота |
| `/help` | Показать справку |
| `/settings` | Настройка предпочтений уведомлений (заглушка) |
| `/latest` | Получить последние новости об AI (заглушка — нет реальных данных) |

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
- **NewsArticle** - Собранные новостные статьи
- **NewsDigest** - История ежедневных дайджестов

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
| `NODE_ENV` | Окружение (development/production) | Нет |
| `LOG_LEVEL` | Уровень логов (debug/info/warn/error) | Нет |

## Лицензия

MIT