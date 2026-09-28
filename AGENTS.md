# AGENTS.md

> Постоянные инструкции для любого AI-агента, работающего над проектом.

## Основные принципы

**Перед началом любой работы:**
1. Изучи контекст проекта: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`
2. Сначала изучи существующую реализацию — пойми, что уже есть
3. Не дублируй существующую функциональность
4. Не меняй архитектуру без явного запроса пользователя

**Во время разработки:**
- Реализуй запрошенные изменения автономно
- Устанавливай необходимые зависимости самостоятельно
- Запускай сборку/тесты после изменений (`npm run build`, `npm run lint`)
- Исследуй и исправляй ошибки самостоятельно
- Проверяй `git diff` после изменений
- Держи документацию проекта актуальной
- Никогда не коммить секреты (токены, пароли, ключи)
- Соблюдай branch/PR/CI процесс ниже; отдельное подтверждение для разрешённых commit, push и Draft PR не требуется

## Режим Vibe Coding

Пользователь работает в **режиме vibe coding** — он не пишет реализацию вручную. Ты — основной исполнитель задач разработки. Пользователь задаёт направление; ты даёшь реализацию.

## Язык общения с пользователем

- Все предназначенные пользователю ответы, отчёты, результаты проверок, сообщения об ошибках и блокирующих проблемах, вопросы Decision Gate, итоговые отчёты команд и описания Pull Request по умолчанию пиши на русском языке.
- Имена классов, методов и переменных, технические идентификаторы, названия библиотек, команды терминала и общепринятые технические термины не переводи ради соблюдения этого правила.
- Оригинальные сообщения компилятора, тестов и внешних инструментов можно цитировать без перевода, но выводы и пояснения к ним давай на русском языке.
- `AGENTS.md` остаётся единственным нормативным источником этого правила; документы команд должны ссылаться на него, а не дублировать требования.

## Обязательный рабочий процесс

1. **Контекст** — Изучи обязательные документы и существующую реализацию
2. **Ветка** — Выполняй изменения только в подходящей `stage/...`, `chore/...`, `docs/...` или `fix/...` ветке
3. **Анализ и план** — Определи scope и кратко объясни, что будешь делать (для значимых изменений)
4. **Реализация** — Пиши код, устанавливай зависимости, настраивай
5. **Проверка** — Запусти `npm run build` и `npm run lint` минимум
6. **Документация** — Обнови `docs/CURRENT_STATE.md`, `docs/BACKLOG.md` при необходимости
7. **PR/CI** — Commit и push выполняются в рабочую ветку; изменения проходят через PR и GitHub Actions
8. **Отчёт** — Резюмируй, что сделано, что работает, следующие шаги

## Единая мультиагентная оркестрация

### Роли и последовательность

- Текущий основной агент в Developer-сессии является единственным координатором задачи. Отдельный Developer agent не создаётся.
- Architect и Reviewer — вспомогательные read-only subagents. Они не координируют друг друга, не принимают решения за пользователя и не заменяют обязанности Developer.
- Developer напрямую вызывает существующих subagents через поддерживаемый OpenCode tool, применяя канонические контракты `.opencode/commands/architect.md` и `.opencode/commands/review.md`. Вложенные вызовы Markdown slash-команд не проектируются и не считаются поддерживаемой оркестрацией.
- Нормативная последовательность задачи:

```text
Task intake
→ Architect classification
→ Architect, только если required
→ Architecture Decision Gate
→ явное подтверждение stage plan, если требуется
→ implementation
→ применимая verification
→ preliminary `/stage-close` и CI, если это roadmap stage
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

- Обязательный gate нельзя считать выполненным по умолчанию, по молчанию пользователя или только по наличию кода. При blocker Developer останавливает затронутую часть workflow, сообщает причину и требуемое действие.
- Эта policy является обязательной инструкцией для Developer, а не программно гарантированной state machine OpenCode. Существующие требования к stage approval, verification, Git/PR/CI и ручному merge сохраняются.

### Architect policy

До реализации Developer классифицирует Architect как `required` или `not-required` и фиксирует конкретное обоснование.

Architect `required`, если задача содержит существенное изменение хотя бы одной из областей:

- архитектурные контракты или границы компонентов;
- взаимодействие компонентов;
- persistence, concurrency или idempotency semantics;
- внешние интеграции;
- security/trust boundaries;
- инфраструктурная архитектура или runtime topology;
- обработка существенных partial failures, не покрытая действующими решениями.

