# /stage-status Command

## Назначение

Read-only восстановление рабочего контекста: roadmap stage, текущая Git-ветка и clean/dirty status, связанный PR и Draft/Ready состояние, CI, task-level orchestration state, точка остановки, одно следующее действие, блокеры и необходимые решения.

Команда ничего не изменяет локально или на GitHub.

## Источники истины

Прочитай:

1. `docs/ROADMAP.md` — текущий фокус, точный статус и следующий milestone.
2. `docs/CURRENT_STATE.md` — подтверждённые результаты.
3. Checklist текущего/связанного с веткой stage из `docs/checklists/`.
4. `docs/BACKLOG.md` — ближайшие задачи.
5. `docs/DECISIONS.md` — только релевантные открытые решения.
6. `.opencode/commands/handoff.md` — только канонический формат task-level state и общие инварианты, не handoff-отчёт как state.
7. `.opencode/commands/start.md` — единые разделы **«Выбор task-level source»**, **«Восстановление и validation orchestration state»** и **«Сверка с актуальным Git/PR/CI»**.
8. Git и GitHub metadata командами ниже.

Не заменяй verification ожиданиями или наличием кода.

Не создавай отдельные правила source selection, pass counters, stale scope или blockers. Примени без отклонений тот же алгоритм, что `/start`, но выведи более подробный stage-oriented status. Не запускай `/start` или `/handoff` как вложенную slash-команду.

## Read-only Git/GitHub inspection

Выполни:

```bash
git branch --show-current
git status --short --branch
git rev-parse HEAD
```

Если текущая ветка не `main` и имеет remote/PR-контекст, read-only проверь:

```bash
gh pr list --head <current-branch> --state all --limit 100 --json number,url,state,isDraft,baseRefName,headRefName,body
```

Не создавай PR и не меняй его состояние/body. Если `gh` недоступен, авторизация отсутствует или PR не найден, сообщи фактический результат (`Недоступно` / `PR отсутствует`), не угадывай.

Для PR сначала примени единый selection algorithm `/start`: допустим только ровно один `OPEN` PR во всех состояниях с base `main` и точным head текущей ветки. Только после выбора выполни `gh pr checks <number>`. CI опиши как `success`, `pending`, `failed`, `not run` или `unknown` только по фактическому выводу. Non-zero exit `gh pr checks` может означать pending/failed; проанализируй список checks, а не называй это автоматически ошибкой `gh`.

## Определение состояния

### Roadmap stage

- Используй раздел **«Текущий фокус»** `docs/ROADMAP.md`, а не первый незавершённый этап.
- Возьми точные номер, название и статус.
- Если stage-ветка содержит подготовленное `/stage-close` переключение roadmap на следующий stage, явно укажи, что это состояние ветки/PR; до merge каноническим остаётся состояние `main`.

### Checklist и точка остановки

- Найди checklist по двузначному номеру stage. Если branch `stage/NN-*` относится к завершаемому stage, проверь также этот checklist.
- При отсутствии или дубликате checklist сообщи нарушение процесса, ничего не создавай.
- Кратко назови последние подтверждённые результаты и первый актуальный обязательный открытый пункт.
- Build-Verified не означает Runtime-Verified.
- При противоречии документов ничего не исправляй: покажи рассинхронизацию.

### Orchestration state

- Для `stage/NN-*` читай state только из единственного checklist того же `NN`. Для non-stage branch используй только body единственного корректного PR. Остальные случаи обрабатывай точно по `/start`.
- Старый checklist без orchestration section допустим: покажи `Недостаточно подтверждённых данных`, но не называй сам факт отсутствия ретроспективным нарушением процесса.
- Покажи Architect classification/reason, analysis status/outcome, context revision, Decision Gate/reference и applied constraints.
- Покажи Stage plan approval и confirmation context. Отсутствие явного сохранённого подтверждения означает `pending`/`unconfirmed`, а не approval.
- Покажи Reviewer classification/reason, last completed pass, reviewed scope revision, remaining rechecks, unresolved finding IDs, confirmed fixes, verification after fixes, accepted residual risks и review gate.
- Проверь counter matrix и остальные общие инварианты из `/handoff`. Model fallback не увеличивает pass/recheck.
- Определи stage-close position: до preliminary close, ожидание preliminary CI, подготовка/verification phase-2 tracked scope, ожидание Reviewer, исправления/recheck, финальный commit/CI либо Ready.
- Сверь reviewed scope с текущим Git, воспроизведя единый versioned content-based contract раздела **«Freshness и scope revision»** `/review`, включая current merge-base, raw final-tree diff, untracked paths, path preflight и локальные exact-byte hashes без вывода содержимого. Category-only перенос того же итогового tree между untracked/unstaged/staged/committed и bounded orchestration-state updates не делает gate stale; изменение содержимого, paths, add/delete/rename/type/mode/base metadata, требований или технической документации делает gate `stale`. Невоспроизводимая equivalence — `unconfirmed`.
- Если pass/counter противоречат друг другу, выведи `ORCHESTRATION_STATE_CONFLICT`, оба значения и запрет автоматического продолжения. Не исправляй state в read-only команде.
- `P0`–`P2`, непринятые findings, stale/unconfirmed required review, pending Decision Gate, неподтверждённый plan и обязательный незавершённый Architect являются orchestration blockers.
- Не требуй Reviewer до подготовки и verification итогового phase-2 tracked scope. После этой точки при required Reviewer рекомендуй внешний `/review`; `/stage-close` сам его не запускает.
- Не сообщай `Stage подготовлен к Ready` и не рекомендуй финальное продолжение `/stage-close`, пока каждый обязательный orchestration gate не подтверждён каноническим source и актуальным итоговым scope.

