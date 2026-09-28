# /stage-start Command

## Назначение

Начать roadmap stage в отдельной `stage/NN-short-slug`: подготовить ветку от актуального `main`, провести анализ, создать или актуализировать checklist, сформировать план и остановиться до изменения application code.

## Workflow

### 1. Прочитать контекст

Прочитай `AGENTS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md`, `docs/ROADMAP_VISUAL.md` и применимые checklist. Изучи релевантную реализацию.

Прочитай `.opencode/commands/architect.md` как канонический Architect protocol и разделы **«Канонический формат task-level orchestration state»** и **«Общие инварианты»** в `.opencode/commands/handoff.md`. Не запускай эти Markdown-команды как вложенные slash-команды и не дублируй их state/protocol в другом source of truth.

### 2. Определить целевой stage

- Используй исключительно раздел **«Текущий фокус»** канонического `docs/ROADMAP.md`.
- Возьми точные номер, название, статус, цель, критерий завершения и зависимости.
- Не выбирай stage как «первый незавершённый», если roadmap задаёт другой фокус.
- Сформируй имя `stage/NN-short-slug`, где номер двузначный, а slug короткий и соответствует названию stage, например `stage/04-llm-processing`.

### 3. Обеспечить корректную ветку

Сначала выполни:

```bash
git branch --show-current
git status --short --branch
```

Если текущая ветка `main`:

1. Убедись, что working tree чистый.
2. Если есть пользовательские, неожиданные или неясные изменения, **STOP**: ничего не stash, не discard, не commit и не переключай; сообщи пользователю.
3. Выполни `git pull --ff-only`. При ошибке или необходимости non-fast-forward **STOP** и сообщи проблему.
4. Проверь, существует ли целевая ветка локально или в `origin`; не создавай дубликат для того же stage.
5. Если ветка существует, безопасно переключись на неё (для remote — с tracking); иначе создай от текущего обновлённого `main`: `git switch -c stage/NN-short-slug`.

Если текущая ветка уже является целевой stage-веткой, продолжай в ней и сохрани существующую работу.

Если активна другая ветка, не переноси изменения и не создавай вторую stage-ветку молча. Покажи branch/status и **STOP**, чтобы пользователь подтвердил продолжение или смену контекста.

Никогда не выполняй stage/application изменения напрямую в `main`, не используй force operations и не обходи branch protection.

### 4. Провести stage-specific анализ

Определи:

- что уже реализовано и переиспользуется;
- что фактически Verified / Build-Verified / Runtime-Verified;
- чего не хватает до roadmap criterion;
- предположительно затрагиваемые части кода и документации;
- выполненные и невыполненные зависимости;
- риски и edge cases;
- in scope и out of scope;
- значимые решения, требующие Decision Gate.

### 5. Найти или создать checklist

Ищи checklist по номеру stage в `docs/checklists/`.

- Допускается максимум один файл `<двузначный номер>-<короткий-slug>.md`.
- Существующий checklist актуализируй только по фактам анализа.
- Отсутствующий checklist создай после анализа; не создавай checklist будущих stage.
- Не веди changelog внутри checklist.
- Отдельно включи **«Что тестирует агент»** и **«Что пользователь тестирует вручную»** с действиями и ожидаемыми результатами.
- Основа checklist: roadmap criterion, current state, backlog, architecture, decisions, фактический код и зависимости.
- Checklist является единственным source of truth task-level orchestration state этого stage. Не копируй state в PR body или отдельный файл.

Обязательная структура checklist:

```markdown
# Stage N — <название>

## Статус

⬜ Запланировано / 🟡 В работе / ✅ Завершено

## Цель

## Scope

### In scope

### Out of scope

## Preconditions

## Реализация

<!-- task-orchestration-state:start -->
## Task-level orchestration state

<точный формат из /handoff>
<!-- task-orchestration-state:end -->

## 1. Что тестирует агент

### Build Verification

### Runtime Verification

## 2. Что пользователь тестирует вручную

### Подготовка

### Пошаговая проверка и ожидаемые результаты

## Acceptance

## Открытые вопросы
```

Каждый раздел заполняется stage-specific содержимым. Build Verification не заменяет Runtime Verification. Ручная проверка должна содержать конкретные действия и ожидаемые результаты, а её пункты нельзя закрывать без явного подтверждения пользователя.

Для существующего checklist:

1. Найди точные markers task-level state из `/handoff`. Ровно одна упорядоченная marker-пара означает один существующий раздел.
2. Если orchestration section отсутствует, это допустимо для старого checklist: добавь ровно один канонический раздел с подтверждёнными текущими данными, а неизвестные значения укажи как `unconfirmed`. Для checklist, созданного текущим kickoff, продолжай заполнение из фактов этого запуска. Для ранее существовавшего checklist с возможной историей Architect/approval добавь безопасный state, сообщи `ORCHESTRATION_STATE_INCOMPLETE` и **STOP**, если прошлое состояние нельзя доказать без предположений.
3. Duplicate/unbalanced markers, несколько одноимённых разделов, невалидные значения или нарушение общих инвариантов `/handoff` означают `ORCHESTRATION_STATE_CONFLICT`: ничего не исправляй догадками и **STOP**.
4. Если существующий раздел не позволяет однозначно установить lifecycle position из classification, analysis status/context revision, Decision Gate и plan approval, сообщи `ORCHESTRATION_STATE_INCOMPLETE` и **STOP**. Не считай `unconfirmed` успешным gate и не запускай Architect «на всякий случай».
5. Не перезаписывай подтверждённые результаты implementation, verification, user acceptance или Reviewer. При новом разделе все неподтверждённые Reviewer fields оставь `unconfirmed`; не назначай pass, findings, fixes, counters, residual risks или gate предположительно.
6. До изменения Architect/plan state восстанови существующие classification, analysis status, context revision, Decision Gate/reference, constraints и plan approval/context. Не понижай и не обнуляй подтверждённые значения молча.

### 6. Зафиксировать существенную версию контекста

Сформируй компактную детерминированную запись `stage_context` из подтверждённых decision-driving inputs: номер/цель/criterion stage, in/out scope, constraints, затронутые компоненты и взаимодействия, применимые решения, открытые архитектурные вопросы и SHA-256 точных релевантных файлов. Не включай secrets, полные документы, нерелевантные изменения или сам generated orchestration section; если checklist является входом scope, используй только его стабильные stage-specific требования вне этого раздела. Сериализуй поля в фиксированном порядке и рассчитай SHA-256 UTF-8 bytes.

Сохрани в `Architect / Context revision` значение вида `stage-context-sha256=<hash>; basis=<краткое основание>`. Hash — идентификатор входа, а не доказательство корректности анализа.

При повторном `/stage-start` сравни текущие decision-driving inputs с сохранённой revision:

- изменение цели, scope, constraints, component boundaries/interactions, применимых решений, значимого кода или открытых вопросов является material context delta;
- форматирование, unrelated Git changes и повторное чтение того же контекста не являются delta;
- delta должна быть явно описана в `Context revision / basis` и применимом stage-specific разделе checklist до нового анализа;
- если revision невозможно воспроизвести или сведения неполны/противоречивы, поставь blocker и **STOP**, не предполагая эквивалентность контекста;
- разрешение ровно того pending Decision Gate, который уже сформулирован завершённым Architect analysis, само по себе не требует повторного анализа. Повтор допустим только если решение дополнительно изменило требования, scope, constraints или породило новый существенный вопрос.

### 7. Классифицировать Architect

До implementation обязательно зафиксируй в checklist:

```text
Architect / Classification: required | not-required
Architect / Classification reason: <конкретное обоснование по AGENTS.md>
```

Используй исключительно актуальные критерии раздела **«Architect policy»** в `AGENTS.md`; не расширяй их и не поддерживай в этой команде независимый список. В частности, полностью применимый существующий ADR без нового требования, конфликта или изменившегося ограничения не требует Architect.

Не подменяй конкретное основание общими фразами. Действующий применимый ADR не требует Architect или повторного согласования без нового требования, конфликта, изменившегося ограничения либо другого существенного обстоятельства.

Если новая classification отличается от сохранённой без документированного material context delta, это `ORCHESTRATION_STATE_CONFLICT`: **STOP**. При подтверждённом delta обнови classification/reason как текущее состояние, сохрани описание delta и не меняй Reviewer state или прежнее plan confirmation.

Если classification `not-required`:

- запиши `Analysis status: not-applicable` и `Outcome: not-applicable`;
- сохрани ранее подтверждённый `Decision Gate: resolved` и его reference; иначе зафиксируй `Decision Gate: none`, только если проверка действительно не выявила нового значимого выбора;
- для применимого существующего решения укажи точную `Decision reference` на `docs/DECISIONS.md`, иначе используй подтверждённое `not-applicable`;
- зафиксируй применимые constraints либо подтверждённое `none`;
- Architect не вызывай и переходи к планированию.

### 8. Выполнить Architect analysis, только если required

Если classification `required`, выполни канонический fixed plan `.opencode/commands/architect.md` в текущей Developer-сессии. Developer непосредственно вызывает существующий project subagent через поддерживаемый OpenCode tool с `agent=architect`, `background=false` и model chain, разрешённой protocol. Не вызывай Markdown-команду `/architect`, не создавай отдельного Developer agent и не пересказывай protocol вместо его выполнения.

Полностью сохрани требования protocol к обязательным входам, минимальному context manifest, path/content security preflight, immutable serialized payload и hashes, foreground model fallback, числу model attempts/steps, quality gate и безопасному отчёту. На неизменную context revision допускается один architecture analysis; model fallback внутри него остаётся частью того же анализа.