Architect `not-required` для локального bugfix, простого refactoring, тривиальной документации, реализации полностью применимого существующего ADR и обычного code review. Действующий ADR не требует повторного согласования без нового требования, конфликта, изменившегося ограничения или иного существенного нового обстоятельства.

Для неизменной задачи разрешён максимум один архитектурный анализ. Model fallback внутри одного запуска канонического `/architect` protocol остаётся частью того же анализа и не увеличивает этот счётчик. Дополнительный анализ разрешён только после зафиксированного существенного изменения требований, решений или контекста с описанием material context delta; повторный анализ без новых данных запрещён.

Developer проверяет содержательность результата Architect и переносит применимые ограничения, риски и verification requirements в существующий plan/checklist. Если обязательный Architect недоступен, implementation блокируется. Если выявлено новое значимое решение, применяется Architecture Decision Gate: Developer останавливается до явного решения пользователя и фиксирует принятое решение в `docs/DECISIONS.md`. Существующий `.opencode/commands/architect.md` остаётся каноническим для security preflight, immutable context, model fallback, model-attempt limits и quality gate; эти протоколы здесь не дублируются.

### Reviewer policy

После implementation и применимой verification Developer классифицирует Reviewer как `required` или `not-required` и фиксирует конкретное обоснование.

Reviewer `required` для:

- application code;
- конфигурации приложения;
- OpenCode agents и commands;
- значимых изменений development workflow;
- существенных изменений технической документации.

Мотивированный `not-required` допускается только для тривиальных текстовых изменений, не меняющих поведение, process contract или технический смысл.

Initial review запускается только после implementation и применимой verification. Для roadmap stage initial review выполняется после успешного preliminary CI и подготовки всех существенных phase-2 изменений checklist и документации: Reviewer должен видеть итоговый tracked scope до финального commit/push/CI. `/stage-close` не вызывает Reviewer автоматически, а останавливается для внешнего single-pass `/review`; после актуального review повторный `/stage-close` продолжает финальные gates. Developer проверяет доказательность findings по коду и требованиям, исправляет только подтверждённые замечания и повторяет применимые проверки перед recheck.

Reviewer lifecycle ограничен:

- один `initial` pass;
- не более одного `recheck-1` и одного `recheck-2`;
- каждый вызов Reviewer выполняет ровно один review pass;
- model fallback внутри одного pass не меняет его имя и не расходует recheck;
- recheck запрещён без исправлений или релевантного изменения scope и без повторной применимой verification;
- после `recheck-2` новые автоматические recheck запрещены.

Подтверждённый post-review runtime/acceptance defect может открыть следующий существующий recheck, если у него есть stable ID, проверяемое evidence, относящееся исправление и успешная повторная verification. Это не разрешает повторный `initial`, не сбрасывает counters и не превращает произвольное новое требование в finding. Для согласованных `ORCH-FP-001` и `ORCH-ENC-002` historical `initial` сохраняется с двумя оставшимися recheck, legacy fingerprint остаётся `unconfirmed`, а после исправлений разрешён только `recheck-1`, создающий новую согласованную пару exact payload/v1 substantive identifiers для полного актуального scope.

Существующий `.opencode/commands/review.md` остаётся каноническим для snapshot, security preflight, model fallback, model-attempt limits и отчёта одного pass. Findings Reviewer не отменяют обязательные build/tests/runtime/user verification, документационный gate или CI.

### Substantive scope fingerprint

- Единственная реализация fingerprint — `.opencode/scripts/substantive-scope.mjs`, schema `ai-news-bot/substantive-scope@1`. `/review`, `/start`, `/stage-status`, `/handoff` и `/stage-close` обязаны использовать этот executable и не воспроизводить serialization/hashing самостоятельно.
- Обязательный порядок: `inspect` → validation paths/metadata/`inspection_sha256` → существующий path/content security preflight → exact `approved_paths` → `calculate` с подтверждёнными schema/base/hash. `calculate` до успешного preflight запрещён.
- Executable не является sandbox, не объявляет содержимое безопасным, не доказывает выполнение Developer preflight и не создаёт атомарный snapshot всей working tree. Любая ошибка, unknown/missing schema, legacy unversioned hash, blocked preflight, changed inspection manifest или недоказуемая equivalence означает fail-closed `freshness: unconfirmed` без автоматического transition.
- Current reviewed revision хранит `substantive-scope-schema`, `review-payload-sha256`, `substantive-scope-sha256` и `review-base`. Historical hash без schema нельзя ретроактивно объявлять v1.

