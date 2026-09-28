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
- **Reviewed scope revision:** <substantive-scope-schema + review-payload-sha256 + substantive-scope-sha256 + review-base | `unconfirmed`>
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
- `Reviewed scope revision` считается надёжным только при `substantive-scope-schema=ai-news-bot/substantive-scope@1` и сохранённых `review-payload-sha256`, `substantive-scope-sha256`, `review-base` из канонического `/review`. Exact payload hash идентифицирует immutable snapshot, а freshness определяется только общим executable. Missing/unknown schema, legacy unversioned hash или недоказуемая equivalence всегда означают `unconfirmed`; не присваивай schema v1 задним числом.
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
- Подтверждённый post-review runtime/acceptance defect со stable ID, evidence, исправлением и повторной verification может открыть следующий существующий recheck по нормативному transition `/review`; это не разрешает новый `initial` и не сбрасывает counters. Для согласованных `ORCH-FP-001` и `ORCH-ENC-002` после historical `initial` разрешён только `recheck-1`, который создаёт новую согласованную пару exact/v1 identifiers для всего актуального scope.
- `P0`, `P1` и `P2` не могут находиться в `Accepted residual risks` и остаются blockers. Конкретный `P3` принимается только вместе с подтверждённым явным решением пользователя; молчание не считается согласием.
- `Review gate: complete` допустим только для мотивированного `not-required` либо когда required-review имеет завершённый pass не `none`/`unconfirmed`, scope актуален, а все unresolved findings отсутствуют или являются явно принятыми P3.
- Актуальность review проверяй только через `.opencode/scripts/substantive-scope.mjs` и schema `ai-news-bot/substantive-scope@1` по разделу **«Freshness и scope revision: единый executable contract»** `/review`. Не воспроизводи алгоритм самостоятельно. Category-only перенос того же итогового tree между untracked/unstaged/staged/committed и bounded orchestration-state updates не делает gate stale. Изменение paths, add/delete/rename/copy semantics, exact bytes, type/mode/base metadata, требований или технической документации делает `Review gate: stale`; missing/unknown schema, legacy hash или недоказуемая equivalence даёт `unconfirmed`. Не объявляй review завершённым только по сохранённому слову `complete` или совпадению HEAD.
- Pending/unconfirmed Architecture Decision Gate, неподтверждённый stage plan, обязательный незавершённый Architect/Reviewer, stale scope, P0–P2 и непринятые findings являются orchestration blockers.

### 3. Проверить работу сессии

- Что реализовано, исправлено или документировано?
- Что подтверждено, а что ещё не verified?
- Какие файлы изменены и нет ли постороннего scope?
- Где остановился stage checklist?
- Какие значения task-level state подтверждены каноническим источником, текущей сессией, `docs/DECISIONS.md`, Git и явными решениями пользователя?
- Совпадает ли воспроизведённый `substantive-scope-sha256` текущего итогового содержимого с reviewed revision, или gate должен стать `stale`/`unconfirmed`?

Не восстанавливай classification, approvals, pass counters, findings или residual risks предположениями. Проверь инварианты канонического формата до записи; при конфликте останови автоматическое продолжение.

### 3.1. Воспроизвести freshness единым executable

Используй только `.opencode/scripts/substantive-scope.mjs` со schema `ai-news-bot/substantive-scope@1` и точный порядок из `/review`:

1. Определи current full `review_base` и вызови `inspect` UTF-8 JSON request.
2. Проверь returned schema/base, `inspection_sha256`, exact paths и Git metadata.
3. Выполни существующий path/content security preflight; executable не является sandbox и не подтверждает безопасность.
4. Только после успешного preflight сформируй `approved_paths` без преобразований и вызови `calculate` с тем же base/schema/hash; для изменённого canonical stage checklist передай его approved path, иначе `null`.
5. Сравни schema, base и возвращённый `substantive_scope_sha256` с current reviewed revision. Любая ошибка, blocked preflight, changed inspection manifest или mismatch означает fail-closed `unconfirmed`; не обновляй state и не продолжай lifecycle автоматически.

