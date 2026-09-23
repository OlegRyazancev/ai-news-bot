# CURRENT_STATE.md

## Текущая фаза
**Pre-MVP / LLM Processing Planning** — Этап 3 завершён: persistence, insert-only дедупликация и `/latest` подтверждены автоматическими, runtime- и пользовательскими проверками. Следующий этап — LLM-обработка.

## Статус проверки

| Категория                    | Статус             | Примечания                                                                                      |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| TypeScript Build             | ✅ Verified         | `npm run build` проходит                                                                        |
| ESLint                       | ✅ Verified         | `npm run lint` проходит                                                                         |
| Prisma Client Generation     | ✅ Verified         | `npx prisma generate` проходит                                                                  |
| Database Connection          | ✅ Verified         | PostgreSQL запущен, `db push` выполнен, схема синхронизирована                                  |
| Database Migrations          | ❌ Not Created      | `prisma migrate` не запускался (использовался `db push`)                                        |
| Bot Startup (polling)        | ✅ Runtime-Verified | `npm run dev` дошёл до polling; авторизация Telegram API через `getMe` успешна                  |
| Telegram Commands            | ✅ Runtime-Verified | `/start`, `/help`, `/settings`, `/latest`, fallback и повторный запуск проверены пользователем  |
| BOT_TOKEN Usage              | ✅ Verified         | Токен перевыпущен; финальная runtime-проверка выполнена с новым токеном                         |
| User Persistence             | ✅ Runtime-Verified | Первый `/start` создаёт User + UserPreferences, повторный вызов не создаёт дубли                |
| News Collection              | ✅ Runtime-Verified | Агент и пользователь проверили все 8 RSS/Atom-фидов и нормализованные статьи                    |
| Collection Scheduler         | ✅ Runtime-Verified | Startup и cron-циклы проверены вместе с Telegram polling; graceful shutdown подтверждён         |
| Article Persistence          | ✅ Runtime-Verified | Реальный batch создал записи в PostgreSQL; повторные URL пропущены без изменения данных         |
| `/latest` with Database Data | ✅ Runtime-Verified | Реальные статьи, ссылки, порядок и очистка Markdown-маркеров проверены пользователем в Telegram |
| Docker Build                 | ❌ Not Tested       | Docker Engine работает, образ бота не собирался                                                 |
| Tests                        | ✅ Verified         | 5 test files, 18 unit tests проходят                                                            |

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
- Реестр из 8 согласованных официальных и независимых RSS/Atom-источников
- RSS/Atom fetching с timeout, нормализацией и изоляцией ошибок источников
- Конфигурируемый `node-cron` scheduler, startup-run и защита от перекрытия циклов
- Unit-тесты нормализации, частичного отказа и overlap guard
- Prisma-backed `NewsArticleStore` с batch insert и insert-only дедупликацией по URL
- Агрегированная статистика persistence и безопасная обработка ошибки БД
- `/latest` на 10 последних статьях PostgreSQL с HTML-экранированием и ограничением размера сообщения
- Очистка внешних заголовков от обрамляющих Markdown-маркеров при нормализации и отображении
- Unit-тесты persistence, повторов, latest query, форматирования и recovery после ошибки handler

## Не реализовано (Схема есть, кода нет)

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
- Нет интеграционных тестов Telegram и PostgreSQL

## Последняя выполненная работа
Этап 3 «Хранение и дедупликация» завершён после успешной ручной перепроверки исправленного `/latest`.

## Следующие рекомендуемые шаги (NOW)
1. Выбрать LLM-провайдера для этапа 4
2. Провести анализ и создать checklist этапа 4 «LLM-обработка»
3. Спланировать суммаризацию, оценку важности и тематическую классификацию

## Последние успешные команды
```
npm run build     ✅
npm run lint      ✅
npm run test      ✅ 18 tests
npx prisma generate   ✅
npx prisma db push    ✅
npm run dev           ✅ polling startup
Telegram API getMe    ✅
Prisma SELECT 1       ✅
RSS/Atom collection   ✅ 8/8 sources
node-cron collection  ✅ startup + scheduled cycles
Article persistence   ✅ real PostgreSQL, insert + duplicate cycle
Latest article query  ✅ 10 ordered records, bounded Telegram message
```
