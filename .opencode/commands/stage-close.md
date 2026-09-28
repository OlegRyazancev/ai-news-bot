# /stage-close Command

## Назначение

В соответствующей stage-ветке проверить Definition of Done, завершить локальные и GitHub gates, актуализировать Draft PR и при полном успехе перевести его в Ready for review. Команда никогда не выполняет merge.

## Workflow

### 1. Проверить stage и ветку

- Прочитай `AGENTS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, обязательные context-файлы и канонические contracts `.opencode/commands/handoff.md`, `.opencode/commands/stage-start.md` и `.opencode/commands/review.md`. Не запускай эти Markdown-команды как вложенные slash-команды.
- Выполни `git branch --show-current` и `git status --short --branch`.
- Определи закрываемый stage по номеру текущей `stage/NN-short-slug`, затем найди этот stage в `docs/ROADMAP.md` и сверь criterion/dependencies.
- Обычно закрываемый stage совпадает с разделом **«Текущий фокус»** roadmap. Если `/stage-close` уже подготовил в этой ветке статус stage `✅ Завершено` и переключил фокус на следующий stage, считай это повторным запуском закрытия прежнего `NN`, а не попыткой закрыть следующий stage; до merge это состояние остаётся branch-only.
- Если команда запущена на `main`, в non-stage ветке или номер ветки нельзя однозначно сопоставить roadmap/checklist, **STOP**: не закрывай stage, не commit/push и не переключай контекст молча.
- При неожиданных или посторонних изменениях остановись и сообщи пользователю; ничего не discard и не перезаписывай.

### 2. Найти и проверить checklist

- Найди единственный checklist stage по двузначному номеру.
- Если checklist отсутствует или их несколько, не закрывай stage; сообщи ошибку процесса.
- Убедись, что отдельно существуют разделы **«Что тестирует агент»** и **«Что пользователь тестирует вручную»**.
- Сопоставь фактическую реализацию с checklist, roadmap criterion, current state, backlog, architecture, decisions и релевантным кодом.
- Для результатов используй только `Verified`, `Build-Verified`, `Runtime-Verified`, `Not Verified` или `Not Applicable`.
- Checklist является единственным source of truth task-level orchestration state stage. Найди ровно одну корректную marker-пару `task-orchestration-state` и восстанови все Architect, Stage plan и Reviewer fields по `/handoff`.
- Отсутствующий orchestration section в старом checklist не доказывает историческое нарушение, но не подтверждает текущие gates: сообщи `ORCHESTRATION_STATE_INCOMPLETE` и **STOP**. Duplicate/unbalanced sections, invalid values или нарушение инвариантов означают `ORCHESTRATION_STATE_CONFLICT` и **STOP**.
- Не создавай второй state section, не восстанавливай approvals/passes/counters/findings предположениями и не сбрасывай подтверждённое состояние при повторном `/stage-close`.

### 3. Выполнить локальную verification

Как минимум выполни:

```bash
npm run lint
npm run build
npm run test   # если тесты существуют или требуются stage/checklist
```

Также выполни обязательную доступную Runtime Verification. Build не доказывает работу Telegram, PostgreSQL, внешнего API, scheduler или другой интеграции.

Если локальная проверка падает, stage не закрывается. Исследуй и исправь причину в текущей stage-ветке, затем повтори применимые проверки. Не ослабляй lint/tests/CI ради зелёного результата.

### 4. Проверить пользовательскую verification и Architecture gate

- Не подтверждай ручные пункты от имени пользователя.
- Требуй явный результат обязательной ручной проверки.
- Если ручная проверка выявила дефект, повторно открой затронутые пункты и потребуй исправление и retest.

Fail-closed проверь по каноническому state:

- Architect classification равна `required` или `not-required` и содержит конкретное основание;
- при `required` analysis status равен `completed`, outcome/constraints подтверждены, а сохранённая context revision соответствует актуальному существенному архитектурному контексту;
- при `not-required` analysis status/outcome равны `not-applicable`;
- Architecture Decision Gate равен подтверждённому `none` либо `resolved`; для `resolved` существует точная ссылка на фактически зафиксированное решение в `docs/DECISIONS.md`;
- Stage plan имеет `Approval: confirmed` и непустой approval context конкретной revision;
- нет нового незадокументированного архитектурного/data/integration выбора или material architectural context delta после анализа.

`pending`, `unconfirmed`, stale context, отсутствующая decision reference или противоречивые значения блокируют закрытие. `/stage-close` не вызывает Architect, не повторяет analysis и не принимает решение за пользователя.

Подтверждение ручной проверки не закрывает stage само по себе.

### 5. Фаза 1 — предварительный Definition of Done

До любых финальных completion marks должны быть подтверждены:

- обязательная реализация и roadmap criterion;
- lint, build и применимые tests;
- обязательная runtime- и пользовательская verification;
- все содержательные требования checklist;
- документационная согласованность, Architecture gate и Stage plan approval;
- отсутствие secrets и посторонних изменений.

Финальный Reviewer gate в phase 1 ещё не требуется: Reviewer должен проверить полностью подготовленный phase-2 tracked scope. Существующий более ранний review не считается автоматически актуальным для будущих phase-2 изменений.

Если что-либо не выполнено, не ставь `✅ Завершено`, не переключай roadmap-фокус, не переводи PR в Ready и выдай конкретный список открытых пунктов.

### 6. Подготовить документацию без окончательного закрытия

При выполненных предварительных gates:

1. Подготовь checklist и документацию, но оставь итоговый статус stage и CI-dependent completion marks незавершёнными.
2. Синхронизируй фактическое содержимое `docs/CURRENT_STATE.md` и `docs/BACKLOG.md`, не утверждая окончательное закрытие.
3. Проверь и при необходимости обнови `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `README.md` и `docs/DECISIONS.md`.
4. Не переключай текущий фокус и не ставь `✅ Завершено` в `docs/ROADMAP.md`/`docs/ROADMAP_VISUAL.md` до успешного CI предварительного HEAD.
5. Проверь старые checklist, `.env.example`, Docker и package scripts, если они применимы.
6. Выполни repository-wide поиск устаревших placeholders, operational instructions, статусов и дублируемых точных значений; проверь локальные Markdown-ссылки.
7. Просмотри `git status`, полный `git diff` и staged diff; проверь отсутствие secrets и посторонних изменений.

