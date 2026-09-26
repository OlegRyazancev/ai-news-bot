# BACKLOG.md

## Now
- **Stage 4 review verification** — Подтвердить в CI новые PostgreSQL tests для persisted quota/pause, metadata reprocess и explicit FAILED retry
- **Gemini runtime verification** — Проверить `gemini-2.5-flash-lite` на одной явно выбранной статье с реальным API key и оценить summary/importance/topics
- **Stage 4 manual acceptance** — Подтвердить совместную работу Telegram polling, RSS collection и независимого LLM processor

## Next
- **Ежедневный дайджест** — Генерация и доставка утреннего дайджеста (за последние 24ч)
- **Scheduler для дайджеста** — Расширить встроенный `node-cron` задачей доставки дайджеста
- **Telegram Delivery** — Отправка дайджеста, обработка обновлений закреплённого сообщения

## Later
- **Breaking News** — Отдельные алерты о важных новостях сразу после их обнаружения
- **Закреплённая шпаргалка по моделям** — Поддержка одного обновляемого сообщения с категориями моделей
- **Weekly Digest** — Расширенная сводка
- **`/ask` over History** — Q&A по накопленным новостям
- **Subscriptions / Preferences** — Мульти-тема, настройки пользователя (схема есть)
- **Webhook Support** — Продакшн деплой
- **Rate Limiting / Admin / Tests** — Укрепление