Не реализуй serialization/hashing в `/handoff` и не вызывай `calculate` до preflight.

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
gh pr list --head <current-branch> --state all --limit 100 --json number,url,state,isDraft,baseRefName,headRefName
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
- Если существует ровно одна корректная marker-пара, замени только bounded section и сохрани весь остальной body как exact Unicode text.
- При duplicate/unbalanced markers или одноимённом разделе без однозначных границ не изменяй PR.
- Любое чтение/изменение PR body выполняй только по UTF-8 safety protocol ниже; временный body-файл создавай вне Git и никогда не добавляй его в репозиторий.
- Без PR не создавай его только для state persistence. Выведи структурированный checkpoint в каноническом формате и явно предупреди, что полное автоматическое восстановление следующей сессией не гарантируется.

#### Остальная документация

- `CURRENT_STATE.md` и `BACKLOG.md` обновляй только при фактическом изменении состояния/приоритетов.
- `ARCHITECTURE.md`, `DECISIONS.md`, `PROJECT.md` и `README.md` меняй только при соответствующих реальных изменениях.
- Roadmap status не переключай: это делает `/stage-close` или отдельная явная команда закрытия.
- Проверь применимые документы, checklist, operational instructions, локальные Markdown-ссылки и финальный diff; не заявляй полный аудит после spot-check.

#### UTF-8 safety protocol для PR body

Этот protocol обязателен для create/edit и post-write verification PR body в `/handoff`, `/review` и `/stage-close`:

1. После повторной проверки единственного `OPEN` PR с точными head/base получи исходный body через `gh` как process bytes (`execFile`/эквивалентный byte API с `encoding: buffer`), а не через console, PowerShell pipeline, command substitution или clipboard. Strict-decode JSON/output как UTF-8; BOM, invalid UTF-8 или `U+FFFD` являются blocker.
2. До изменения определи ожидаемую cardinality из source policy: для non-stage PR с durable state — ровно одна упорядоченная marker-пара и один `## Task-level orchestration state`; для stage PR, где checklist остаётся единственным state source, допустимо подтверждённое отсутствие обоих. При первичном добавлении non-stage state исходное отсутствие обоих допустимо только до вставки. Duplicate/unbalanced markers или несоответствие ожидаемой cardinality блокируют запись.
3. При существующем/добавляемом non-stage state замени только bounded section и сохрани exact Unicode text до start marker и после end marker. После сборки проверь ожидаемую cardinality, единственный state heading, сохранность внешнего текста и отсутствие replacement characters; stage body не получает marker section только ради PR update.
4. Создай уникальный временный файл вне Git через Node.js byte API (`Buffer.from(body, 'utf8')` + exclusive write), UTF-8 без BOM. Сразу прочитай его обратно bytes API, strict-decode и сравни exact Unicode text и SHA-256 UTF-8 bytes с подготовленным body.
5. Передай файл только через `gh pr create/edit --body-file <temporary-path>`, запуская `gh` без shell interpolation. Передача body через `--body`, stdout/stdin console pipe или PowerShell text pipeline запрещена.
6. После записи повторно получи remote body тем же byte-safe способом. Проверь exact Unicode equality и SHA-256 с подготовленным body, сохранность текста вне bounded section и ожидаемую marker/state-heading cardinality. Для non-stage durable state это обязана быть одна marker-пара и один heading. Только полное совпадение означает успешную запись.
7. При любом decode/hash/text/marker mismatch считай update неуспешным, не продолжай lifecycle и сообщи безопасный blocker без вывода потенциально повреждённого body. Временный файл удали best-effort после проверки.

Этот protocol предотвращает повторное console/pipe transcoding, но не делает body частью Git fingerprint.

### 7. Сохранить coherent progress

Если работа образует осмысленный проверенный checkpoint, находится в разрешённой рабочей ветке и пользователь не запретил Git/GitHub actions для задачи, агент может:

1. сделать содержательный commit;
2. push текущей ветки без force;
3. после первого meaningful push создать Draft PR только если проверка всех состояний подтвердила полное отсутствие PR для этой ветки: сформировать body по `.github/pull_request_template.md` во временном файле вне Git и выполнить без интерактивного редактора `gh pr create --draft --base main --head <current-branch> --title "<PR title>" --body-file <temporary-body-file>`;
4. актуализировать body только у проверенного единственного `OPEN` PR с правильными head/base, сохраняя всё содержимое вне bounded orchestration section; строго применяй UTF-8 safety protocol выше и `gh pr edit <number> --body-file <temporary-body-file>` без интерактивного редактора.

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
