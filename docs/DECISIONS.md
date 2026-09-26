# DECISIONS.md

## Архитектурные решения

| Решение | Выбор | Причина |
|----------|--------|--------|
| Язык | TypeScript | не задокументировано |
| Runtime | Node.js 20+ | не задокументировано |
| Telegram Framework | grammY | не задокументировано |
| Conversation Handling | @grammyjs/conversations | не задокументировано |
| База данных | PostgreSQL | не задокументировано |
| ORM | Prisma | не задокументировано |
| Config Validation | Zod | не задокументировано |
| Environment | dotenv | не задокументировано |
| Dev Runtime | tsx | не задокументировано |
| Linting | ESLint + TypeScript ESLint | не задокументировано |
| Testing | Vitest | не задокументировано |
| Containerization | Docker + Docker Compose | не задокументировано |
| Docker Base | node:20-alpine | не задокументировано |
| Bot Mode | Long polling | не задокументировано |
| Session Storage | In-memory (grammY default) | не задокументировано |
| Logging | Custom console logger | не задокументировано |
| News Source Strategy | Curated RSS mix: OpenAI, Google DeepMind, Hugging Face, Apple ML, NVIDIA Technical Blog, Ars Technica AI, MIT Technology Review AI, The Decoder | Согласованные 8 RSS/Atom-фидов дают баланс официальных и независимых источников без API-ключей; все URL runtime-проверены |
| Scheduler Library | Embedded `node-cron` | Подходит для регулярного сбора и будущего дайджеста без отдельной инфраструктуры; проект работает в одном экземпляре |
| LLM Provider Architecture | Provider-independent `LlmProvider`; `GeminiProvider` через официальный `@google/genai` и `MockProvider` для разработки/тестов | Бизнес-логика не зависит от SDK; активные provider и model задаются конфигурацией. Первый runtime-провайдер — Google Gemini с моделью `gemini-2.5-flash-lite`. Автоматический fallback, балансировка и одновременная обработка несколькими моделями не входят в этап 4 |
| LLM Response Contract | Structured JSON output + обязательная Zod-валидация | Резюме, importance и topics должны иметь provider-independent типизированный контракт; некорректный ответ считается ошибкой обработки и не записывается как успешный результат |
| LLM Processing Reliability | Настраиваемый timeout, ограниченные retry и отдельная обработка HTTP 429 | Внешний API не должен бессрочно блокировать цикл; исчерпание retry фиксируется как неуспешная попытка без потери исходной статьи |
| LLM Execution Model | Независимый embedded `node-cron` processor поверх PostgreSQL | LLM не вызывается из RSS collection handler и не блокирует polling/collection; существующей PostgreSQL достаточно, Kafka/Redis/отдельный сервис для single-instance проекта не требуются |
| LLM Delivery Semantics | Идемпотентные DB writes без exactly-once гарантии внешнего API | Atomic `FOR UPDATE SKIP LOCKED` claim + claim token исключают одновременную запись одной статьи и отбрасывают stale results, но после неопределённого сетевого сбоя внешний запрос может повториться |
| LLM Provider Budget | PostgreSQL-backed provider-wide state с UTC-дневным внутренним бюджетом и persisted `pausedUntil` | Атомарное reservation до реального API call учитывает retry/manual retry и переживает restart; транзакция не удерживается во время сети. Бюджет приложения не считается фактической квотой Google; MockProvider его не расходует. `model` хранит модель последнего reservation для диагностики, но budget/pause keyed по provider |
| LLM 429 Semantics | Остановить текущий batch и поставить весь provider на persisted pause минимум до `Retry-After` | Другие статьи не усугубляют quota exhaustion; provider `Retry-After` не ограничивается локальным `retryMaxDelay`, поэтому ранний повтор исключён |

## Решения по модели данных

| Решение | Выбор | Причина |
|----------|--------|--------|
| User ID | BigInt (autoincrement) | не задокументировано |
| Telegram ID | BigInt @unique | не задокументировано |
| Preferences | Separate 1:1 model | не задокументировано |
| Subscriptions | Topic + keywords array | не задокументировано |
| Articles | URL @unique, indexed | не задокументировано |
| Повторная статья | Insert-only по точному нормализованному URL | Повторный сбор пропускает уже сохранённый URL и не перезаписывает исходные или будущие LLM-обогащённые поля; уникальность гарантируется PostgreSQL |
| LLM-обогащение статьи | Dedicated fields в `NewsArticle`, persist-first | Исходные RSS `summary` и `topics` сохраняются без изменений, существующее `relevance` не переиспользуется как importance. LLM summary, importance и topics хранятся отдельно вместе со status, provider, model, временными метками, безопасной диагностикой попыток и token usage; после сохранения обрабатываются новые и ранее не обработанные записи с возможностью retry/backfill |
| Метаданные LLM reprocess | Success metadata отделены от attempt metadata | `llmProvider`, `llmModel`, `llmProcessedAt` и token usage относятся к последнему успешному enrichment; `llmLastAttemptProvider`, `llmLastAttemptModel`, `llmLastAttemptAt`, status/error — к последней попытке. Неуспешный reprocess сохраняет старый enrichment и его корректную атрибуцию |
| Digests | Article ID array | не задокументировано |

## Недокументированные / Не решённые

| Область | Статус |
|------|--------|
| Webhook vs Polling (prod) | Polling for now, webhook TBD |
| Rate Limiting | Не реализовано |
| Multi-instance Session Store | Пока не требуется |
| Monitoring/Observability | Не решено |
| Backup Strategy | Не решено |
| Article Retention Policy | Не решено |
| User Data Export/Deletion | Не решено (GDPR) |
| Pinned Message Update Mechanism | Не решено |
| Cheat-sheet Content Source | Не решено |
