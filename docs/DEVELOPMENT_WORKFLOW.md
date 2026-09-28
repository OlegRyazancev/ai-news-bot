# Development Workflow

Разработка AI News Bot ведётся через Developer-led orchestration и GitHub branch/PR/CI процесс. `main` — default/protected branch и каноническое состояние проекта. Текущий основной агент в Developer-сессии — единственный координатор; отдельный Developer agent не создаётся. Крупный этап проходит цикл:

**Актуальный main → Stage branch → Анализ/checklist → Architect classification → Architect при необходимости → Decision Gate → План → Подтверждение → Реализация → Verification → preliminary `/stage-close`/CI → финальный tracked scope → Reviewer classification → bounded review при необходимости → финальный commit/push/CI → Ready for review → Ручной merge**

Merge всегда выполняет пользователь. Предпочтительный метод — **Squash and merge**.

## Источники истины

- [`AGENTS.md`](../AGENTS.md) — нормативные правила агента и разрешения Git/GitHub; при расхождениях имеет приоритет.
- [`docs/ROADMAP.md`](./ROADMAP.md) — канонические этапы, статусы и текущий фокус.
- [`docs/CURRENT_STATE.md`](./CURRENT_STATE.md) — фактически подтверждённое состояние текущей ветки; каноническим оно становится в `main`.
- [`docs/BACKLOG.md`](./BACKLOG.md) — операционные задачи.
- [`docs/DECISIONS.md`](./DECISIONS.md) — принятые и открытые архитектурные решения.
- [`docs/checklists/`](./checklists/) — один актуальный checklist на каждый начатый этап.
- [`.github/pull_request_template.md`](../.github/pull_request_template.md) — обязательная основа PR body.
- [`docs/DAILY_WORKFLOW.md`](./DAILY_WORKFLOW.md) — краткая ежедневная шпаргалка.

Этот документ описывает процесс, но не заменяет roadmap, current state, backlog, decisions или stage checklist.

### Состояние оркестрации

Источники разделены по типам состояния:

| Состояние | Source of truth |
|---|---|
| Глобальные orchestration rules | `AGENTS.md` |
| Архитектурные решения | `docs/DECISIONS.md` |
| Orchestration roadmap stage | Существующий stage checklist |
| Orchestration non-stage задачи до публикации | Текущая Developer-сессия |
| Orchestration non-stage задачи после публикации | Body существующего PR |
| Реализация и changed scope | Git |
| CI конкретного HEAD | GitHub Actions |
| Handoff | Производная сводка, не самостоятельный source of truth |

Минимальный task-level state включает Architect/Reviewer classification с обоснованием, Architect outcome, Architecture Decision Gate и ссылку на принятое решение, Stage plan approval, последний review pass, unresolved finding IDs, выполненные исправления, повторную verification, remaining rechecks и явно принятые residual risks. Полные transcripts агентов, скрытые рассуждения и raw provider payload не сохраняются.

Stage хранит это состояние в своём checklist. Для stage PR body содержит только производную сводку или ссылку на checklist и не становится вторым независимым каноном. Non-stage задача до PR опирается на текущую Developer-сессию, а после публикации — на body единственного существующего PR. Если non-stage задача не имеет PR и сессия завершается, полное автоматическое восстановление не гарантируется; до изменения команды `/handoff` Developer явно сообщает это ограничение и предоставляет структурированную сводку для переноса.

### Межсессионное восстановление

В новой Developer-сессии глобальный и stage-контекст восстанавливается из `AGENTS.md`, проектных документов, stage checklist, Git и фактических PR/CI metadata. Для non-stage задачи с опубликованным PR task-level orchestration state восстанавливается из body этого PR. Conversation history и handoff-ответ могут помогать ориентации, но не заменяют канонические источники.

Если stage checklist или PR body не содержит требуемого подтверждённого состояния, Developer не додумывает classification, pass counter, finding IDs, пользовательские решения или verification. Такое состояние помечается как недостаточно подтверждённое и соответствующий gate остаётся открытым. `/start` и `/stage-status` read-only восстанавливают этот state, а `/handoff` синхронизирует его только в каноническом source.

## Developer-led orchestration

### Полный lifecycle

```text
Task intake
→ Architect classification
→ Architect, только если required
→ Architecture Decision Gate
→ явное подтверждение stage plan, если требуется
→ implementation
→ применимая verification
→ preliminary /stage-close и CI, если это roadmap stage
→ подготовка и verification итогового tracked scope stage
→ Reviewer classification
→ initial review, если required
→ исправление подтверждённых findings
→ повторная применимая verification
→ recheck, если необходим и разрешён
→ финальные Git / PR / CI gates
→ stage completion, если применимо
→ ручной merge пользователем
```