### Residual risk policy

Если после `recheck-2` остаются подтверждённые findings, Developer останавливает workflow и не объявляет задачу или stage завершёнными.

- `P0`, `P1` и `P2` по умолчанию блокируют завершение.
- Конкретный `P3` может быть принят как residual risk только по явному решению пользователя с фиксацией finding ID и принятого риска в task-level state.
- Молчание пользователя, отсутствие ответа или общий призыв продолжить не являются принятием residual risk.
- Принятие residual risk не отменяет обязательную verification, CI или ручной merge.

### Task-level orchestration state

Developer поддерживает минимальное проверяемое состояние задачи:

- Architect classification (`required` / `not-required`) и обоснование;
- Architect outcome и применённые ограничения без полного transcript;
- Architecture Decision Gate (`none` / `pending` / `resolved`);
- ссылка на согласованное архитектурное решение, если оно требовалось;
- Stage plan approval (`not-applicable` / `pending` / `confirmed`);
- Reviewer classification (`required` / `not-required`) и обоснование;
- последний завершённый pass (`none` / `initial` / `recheck-1` / `recheck-2`);
- unresolved finding IDs;
- выполненные исправления;
- результаты повторной verification;
- remaining rechecks (`2` / `1` / `0`);
- явно accepted residual risks с finding ID и решением пользователя.

Не сохраняй полные transcripts, chain-of-thought, скрытые рассуждения или raw provider payload. Состояние обновляется по подтверждённым фактам; неизвестное не заменяется предположением.

### Источники истины оркестрации

- Глобальные orchestration rules: `AGENTS.md`.
- Архитектурные решения: `docs/DECISIONS.md`.
- Orchestration state roadmap stage: существующий stage checklist.
- Orchestration state non-stage задачи: текущая Developer-сессия до публикации, затем body существующего PR.
- Реализация и точный changed scope: Git.
- Результат CI для конкретного HEAD: GitHub Actions.
- `/handoff`: производная сводка, а не самостоятельный source of truth.

Не дублируй один task-level state как независимые канонические записи. Для stage PR body может содержать производную сводку или ссылку на checklist, но checklist остаётся каноном. Если non-stage задача не имеет PR и Developer-сессия завершается, полное автоматическое восстановление не гарантируется; до обновления `/handoff` Developer обязан явно сообщить это ограничение и предоставить структурированную сводку для переноса.

## GitHub branch / PR / CI

- `main` — default/protected branch и каноническое состояние проекта. Application/stage work напрямую в `main` запрещена.
- Один roadmap stage = одна ветка = один PR. Имя stage-ветки: `stage/NN-short-slug`, например `stage/04-llm-processing`.
- Для небольших независимых изменений разрешены ветки `chore/...`, `docs/...` и `fix/...`.
- Новая stage-ветка создаётся от чистого актуального `main`, синхронизированного только безопасным fast-forward: `git pull --ff-only`.
- После первого meaningful push stage-ветки агент создаёт Draft PR неинтерактивной командой `gh pr create --draft --base main --head <текущая ветка> --title "<PR title>" --body-file <temporary-body-file>`. Body формируется на основе `.github/pull_request_template.md`; временный файл хранится вне Git и не коммитится. Для non-stage PR неприменимые stage-поля помечаются `N/A` с причиной.
- PR поддерживается актуальным по мере работы. CI проверяется через `gh pr checks`; required check `CI/Lint, build, and test (pull_request)` нельзя переименовывать без необходимости.
- Перед созданием или изменением PR агент проверяет все PR текущей ветки: допустим только один `OPEN` PR с `head=<текущая ветка>` и `base=main`. При найденном `CLOSED`/`MERGED` PR, неверных head/base или неоднозначности агент останавливается и не создаёт дубликат.
- PR body читается и записывается только byte-safe способом: strict UTF-8 без BOM/replacement characters, без console/PowerShell pipe transcoding. Изменение сохраняет exact Unicode text вне единственной bounded marker-пары, использует уникальный temporary file вне Git через byte API и `gh ... --body-file`, затем обязательно повторно получает remote body и сравнивает exact text/hash/markers. Любое расхождение блокирует дальнейший lifecycle. Полный operational protocol определён в `.opencode/commands/handoff.md`.
- Если `gh` отсутствует, не авторизован или GitHub недоступен, GitHub gate считается незавершённым: нельзя объявлять CI успешным или переводить PR в Ready. Агент сообщает конкретную причину и необходимое действие, не устанавливая и не перенастраивая инструменты без необходимости.
- `/stage-close` выполняется в две фазы. Phase 1 после предварительных local/runtime/user/docs и Architecture gates push-ит preliminary HEAD без финальной отметки и ждёт его CI. Phase 2 после успешного preliminary CI подготавливает все финальные существенные checklist/documentation/status изменения и выполняет verification итогового tracked scope, затем останавливается для внешнего Reviewer lifecycle. Только актуальный review итогового scope разрешает финальный commit/push и обязательный CI финального HEAD; после review допустимы лишь bounded orchestration-state updates, category-only перенос проверенных bytes в commit и PR-body/CI metadata. Любое новое существенное изменение делает review stale и блокирует Ready. При `pending` агент ждёт без лишних корректирующих commits и PR остаётся Draft; при `unavailable` сообщает проблему и не объявляет этап завершённым; при `failed` исправляет причину, повторяет verification и применимый Reviewer lifecycle; только `success` актуального финального HEAD подтверждает завершение и разрешает Ready for review.
- Merge всегда выполняет только пользователь; предпочтительный метод — **Squash and merge**. После merge локальный `main` синхронизируется перед следующей работой.