### Git status

Покажи:

- точное имя ветки;
- `clean` или `dirty`;
- количество staged, unstaged и untracked изменений;
- общий тип файлов, если он виден без diff.

### Следующий шаг

Дай ровно одно конкретное действие по приоритету:

1. устранить подтверждённую рассинхронизацию/неожиданные Git changes;
2. устранить `ORCHESTRATION_STATE_CONFLICT` или stale review scope;
3. принять блокирующее архитектурное решение или явно подтвердить Stage plan;
4. выполнить обязательный Architect gate;
5. на `main` без начатого stage — вызвать `/stage-start`;
6. в stage-ветке без checklist — завершить `/stage-start`;
7. продолжить конкретный открытый пункт checklist или недостающую agent/user verification;
8. при готовой реализации вызвать `/stage-close` для preliminary phase/CI и подготовки итогового tracked scope;
9. после подготовки итогового scope выполнить обязательный `/review` либо исправить подтверждённые findings, повторить verification и разрешённый recheck;
10. при актуальном review повторно вызвать `/stage-close` для final commit/push/CI;
11. исправить failed CI или дождаться pending CI;
12. при Ready PR — пользователь выполняет review и Squash and merge;
13. после merge — синхронизировать локальный `main` через fast-forward.

### Блокеры и решения

- Показывай только фактические блокеры и решения текущего/ближайшего stage.
- Failed CI — blocker; pending CI — незавершённый gate, а не успешная проверка.
- Отсутствие PR до первого meaningful push не является blocker.
- Отсутствующий orchestration section в старом checklist означает недостаток подтверждённых данных, но не доказывает историческое нарушение.
- Accepted residual risk снимает blocker только для конкретного P3 с явным решением пользователя; P0–P2 всегда остаются blockers.
- Если блокеров или решений нет, напиши `Нет.`

## Формат ответа

Язык пользовательского ответа определяется разделом **«Язык общения с пользователем»** в `AGENTS.md`.

```markdown
# Статус этапа

## Текущий roadmap stage
<номер>. <точное название>
Статус: <точный статус>

## Git
Ветка: <ветка>
Рабочее дерево: <clean / dirty + counts>

## Pull Request
<N, URL, base/head, Draft/Ready/Open или «не применимо / отсутствует / недоступно»>

## CI
<success / pending / failed / not run / unknown + краткая причина>

## Orchestration state
Source: <stage checklist / PR body / current session only / отсутствует>
Architect: <required/not-required/unconfirmed + status + outcome>
Architecture Decision Gate: <none/pending/resolved/unconfirmed + reference>
Stage plan: <confirmed/pending/not-applicable/unconfirmed + context>
Stage-close phase: <preliminary / preliminary CI / phase-2 scope / Reviewer / final CI / Ready>
Reviewer: <required/not-required/unconfirmed + review gate>
Последний pass: <none/initial/recheck-1/recheck-2/unconfirmed>
Осталось recheck: <2/1/0/unconfirmed>
Unresolved findings: <IDs/none/unconfirmed>
Accepted residual risks: <P3 IDs/none/unconfirmed>
Scope freshness: <current/stale/unconfirmed>

## Где остановились
- <подтверждённый результат>
- <актуальная открытая точка или «Stage подготовлен к review»>

## Следующий шаг
<одно действие>

## Блокеры
Git/CI: <блокеры или «Нет.»>
Orchestration: <блокеры / «Нет.» / «Недостаточно подтверждённых данных»>

## Требуемые решения
<решения или «Нет.»>

## Далее
<следующий milestone из ROADMAP.md>
```

## Строгие read-only rules

Во время `/stage-status` запрещено:

- менять любые файлы, checklist или документацию;
- выполнять build, lint, tests или runtime-проверки;
- выполнять `git add`, commit, push, pull, switch, checkout, stash, reset или создавать/удалять ветки;
- создавать, редактировать, переводить в Ready, закрывать или merge-ить PR;
- исправлять или дополнять orchestration state в checklist/PR body;
- запускать Architect, Reviewer или любой автоматический transition;
- перезапускать/отменять CI или менять ruleset;
- придумывать проценты, ETA, даты, проверки или решения.

При неполных или противоречивых данных напиши `Недостаточно подтверждённых данных`, перечисли конкретные источники проблемы и ничего не исправляй.