Developer выполняет классификацию, вызывает нужного subagent, проверяет его результат, реализует изменения и ведёт task-level state. Architect и Reviewer остаются независимыми read-only ролями и не вызывают друг друга. Developer обращается к ним напрямую через поддерживаемый OpenCode tool по существующим контрактам `/architect` и `/review`; Markdown slash-команды не вкладываются друг в друга.

Policy задаёт обязательное поведение Developer, но не является программно гарантированной state machine OpenCode. Любой обязательный blocker останавливает затронутую часть workflow. Неизвестное состояние не считается успешно пройденным gate.

### Что автоматизирует Developer

- читает применимые sources of truth и классифицирует необходимость Architect/Reviewer;
- напрямую запускает required subagent по существующему command contract;
- проверяет содержательность Architect outcome и доказательность Reviewer findings;
- переносит применимые ограничения, риски и verification requirements в plan/checklist;
- исправляет подтверждённые findings, повторяет verification и при необходимости запускает разрешённый recheck;
- выполняет разрешённые Git/PR/CI действия по действующему lifecycle.

### Что решает пользователь

- принимает новое значимое архитектурное решение через Decision Gate;
- явно подтверждает Stage plan до application implementation;
- выполняет и подтверждает обязательную ручную проверку;
- при необходимости явно принимает конкретный `P3` residual risk;
- выполняет merge PR.

Молчание пользователя не считается подтверждением плана, архитектурным решением, результатом ручной проверки или принятием residual risk.

## Ветки и границы полномочий

### Имена веток

- roadmap stage: `stage/NN-short-slug`, например `stage/04-llm-processing`;
- небольшое обслуживание: `chore/...`;
- отдельные изменения документации: `docs/...`;
- отдельное исправление: `fix/...`.

Один roadmap stage ведётся в одной stage-ветке и одном PR. Application/stage work напрямую в `main` не выполняется.

### Что агент может делать

В текущей рабочей ветке агент может создавать commits, выполнять push, создавать Draft PR через `gh`, обновлять PR body, смотреть `gh pr checks`, исправлять CI и переводить полностью проверенный PR в Ready for review. Эти действия не требуют отдельного разрешения, если пользователь не ограничил их для конкретной задачи.

### Что остаётся за пользователем

Только пользователь выполняет merge. Агент не выполняет commit/push в `main`, force push, merge, не закрывает PR без явной команды, не обходит branch protection/ruleset и не ослабляет CI. Secrets никогда не попадают в Git.

## Начало рабочего дня

```text
opencode
/start
/stage-status
```

`/start` восстанавливает общий контекст. `/stage-status` read-only показывает roadmap stage, текущую ветку и clean/dirty status, связанный PR и его Draft/Ready состояние, CI, точку остановки, следующий шаг, блокеры и необходимые решения.

## Начало нового roadmap stage

Используется `/stage-start`.

### 1. Определить stage

Номер, точное название и текущий фокус берутся исключительно из `docs/ROADMAP.md`. Первый незавершённый этап не выбирается автоматически, если roadmap указывает другой фокус.

### 2. Подготовить ветку

Если команда запущена на `main`, агент:

1. проверяет `git status`;
2. при пользовательских или неожиданных изменениях останавливается, ничего не переключает и сообщает пользователю;
3. при чистом дереве выполняет безопасный `git pull --ff-only`;
4. проверяет, не существует ли уже целевая stage-ветка локально или в remote;
5. продолжает существующую ветку либо создаёт `stage/NN-short-slug` от обновлённого `main`, не допуская второй ветки для того же stage.

Если текущая ветка уже соответствует целевому stage, работа продолжается в ней. Если активна другая ветка, агент не переносит и не отбрасывает изменения молча: он проверяет ситуацию и останавливается при конфликте или неоднозначности.

### 3. Выполнить kickoff

В stage-ветке агент:

1. проводит stage-specific анализ существующей реализации;
2. проверяет зависимости, scope, out-of-scope, риски и verification;
3. по нормативным правилам `AGENTS.md` классифицирует необходимость Architect и при `required` применяет существующий `/architect` protocol до реализации;
4. применяет Decision Gate, если существенный выбор не зафиксирован в `DECISIONS.md`;
5. создаёт или актуализирует единственный `docs/checklists/NN-short-slug.md`, включая task-level orchestration state;
6. формирует implementation plan;
7. **останавливается до изменения application code** и ждёт явного подтверждения пользователя.

