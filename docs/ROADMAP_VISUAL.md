# AI News Bot — Visual Roadmap

Это компактное визуальное представление проекта для просмотра в Obsidian. Канонический roadmap находится в [ROADMAP.md](./ROADMAP.md).

## Сейчас

- **Текущий этап:** 4. LLM-обработка
- **Статус:** 🟡 В работе
- **Подтверждено:** provider-independent pipeline и PostgreSQL reliability paths проверены автоматически; статья №11 успешно обработана `gemini-3.5-flash-lite`, совместная runtime-работа и manual acceptance подтверждены пользователем.
- **Следующий крупный milestone:** выполнить отдельный `/stage-close` для этапа 4 только по явной команде пользователя.

## Карта этапов

```mermaid
flowchart TD
    S0["✅ 0. Foundation / базовая инфраструктура"] --> S1["✅ 1. Telegram runtime"]
    S1 --> S2["✅ 2. Сбор новостей"]
    S2 --> S3["✅ 3. Хранение и дедупликация"]
    S3 --> S4["🟡 4. LLM-обработка"]
    S4 --> S5["⬜ 5. Ежедневный дайджест"]
    S5 --> S6["⬜ 6. Breaking News"]
    S6 --> S7["⬜ 7. Закреплённая шпаргалка по AI-моделям"]
    S7 --> S8["⬜ 8. Q&A по истории новостей"]
    S8 --> S9["🟡 9. Deployment / эксплуатация"]
```

## Этапы кратко

- ✅ 0. Foundation / базовая инфраструктура
- ✅ 1. Telegram runtime
- ✅ 2. Сбор новостей
- ✅ 3. Хранение и дедупликация
- 🟡 4. LLM-обработка
- ⬜ 5. Ежедневный дайджест
- ⬜ 6. Breaking News
- ⬜ 7. Закреплённая шпаргалка по AI-моделям
- ⬜ 8. Q&A по истории новостей
- 🟡 9. Deployment / эксплуатация

## Быстрые ссылки

- [Roadmap](./ROADMAP.md)
- [Current State](./CURRENT_STATE.md)
- [Backlog](./BACKLOG.md)
- [Architecture](./ARCHITECTURE.md)
- [Decisions](./DECISIONS.md)
