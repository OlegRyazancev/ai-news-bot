# Daily Workflow

## Начало дня

```text
opencode
/start
/stage-status
```

## Новый этап

```text
/stage-start
→ проверить анализ, checklist и план
→ подтвердить реализацию
```

## Продолжение этапа

```text
/stage-status
→ выполнить следующую задачу текущего этапа
```

## Закрытие этапа

```text
выполнить раздел checklist «Что пользователь тестирует вручную»
→ сообщить агенту результат
/stage-close
```

## Конец дня

```text
/handoff
git status
commit / push при необходимости
```

## Если потерял контекст

```text
/stage-status
```

Полный процесс: [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