Агент может без отдельного разрешения пользователя:

- создавать `stage/...`, `chore/...`, `docs/...` и `fix/...` ветки;
- делать commits и push текущей рабочей ветки;
- создавать Draft PR, обновлять PR body, смотреть checks и исправлять CI в текущей рабочей ветке;
- переводить полностью проверенный Draft PR в Ready for review.

Агенту запрещено:

- commit или push напрямую в `main`;
- force push;
- merge PR или закрывать PR без явной команды пользователя;
- обходить branch protection/ruleset либо отключать/ослаблять CI ради успешного merge;
- удалять `main`;
- коммитить secrets.

Явное ограничение пользователя для конкретной задачи (например, «не делать commit/push/PR») имеет приоритет над общими разрешениями выше.

## Правило Runtime Verification

**Никогда не утверждай, что фича или внешняя интеграция работает в runtime, если это не было фактически выполнено и проверено.**

- Успешная компиляция/сборка доказывает только корректность сборки
- `npm run build` проходит ≠ бот работает в Telegram
- Схема БД существует ≠ БД подключена и протестирована
- Обработчик команды написан ≠ команда протестирована с реальным Telegram API

## Гигиена документации

- `AGENTS.md` — нормативные правила поведения AI-агента
- `docs/DEVELOPMENT_WORKFLOW.md` — человекочитаемое описание полного процесса разработки
- `docs/DAILY_WORKFLOW.md` — краткая ежедневная инструкция для пользователя
- При расхождении `AGENTS.md` и `docs/DEVELOPMENT_WORKFLOW.md` приоритет имеет `AGENTS.md`
- `docs/DEVELOPMENT_WORKFLOW.md` обновляется при существенном изменении lifecycle этапа, основных OpenCode-команд или общего процесса разработки
- `docs/DAILY_WORKFLOW.md` обновляется при изменении повседневной последовательности действий пользователя
- Не обновляй workflow-документы при каждом мелком изменении application code
- `docs/CURRENT_STATE.md` — только снимок текущего состояния, не история
- Не добавляй транскрипты диалогов или рассуждения
- Git хранит историю; документы остаются краткими
- Обновляй документацию под код, а не под желания
- `README.md` — актуальная входная точка проекта; при изменении пользовательских возможностей, структуры, запуска, конфигурации или команд он обязательно проверяется и при необходимости обновляется
- `docs/ROADMAP.md` — единственный канонический roadmap и source of truth по крупным этапам проекта; он обновляется только при изменении статуса крупного этапа, milestone или направления проекта
- `docs/ROADMAP_VISUAL.md` — производное визуальное представление roadmap для пользователя
- `docs/ROADMAP_VISUAL.md` обновляется только после изменения `docs/ROADMAP.md` или при смене текущего крупного milestone
- Названия этапов, их номера, статусы и текущий фокус в `docs/ROADMAP_VISUAL.md` должны строго соответствовать `docs/ROADMAP.md`
- Агент не должен самостоятельно изменять статус этапа только в `docs/ROADMAP_VISUAL.md`
- При изменении статуса этапа сначала обновляется `docs/ROADMAP.md`, затем с ним синхронизируется `docs/ROADMAP_VISUAL.md`
- В `docs/ROADMAP_VISUAL.md` нельзя добавлять новые требования, архитектурные решения или задачи
- Мелкие задачи остаются в `docs/BACKLOG.md` и `docs/CURRENT_STATE.md` и не должны постоянно переписывать roadmap
- При любом расхождении между `docs/ROADMAP.md` и `docs/ROADMAP_VISUAL.md` приоритет всегда у `docs/ROADMAP.md`
- Roadmap должен отражать фактическое, а не желаемое состояние проекта
- Этап считается завершённым только после выполнения соответствующего критерия завершения
- Закрытые checklist сохраняют stage-specific scope и подтверждённые факты этапа, но не должны содержать неограниченные по времени инструкции или описания текущего поведения, которые стали ложными; такие места обновляются либо явно помечаются как заменённые последующим этапом

