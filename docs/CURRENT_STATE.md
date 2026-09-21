# CURRENT_STATE.md

## Текущая фаза
**Pre-MVP / News Collection** — Этап Telegram runtime завершён: polling, базовые команды и User + Preferences upsert проверены. Текущий фокус — сбор новостей из доверенных источников.

## Статус проверки

| Категория | Статус | Примечания |
|----------|--------|-------|
| TypeScript Build | ✅ Verified | `npm run build` проходит |
| ESLint | ✅ Verified | `npm run lint` проходит |
| Prisma Client Generation | ✅ Verified | `npx prisma generate` проходит |
| Database Connection | ✅ Verified | PostgreSQL запущен, `db push` выполнен, схема синхронизирована |
| Database Migrations | ❌ Not Created | `prisma migrate` не запускался (использовался `db push`) |
| Bot Startup (polling) | ✅ Runtime-Verified | `npm run dev` дошёл до polling; авторизация Telegram API через `getMe` успешна |
| Telegram Commands | ✅ Runtime-Verified | `/start`, `/help`, `/settings`, `/latest`, fallback и повторный запуск проверены пользователем |
| BOT_TOKEN Usage | ✅ Verified | Токен перевыпущен; финальная runtime-проверка выполнена с новым токеном |
| User Persistence | ✅ Runtime-Verified | Первый `/start` создаёт User + UserPreferences, повторный вызов не создаёт дубли |
| Docker Build | ❌ Not Tested | Docker Engine работает, образ бота не собирался |
| Tests | ❌ None | Vitest настроен, 0 тестов |

## Реализовано (Код есть, Build-Verified)

- Скелет проекта (TypeScript, ESLint, конфиги)
- Prisma схема: 5 моделей (User, UserPreferences, Subscription, NewsArticle, NewsDigest)
- Валидация окружения (Zod) с кэшированным конфигом
- Логгер (уровневый консольный вывод)
- Фабрика бота с session + conversations middleware
- 4 обработчика команд: `/start`, `/help`, `/settings`, `/latest`
- User + UserPreferences upsert при `/start` по уникальному `telegramId`
- Graceful shutdown handlers (SIGINT, SIGTERM)
- Docker multi-stage build + docker-compose (PostgreSQL + бот)

## Не реализовано (Схема есть, кода нет)

- Сервис сбора новостей (RSS/API)
- Логика дедупликации
- Оценка важности
- LLM интеграция (суммаризация, классификация)
- Генерация ежедневного дайджеста + шедулер
- Детекция и доставка breaking news
- Управление закреплённым сообщением-шпаргалкой
- Q&A по истории новостей

## Известные проблемы

- `SessionData` пуст — состояние сессии не используется
- Conversations middleware загружен но не используется
- Webhook mode не реализован
- Тесты не написаны

## Последняя выполненная работа
Этап Telegram runtime завершён: новый токен проверен, все команды и fallback работают, User + UserPreferences upsert подтверждён первым и повторным `/start`.

## Следующие рекомендуемые шаги (NOW)
1. Определить доверенные AI/LLM-источники
2. Реализовать сервис получения и нормализации новостей из RSS/API
3. Проверить получение реальных статей в runtime

## Последние успешные команды
```
npm run build     ✅
npm run lint      ✅
npx prisma generate   ✅
npx prisma db push    ✅
npm run dev           ✅ polling startup
Telegram API getMe    ✅
Prisma SELECT 1       ✅
```
