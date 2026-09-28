# /handoff Command

## Назначение

Оставить следующей сессии проверяемый контекст текущей рабочей ветки и PR. `/handoff` не заменяет `/stage-close` и никогда не выполняет merge.

Для roadmap stage команда синхронизирует task-level orchestration state в существующем stage checklist. Для non-stage задачи после публикации каноническим хранилищем становится body единственного корректного PR. Сам итоговый отчёт `/handoff` остаётся производной сводкой, а не отдельным source of truth.

## Workflow

### 1. Проверить Git-контекст

```bash
git branch --show-current
git status --short --branch
git diff
git diff --staged
```

- Зафиксируй текущую ветку, staged/unstaged/untracked изменения и их назначение.
- Не discard, reset, stash и не перезаписывай пользовательские изменения.
- Если изменения stage/application находятся на `main`, не commit/push: остановись и сообщи о нарушении workflow.

### 2. Выбрать канонический источник task-level state

1. Если текущая ветка имеет точный вид `stage/NN-*`, найди ровно один checklist `docs/checklists/NN-*.md`. Это единственный канонический task-level source; PR body для этого stage не дублирует state.
2. Если checklist stage отсутствует или найдено несколько, останови синхронизацию orchestration state и сообщи нарушение процесса. Другой источник вместо checklist не выбирай.
3. Для `chore/...`, `docs/...` или `fix/...` используй PR body только после проверки всех PR текущей ветки по правилам раздела 5. Не выбирай PR по номеру, названию или недавней активности.
4. Для non-stage задачи без единственного корректного PR state остаётся в текущей Developer-сессии. Не создавай PR исключительно ради сохранения state.
5. На `main` не создавай task-level запись и не пытайся привязать состояние к checklist или чужому PR.

## Канонический формат task-level orchestration state

Этот раздел определяет только формат сериализации и общие validation rules. Он не является хранилищем состояния. `/start` и `/stage-status` обязаны читать этот contract и применять его без независимых правил вычисления.

В stage checklist и non-stage PR body используется не более одного раздела с точными границами:

```markdown
<!-- task-orchestration-state:start -->
## Task-level orchestration state

### Architect
- **Classification:** `required` | `not-required` | `unconfirmed`
- **Classification reason:** <краткое подтверждённое основание | `unconfirmed`>
- **Analysis status:** `not-run` | `completed` | `blocked` | `not-applicable` | `unconfirmed`
- **Context revision:** <существенная версия контекста и основание | `unconfirmed`>
- **Outcome:** <краткий actionable outcome | `not-applicable` | `unconfirmed`>
- **Decision Gate:** `none` | `pending` | `resolved` | `unconfirmed`
- **Decision reference:** <ссылка на docs/DECISIONS.md | `not-applicable` | `unconfirmed`>
- **Applied constraints:** <краткий список | `none` | `unconfirmed`>

### Stage plan
- **Approval:** `confirmed` | `pending` | `not-applicable` | `unconfirmed`
- **Approval context:** <какой plan/revision явно подтвердил пользователь | `not-applicable` | `unconfirmed`>

### Reviewer
- **Classification:** `required` | `not-required` | `unconfirmed`
- **Classification reason:** <краткое подтверждённое основание | `unconfirmed`>
- **Last completed pass:** `none` | `initial` | `recheck-1` | `recheck-2` | `unconfirmed`
- **Reviewed scope revision:** <review-payload-sha256 + content-based substantive-scope-sha256 + review-base | `unconfirmed`>
- **Unresolved finding IDs:** <severity + ID list | `none` | `unconfirmed`>
- **Confirmed fixes:** <finding ID + краткое исправление | `none` | `unconfirmed`>
- **Verification after fixes:** <фактические команды/результаты | `not-applicable` | `unconfirmed`>
- **Remaining rechecks:** `2` | `1` | `0` | `unconfirmed`
- **Accepted residual risks:** <только P3 finding ID + явное решение пользователя | `none` | `unconfirmed`>
- **Review gate:** `pending` | `complete` | `blocked` | `stale` | `unconfirmed`
<!-- task-orchestration-state:end -->
```

Правила значений:

- `none` и `not-applicable` записывай только когда отсутствие или неприменимость подтверждены; отсутствие сведений всегда `unconfirmed`.
- Для roadmap stage `Stage plan / Approval` не может быть `not-applicable`; без явного пользовательского подтверждения используй `pending` или `unconfirmed`.
- Для non-stage задачи Stage plan равен `not-applicable`, если это подтверждено типом задачи.
- Architect outcome содержит только применимые выводы, constraints и risks, а не полный ответ subagent.
- `Reviewed scope revision` считается надёжным только при сохранённых `review-payload-sha256`, content-based `substantive-scope-sha256` и `review-base` из канонического `/review`. Exact payload hash идентифицирует исходный immutable snapshot, а freshness определяется воспроизводимым substantive fingerprint итогового содержимого и значимой Git metadata. Если identifier отсутствует или equivalence нельзя доказать, используй `unconfirmed`.
- Model attempts/fallback внутри одного `/architect` analysis или `/review` pass не изменяют analysis count, `Last completed pass` или `Remaining rechecks`.
- Не сохраняй prompts, полные transcripts, chain-of-thought, raw provider payload, credentials или secrets.

