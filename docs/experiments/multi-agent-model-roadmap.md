# Roadmap моделей для мультиагентной разработки

**Проект:** ai-news-bot
**Цель:** уменьшить количество ручных итераций проверки, сбалансировать расход токенов и сохранить качество разработки.

## План на ближайшие 2–3 месяца

| Период | Основная конфигурация | Что пробуем |
|---|---|---|
| **Сейчас** | GPT-5.6 Sol High + multi-model Reviewer + Architect | Reviewer и предварительный read-only Architect настроены и runtime-проверены |
| **Через 2–3 недели** | GPT + Gemini | Сравниваем несколько подходящих моделей Gemini |
| **Примерно через месяц** | Лучшая из проверенных конфигураций | Пробуем DeepSeek |
| **Примерно через два месяца** | Стабильная конфигурация | Пробуем GLM или Qwen |

Сроки ориентировочные. Работающую конфигурацию не меняем ради эксперимента, если она уже удовлетворяет требованиям.

## Распределение ролей

| Роль | Сейчас | Возможные альтернативы |
|---|---|---|
| **Developer** | GPT-5.6 Sol High | DeepSeek, Qwen Coder |
| **Reviewer** | Gemini 3.8 Flash | Gemini 3.5 Flash Lite, GPT-5.6 Luna Fast, DeepSeek Flash |
| **Architect** | Gemini 3.5 Flash | Gemini 3.5 Flash Lite и GPT-5.6 Luna Fast как bounded fallback; GLM как будущий эксперимент |

Конкретные версии, идентификаторы, тарифы и доступность альтернатив проверяем перед подключением.

## Текущий подтверждённый статус

- Developer работает на `openai/gpt-5.6-sol#high`.
- Primary Reviewer — `google/gemini-3.8-flash`.
- Fallback 1 — `google/gemini-3.5-flash-lite`.
- Fallback 2 — `openai/gpt-5.6-luna-fast` через существующее account-based OAuth-подключение.
- Все три модели прошли отдельные runtime-тесты с существующим Reviewer.
- Основной Primary-сценарий `/review` успешно проверен на полном changed scope.
- Автоматическое переключение Reviewer при реальной provider error пока не runtime-подтверждено; реализована ограниченная fail-closed orchestration на уровне Developer.
- Architect реализован как deny-by-default read-only project subagent: Primary `google/gemini-3.5-flash`, `8` model steps, без code changes, shell, tests, внешних API и запуска других агентов.
- `/architect` вызывается до реализации для значимых архитектурных вопросов, проверяет применимость существующих ADR, partial failures и Architecture Decision Gate; обычный code review остаётся задачей Reviewer.
- Fallback Architect: `google/gemini-3.5-flash-lite`, затем `openai/gpt-5.6-luna-fast`; максимум три foreground attempts, только structured allowlisted provider errors, а Luna — только через подтверждённый account-based OAuth.
- Отдельный model-override тест Fallback 1 успешно завершился за 3 model steps. Сквозной тест подтвердил переключение с Primary после structured `provider.quota`/HTTP `429` и успешный результат Fallback 1 без вызова Luna.
- В сквозном тесте компактный payload и persisted explicit prompt обеих попыток совпали: `3155` UTF-8 bytes, SHA-256 `6582ccd818688fb433c79d3da115d94c11cc7d67b9c57ccbbfc49e2856a03d6d`; полные persisted user messages с автоматическим префиксом OpenCode также были идентичны.

## Контракт Architect и подтверждённые возможности

- Developer выполняет security preflight, формирует payload один раз и передаёт краткий контекст, manifest разрешённых project-relative путей и SHA-256 проверенного содержимого вместо копирования больших документов.
- Architect читает только необходимые manifest-пути; запрос дополнительного файла возвращается как `ARCHITECTURE_CONTEXT_REQUIRED` без fallback.
- Architecture Decision Gate требуется только для нового незакрытого существенного выбора, конфликта с ADR или нового требования. Уже принятое применимое решение не отправляется пользователю на повторное согласование без новых оснований.
- Quality gate требует разделять гарантии приложения, PostgreSQL и внешних систем, учитывать partial failures и не выдавать best-effort recovery за гарантированное восстановление.
- Fallback не запускается из-за качества или неполноты содержательного ответа и немедленно прекращается при успешной попытке или immutable-context violation.

## Оставшиеся технические ограничения Architect

- `/architect` — bounded orchestration Developer, а не нативный гарантированный fallback OpenCode.
- Markdown-команда и `subagent` tool не предоставляют общий immutable prompt object между вызовами. Подтверждена идентичность persisted OpenCode prompt, но API не раскрывает exact provider HTTP request bytes и полный скрытый runtime/system context.
- Post-call hash способен обнаружить расхождение persisted prompt только после состоявшейся отправки; pre-call проверка фактического tool argument доступна не всегда.
- Permissions Architect статичны и не сужаются динамически до manifest; соблюдение manifest контролируется инструкцией и доступным аудитом tool metadata.
- Security preflight эвристический. SHA-256 manifest не создаёт атомарный filesystem snapshot, а Architect не может подтвердить raw-file hash обычным `read`.

## Три альтернативы, которые держим в поле зрения

- **DeepSeek** — прежде всего для недорогого независимого ревью.
- **GLM** — для архитектурного анализа и сложных технических задач.
- **Qwen Coder** — потенциальная альтернатива основному Developer для программирования.

GPT-5.6 Luna Fast используется как второй fallback Reviewer и Architect через существующее account-based OAuth-подключение OpenAI; без подтверждения типа подключения попытка не выполняется.

## Долгосрочный ориентир

**GPT — основной разработчик; Gemini — регулярный Reviewer и предварительный Architect; DeepSeek — возможный альтернативный Reviewer.**

Эту конфигурацию не считаем окончательной до испытаний на реальных задачах `ai-news-bot`. Через несколько недель оцениваем, уменьшилось ли количество замечаний и ручных обращений. Если текущая система устраивает, продолжаем Stage 5 без дополнительных экспериментов.