Не утверждай, что все документы синхронизированы после выборочного просмотра. Назови фактический охват и исключения.

### 7. Push предварительного HEAD и безопасно определить PR

1. Сделай необходимые содержательные commit только в текущую stage-ветку и выполни обычный push без force.
2. До любых операций с PR убедись, что `gh` доступен, авторизован и GitHub отвечает. При ошибке **STOP**: не объявляй CI успешным, не меняй PR и не устанавливай/перенастраивай инструменты без необходимости; сообщи конкретную причину и требуемое действие.
3. Через `gh pr list --head <current-branch> --state all` проверь все PR текущей ветки и получи как минимум `number,url,state,isDraft,baseRefName,headRefName`.
4. Если найден PR `CLOSED`/`MERGED`, более одного PR, неверные head/base или иная неоднозначность — **STOP**, ничего в PR не меняй и не создавай дубликат.
5. Существующий PR можно использовать только если он единственный, `OPEN`, его head точно равен текущей ветке, а base равен `main`.
6. Только если PR для ветки действительно отсутствует во всех состояниях, сформируй body на основе `.github/pull_request_template.md` во временном файле вне Git и создай PR без интерактивного редактора: `gh pr create --draft --base main --head <current-branch> --title "<PR title>" --body-file <temporary-body-file>`.
7. Перед `gh pr edit` повторно подтверди OPEN/head/base. Затем актуализируй body через `--body-file` на основе `.github/pull_request_template.md`.

### 8. Дождаться CI предварительного HEAD

Выполни `gh pr checks` и дождись результата для актуального preliminary HEAD.

- `pending` означает незавершённый gate, а не успех;
- при failed CI stage не закрывается: исследуй причину, исправь её в stage-ветке, повтори локальные проверки, commit/push и CI;
- при недоступном `gh`, ошибке авторизации или GitHub stage не закрывается и PR не переводится в Ready;
- не обходи ruleset, не отключай/ослабляй CI и не переименовывай required check `CI/Lint, build, and test (pull_request)` без необходимости.

### 9. Фаза 2 — подготовить и проверить итоговый tracked scope

Только после успешного CI preliminary HEAD:

1. Отметь checklist и stage подготовленными как `✅ Завершено`, синхронизируй `CURRENT_STATE.md`, `BACKLOG.md`, сначала `ROADMAP.md`, затем `ROADMAP_VISUAL.md`, и остальные применимые документы. До финальных gates и merge это branch-only подготовленный статус, а не каноническое завершение.
2. Заверши все существенные изменения checklist, требований, implementation и технической документации до Reviewer. Не оставляй запланированные tracked updates на период после review.
3. Повтори применимые `npm run lint`, `npm run build`, tests и targeted runtime verification, если phase-2 изменения либо исправления могли повлиять на соответствующее поведение. Не закрывай пользовательские пункты без явного подтверждения.
4. Повтори применимый repository-wide docs audit, проверку локальных Markdown-ссылок, secrets, `git status`, полного/staged diff и постороннего scope.
5. Повторно проверь Architecture gate и отсутствие material architectural context delta в итоговом scope.
6. Не commit/push итоговые phase-2 изменения до Reviewer gate ниже: Reviewer должен получить полный final-content scope, включая committed preliminary HEAD и phase-2 staged/unstaged/untracked changes.

Если phase-2 scope уже подготовлен предыдущим запуском, не переписывай его и не дублируй completion/state sections. Сверь факты и продолжи с текущей точки.

### 10. Проверить Reviewer gate и freshness

