# CURRENT_STATE.md

## Текущая фаза
**Pre-MVP / Stage 4 LLM Processing In Progress** — Реальная статья №11 успешно обработана `gemini-3.5-flash-lite`; результаты сохранены, повторный claim `COMPLETED` исключён. Совместные polling, RSS collection, startup/scheduled LLM cycles, `/latest`, дневной budget и graceful shutdown подтверждены пользователем. Остались только отдельные ручные checklist-пункты перед закрытием этапа.

## Статус проверки

| Категория                    | Статус             | Примечания                                                                                      |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| TypeScript Build             | ✅ Verified         | `npm run build` проходит                                                                        |
| ESLint                       | ✅ Verified         | `npm run lint` проходит                                                                         |
| Prisma Client Generation     | ✅ Verified         | `npx prisma generate` проходит                                                                  |
| Database Connection          | ✅ CI-Verified      | Base schema runtime-verified ранее; review schema успешно применена к PostgreSQL service в GitHub Actions |
| Database Migrations          | ❌ Not Created      | `prisma migrate` не запускался (использовался `db push`)                                        |
| Bot Startup (polling)        | ✅ Runtime-Verified | `npm run dev` дошёл до polling; авторизация Telegram API через `getMe` успешна                  |
| Telegram Commands            | ✅ Runtime-Verified | `/start`, `/help`, `/settings`, `/latest`, fallback и повторный запуск проверены пользователем  |
| BOT_TOKEN Usage              | ✅ Verified         | Токен перевыпущен; финальная runtime-проверка выполнена с новым токеном                         |
| User Persistence             | ✅ Runtime-Verified | Первый `/start` создаёт User + UserPreferences, повторный вызов не создаёт дубли                |
| News Collection              | ✅ Runtime-Verified | Агент и пользователь проверили все 8 RSS/Atom-фидов и нормализованные статьи                    |
| Collection Scheduler         | ✅ Runtime-Verified | Startup и cron-циклы проверены вместе с Telegram polling; graceful shutdown подтверждён         |
| Article Persistence          | ✅ Runtime-Verified | Реальный batch создал записи в PostgreSQL; повторные URL пропущены без изменения данных         |
| `/latest` with Database Data | ✅ Runtime-Verified | Реальные статьи, ссылки, порядок и очистка Markdown-маркеров проверены пользователем в Telegram |
| Docker Build                 | ✅ Build-Verified   | `ai-news-bot:stage4` собран; runtime контейнеров с реальными интеграциями ещё не проверен        |
| LLM Provider Layer           | ✅ Build-Verified   | `LlmProvider`, Gemini/Mock, structured JSON + Zod, timeout/error mapping                         |
| LLM PostgreSQL Processing    | ✅ Integration-Verified | Atomic claim, stale recovery, idempotent writes, delayed retry и Mock metadata проверены в PostgreSQL |
| Gemini API                   | ✅ Runtime-Verified | Статья №11 успешно обработана `gemini-3.5-flash-lite`; structured result и persistence подтверждены пользователем |
| Tests                        | ✅ CI-Verified      | 53 unit и 17 PostgreSQL integration tests проходят локально и в GitHub Actions |

## Реализовано (Код есть, Build-Verified)

- Скелет проекта (TypeScript, ESLint, конфиги)
- Prisma схема: 6 моделей (User, UserPreferences, Subscription, NewsArticle, LlmProviderQuota, NewsDigest)
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
- Provider-independent `LlmProvider`, `GeminiProvider` на `@google/genai` 2.24.0 и `MockProvider`
- Structured JSON contract с повторной Zod-валидацией и недоверенной RSS data boundary
- Dedicated LLM summary/importance/topics без изменения RSS `summary`/`topics` и `relevance`
- Раздельные success/attempt provider/model/timestamp/error/token metadata в `NewsArticle`
- Независимый LLM scheduler, PostgreSQL atomic claim, claim token и stale `PROCESSING` recovery
- Bounded attempts, persisted exponential backoff, `Retry-After` и in-process halt на permanent auth/config errors
- Provider-wide persisted pause после HTTP 429 без ограничения `Retry-After` локальным retry maximum
- Атомарный PostgreSQL-backed дневной бюджет реального provider с UTC reset и восстановлением после restart
- Явный `--retry-failed` для конкретного ID после исправления permanent auth/config ошибки
- Изоляция repository/startup/scheduled/shutdown ошибок LLM processor от основного процесса
- Сохранение permanent/retryable FAILED policy при quota race между availability check и atomic reservation
- Best-effort claim release после reserve/startAttempt exceptions без quota refund; при недоступной БД остаётся stale recovery
- Безопасная Gemini-диагностика: `httpStatus`, allowlisted `providerStatus`/`diagnosticCode` без raw message, secrets, headers, request/response или prompt
- Модель по умолчанию `gemini-3.5-flash-lite`; stable model ID, structured outputs и используемый JSON Schema subset подтверждены официальной документацией
- MockProvider acceptance matrix: missing key, configuration recovery, provider unavailable, RSS preservation и targeted isolation
- Targeted processing одной явной статьи через `npm run llm:process-article`
- PostgreSQL integration tests и CI PostgreSQL service

## Не реализовано / не подтверждено

- Отдельное подтверждение Google AI Studio project RPM/TPM/RPD
- Несколько точечных ручных пунктов безопасности/metadata из checklist Stage 4
- Генерация ежедневного дайджеста + шедулер
- Детекция и доставка breaking news
- Управление закреплённым сообщением-шпаргалкой
- Q&A по истории новостей

## Известные проблемы

- `SessionData` пуст — состояние сессии не используется
- Conversations middleware загружен но не используется
- Webhook mode не реализован
- Нет автоматических интеграционных тестов Telegram
- Exactly-once для внешнего LLM API не гарантируется; после неопределённого сбоя запрос может повториться, при этом DB writes защищены claim token

## Последняя выполненная работа
Успешная Gemini 3.5 обработка статьи №11 и совместная работа runtime подтверждены пользователем; финальные edge cases закрыты MockProvider/unit/PostgreSQL tests и успешным GitHub Actions CI.

## Следующие рекомендуемые шаги (NOW)
1. Закрыть оставшиеся точечные ручные пункты checklist Stage 4
2. После явного подтверждения пользователя выполнить отдельный `/stage-close`

## Последние успешные команды
```
npm run build     ✅
npm run lint      ✅
npm run test      ✅ 53 unit tests
npm run test:integration ✅ 17 PostgreSQL integration tests локально и в GitHub Actions
npx prisma generate   ✅
npx prisma validate   ✅
npx prisma db push    ✅ review schema применена в GitHub Actions PostgreSQL service
npm run dev           ✅ polling startup
Telegram API getMe    ✅
Prisma SELECT 1       ✅
RSS/Atom collection   ✅ 8/8 sources
node-cron collection  ✅ startup + scheduled cycles
Article persistence   ✅ real PostgreSQL, insert + duplicate cycle
Latest article query  ✅ 10 ordered records, bounded Telegram message
LLM Mock + PostgreSQL ✅ atomic claim, stale recovery, delayed retry, permanent-error halt
Gemini API             ✅ article #11 via gemini-3.5-flash-lite
```
