# /handoff Command

## Instructions

Когда пользователь вызывает `/handoff`, выполни следующие шаги:

### 1. Examine Current Changes
```bash
git status
git diff                      # Все незакоммиченные изменения
git diff --staged             # Застейдженные изменения
```

### 2. Review Session Work
- Какие фичи реализованы?
- Какие баги исправлены?
- Какие файлы созданы/изменены/удалёны?

### 3. Run Verification
```bash
npm run build                 # Must pass
npm run lint                  # Must pass
# npm run test                # Если тесты есть
```

### 4. Update docs/CURRENT_STATE.md
Обнови эти поля на основе работы сессии:
- **Current Phase** — Если изменилась
- **What Works** — Добави вновь работающие фичи
- **Implemented Functions** — Обнови таблицу статусов
- **In Progress** — Обнови текущую работу
- **Known Issues** — Добавь/убери проблемы
- **Last Completed Feature** — Обнови до последней
- **Next Recommended Step** — Обнови на основе прогресса
- **Last Successful Commands** — Добавь результаты build/lint

### 5. Update docs/BACKLOG.md
- Перенеси выполненные из "Now" → "Next" или удали
- Добавь новые пункты, открытые в процессе работы
- Переприоритезируй если нужно

### 6. Update docs/ARCHITECTURE.md (ТОЛЬКО если архитектура реально изменилась)
- Новые компоненты добавлены
- Новые зависимости добавлены
- Изменились data flows
- Новые внешние интеграции

### 7. Update docs/DECISIONS.md (ТОЛЬКО если принято новое архитектурное решение)
- Добавь строку в таблицу с Decision, Choice, Reason
- Используй "Reason: not documented" если причина неизвестна

### 8. Verify Documentation Matches Code
- Проверь `README.md`, `PROJECT.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md`, `BACKLOG.md`, `DECISIONS.md`, roadmap и применимые checklist.
- Таблицы команд, структура проекта, data flow и статусы интеграций актуальны?
- Если менялись запуск или конфигурация, согласованы ли `.env.example`, Docker-конфигурация и package scripts?
- Нет ли устаревших placeholders, названий этапов, статусов, количеств тестов/источников и operational instructions?
- Разрешаются ли локальные Markdown-ссылки?
- Проверен ли финальный `git diff` после документационных исправлений?

Не утверждай, что все файлы синхронизированы, если выполнен только spot-check. Назови проверенный охват и исключения. Generated files, зависимости и секретный `.env` в документационный аудит не входят.

## Output Format

```
## Handoff Complete

**Session Summary:** [2-3 предложения о том, что сделано]

**Files Changed:** [список ключевых файлов]

**Verification:** npm run build ✅ / ❌, npm run lint ✅ / ❌

**Updated Docs:** CURRENT_STATE.md, BACKLOG.md[, ARCHITECTURE.md, DECISIONS.md]

**Documentation Audit:** [проверенный охват и исключения]

**Next Agent Should:** [конкретный следующий шаг из обновлённого CURRENT_STATE.md]
```

## Rules

- Do NOT commit changes (user decides when to commit)
- Do NOT push to remote
- Do NOT save conversation history or reasoning
- Only update docs — preserve code changes as-is
- Keep docs/CURRENT_STATE.md concise (not a history log)