Создание ветки, анализ и checklist не считаются application implementation и разрешены до этого STOP.

## Реализация и Draft PR

После подтверждения пользователь задаёт направление, а агент реализует stage в текущей stage-ветке. Checklist остаётся живым документом без внутреннего changelog.

Агент выполняет локальные проверки и создаёт содержательные commits. После первого meaningful push он:

1. формирует PR body на основе `.github/pull_request_template.md`, заполняя stage, checklist, крупные изменения, фактическую verification, вопросы и notes for review;
2. через `gh` проверяет все PR с head текущей ветки;
3. использует только единственный `OPEN` PR с правильными `head=<current branch>` и `base=main`; при `CLOSED`/`MERGED` PR, неверных head/base или неоднозначности останавливается и не создаёт дубликат;
4. если PR действительно отсутствует, формирует body на основе `.github/pull_request_template.md` во временном файле вне Git и создаёт Draft PR неинтерактивной командой `gh pr create --draft --base main --head <branch> --title "<PR title>" --body-file <temporary-body-file>`;
5. поддерживает PR body и checklist актуальными по мере работы;
6. проверяет GitHub Actions через `gh pr checks`.

Required check сейчас называется `CI/Lint, build, and test (pull_request)`. Его имя и соответствующий CI job не меняются без необходимости, поскольку ruleset зависит от этого status check.

Падение локальной проверки или CI не обходится изменением ruleset либо ослаблением workflow. Агент исследует причину, исправляет её в текущей ветке, повторяет проверки, commit/push и снова проверяет CI.

Если `gh` отсутствует, авторизация недействительна или GitHub недоступен, PR/CI gate остаётся незавершённым. Агент не объявляет CI успешным, не меняет PR и не переводит его в Ready, а сообщает конкретную причину и необходимое действие. Установка или перенастройка инструментов без необходимости не выполняется.

## Verification

### Что тестирует агент

- `npm run lint`;
- `npm run build`;
- тесты, если они существуют или требуются этапом;
- доступные runtime-проверки Telegram, PostgreSQL, RSS/API, scheduler и других интеграций;
- GitHub Actions для актуального head commit PR.

Build Verification не заменяет Runtime Verification.

### Что пользователь тестирует вручную

Пользователь выполняет отдельный пошаговый раздел checklist и сообщает результат. Агент не закрывает эти пункты от имени пользователя. Подтверждение ручной проверки закрывает только соответствующие пункты и не заменяет `/stage-close`.

Если найден дефект, затронутые acceptance-пункты открываются повторно. После исправления заново выполняются применимые local/runtime/CI проверки, пользовательский retest, документационный аудит и diff review.

### Предварительный Architect

До реализации Developer фиксирует Architect classification (`required` или `not-required`) и конкретное обоснование. Architect обязателен при существенном изменении архитектурных контрактов, границ или взаимодействия компонентов, persistence/concurrency/idempotency semantics, внешних интеграций, security boundaries, инфраструктурной архитектуры/runtime topology либо существенных partial failures, не покрытых действующими решениями.

Architect не вызывается для локального bugfix, простого refactoring, тривиальной документации, реализации полностью применимого существующего ADR и обычного code review. Действующий ADR не требует повторного согласования без существенных новых обстоятельств.

Команда выполняется в текущей Developer-сессии (`subagent: false`) и запускает project agent из `.opencode/agents/architect.md` только в foreground. Architect анализирует и консультирует, не пишет код, не изменяет проект, не запускает shell/tests/API и не принимает решение за пользователя. Agent использует deny-by-default read-only permissions, Primary `google/gemini-3.5-flash` и лимит `8` model steps.

Developer до вызова выполняет security preflight, один раз сериализует компактный `architecture_payload` и передаёт задачу, ограничения, вопросы, краткий контекст и manifest только необходимых project-relative файлов с SHA-256. Полное содержимое больших документов по умолчанию не передаётся; Architect читает нужные разрешённые manifest-пути. Fallback ограничен тремя новыми foreground child sessions: `google/gemini-3.5-flash` → `google/gemini-3.5-flash-lite` → `openai/gpt-5.6-luna-fast`. Переключение разрешено только по однозначной structured allowlisted quota/provider/transport error; содержательная неполнота, `ARCHITECTURE_CONTEXT_REQUIRED`, auth/unknown error или immutable-context violation останавливают цепочку. Luna Fast допускается только через подтверждённое существующее account-based OAuth-подключение.

