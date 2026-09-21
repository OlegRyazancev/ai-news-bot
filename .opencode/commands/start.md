# /start Command

## Instructions

Когда пользователь вызывает `/start`, выполни следующие шаги по порядку:

1. **Read AGENTS.md** — Понять правила агента и workflow
2. **Read docs/PROJECT.md** — Понять назначение приложения и функциональность
3. **Read docs/ARCHITECTURE.md** — Понять техническую архитектуру
4. **Read docs/CURRENT_STATE.md** — Понять текущее состояние проекта
5. **Read docs/DECISIONS.md** — Понять архитектурные решения
6. **Read docs/BACKLOG.md** — Понять текущие приоритеты
7. **Run `git status`** — Проверить незакоммиченные изменения
8. **Run `git log --oneline -10`** — Посмотреть последние коммиты (если есть)
9. **Explore relevant code** — Посмотреть файлы, связанные с приоритетами BACKLOG

## Output Format

После завершения вышеуказанного, дай краткую сводку:

```
## Project Status Summary

**Where the project is:** [фаза из CURRENT_STATE.md]

**What works:** [список из CURRENT_STATE.md]

**What was done last:** [последняя выполненная фича из CURRENT_STATE.md]

**Unfinished work:** [в-процессе из CURRENT_STATE.md]

**Recommended next step:** [следующий шаг из CURRENT_STATE.md или BACKLOG.md "Now" секции]
```

## Rules

- Do NOT modify any files during `/start`
- Do NOT run build or tests unless explicitly asked
- Keep output concise — это ориентация, не реализация