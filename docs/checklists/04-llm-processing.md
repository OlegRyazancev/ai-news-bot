# Stage 4 — LLM-обработка

Checklist этапа **4. LLM-обработка**. Канонические цель и критерий завершения находятся в [ROADMAP.md](../ROADMAP.md), фактическое состояние — в [CURRENT_STATE.md](../CURRENT_STATE.md), принятые решения — в [DECISIONS.md](../DECISIONS.md).

## Статус

🟡 В работе — kickoff и Decision Gate выполнены; пользователь подтвердил реализацию с уточнениями по асинхронности, состояниям, retry и безопасности

## Цель

Обогащать сохранённые статьи кратким LLM-резюме, оценкой важности и тематической категоризацией так, чтобы валидированные результаты и метаданные обработки были доступны дайджесту и последующим этапам.

## Scope

### In scope

- Provider-independent интерфейс `LlmProvider` и фабрика на основе валидируемой конфигурации.
- Один реальный адаптер `GeminiProvider` через официальный SDK `@google/genai` и стабильную модель `gemini-3.5-flash-lite` по умолчанию.
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
- [x] Выбрана модель по умолчанию `gemini-3.5-flash-lite` и официальный SDK `@google/genai`.
- [x] Выбрано dedicated хранение LLM-результатов и метаданных без изменения RSS-полей.
- [x] Официальная документация подтверждает stable model ID `gemini-3.5-flash-lite`, совместимость с `models.generateContent`, structured outputs и используемым JSON Schema subset.
- [x] Пользователь создал Gemini API key и добавил его только в локальный `.env`; секрет не выводится и не коммитится.
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

### Исправления после первой Gemini runtime-попытки

- [x] HTTP 400/404 больше не скрываются одной категорией: нормализованная ошибка содержит безопасные `httpStatus`, allowlisted `providerStatus` и `diagnosticCode`.
- [x] Raw `ApiError.message`, API key, headers, request/response и prompt не сохраняются и не логируются.
- [x] Добавлены unit-тесты HTTP 400/404 и проверки отсутствия secret/raw provider data в логах.
- [x] Модель по умолчанию изменена с ограниченной для нового project Gemini 2.5 на стабильную `gemini-3.5-flash-lite`.
- [x] По официальной документации подтверждены `@google/genai`/`models.generateContent`, structured outputs и keywords существующей JSON Schema.

## 1. Что тестирует агент

### Build Verification

- [x] `npm run build` проходит.
- [x] `npm run lint` проходит.
- [x] `npm run test` проходит: 53 unit tests.
- [x] `npm run test:integration` проходит локально: 17 PostgreSQL integration tests; текущий CI ожидается.
- [x] `npx prisma generate` проходит.
- [x] `npx prisma validate` проходит.
- [x] Docker image `ai-news-bot:stage4` собирается; `.dockerignore` исключает локальные secrets и dev artifacts.
- [x] Repository-wide аудит применимых документов, локальных Markdown-ссылок и дублируемых фактов выполнен.
- [x] `git diff` просмотрен; секреты, raw prompts/responses и случайные изменения отсутствуют.

### Runtime Verification

- [x] Review-версия Prisma-схемы успешно применена через `npx prisma db push` к PostgreSQL service в GitHub Actions; 17 integration tests также проходят на локальной PostgreSQL.
- [x] С `MockProvider` реальная тестовая статья в PostgreSQL проходит persist-first pipeline до `COMPLETED`, а dedicated поля и metadata записываются без изменения RSS `summary`/`topics`/`relevance`.
- [x] Mock-сценарии invalid response, timeout и provider unavailable сохраняют ожидаемые retry/status/attempt metadata и не останавливают обычный batch; 429 и permanent errors следуют своим явно проверенным stop/pause semantics.
- [x] Stale `PROCESSING` запись доступна для безопасного повторного запуска; результат старого claim token отклоняется.
- [x] Два пересекающихся processor claims не получают одну статью; атомарность подтверждена PostgreSQL integration test.
- [x] Mocked 429 переводит запись в отложенное состояние и не вызывает tight retry loop; `Retry-After` учитывается в допустимых границах.
- [x] PostgreSQL integration и пользовательская runtime-проверка: persisted provider pause переживает restart, дневной budget резервируется атомарно и безопасно сбрасывается на следующем UTC-дне.
- [x] PostgreSQL integration: quota race сохраняет permanent/retryable FAILED policy, а release проверяет claim token.
- [x] Mocked permanent auth/config error не получает автоматический retry и останавливает in-process worker до перезапуска.
- [x] С локальным `GEMINI_API_KEY` выполнен успешный реальный запрос к стабильной `gemini-3.5-flash-lite`; статья №11 прошла structured output и Zod-валидацию до `COMPLETED`.
- [x] Для реальной статьи №11 Gemini записала корректные dedicated LLM-результаты и metadata обработки.
- [x] Повторный обычный цикл не claim-ит уже `COMPLETED` статью; explicit targeted reprocessing работает только для указанного ID.
- [x] PostgreSQL integration test подтверждает, что targeted processing изменяет только явно указанный ID и оставляет другую статью полностью без изменений.
- [x] Реальный 429 намеренно не создавался во избежание злоупотребления API; эквивалентный adapter + PostgreSQL path проверен через controlled MockProvider.
- [x] Статический аудит логирования и Git diff подтверждает отсутствие Gemini API key, полного prompt, полного article content и сырого LLM-ответа.
- [x] Пользователь подтвердил совместные polling, RSS collection, startup/scheduled LLM cycles и `/latest`; автоматические scheduler/processor tests подтверждают изоляцию provider/infrastructure failures.