Architecture Decision Gate открывается только при новом существенном выборе: решение отсутствует, новое требование или ограничение конфликтует с действующим ADR либо применимость решения нельзя установить из проверенного контекста. Если действующее решение покрывает задачу и новых оснований для выбора нет, отчёт прямо фиксирует, что новый gate не требуется, и не просит пользователя повторно согласовать уже принятое решение. Developer дополнительно проверяет, что при partial failures гарантии приложения, PostgreSQL и внешних систем разделены, а best-effort release/recovery не назван гарантированным восстановлением.

Для неизменной задачи разрешён максимум один архитектурный анализ. До трёх model attempts в fallback chain относятся к одному анализу. Дополнительный анализ допустим только после документированного material context delta — существенного изменения требований, решений или контекста. При обязательном, но недоступном Architect implementation блокируется. После успешного анализа Developer сохраняет только actionable outcome, ограничения, риски и дополнения к verification, но не полный transcript.

**Подтверждено runtime:** отдельный model-override тест `google/gemini-3.5-flash-lite` успешно выполнил read-only анализ за 3 model steps. Сквозной `/architect` тест получил structured `provider.quota`/HTTP `429` на Primary и штатно завершился на Fallback 1; Luna не вызывалась. Компактный explicit payload имел размер `3155` UTF-8 bytes и SHA-256 `6582ccd818688fb433c79d3da115d94c11cc7d67b9c57ccbbfc49e2856a03d6d`; persisted explicit prompt обеих попыток имел тот же размер и hash, а полные persisted user messages с автоматическим префиксом OpenCode также совпали.

**Технические ограничения:** это bounded orchestration Developer, а не нативный fallback OpenCode. Markdown-команда не получает immutable prompt object, а API не раскрывает exact provider HTTP request bytes или полный скрытый runtime/system context; поэтому подтверждена идентичность persisted OpenCode prompt, но не provider transport и не всего runtime-контекста. Проверка persisted prompt после вызова обнаруживает расхождение, но не предотвращает уже выполненную отправку. Permissions нельзя динамически сузить до manifest, security scan эвристический, manifest hash не создаёт атомарный filesystem snapshot, а прочитанный Architect файл может измениться после preflight.

### Независимый Reviewer

После реализации и применимой verification Developer фиксирует Reviewer classification и обоснование. Для roadmap stage это выполняется после successful preliminary CI и подготовки/verification всех phase-2 изменений итогового tracked scope. Reviewer обязателен для application code, конфигурации приложения, OpenCode agents/commands, значимых изменений workflow и существенных изменений технической документации. Мотивированный пропуск допустим только для тривиальной текстовой правки, не меняющей поведение, process contract или технический смысл.

Только после реализации и применимой verification итогового scope Developer запускает `/review`, передавая `pass`, краткий scope задачи, acceptance criteria, ограничения и фактические результаты verification. Поле команды `subagent: false` явно оставляет её в текущей Developer-сессии. Developer один раз фиксированными read-only Git-командами получает committed, staged, unstaged и точный untracked scope, формирует changed-files manifest, выполняет локальный security preflight, безопасно фиксирует содержимое untracked-файлов и создаёт единый immutable snapshot для всех model attempts. Потенциальный секрет, неполный, недоступный, truncated или слишком большой snapshot блокирует вызов до передачи внешней модели.

Exact `review_payload_sha256` включает исходные Git snapshots и их категории. Отдельный `substantive_scope_sha256` строится по итоговому содержимому и значимой Git metadata относительно зафиксированной review base: add/delete/rename/type/mode/content changes меняют fingerprint, а перенос тех же bytes между untracked/unstaged/staged/committed — нет. Bounded orchestration-state values checklist нормализуются только для freshness и остаются в полном payload. Если content equivalence, binary/special path или metadata нельзя доказать, review freshness считается `unconfirmed`.

Project agent из `.opencode/agents/reviewer.md` запускается в foreground с явным model override: Primary `google/gemini-3.8-flash`, Fallback 1 `google/gemini-3.5-flash-lite`, Fallback 2 `openai/gpt-5.6-luna-fast`. На один pass разрешено не более трёх попыток, каждая модель вызывается максимум один раз в новой child session с идентичным snapshot. Fallback выполняется только при подтверждённой allowlisted provider/transport error; обычный результат, `REVIEW_INCOMPLETE`, `INSUFFICIENT_REVIEW_CONTEXT`, auth/unknown error или недостаточные structured metadata останавливают цепочку. Reviewer сохраняет deny-by-default read-only permissions, не использует shell и ограничен 12 model steps; model override не меняет модель Developer.