Для новой required revision до вызова запиши `Analysis status: not-run`, а неподтверждённые `Outcome`, Decision Gate/reference и constraints оставь `unconfirmed`. Не затирай ими ранее подтверждённые значения другой revision: при их наличии сначала должен быть документирован material context delta.

Идемпотентность:

- если для текущей context revision уже сохранены `Classification: required`, `Analysis status: completed` и содержательный outcome, не вызывай Architect повторно;
- если предыдущий analysis `blocked`, не повторяй его без устранённого и зафиксированного blocker либо material context delta;
- material context delta разрешает не более одного нового анализа для новой revision, но не требует его, если delta только фиксирует точный выбор из уже проанализированного pending gate;
- не создавай повторный Decision Gate без нового существенного обстоятельства;
- если существующий state не позволяет доказать revision или факт завершённого анализа, **STOP**, а не повторный вызов «на всякий случай».

Если Architect недоступен, вернул `ARCHITECTURE_CONTEXT_REQUIRED`, обнаружена `IMMUTABLE_CONTEXT_VIOLATION`, security preflight заблокирован либо quality gate не пройден:

- запиши `Analysis status: blocked` и краткий безопасный blocker в `Outcome`, не сохраняя transcript/raw provider payload;
- сохрани уже подтверждённые state и constraints без обнуления;
- не формируй финальный implementation plan и **STOP** до устранения blocker.

После пригодного результата запиши `Analysis status: completed`, context revision, краткий actionable outcome и applied constraints. Полный transcript Architect не сохраняй.

### 9. Применить Architecture Decision Gate

Проверь результат stage-анализа, применимые ADR и пригодный Architect outcome, если он требовался.

Если существующие решения полностью применимы и нового существенного выбора нет:

- не запрашивай повторное согласование;
- сохрани ранее подтверждённый `Decision Gate: resolved` с его reference; если gate ранее не требовался, зафиксируй `Decision Gate: none` и точную применимую `Decision reference` либо подтверждённое `not-applicable`;
- продолжай kickoff.

Если требуется новое значимое архитектурное/data/integration решение:

1. зафиксируй `Decision Gate: pending`, а неподтверждённую reference оставь `unconfirmed`;
2. представь пользователю 2–3 варианта с плюсами, минусами и влиянием на stage;
3. останови дальнейшее планирование и **STOP** до явного решения пользователя;
4. после ответа зафиксируй решение согласно существующему workflow в `docs/DECISIONS.md`;
5. только затем поставь `Decision Gate: resolved`, добавь точную ссылку и продолжай.

Architect консультирует, но не принимает решение за пользователя. Молчание и общий призыв продолжить не закрывают gate. При повторном запуске с уже зафиксированным решением не открывай тот же gate заново без material context delta.

### 10. Подготовить implementation plan

Перенеси подтверждённые Architect constraints, risks и дополнительные verification requirements в stage-specific разделы checklist и в implementation plan. Не добавляй отдельное поле к каноническому orchestration schema: verification requirements размещай в существующих разделах **«Что тестирует агент»**, **«Что пользователь тестирует вручную»**, Acceptance/Risks и ссылайся на них из `Applied constraints` при необходимости.

Сформируй последовательность крупных изменений и проверок. Не начинай application implementation.

Для Stage plan:

- при первом сформированном плане запиши `Approval: pending`, `Approval context: unconfirmed` и дождись явного ответа пользователя;
- `confirmed` и точный approval context записывай только после явного подтверждения конкретной revision плана;
- при повторном `/stage-start` не сбрасывай ранее подтверждённые `Approval: confirmed` и context;
- если material context delta изменил подтверждённый план, сохрани прежние confirmation fields без изменений, явно отметь mismatch revision в **«Открытых вопросах»** и kickoff report как blocker и **STOP** для повторного подтверждения. Обновляй approval fields только после нового явного ответа пользователя.

### 11. Выдать отчёт о старте этапа

Язык пользовательского отчёта определяется разделом **«Язык общения с пользователем»** в `AGENTS.md`.

```text
Этап:
Ветка:
Синхронизация с main:
Текущее состояние:
Уже доступно:
Не хватает:
В scope:
Вне scope:
Требуемые решения:
Риски:
Checklist:
Architect classification и причина:
Architect analysis и context revision:
Architecture Decision Gate:
Stage plan approval:
Orchestration blockers:
План реализации:
```

Если kickoff остановлен раньше из-за state conflict, Architect blocker или pending Decision Gate, выдай доступную часть отчёта, точный STOP condition и одно требуемое действие; не изображай незавершённый implementation plan как готовый.

### 12. STOP

После создания ветки, анализа, checklist и плана остановись. Application code, Prisma schema, dependencies и другая реализация stage меняются только после явного подтверждения пользователя.

Branch creation, анализ и checklist не считаются application implementation. Не создавай PR только ради kickoff: Draft PR создаётся после первого meaningful push в ходе реализации. Общие разрешения на commit/push не отменяют явные ограничения пользователя для конкретной задачи.