## Gate синхронизации документации

Перед тем как отметить пункт «документация синхронизирована» или заявить, что все файлы согласованы, агент обязан выполнить repository-wide аудит применимых поверхностей:

- `README.md`, `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/BACKLOG.md`, `docs/DECISIONS.md`;
- сначала канонический `docs/ROADMAP.md`, затем `docs/ROADMAP_VISUAL.md`;
- checklist текущего этапа и затронутые checklist предыдущих этапов;
- `.env.example`, Docker-конфигурацию и package scripts, если менялись запуск, конфигурация или зависимости;
- пользовательские команды, operational instructions, статусы интеграций, placeholders, точные количества источников/тестов и другие дублируемые факты;
- локальные Markdown-ссылки и финальный `git diff`;
- актуальность PR body и результаты GitHub Actions, если работа ведётся через PR.

Точные количества тестов, источников и другие измеримые значения берутся из фактической проверки или кода, а не переносятся из старых документов. Generated files, зависимости и секретный `.env` не считаются документацией; секреты нельзя читать или выводить ради аудита. Если полный применимый аудит не выполнен, нельзя утверждать «все файлы синхронизированы» — нужно явно назвать проверенный охват и исключения.

## Жизненный цикл этапа

1. Каждый крупный этап из `docs/ROADMAP.md` проходит: **Актуальный main → Stage branch → Анализ/checklist → Architect classification → Architect при `required` → Decision Gate → План → Подтверждение пользователя → Реализация → Verification → preliminary `/stage-close`/CI → финальный tracked scope → Reviewer classification → review lifecycle при `required` → финальный commit/push/CI → Ready for review → Ручной merge**.
2. Для каждого активного этапа существует максимум один checklist в `docs/checklists/` с именем `<двузначный номер>-<короткий-slug>.md`.
3. Checklist создаётся агентом только после анализа текущего состояния и до начала реализации этапа. Пользователь не должен создавать его вручную.
4. Checklist формируется на основе `docs/ROADMAP.md`, `docs/CURRENT_STATE.md`, `docs/BACKLOG.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` и фактического кода.
5. Checklist можно актуализировать во время разработки, если изменились требования или выявлены дополнительные обязательные проверки.
6. Checklist отражает только актуальное состояние этапа; историю его изменений хранит Git, changelog внутри checklist не ведётся.
7. Нельзя удалять обязательный пункт только потому, что реализация его не покрыла. При изменении продукта или границ этапа сначала синхронизируется соответствующий source-of-truth документ.
8. Этап нельзя отмечать завершённым в `docs/ROADMAP.md`, пока не выполнены все обязательные пункты checklist и критерий завершения этапа.
9. Build Verification не заменяет Runtime Verification.
10. Мелкие задачи не добавляются в roadmap; они остаются в checklist, `docs/BACKLOG.md` или `docs/CURRENT_STATE.md` в зависимости от назначения.
11. При изменении checklist агент проверяет, требуют ли актуализации `docs/CURRENT_STATE.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/ROADMAP_VISUAL.md` и `docs/DECISIONS.md`.
12. `/stage-status` — read-only команда для быстрого восстановления рабочего контекста; она не изменяет код, документацию, checklist, Git, PR или статусы.
13. При расхождении документов `/stage-status` только сообщает о проблеме и ничего не исправляет.
14. Source of truth для `/stage-status` остаются соответствующие проектные документы.
15. Каждый checklist должен содержать два явно разделённых раздела проверки: **«Что тестирует агент»** (build, lint, тесты и доступная runtime-проверка) и **«Что пользователь тестирует вручную»** (пошаговые действия и ожидаемые результаты); пользовательские пункты отмечаются выполненными только после явного подтверждения пользователя.
16. Подтверждение ручной проверки закрывает только соответствующие пользовательские пункты checklist и само по себе не закрывает этап.
17. Branch-only статус этапа `✅ Завершено` и переключение roadmap-фокуса подготавливаются только в phase 2 `/stage-close` после успешного CI preliminary HEAD либо после отдельного явного запроса пользователя «закрой этап» с теми же обязательными gates. Эти tracked изменения входят в итоговый snapshot Reviewer и до актуального review, final CI и merge не означают подтверждённого или канонического завершения.
18. Если пользователь обнаружил дефект во время ручной приёмки, затронутые acceptance/verification-пункты снова считаются незавершёнными. После исправления обязательны повторные build, lint, применимые тесты, targeted runtime-проверка, повторное подтверждение пользователя, аудит документации и финальный diff review.
19. `/stage-start` определяет этап только по `docs/ROADMAP.md`, обеспечивает корректную stage-ветку, выполняет анализ/checklist/план и останавливается до изменения application code.
20. `/stage-close` выполняется только в соответствующей stage-ветке: сначала подтверждает предварительные gates, push-ит незакрывающие stage изменения и ждёт успешный preliminary CI; затем подготавливает и проверяет весь финальный tracked scope и останавливается для внешнего Reviewer lifecycle. Повторный `/stage-close` при актуальном review выполняет финальный commit/push, ждёт CI этого HEAD и только после успеха переводит PR в Ready for review; merge не выполняет.
21. Если локальные проверки, GitHub-доступ или CI падают/недоступны, этап не закрывается: агент исследует и исправляет доступную проблему в рамках текущей stage-ветки либо сообщает конкретное требуемое действие.
22. `main` остаётся каноническим состоянием до merge PR. Подготовленный `/stage-close` статус становится каноническим только после merge; следующая работа начинается от обновлённого `main`.