Разрешены одно первоначальное ревью (`initial`) и не более двух повторных проверок (`recheck-1`, `recheck-2`). Каждый вызов выполняет ровно один review pass; model fallback внутри pass не увеличивает счётчик recheck. Повторные проверки фокусируются на предыдущих findings и новых hunks. Developer проверяет замечания, исправляет подтверждённые проблемы, повторяет применимые проверки и передаёт Reviewer ID замечаний и описание исправлений. Recheck без исправления или релевантного изменения scope и повторной verification запрещён. После `recheck-2` новые автоматические recheck не выполняются. Reviewer не заменяет build, tests, runtime/user verification, документационный gate или CI и не запускается рекурсивно.

Если после `recheck-2` остаются подтверждённые findings, workflow останавливается. `P0`, `P1` и `P2` по умолчанию блокируют завершение. Только конкретный `P3` может быть принят по явному решению пользователя с фиксацией finding ID и риска в task-level state; молчание не считается согласием. Такой waiver не отменяет verification, CI или ручной merge.

**Рабочий вызов:** Developer запускает `/review` в текущей рабочей сессии. Foreground child возвращает результат Developer, после чего тот оценивает findings и продолжает workflow; recheck автоматически не запускается.

**Изолированное испытание:** через интерфейс OpenCode создаётся отдельная Developer-сессия этого проекта, и `/review` запускается только в ней. Foreground Reviewer возвращает результат тестовой parent-сессии, поэтому основная рабочая Developer-сессия не получает synthetic result и не продолжает работу. Background-команда для этого не используется.

**Фактическая verification:** все три модели прошли отдельные runtime-тесты с существующим Reviewer, включая сохранение agent permissions и model-step limit. Основной Primary-сценарий `/review` успешно проверен на полном changed scope. Автоматическое переключение Reviewer при реальной ошибке провайдера пока не runtime-подтверждено; это bounded orchestration Developer, а не нативный гарантированный fallback OpenCode.

## Закрытие stage и подготовка PR к review

`/stage-close` выполняется в соответствующей `stage/NN-short-slug` ветке по двухфазной схеме.

### Фаза 1 — предварительные gates и CI

1. Проверяются реализация против roadmap criterion и checklist, task-level orchestration state, lint/build/tests, обязательная Runtime Verification и явное подтверждение пользовательской проверки.
2. Проверяются Architecture gate, Stage plan approval, документация, локальные Markdown-ссылки, `git diff`, отсутствие secrets и посторонних изменений. Финальный Reviewer gate намеренно ещё не требуется: Reviewer должен получить полный phase-2 tracked scope.
3. Checklist и документация подготавливаются без финальной отметки stage `✅ Завершено` и без переключения текущего roadmap-фокуса.
4. Изменения commit/push-ятся в stage-ветку.
5. Перед созданием или изменением PR проверяются все PR текущей ветки. Продолжение разрешено только с единственным `OPEN` PR, у которого head совпадает с текущей веткой, а base равен `main`; закрытый, merged, неверный или неоднозначный PR останавливает процесс без создания дубликата.
6. Draft PR создаётся только если PR для этой ветки действительно отсутствует; существующий валидный Draft PR актуализируется по template.
7. Для актуального HEAD ожидается успешный `gh pr checks`. Failed/pending/unavailable CI не позволяет перейти к фазе 2.

### Фаза 2 — итоговый tracked scope, Reviewer и финальный CI

1. Только после успешного CI preliminary HEAD stage отмечается `✅ Завершено`, checklist получает окончательные completion marks, roadmap-фокус и применимые state/backlog/visual документы синхронизируются. До merge это остаётся branch-only подготовленным статусом.
2. Завершаются все существенные изменения документации/checklist и выполняются local verification, repository-wide docs audit, link/secret checks и финальный diff review итогового tracked scope.
3. `/stage-close` проверяет task-level state и останавливается для внешнего `/review`, если Reviewer required и актуальный review этого итогового scope отсутствует. Команда не вызывает Reviewer автоматически. Findings исправляются с повторной verification и максимум двумя разрешёнными recheck.
4. После актуального review повторный `/stage-close` пересчитывает тот же content-based freshness fingerprint. Bounded state updates и category-only перенос неизменных bytes в commit не создают review loop; любое реальное изменение путей, содержимого, metadata, требований или технической документации делает gate stale.
5. Только при закрытых Architecture/Review gates итоговый scope commit/push-ится. После review не допускаются новые существенные tracked changes.
6. Завершение остаётся неподтверждённым до обязательного CI именно для актуального финального HEAD. При `pending` агент ждёт без корректирующих commits, PR остаётся Draft; при `unavailable` сообщает проблему; при `failed` исправляет причину, повторяет verification и применимый Reviewer lifecycle.
7. PR body актуализируется только после повторной проверки его OPEN/head/base состояния. PR body и CI metadata не меняют reviewed Git scope.
8. Только `success` обязательного CI актуального финального HEAD подтверждает завершение и позволяет перевести Draft PR в Ready for review.
9. Агент сообщает пользователю, что PR готов к ручному review и **Squash and merge**.

