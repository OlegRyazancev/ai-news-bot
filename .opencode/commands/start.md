# /start Command

## Назначение

Read-only восстановить общий контекст проекта, включая текущую branch/PR/CI позицию. Команда ориентирует, но не начинает и не реализует stage.

## Workflow

1. Прочитай `AGENTS.md` и `docs/DEVELOPMENT_WORKFLOW.md`.
2. Прочитай `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md` и `docs/ROADMAP.md`.
3. Прочитай checklist текущего stage, если он существует.
4. Выполни read-only Git inspection:

   ```bash
   git branch --show-current
   git status --short --branch
   git log --oneline -10
   ```

5. Если текущая ветка не `main`, проверь связанный PR без изменений:

   ```bash
   gh pr view --json number,url,state,isDraft,baseRefName,headRefName
   gh pr checks
   ```

6. Изучи только релевантный существующий код, необходимый для понимания ближайшей задачи.

Если `gh` недоступен, нет авторизации или PR отсутствует, сообщи это без догадок. Non-zero `gh pr checks` разбери как возможный pending/failed status.

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
**Незавершённая работа:** <текущая точка>
**Рекомендуемый следующий шаг:** <одно действие>
```

## Правила

- Не изменяй файлы, Git, PR или CI.
- Не выполняй pull, switch, commit, push, создание/редактирование PR или merge.
- Не запускай build/tests/runtime verification без отдельного запроса.
- `main` считай каноническим; незамерженные результаты stage-ветки не описывай как уже находящиеся в `main`.
- Для начала нового stage рекомендуй `/stage-start`; для детального read-only статуса — `/stage-status`.
- Ответ должен быть кратким.