### Автоматические доказательства финальных edge cases

- [x] Отсутствующий Gemini API key отклоняется config/factory validation до создания provider request и без вывода значения секрета.
- [x] Permanent `CONFIGURATION` не повторяется автоматически, а после исправления конфигурации explicit `--retry-failed` восстанавливает статью до `COMPLETED`.
- [x] Недоступность provider (`TEMPORARY`/HTTP 503 через `MockProvider`) сохраняет delayed retry metadata и не останавливает обработку других статей batch.
- [x] PostgreSQL completion сохраняет исходные RSS `summary`, `content`, `topics` и `relevance` без изменений.
- [x] Targeted processing одной статьи не изменяет ни одно поле другой статьи.

## 2. Что пользователь тестирует вручную

### Подготовка

- [x] Создать API key в Google AI Studio и сохранить только в локальном `.env` как `GEMINI_API_KEY`; не отправлять key в чат и не коммитить.
- [x] Успешный runtime вызов подтвердил доступность `gemini-3.5-flash-lite` для выбранного project.
- [ ] В Google AI Studio отдельно проверить конкретные project RPM/TPM/RPD; внутренний дневной budget приложения не заменяет эту проверку.
- [x] Успешная обработка статьи №11 подтвердила доступную PostgreSQL, актуальную схему и наличие содержательной статьи.
- [ ] Перед повторной ручной проверкой убедиться, что не запущен другой экземпляр бота.
- [ ] Установить `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.5-flash-lite`, `LLM_PROCESSING_ENABLED=false` и небольшой batch size согласно обновлённой `.env.example`.

### Пошаговая проверка и ожидаемые результаты

1. Через `npm run db:studio` выбрать конкретный article ID со статусом `PENDING` и выполнить безопасный targeted run:

   ```bash
   npm run llm:process-article -- <article-id>
   ```

    Для уже `COMPLETED` записи использовать `--reprocess` только при осознанной повторной проверке именно этого ID. Для `FAILED` после исправления auth/config использовать явный `--retry-failed`.

   - [ ] только выбранная статья отправлена в Gemini;
   - [ ] команда завершилась успешно без вывода API key, prompt, полного RSS content или raw response;
   - [x] выбранная статья №11 получила status `COMPLETED`.
2. Проверить обработанную запись через Prisma Studio без публикации полного контента:
   - [ ] RSS `summary` и `topics` сохранились без изменения;
   - [ ] `relevance` сохранился без изменения;
   - [x] dedicated LLM summary краткое и соответствует статье;
   - [x] importance находится в документированном диапазоне, topics содержат релевантные категории;
   - [ ] provider равен Gemini, model равна `gemini-3.5-flash-lite`, timestamp и token usage заполнены настолько, насколько их вернул API.
3. Установить `LLM_PROCESSING_ENABLED=true`, подготовить ещё одну pending-статью и запустить `npm run dev`:
   - [ ] приложение доходит до polling без config/error stack с секретными значениями;
   - [x] лог показывает отдельные collection и startup/scheduled LLM scheduler/processing events;
   - [x] `/latest` отвечает во время работы processor, а RSS collection работает параллельно;
   - [ ] ограниченный enrichment batch завершается, ошибка одной статьи не останавливает polling или следующий scheduler cycle.
4. Перезапустить приложение с той же завершённой записью:
   - [x] `COMPLETED` статья не отправляется в Gemini повторно;
   - [ ] приложение и `/latest` продолжают отвечать, исходная статья не повреждена.
5. Удалить API key локально при `LLM_PROCESSING_ENABLED=true` и снова запустить приложение:
   - [ ] ошибка конфигурации/провайдера понятна, но не раскрывает key;
   - [x] статья №11 восстановилась после прежней `CONFIGURATION` ошибки и explicit retry после исправления конфигурации; эквивалентный MockProvider test проверяет policy без внешнего API.
6. Остановить приложение через `Ctrl+C`:
   - [x] shutdown через `Ctrl+C` завершается корректно, scheduler останавливается;
   - [x] пользователь сообщил результаты без значений секретов.

## Acceptance

- [x] Бизнес-логика использует `LlmProvider` и не импортирует `@google/genai` вне Gemini adapter.
- [x] Конфигурация выбирает active provider и model; `GeminiProvider` и `MockProvider` создаются через factory.
- [x] Реальная сохранённая статья №11 успешно обработана `gemini-3.5-flash-lite`, а structured result валидирован Zod.
- [x] RSS-поля не перезаписываются; dedicated summary, importance, topics и processing/token metadata доступны последующим этапам.
- [x] Timeout, ограниченные retries, HTTP 429 и ошибка отдельной статьи обработаны без бесконечного цикла и остановки pipeline.
- [x] LLM processor архитектурно независим от collection/polling, атомарно claim-ит статьи и восстанавливает stale work без exactly-once обещаний для внешнего API.
- [x] Unit-, build- и применимые runtime-проверки выполнены.
- [ ] Пользователь выполнил ручной checklist и явно подтвердил результат.
- [x] Документация синхронизирована с фактической реализацией после repository-wide аудита; оставшиеся ручные gates отмечены явно.
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
