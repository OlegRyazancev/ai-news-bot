# /start Command

## Назначение

Read-only восстановить общий контекст проекта, текущую branch/PR/CI позицию и подтверждённый task-level orchestration state. Команда ориентирует, но не начинает и не реализует stage.

## Workflow

1. Прочитай `AGENTS.md`, `docs/DEVELOPMENT_WORKFLOW.md` и разделы **«Канонический формат task-level orchestration state»** и **«Общие инварианты»** в `.opencode/commands/handoff.md`. Последний задаёт только общий формат/validation contract; не запускай `/handoff` и не считай его отчёт source of truth.
2. Прочитай `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md` и `docs/ROADMAP.md`.
3. Прочитай checklist текущего stage, если он существует, но выбери task-level source только по правилам ниже.
4. Выполни read-only Git inspection:

   ```bash
   git branch --show-current
   git status --short --branch
   git rev-parse HEAD
   git log --oneline -10
   ```

5. Если текущая ветка не `main`, проверь все PR текущей ветки без изменений:

   ```bash
   gh pr list --head <current-branch> --state all --limit 100 --json number,url,state,isDraft,baseRefName,headRefName,body
   ```

6. Изучи только релевантный существующий код, необходимый для понимания ближайшей задачи.

Если `gh` недоступен, нет авторизации или PR отсутствует, сообщи это без догадок. Non-zero `gh pr checks` разбери как возможный pending/failed status.

## Выбор task-level source

Применяй этот алгоритм без fallback на другой источник:

1. **Roadmap stage:** если текущая ветка соответствует `stage/NN-*`, найди ровно один `docs/checklists/NN-*.md` и читай task-level state только из него. PR body может быть производной сводкой и не заменяет checklist.
2. Отсутствующий или дублированный checklist stage — process blocker. Не выбирай checklist другого номера и не восстанавливай state из PR.
3. **Non-stage branch:** для `chore/...`, `docs/...` или `fix/...` отфильтруй `gh pr list` по точному `headRefName=<current-branch>`. PR body допустим как source только если во всех состояниях найден ровно один PR, он `OPEN`, `baseRefName=main`, а head точно равен текущей ветке. Только после выбора такого PR выполни `gh pr checks <number>`.
4. `CLOSED`/`MERGED`, несколько PR, неверные head/base или неоднозначность означают `Недостаточно подтверждённых данных`; не выбирай произвольный PR.
5. **Non-stage без корректного PR:** durable task-level source отсутствует. Текущая conversation может помочь только в этой Developer-сессии, но lossy summary или handoff-текст не доказывают прохождение обязательного gate.
6. На `main` не привязывай task-level state к случайному открытому PR или checklist. Показывай его только если активный roadmap-stage source однозначно установлен проектными документами; иначе укажи `не применимо / активная задача не установлена`.

## Восстановление и validation orchestration state

1. В выбранном checklist или PR body найди точные markers `<!-- task-orchestration-state:start -->` и `<!-- task-orchestration-state:end -->` из канонического формата `/handoff`.
2. Ровно одна упорядоченная marker-пара означает один кандидат на разбор. Duplicate/unbalanced markers, несколько одноимённых разделов или неоднозначные границы — `ORCHESTRATION_STATE_CONFLICT`.
3. Если markers/section отсутствуют в старом checklist, это обратная совместимость, а не доказанное нарушение прошлого процесса. Покажи `orchestration state: unconfirmed`; все обязательные текущие gates остаются неподтверждёнными.
4. Восстанови и покажи без сокращения состава полей:
   - Architect classification/reason, analysis status, context revision, outcome, Decision Gate/reference и applied constraints;
   - Stage plan approval и approval context;
   - Reviewer classification/reason, last completed pass, reviewed scope revision, unresolved finding IDs, confirmed fixes, verification after fixes, remaining rechecks, accepted residual risks и review gate.