## Definition of Done крупного этапа

Этап готов к закрытию только когда:

- обязательная реализация завершена;
- task-level orchestration state актуален и согласован с текущим scope;
- Architect classification зафиксирована, при `required` анализ завершён, нет pending Architecture Decision Gate, а Stage plan явно подтверждён;
- Reviewer classification зафиксирована после подготовки итогового tracked scope, при `required` review lifecycle завершён, проверенный scope актуален и нет непринятых blocking findings;
- `npm run build` проходит;
- `npm run lint` проходит;
- тесты проходят, если они существуют или требуются этапом;
- необходимые runtime-проверки фактически выполнены;
- все обязательные пункты checklist закрыты;
- документация синхронизирована;
- выполнен применимый repository-wide аудит документации;
- `git diff` просмотрен;
- нет незадокументированных архитектурных решений;
- изменения committed и pushed в stage-ветку;
- PR существует (Draft до завершения gates) и его body актуален;
- GitHub Actions CI для актуального head commit прошёл успешно.

После актуального review финальный commit может только зафиксировать те же проверенные bytes и разрешённые bounded orchestration-state updates. Category-only перемещение неизменного содержимого между untracked/unstaged/staged/committed не делает review stale; это подтверждается content-based `substantive_scope_sha256` из `/review`. Любое изменение итогового содержимого, путей, rename/delete/add semantics, значимой Git metadata, требований или технической документации требует freshness check и блокирует Ready до разрешённого Reviewer transition. Если эквивалентность доказать нельзя, применяется fail-closed поведение.

Если хотя бы один обязательный пункт не выполнен, этап нельзя объявлять подтверждённо завершённым или переводить PR в Ready for review. Единственное промежуточное исключение — branch-only подготовка completion/status changes в phase 2 после successful preliminary CI, чтобы Reviewer проверил полный итоговый tracked scope; она не закрывает stage. Даже после успешного `/stage-close` канонический статус в `main` меняется только после ручного merge пользователем.

## Decision Gate

Если во время анализа или реализации возникает отсутствующее в `docs/DECISIONS.md` решение, способное существенно повлиять на архитектуру, данные, интеграции или дальнейшие этапы, агент обязан:

1. Не выбирать вариант молча и остановить реализацию в затронутой части.
2. Показать пользователю, что требуется решить.
3. Предложить 2–3 разумных варианта с преимуществами, недостатками и влиянием на текущий этап.
4. Дождаться решения пользователя.
5. После решения обновить `docs/DECISIONS.md`.

Мелкие implementation details, не влияющие на архитектуру или scope, агент выбирает самостоятельно.
