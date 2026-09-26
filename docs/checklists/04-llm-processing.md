# Stage 4 — LLM-обработка

Checklist этапа **4. LLM-обработка**. Канонические цель и критерий завершения находятся в [ROADMAP.md](../ROADMAP.md), фактическое состояние — в [CURRENT_STATE.md](../CURRENT_STATE.md), принятые решения — в [DECISIONS.md](../DECISIONS.md).

## Статус

🟡 В работе — kickoff и Decision Gate выполнены; пользователь подтвердил реализацию с уточнениями по асинхронности, состояниям, retry и безопасности

## Цель

Обогащать сохранённые статьи кратким LLM-резюме, оценкой важности и тематической категоризацией так, чтобы валидированные результаты и метаданные обработки были доступны дайджесту и последующим этапам.

## Scope

### In scope

- Provider-independent интерфейс `LlmProvider` и фабрика на основе валидируемой конфигурации.
- Один реальный адаптер `GeminiProvider` через официальный SDK `@google/genai` и стабильную модель `gemini-2.5-flash-lite` по умолчанию.
- `MockProvider` для детерминированной разработки и unit-тестов без внешнего API.
- Один structured JSON response с LLM summary, importance и topics, затем независимая Zod-валидация.
- Независимый от RSS collection и Telegram polling persist-first processor, выбирающий из PostgreSQL новые и ранее не обработанные статьи ограниченными batch.
- Собственное расписание processor: медленный LLM-вызов не блокирует collection handler, polling или последующие collection cycles.
- Dedicated LLM-поля без перезаписи исходных RSS `summary`/`topics` и без переиспользования существующего `relevance` как importance.
- Метаданные provider/model, processing status, временные метки, число попыток, безопасная последняя ошибка и input/output/total token usage.
- Настраиваемые timeout и ограниченные retry с backoff; явная обработка HTTP 429 и временных ошибок.
- Атомарный claim статьи, защита от параллельной обработки одной записи, stale `PROCESSING` recovery и отложенный retry через persisted `nextRetryAt`.
- Идемпотентные записи результата без заявления exactly-once для внешнего API: после неопределённого сетевого сбоя повторный LLM-запрос допустим.
- Изоляция ошибки одной статьи от остальных статей и будущих collection cycles.
- Безопасное агрегированное логирование без API key, полного текста статьи, prompt или полного LLM-ответа.
- Unit- и runtime-проверки реального Gemini API, PostgreSQL persistence и повторной обработки.

### Out of scope

- OpenAI, Anthropic, OpenRouter и другие реальные provider adapters.
- Автоматический fallback или переключение provider/model после ошибки.
- Балансировка нагрузки и одновременная обработка несколькими моделями.
- Параллельная высокопроизводительная обработка и multi-instance worker coordination.
- Kafka, Redis, отдельный микросервис и другие дополнительные инфраструктурные компоненты.
- Генерация и доставка ежедневного дайджеста, breaking-news alerts и изменение `/latest`.
- Полнотекстовое скачивание URL статьи, embeddings, vector search и Q&A.
- Prompt/version history и сохранение полного сырого LLM-ответа.
- Переход проекта с Node.js 20 на Node.js 22.

## Preconditions

- [x] Этап 3 завершён: статьи persist-first сохраняются в PostgreSQL и дедуплицируются по URL.
- [x] Выбран provider-independent контракт с `GeminiProvider` и `MockProvider`.
- [x] Выбрана модель по умолчанию `gemini-2.5-flash-lite` и официальный SDK `@google/genai`.
- [x] Выбрано dedicated хранение LLM-результатов и метаданных без изменения RSS-полей.
- [x] Официальная документация подтверждает stable model ID и поддержку structured output.
- [x] Официальная pricing-документация указывает free tier для Gemini 2.5 Flash-Lite.
- [ ] Пользователь создал Gemini API key и добавил его только в локальный `.env`; секрет не выводится и не коммитится.
- [ ] Пользователь проверил доступные конкретному Google AI Studio project RPM/TPM/RPD и региональную доступность; опубликованные лимиты не считаются гарантированными.
- [x] До установки выбрать и зафиксировать актуальную Node.js 20-совместимую версию `@google/genai`; зафиксирована точная версия `2.24.0`.

## Реализация