Общие инварианты:

| Reviewer classification | Last completed pass | Remaining rechecks |
|---|---|---|
| `required` | `none` | `2` |
| `required` | `initial` | `2` |
| `required` | `recheck-1` | `1` |
| `required` | `recheck-2` | `0` |
| `not-required` | `none` | `0` |

- Для `unconfirmed` classification/pass соответствующий counter также `unconfirmed`.
- Любое другое сочетание — `ORCHESTRATION_STATE_CONFLICT`: не исправляй его молча, не продолжай автоматический workflow и перечисли конфликтующие поля.
- При Architect `required` допустимы `not-run`, `completed`, `blocked` или `unconfirmed`; для завершённого gate нужны `completed`, подтверждённый outcome и context revision. При `not-required` analysis status и outcome должны быть `not-applicable`, а classification reason остаётся обязательным.
- `Decision Gate: resolved` требует ссылку на согласованное решение в `docs/DECISIONS.md`; `pending` и `unconfirmed` блокируют продолжение. `none` допустим только когда отсутствие нового решения подтверждено.
- `Stage plan / Approval: confirmed` требует непустой подтверждённый approval context. Для stage `pending`/`unconfirmed` блокируют implementation/completion; для non-stage подтверждённое `not-applicable` не является blocker.
- После `recheck-2` новые автоматические recheck запрещены.
- `P0`, `P1` и `P2` не могут находиться в `Accepted residual risks` и остаются blockers. Конкретный `P3` принимается только вместе с подтверждённым явным решением пользователя; молчание не считается согласием.
- `Review gate: complete` допустим только для мотивированного `not-required` либо когда required-review имеет завершённый pass не `none`/`unconfirmed`, scope актуален, а все unresolved findings отсутствуют или являются явно принятыми P3.
- Актуальность review проверяй только по единому versioned content-based contract раздела **«Freshness и scope revision»** `/review`: заново определи current merge-base, получи полный raw final-tree diff и untracked paths, выполни path preflight, локально хешируй exact bytes без вывода содержимого и сравни current base/fingerprint с сохранёнными. Category-only перенос того же итогового tree между untracked/unstaged/staged/committed и bounded orchestration-state updates не делает gate stale. Изменение paths, add/delete/rename/copy semantics, exact bytes, type/mode/base metadata, требований или технической документации делает `Review gate: stale`; недоказуемая equivalence даёт `unconfirmed`. Не объявляй review завершённым только по сохранённому слову `complete` или совпадению HEAD.
- Pending/unconfirmed Architecture Decision Gate, неподтверждённый stage plan, обязательный незавершённый Architect/Reviewer, stale scope, P0–P2 и непринятые findings являются orchestration blockers.

### 3. Проверить работу сессии

- Что реализовано, исправлено или документировано?
- Что подтверждено, а что ещё не verified?
- Какие файлы изменены и нет ли постороннего scope?
- Где остановился stage checklist?
- Какие значения task-level state подтверждены каноническим источником, текущей сессией, `docs/DECISIONS.md`, Git и явными решениями пользователя?
- Совпадает ли воспроизведённый `substantive-scope-sha256` текущего итогового содержимого с reviewed revision, или gate должен стать `stale`/`unconfirmed`?

Не восстанавливай classification, approvals, pass counters, findings или residual risks предположениями. Проверь инварианты канонического формата до записи; при конфликте останови автоматическое продолжение.

### 4. Выполнить применимую verification

Для изменения application code как минимум:

```bash
npm run lint
npm run build
npm run test   # если тесты существуют или применимы
```

Выполни доступную обязательную runtime-проверку, если она относится к текущей работе. Не объявляй runtime working только по build.

### 5. Проверить PR и CI

Если текущая ветка не `main`, выполни read-only inspection:

```bash
gh pr list --head <current-branch> --state all --limit 100 --json number,url,state,isDraft,baseRefName,headRefName,body
```

Отфильтруй результат по точному `headRefName=<current-branch>`. Перед чтением PR body как канонического state или любым изменением PR убедись, что найден ровно один PR во всех состояниях, он `OPEN`, head совпадает с текущей веткой, base равен `main` и он не был closed/merged. Только после этого выполни `gh pr checks <number>` и сообщи URL, Draft/Ready state и фактическое состояние CI. При `CLOSED`/`MERGED`, нескольких PR, неверных head/base или иной неоднозначности останови PR-действия и не создавай дубликат.

Если `gh` отсутствует, авторизация недействительна или GitHub недоступен, не объявляй CI успешным и не меняй PR. Сообщи конкретную причину и необходимое действие; не устанавливай и не перенастраивай инструменты без необходимости. Отсутствие PR до первого meaningful push допустимо; после meaningful push stage-ветки Draft PR должен существовать.

### 6. Синхронизировать state и только необходимую документацию

#### Roadmap stage

