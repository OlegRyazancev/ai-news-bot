# /handoff Command

## Назначение

Оставить следующей сессии проверяемый контекст текущей рабочей ветки и PR. `/handoff` не заменяет `/stage-close` и никогда не выполняет merge.

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

### 2. Проверить работу сессии

- Что реализовано, исправлено или документировано?
- Что подтверждено, а что ещё не verified?
- Какие файлы изменены и нет ли постороннего scope?
- Где остановился stage checklist?

### 3. Выполнить применимую verification

Для изменения application code как минимум:

```bash
npm run lint
npm run build
npm run test   # если тесты существуют или применимы
```

Выполни доступную обязательную runtime-проверку, если она относится к текущей работе. Не объявляй runtime working только по build.

### 4. Актуализировать только необходимую документацию

- `CURRENT_STATE.md` и `BACKLOG.md` обновляй только при фактическом изменении состояния/приоритетов.
- `ARCHITECTURE.md`, `DECISIONS.md`, `PROJECT.md` и `README.md` меняй только при соответствующих реальных изменениях.
- Roadmap status не переключай: это делает `/stage-close` или отдельная явная команда закрытия.
- Проверь применимые документы, checklist, operational instructions, локальные Markdown-ссылки и финальный diff; не заявляй полный аудит после spot-check.

### 5. Проверить PR и CI

Если текущая ветка не `main`, выполни read-only inspection:

```bash
gh pr list --head <current-branch> --state all --json number,url,state,isDraft,baseRefName,headRefName
gh pr checks
```

Сообщи URL, Draft/Ready state и фактическое состояние CI. Перед любым последующим изменением PR убедись, что найден ровно один PR, он `OPEN`, head совпадает с текущей веткой, base равен `main` и он не был closed/merged. При несоответствии или неоднозначности останови PR-действия и не создавай дубликат.

Если `gh` отсутствует, авторизация недействительна или GitHub недоступен, не объявляй CI успешным и не меняй PR. Сообщи конкретную причину и необходимое действие; не устанавливай и не перенастраивай инструменты без необходимости. Отсутствие PR до первого meaningful push допустимо; после meaningful push stage-ветки Draft PR должен существовать.

### 6. Сохранить coherent progress

Если работа образует осмысленный проверенный checkpoint, находится в разрешённой рабочей ветке и пользователь не запретил Git/GitHub actions для задачи, агент может:

1. сделать содержательный commit;
2. push текущей ветки без force;
3. после первого meaningful push создать Draft PR в `main` только если проверка всех состояний подтвердила полное отсутствие PR для этой ветки;
4. актуализировать body только у проверенного единственного `OPEN` PR с правильными head/base.

Не создавай commit только для сокрытия незавершённого или сломанного состояния. Если checkpoint не готов либо действует ограничение пользователя, оставь изменения как есть и явно укажи uncommitted/unpushed status.

`/handoff` не переводит stage PR в Ready for review вместо `/stage-close`, не закрывает и не merge-ит PR.

## Output Format

```markdown
## Handoff Complete

**Session Summary:** <2–3 предложения>
**Branch:** <ветка>
**Files Changed:** <ключевые файлы>
**Verification:** <lint/build/tests/runtime факты>
**Git State:** <clean/dirty, committed/uncommitted, pushed/unpushed>
**Pull Request:** <URL + Draft/Ready/отсутствует/недоступно>
**CI:** <success/pending/failed/not run/unknown>
**Documentation Audit:** <охват и исключения>
**Where Stopped:** <точная точка>
**Next Agent Should:** <одно конкретное действие>
```

## Rules

- Никогда не commit/push в `main`, не force push и не обходи protection/ruleset.
- Никогда не merge PR; не закрывай PR без явной команды пользователя.
- Не сохраняй transcript или reasoning в документации.
- Уважай более узкое ограничение пользователя, например «не делать commit/push/PR».