5. Примени ровно общие инварианты из `.opencode/commands/handoff.md`. Model fallback не создаёт новый analysis/pass. Несовместимые `Last completed pass` и `Remaining rechecks` не исправляй: верни `ORCHESTRATION_STATE_CONFLICT`, останови автоматическое продолжение и укажи оба значения.
6. Не восстанавливай пользовательское подтверждение Stage plan, resolved Decision Gate или accepted P3 без явного сохранённого confirmation context/reference. `unconfirmed` не преобразуется в успешный gate.
7. `P0`–`P2`, непринятые findings, pending/unconfirmed gate и обязательный незавершённый Architect/Reviewer являются blockers. Accepted residual risk допустим только для конкретного P3 с явным решением пользователя.

## Сверка с актуальным Git/PR/CI

- Сопоставь сохранённое состояние с текущими branch, full HEAD SHA, clean/dirty status, PR metadata и CI. Saved state не переопределяет live GitHub Actions.
- Для актуального Reviewer state должны существовать `review-payload-sha256`, content-based `substantive-scope-sha256` и `review-base` по каноническому `/review`. Exact payload hash идентифицирует исходный immutable snapshot, но freshness не определяется совпадением категорий Git или HEAD.
- Воспроизведи normalized final-content manifest и versioned serialization строго по разделу **«Freshness и scope revision»** `/review`: заново определи current merge-base, получи полный raw final-tree diff и untracked paths, выполни path preflight и локально хешируй exact bytes без вывода содержимого. Сравни current base с сохранённой review base, затем `substantive-scope-sha256`. Простое перемещение того же итогового tree между untracked/unstaged/staged/committed и bounded orchestration-state updates не делает review stale, поэтому Review → final commit без изменения содержимого остаётся актуальным.
- Изменение paths, add/delete/rename/copy semantics, exact bytes, file type/mode, review base, требований, implementation или технической документации делает `Review gate: stale`, даже если сохранено `complete`.
- Если identifier отсутствует, binary/special path или metadata нельзя однозначно нормализовать либо equivalence не доказана, freshness равна `unconfirmed` и review gate нельзя считать завершённым.
- При stale/unconfirmed scope не запускай Reviewer и не меняй state: `/start` только показывает blocker и следующий требуемый шаг.
- Content-based freshness не заменяет live PR/CI inspection: после final commit CI оценивается только для актуального HEAD.
- Отсутствие `/handoff` не является проблемой, если канонический checklist/PR body содержит актуальный валидный state. Наличие handoff-ответа не компенсирует отсутствующий канонический source.

## Формат ответа

Язык пользовательского ответа определяется разделом **«Язык общения с пользователем»** в `AGENTS.md`.

```markdown
## Сводка состояния проекта

**Текущее состояние:** <фаза и roadmap stage>
**Что работает:** <подтверждённые результаты>
**Последняя выполненная работа:** <последняя подтверждённая работа>
**Текущая ветка:** <branch + clean/dirty>
**Pull Request:** <URL + Draft/Ready/отсутствует/не применимо>
**CI:** <success/pending/failed/not run/unknown>
**Orchestration source:** <stage checklist / PR body / current session only / отсутствует>
**Architect:** <classification + analysis status + outcome + Decision Gate>
**Stage plan:** <approval + confirmation context>
**Reviewer:** <classification + last pass + remaining rechecks + review gate>
**Findings:** <unresolved IDs + accepted residual risks>
**Orchestration blockers:** <список / Нет / Недостаточно подтверждённых данных>
**Незавершённая работа:** <текущая точка>
**Рекомендуемый следующий шаг:** <одно действие>
```

## Правила

- Не изменяй файлы, Git, PR или CI.
- Не выполняй pull, switch, commit, push, создание/редактирование PR или merge.
- Не запускай build/tests/runtime verification без отдельного запроса.
- Не изменяй checklist или PR body и не запускай Architect/Reviewer.
- `main` считай каноническим; незамерженные результаты stage-ветки не описывай как уже находящиеся в `main`.
- Для начала нового stage рекомендуй `/stage-start`; для детального read-only статуса — `/stage-status`.
- При недостаточных или противоречивых данных не продолжай workflow автоматически и не заполняй пробелы conversation summary.
- Ответ должен быть кратким, но содержать orchestration blockers.