- [x] Добавить Node.js 20-совместимую версию официального `@google/genai` и зафиксировать lockfile.
- [x] Добавить валидируемую конфигурацию active provider, model, Gemini API key, processor cron, timeout, retry count, backoff и batch size; обновить `.env.example` и Docker environment без секретов.
- [x] Не требовать Gemini API key при выбранном `MockProvider`; при `GeminiProvider` завершаться с понятной config-ошибкой без вывода значения key.
- [x] Определить provider-independent input, enrichment result и token usage types, а также интерфейс `LlmProvider`.
- [x] Реализовать единый Zod-контракт результата: непустое ограниченное summary, importance в диапазоне `0..1` и нормализованный список из `1..8` topics.
- [x] Сформировать prompt из безопасно ограниченных title, RSS summary/content, source и language; явно отделить RSS как недоверенные данные, запретить следовать инструкциям внутри них и не передавать URL-контент, если он не был собран ранее.
- [x] Реализовать `GeminiProvider` со structured JSON output и повторной Zod-валидацией ответа на границе адаптера.
- [x] Преобразовать Gemini usage metadata в provider-independent input/output/total token counts; отсутствие отдельных значений обрабатывать явно.
- [x] Реализовать детерминированный `MockProvider`, включая сценарии success, invalid response, timeout, retryable и non-retryable error; всегда сохранять provider metadata `mock`.
- [x] Добавить классификацию provider errors: timeout/429/временные 5xx допускают только ограниченные retry с exponential backoff, permanent auth/config errors не повторяются автоматически до перезапуска процесса.
- [x] Для HTTP 429 учитывать валидный `Retry-After`, если он доступен, и сохранять отложенный `nextRetryAt`; исчерпание попыток не порождает немедленный бесконечный цикл.
- [x] Добавить dedicated Prisma-поля для LLM summary, importance и topics, а также status/provider/model/attempts/timestamps/safe error/token usage; сохранить RSS `summary`/`topics` и существующее `relevance` без изменения.
- [x] Определить состояния `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` и lease timestamp для безопасного восстановления stale `PROCESSING` после остановки процесса.
- [x] Реализовать атомарный claim кандидата через PostgreSQL transaction с `FOR UPDATE SKIP LOCKED`; пересекающиеся scheduler runs или процессы не могут одновременно получить одну статью.
- [x] Реализовать repository queries для выборки только eligible записей (`PENDING`, due retry или stale `PROCESSING`) и атомарной фиксации успеха/ошибки.
- [x] Гарантировать, что частичный или невалидный LLM-ответ не перезаписывает последний согласованный enrichment и не помечается `COMPLETED`.
- [x] Реализовать processor для последовательной обработки ограниченного batch; локальный overlap guard дополняет DB claim, а ошибка одной статьи не останавливает остальные и будущие циклы.
- [x] Запускать processor по отдельному расписанию независимо от collection handler; persistence только создаёт eligible запись и не ожидает LLM.
- [x] Сделать повторную фиксацию результата идемпотентной относительно сохранённых данных; exactly-once для внешнего LLM-вызова не заявляется.
- [x] Добавить безопасный targeted reprocessing механизм для реальной Gemini-проверки, требующий явного article ID и флага `--reprocess` для `COMPLETED`.
- [x] Исключить повторную обработку `COMPLETED` статьи обычным циклом; смена provider/model сама по себе не перезаписывает результат.
- [x] Логировать только агрегированные counts, article ID, provider/model, status/error category, attempts, duration и token counts без секретов, RSS-контента, prompt и raw response.
- [x] Добавить unit-тесты контракта, config, mock, Gemini adapter, timeout/retry/429, scheduler и processor state transitions, а также PostgreSQL integration tests.
- [x] Обновить README, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/BACKLOG.md`, `.env.example` и Docker-конфигурацию по фактической реализации.

### Исправления по review перед Gemini runtime

- [x] HTTP 429 останавливает текущий batch и сохраняет provider-wide `pausedUntil` в PostgreSQL.
- [x] `Retry-After` имеет приоритет над локальным retry maximum и не допускает преждевременный retry.
- [x] Добавлен атомарный внутренний дневной budget реального provider с UTC reset и восстановлением после restart; MockProvider quota не расходует.
- [x] Repository, scheduler startup/scheduled execution и shutdown ошибки изолированы безопасным агрегированным логированием.
- [x] Success metadata отделены от last-attempt metadata; неуспешный reprocess не меняет атрибуцию старого enrichment.
- [x] Добавлен явный `--retry-failed` для конкретной `FAILED` статьи без автоматического повтора permanent errors.
- [x] Добавлены unit tests для quota exhaustion, 429 batch stop, PostgreSQL failure isolation и manual retry.
- [x] Добавлены PostgreSQL integration tests для atomic quota reservation, UTC reset, restart/pause recovery, metadata и explicit FAILED retry.

### Дополнительные исправления по повторному review

- [x] `release()` сохраняет permanent `FAILED` с `nextRetryAt=null` без создания автоматического retry.
- [x] Для ранее retryable `FAILED` восстановленный `nextRetryAt` равен более позднему из previous retry и provider pause.
- [x] Race между `quota.check()` и `quota.reserve()` освобождает claim по token и не вызывает внешний provider.
- [x] Исключения из `reserve()` и `startAttempt()` запускают best-effort claim release; ошибка release оставляет stale recovery.
- [x] Зарезервированный дневной budget не возвращается после неоднозначной infrastructure error.
- [x] Добавлены unit и PostgreSQL integration regression tests для обоих edge case.

## 1. Что тестирует агент

### Build Verification

- [x] `npm run build` проходит.
- [x] `npm run lint` проходит.
- [x] `npm run test` проходит: 45 unit tests.
- [ ] `npm run test:integration`: suite расширен до 12 PostgreSQL integration tests; локальный запуск недоступен из-за остановленной PostgreSQL/Docker, требуется текущий CI.
- [x] `npx prisma generate` проходит.
- [x] `npx prisma validate` проходит.
- [x] Docker image `ai-news-bot:stage4` собирается; `.dockerignore` исключает локальные secrets и dev artifacts.
- [x] Repository-wide аудит применимых документов, локальных Markdown-ссылок и дублируемых фактов выполнен.
- [x] `git diff` просмотрен; секреты, raw prompts/responses и случайные изменения отсутствуют.

### Runtime Verification

- [x] Review-версия Prisma-схемы успешно применена через `npx prisma db push` к PostgreSQL service в GitHub Actions; локальный PostgreSQL/Docker недоступен.
- [x] С `MockProvider` реальная тестовая статья в PostgreSQL проходит persist-first pipeline до `COMPLETED`, а dedicated поля и metadata записываются без изменения RSS `summary`/`topics`/`relevance`.
- [ ] Mock-сценарии invalid response, timeout, retryable/429 и non-retryable error приводят к ожидаемым retry/status/attempt metadata и не останавливают batch.
- [x] Stale `PROCESSING` запись доступна для безопасного повторного запуска; результат старого claim token отклоняется.
- [x] Два пересекающихся processor claims не получают одну статью; атомарность подтверждена PostgreSQL integration test.
- [x] Mocked 429 переводит запись в отложенное состояние и не вызывает tight retry loop; `Retry-After` учитывается в допустимых границах.
- [x] PostgreSQL integration: persisted provider pause переживает restart, дневной budget резервируется атомарно и безопасно сбрасывается на следующем UTC-дне.
- [ ] PostgreSQL integration: quota race сохраняет permanent/retryable FAILED policy, а release проверяет claim token (ожидается CI).
- [x] Mocked permanent auth/config error не получает автоматический retry и останавливает in-process worker до перезапуска.
- [ ] С локальным `GEMINI_API_KEY` выполнен реальный запрос к стабильной `gemini-2.5-flash-lite`; structured output проходит Zod-валидацию.
- [ ] Для реальной сохранённой статьи Gemini записывает осмысленные summary, importance и topics, provider/model, processed timestamp и доступные token counts.
- [x] Повторный обычный цикл не claim-ит уже `COMPLETED` статью; explicit targeted reprocessing работает только для указанного ID.
- [ ] Targeted Gemini runtime-проверка действует только на явно выбранную статью и не перезаписывает остальные завершённые записи.
- [x] Реальный 429 намеренно не создавался во избежание злоупотребления API; эквивалентный adapter + PostgreSQL path проверен через controlled MockProvider.
- [x] Статический аудит логирования и Git diff подтверждает отсутствие Gemini API key, полного prompt, полного article content и сырого LLM-ответа.
- [ ] Bot polling, collection, persistence и LLM processor фактически запускаются совместно; недоступность Gemini не ломает последующий scheduler cycle.

## 2. Что пользователь тестирует вручную

### Подготовка

- [ ] Создать API key в Google AI Studio и сохранить только в локальном `.env` как `GEMINI_API_KEY`; не отправлять key в чат и не коммитить.
- [ ] В Google AI Studio открыть rate limits выбранного project и убедиться, что `gemini-2.5-flash-lite` доступна на free tier; сообщить агенту только несекретные лимиты/ошибку доступности.
- [ ] Убедиться, что PostgreSQL запущен, актуальная Prisma-схема применена, другой экземпляр бота остановлен, а в БД есть хотя бы одна содержательная статья.
- [ ] Установить `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-2.5-flash-lite`, `LLM_PROCESSING_ENABLED=false` и небольшой batch size согласно обновлённой `.env.example`.

### Пошаговая проверка и ожидаемые результаты

1. Через `npm run db:studio` выбрать конкретный article ID со статусом `PENDING` и выполнить безопасный targeted run:

   ```bash
   npm run llm:process-article -- <article-id>
   ```

    Для уже `COMPLETED` записи использовать `--reprocess` только при осознанной повторной проверке именно этого ID. Для `FAILED` после исправления auth/config использовать явный `--retry-failed`.

   - [ ] только выбранная статья отправлена в Gemini;
   - [ ] команда завершилась успешно без вывода API key, prompt, полного RSS content или raw response;
   - [ ] выбранная статья получила status `COMPLETED`.
2. Проверить обработанную запись через Prisma Studio без публикации полного контента:
   - [ ] RSS `summary` и `topics` сохранились без изменения;
   - [ ] `relevance` сохранился без изменения;
   - [ ] dedicated LLM summary краткое и соответствует статье;
   - [ ] importance находится в документированном диапазоне, topics содержат релевантные категории;
   - [ ] provider равен Gemini, model равна `gemini-2.5-flash-lite`, timestamp и token usage заполнены настолько, насколько их вернул API.
3. Установить `LLM_PROCESSING_ENABLED=true`, подготовить ещё одну pending-статью и запустить `npm run dev`:
   - [ ] приложение доходит до polling без config/error stack с секретными значениями;
   - [ ] лог показывает отдельные collection и LLM scheduler/processing events;
   - [ ] `/latest` отвечает во время работы processor, а collection cycle не ожидает LLM handler;
   - [ ] ограниченный enrichment batch завершается, ошибка одной статьи не останавливает polling или следующий scheduler cycle.
4. Перезапустить приложение с той же завершённой записью:
   - [ ] `COMPLETED` статья не отправляется в Gemini повторно;
   - [ ] приложение и `/latest` продолжают отвечать, исходная статья не повреждена.
5. Удалить API key локально при `LLM_PROCESSING_ENABLED=true` и снова запустить приложение:
   - [ ] ошибка конфигурации/провайдера понятна, но не раскрывает key;
   - [ ] после возврата корректного key и перезапуска eligible pending/failed статья может быть обработана согласно retry policy.
6. Остановить приложение через `Ctrl+C`:
   - [ ] shutdown завершается корректно, scheduler останавливается;
   - [ ] сообщить агенту результат каждого пункта и только безопасные фрагменты ошибок.

## Acceptance

- [x] Бизнес-логика использует `LlmProvider` и не импортирует `@google/genai` вне Gemini adapter.
- [x] Конфигурация выбирает active provider и model; `GeminiProvider` и `MockProvider` создаются через factory.
- [ ] Реальная сохранённая статья успешно обработана `gemini-2.5-flash-lite`, а structured result валидирован Zod.
- [x] RSS-поля не перезаписываются; dedicated summary, importance, topics и processing/token metadata доступны последующим этапам.
- [x] Timeout, ограниченные retries, HTTP 429 и ошибка отдельной статьи обработаны без бесконечного цикла и остановки pipeline.
- [x] LLM processor архитектурно независим от collection/polling, атомарно claim-ит статьи и восстанавливает stale work без exactly-once обещаний для внешнего API.
- [ ] Unit-, build- и применимые runtime-проверки выполнены.
- [ ] Пользователь выполнил ручной checklist и явно подтвердил результат.
- [x] Документация синхронизирована с фактической реализацией после repository-wide аудита; незавершённый Gemini runtime gate отмечен явно.
- [ ] Все обязательные пункты checklist выполнены до закрытия этапа.

## Риски

- Free tier quotas зависят от Google AI Studio project/account/region, могут меняться и не гарантируют фактическую capacity; точные значения нельзя зафиксировать только по публичной странице.
- По pricing-документации данные free tier могут использоваться Google для улучшения продуктов; в prompt нельзя отправлять секреты или персональные данные.
- RSS часто содержит только короткий excerpt, поэтому качество summary и классификации ограничено доступным `summary`/`content`.
- Retry после неопределённого сетевого исхода может повторно потратить quota/token usage; retries должны быть малыми и наблюдаемыми.
- Exactly-once для внешнего LLM API недостижим без provider-side idempotency: DB writes идемпотентны, но после сбоя запрос может повториться.
- Падение процесса в `PROCESSING` требует stale-recovery, иначе статья останется заблокированной.
- Невалидный или семантически слабый JSON может формально соответствовать schema; нужны Zod-ограничения и ручная оценка реальных результатов.
- Будущий major `@google/genai` требует Node.js 22; текущий проект остаётся на Node.js 20 и должен зафиксировать совместимую версию SDK.

## Открытые вопросы

- Блокирующих архитектурных вопросов нет. Конкретные free-tier limits и фактическая доступность API для пользовательского project подтверждаются перед runtime-проверкой в Google AI Studio.
