# Daily Workflow

`main` — каноническая protected branch. Работай только в `stage/...`, `chore/...`, `docs/...` или `fix/...`; merge всегда выполняет пользователь.

## Начало дня

```text
opencode
/start
/stage-status
```

## Новый roadmap stage

```text
/stage-start
→ агент обновит чистый main через fast-forward и создаст stage/NN-short-slug
→ проверить анализ, checklist и план
→ явно подтвердить начало application implementation
```

Если на `main` есть неожиданные изменения, `/stage-start` остановится до переключения ветки.

## Работа над stage

```text
/stage-status
→ выполнить следующий пункт checklist
→ локальные проверки
→ /review pass=initial task="..." acceptance="..." verification="..."
→ исправить подтверждённые замечания и повторить проверки
→ при необходимости /review pass=recheck-1|recheck-2 с finding ID и исправлениями
→ commit + push в stage-ветку
→ после первого meaningful push агент создаёт Draft PR в main
→ gh pr checks
```

Developer на `openai/gpt-5.6-sol#high` передаёт Reviewer полный changed-files manifest и один immutable committed/staged/unstaged/untracked snapshot после локального security preflight. Reviewer работает без shell в foreground child: Primary — `google/gemini-3.8-flash`, затем только при подтверждённой provider error допускаются `google/gemini-3.5-flash-lite` и `openai/gpt-5.6-luna-fast` (не более трёх model attempts на один pass). Разрешены одно первоначальное ревью и максимум две сфокусированные повторные проверки.

Все три модели отдельно runtime-проверены, а основной Primary-сценарий `/review` успешно прошёл на полном changed scope. Автоматическое переключение при реальной provider error пока не подтверждено; Architect не реализован. Reviewer не заменяет local/runtime/user/CI gates. PR body ведётся по `.github/pull_request_template.md`. Ошибки локальных проверок и CI исправляются в той же stage-ветке.

## Закрытие stage

```text
выполнить ручной раздел checklist и сообщить результат
/stage-close
→ предварительные local/runtime/user/docs/diff gates
→ commit + push без финального закрытия stage
→ проверить OPEN PR с правильными head/base и дождаться успешного CI
→ окончательно обновить статус stage и push
→ если появился новый commit, снова дождаться CI нового HEAD
→ только после этого PR становится Ready for review
→ пользователь выполняет review и Squash and merge
```

При недоступном `gh`, ошибке авторизации, недоступном GitHub или неуспешном CI stage не закрывается и PR не переводится в Ready. `/stage-close` не выполняет merge. До merge подготовленный статус существует только в stage-ветке; каноническим он становится в `main` после merge.

## После merge

```bash
git switch main
git pull --ff-only
```

Следующую задачу начинай только от обновлённого `main` в новой рабочей ветке.

## Конец дня

```text
/handoff
→ проверить branch, git status, PR и CI
```

Полный процесс: [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