Применяй classification, transition/counter matrix, findings evidence, residual-risk и content-based freshness contract непосредственно из `AGENTS.md`, `/handoff` и `/review`; не создавай альтернативную матрицу.

Обязательно проверь:

- Reviewer classification и конкретную причину;
- при `required` — завершённый `initial` либо более поздний разрешённый pass; отсутствие сведений или `Last completed pass: none` не доказывает review;
- согласованность `Last completed pass` и `Remaining rechecks` с общей matrix;
- stable unresolved finding IDs, подтверждённые fixes и фактическую verification after fixes для выполненных recheck;
- `Reviewed scope revision` с exact payload hash, content-based `substantive_scope_sha256` и review base;
- актуальность итогового scope путём воспроизведения того же versioned normalized final-content manifest по разделу **«Freshness и scope revision»** `/review`, включая current merge-base, raw final-tree diff, untracked paths, path preflight и локальные exact-byte hashes без вывода содержимого;
- `Review gate: complete` только при актуальном scope и отсутствии непринятых blocking findings.

Для `not-required` допустим только мотивированный state `Last completed pass: none`, `Remaining rechecks: 0`, `Review gate: complete`.

Если required initial/recheck ещё не выполнен, findings требуют исправления либо gate `pending`/`blocked`, оставь PR Draft, не вызывай Reviewer автоматически и **STOP** с одним следующим действием: внешний single-pass `/review` или исправления + verification + разрешённый recheck. После `recheck-2` новые автоматические passes запрещены.

Residual risks:

- `P0`, `P1` и `P2` всегда блокируют завершение;
- каждый accepted `P3` должен совпадать с unresolved finding ID и содержать сохранённое явное решение пользователя;
- молчание, отсутствие finding ID или общий призыв продолжить не являются acceptance;
- после `recheck-2` с непринятыми findings workflow останавливается без дополнительных review calls.

Freshness:

- bounded изменения значений канонического orchestration section и PR body/CI metadata являются служебными и не создают review loop;
- category-only перенос неизменных итоговых bytes между untracked/unstaged/staged/committed не делает review stale;
- add/delete/rename/copy, path/content/type/mode/base changes, новые требования, implementation или техническая документация являются substantive;
- при отличии `substantive_scope_sha256` поставь/считай gate `stale` и **STOP**; `/stage-close` не запускает новый pass;
- если equivalence или normalization нельзя доказать, freshness равна `unconfirmed` и применяется **STOP**.

### 11. Финальный commit, push, CI и Ready

Только при полностью подтверждённых Architecture и Review gates:

1. Убедись, что после reviewed snapshot не появилось substantive changes. Разрешены только bounded state updates, PR metadata и category-only фиксация тех же проверенных bytes.
2. Сделай финальный commit в текущей stage-ветке. Сразу пересчитай normalized final-content manifest и `substantive_scope_sha256`: category movement не должно изменить fingerprint.
3. Если fingerprint изменился или equivalence не доказана, **STOP** до push; не amend/reset и не объявляй review актуальным.
4. Push выполни без force. Завершение неподтверждено до обязательного CI именно для актуального финального HEAD.
5. При `pending` жди результата без лишних commits, PR оставь Draft. При `unavailable` сообщи конкретную проблему. При `failed` исследуй причину; любые substantive fixes требуют повторной verification, freshness check и разрешённого Reviewer transition до нового final push.
6. Перед изменением PR body или состояния повторно проверь, что PR единственный, `OPEN`, head равен текущей ветке, base равен `main` и он не был closed/merged.
7. Актуализируй PR body фактическими финальными результатами. Это не заменяет checklist state и не меняет reviewed Git scope.
8. Только `success` обязательного CI именно для актуального финального HEAD подтверждает завершение и позволяет перевести Draft PR в Ready for review через `gh pr ready`.
9. При повторном `/stage-close` не повторяй успешные preliminary/review/final gates, не создавай новый PR/section, не сбрасывай counters и не принимай residual risks автоматически; сверяй сохранённые факты с текущим HEAD/CI.
10. Сообщи пользователю URL PR и что он готов к ручному review и предпочтительному **Squash and merge**.

Не выполняй merge и не закрывай PR. До пользовательского merge `main` остаётся каноническим; завершённый статус существует только в stage-ветке и становится каноническим после merge.

## Итоговый отчёт

Язык пользовательского отчёта определяется разделом **«Язык общения с пользователем»** в `AGENTS.md`.

```text
Этап:
Ветка:
Результат:
Сборка:
Lint:
Тесты:
Runtime-проверка:
Ручная проверка пользователя:
Checklist:
Аудит документации:
Commit / push:
PR:
Состояние PR:
CI предварительного HEAD:
Architecture gate:
Reviewer gate и последний pass:
Review freshness:
Unresolved findings / accepted P3:
CI финального HEAD:
Оставшиеся проблемы:
Действие пользователя: выполнить review и Squash and merge / устранить перечисленные блокеры
```