Если любой обязательный пункт, доступ к GitHub или CI не выполнен, stage не считается подтверждённо завершённым, PR остаётся Draft, а агент ждёт pending-проверку, исправляет failed-проверку либо сообщает конкретную unavailable-проблему.

Агент никогда не выполняет merge.

## Канонический статус до и после merge

До merge изменения, включая подготовленную `/stage-close` отметку `✅ Завершено`, существуют только в stage-ветке. Каноническое состояние проекта остаётся в `main`.

После ручного merge следующая работа начинается от синхронизированного `main`:

```bash
git switch main
git pull --ff-only
```

Удаление merged-ветки выполняется только безопасно и не является обязанностью `/stage-close`.

## Небольшие изменения вне stage

Самостоятельные инфраструктурные, документационные и bugfix-задачи выполняются в `chore/...`, `docs/...` или `fix/...`, а не в `main`. Они также проходят через PR и CI, но не создают stage checklist и не меняют roadmap status, если задача не меняет крупный этап. PR body всё равно основывается на `.github/pull_request_template.md`; неприменимые stage-поля отмечаются `N/A` с причиной.

## Документационный gate

Перед заявлением о синхронизации агент проверяет применимые поверхности: `README.md`, product/architecture/current state/backlog/decisions, сначала канонический roadmap и затем visual roadmap, текущий и затронутые старые checklist, operational instructions, локальные Markdown-ссылки, а при изменении запуска или конфигурации — `.env.example`, Docker и package scripts.

Generated files, зависимости и секретный `.env` не входят в документационный аудит. Непроверенный охват явно называется; точные числа берутся из кода или фактических проверок.

## `/handoff`

`/handoff` фиксирует состояние сессии без merge: текущую ветку, локальные изменения, связанный PR, его Draft/Ready состояние, CI, выполненные проверки, точку остановки и одно следующее действие. Он обновляет только действительно затронутую документацию и не подменяет `/stage-close`.

Handoff является производной сводкой, а не самостоятельным source of truth. Для non-stage задачи без PR Developer сообщает, что полное автоматическое восстановление после завершения сессии не гарантируется, и выдаёт структурированную task-level сводку для переноса. Для stage каноническим orchestration state остаётся checklist.

## Основные команды

| Команда | Назначение |
|---------|------------|
| `/start` | Read-only восстановление общего контекста, Git branch и PR/CI контекста. |
| `/stage-status` | Read-only статус stage, Git, PR, CI, блокеров и следующего шага. |
| `/stage-start` | Выбрать stage из roadmap, подготовить stage-ветку, анализ/checklist/план и STOP. |
| `/stage-close` | Выполнить preliminary CI, подготовить итоговый tracked scope, остановиться для Reviewer и после актуального review завершить final CI/Ready; не merge. |
| `/handoff` | Оставить проверяемый контекст текущей ветки/PR для следующей сессии. |
| `/architect` | До реализации foreground-запустить read-only Architect для значимого архитектурного вопроса и применимости Decision Gate. |
| `/review` | В текущей Developer-сессии собрать статический Git scope и foreground запустить независимый read-only Reviewer. |

```text
Не знаю, где остановился?       → /stage-status
Начинаю новый stage?            → /stage-start
Есть значимый архитектурный выбор? → /architect → решение/план без реализации
Продолжаю stage?                → checklist → следующая задача → verification
Реализация и ручная проверка готовы? → /stage-close → preliminary CI → финальный tracked scope
Итоговый scope готов?           → /review → исправления → максимум два recheck
Review актуален?                → /stage-close → final commit/push/CI → Ready
PR Ready for review?            → пользователь review → Squash and merge
Начинаю следующую работу?       → обновить main → новая ветка
```