- Обновляй только существующий checklist, выбранный по номеру stage-ветки.
- Если ограниченный marker-раздел отсутствует и нет другого раздела `## Task-level orchestration state`, добавь его без перестройки остальных разделов checklist.
- Если существует ровно один marker-раздел, замени только его содержимое между точными markers, сохранив остальной checklist.
- Если найден существующий одноимённый раздел без markers, нормализуй его на канонический формат только когда границы до следующего heading уровня `##` однозначны; иначе остановись, не создавая дубликат.
- Дублированные/несбалансированные markers или несколько одноимённых разделов — blocker. Не выбирай один произвольно.
- Записывай только подтверждённые значения; остальные поля оставляй `unconfirmed`. Не изменяй старый checklist только ради ретроспективного объявления gates успешно пройденными.
- Не копируй этот state в PR body stage как второй независимый канон.

#### Non-stage задача

- При единственном корректном PR используй тот же bounded marker-раздел в PR body. Если PR создаётся позднее как обычный meaningful checkpoint по разделу 7, добавь state в его initial body или безопасно обнови body после повторной проверки.
- Перед записью проверь state на secrets и запрещённые transcripts. При потенциальной утечке остановись без изменения PR и не цитируй значение.
- Если markers отсутствуют и одноимённого раздела нет, добавь один раздел в конец body.
- Если существует ровно одна корректная marker-пара, замени только bounded section и сохрани весь остальной body byte-for-byte настолько, насколько это позволяет `gh pr edit --body-file`.
- При duplicate/unbalanced markers или одноимённом разделе без однозначных границ не изменяй PR.
- Временный body-файл создавай вне Git; после операции не добавляй его в репозиторий.
- Без PR не создавай его только для state persistence. Выведи структурированный checkpoint в каноническом формате и явно предупреди, что полное автоматическое восстановление следующей сессией не гарантируется.

#### Остальная документация

- `CURRENT_STATE.md` и `BACKLOG.md` обновляй только при фактическом изменении состояния/приоритетов.
- `ARCHITECTURE.md`, `DECISIONS.md`, `PROJECT.md` и `README.md` меняй только при соответствующих реальных изменениях.
- Roadmap status не переключай: это делает `/stage-close` или отдельная явная команда закрытия.
- Проверь применимые документы, checklist, operational instructions, локальные Markdown-ссылки и финальный diff; не заявляй полный аудит после spot-check.

### 7. Сохранить coherent progress

Если работа образует осмысленный проверенный checkpoint, находится в разрешённой рабочей ветке и пользователь не запретил Git/GitHub actions для задачи, агент может:

1. сделать содержательный commit;
2. push текущей ветки без force;
3. после первого meaningful push создать Draft PR только если проверка всех состояний подтвердила полное отсутствие PR для этой ветки: сформировать body по `.github/pull_request_template.md` во временном файле вне Git и выполнить без интерактивного редактора `gh pr create --draft --base main --head <current-branch> --title "<PR title>" --body-file <temporary-body-file>`;
4. актуализировать body только у проверенного единственного `OPEN` PR с правильными head/base, сохраняя всё содержимое вне bounded orchestration section; используй проверенный полный body во временном файле вне Git и `gh pr edit <number> --body-file <temporary-body-file>` без интерактивного редактора.

Не создавай commit только для сокрытия незавершённого или сломанного состояния. Если checkpoint не готов либо действует ограничение пользователя, оставь изменения как есть и явно укажи uncommitted/unpushed status.

`/handoff` не переводит stage PR в Ready for review вместо `/stage-close`, не закрывает и не merge-ит PR.

## Формат ответа

Язык пользовательского ответа определяется разделом **«Язык общения с пользователем»** в `AGENTS.md`.

```markdown
## Передача контекста завершена

**Сводка сессии:** <2–3 предложения>
**Ветка:** <ветка>
**Изменённые файлы:** <ключевые файлы>
**Проверка:** <lint/build/tests/runtime факты>
**Состояние Git:** <clean/dirty, committed/uncommitted, pushed/unpushed>
**Pull Request:** <URL + Draft/Ready/отсутствует/недоступно>
**CI:** <success/pending/failed/not run/unknown>
**Orchestration source:** <stage checklist / PR body / current session only>
**Architect:** <classification + analysis status + outcome + Decision Gate>
**Stage plan:** <approval + confirmation context>
**Reviewer:** <classification + last pass + remaining rechecks + review gate>
**Findings / residual risks:** <unresolved IDs + explicit accepted P3 или unconfirmed>
**Orchestration blockers:** <список или «Нет»>
**Аудит документации:** <охват и исключения>
**Точка остановки:** <точная точка>
**Следующее действие агента:** <одно конкретное действие>
```

## Правила

- Никогда не commit/push в `main`, не force push и не обходи protection/ruleset.
- Никогда не merge PR; не закрывай PR без явной команды пользователя.
- Не сохраняй transcript или reasoning в документации.
- Итоговый handoff-ответ не заменяет checklist/PR body и не становится новым source of truth.
- Уважай более узкое ограничение пользователя, например «не делать commit/push/PR».
