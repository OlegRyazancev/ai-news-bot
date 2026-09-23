# DECISIONS.md

## Архитектурные решения

| Решение | Выбор | Причина |
|----------|--------|--------|
| Язык | TypeScript | не задокументировано |
| Runtime | Node.js 20+ | не задокументировано |
| Telegram Framework | grammY | не задокументировано |
| Conversation Handling | @grammyjs/conversations | не задокументировано |
| База данных | PostgreSQL | не задокументировано |
| ORM | Prisma | не задокументировано |
| Config Validation | Zod | не задокументировано |
| Environment | dotenv | не задокументировано |
| Dev Runtime | tsx | не задокументировано |
| Linting | ESLint + TypeScript ESLint | не задокументировано |
| Testing | Vitest | не задокументировано |
| Containerization | Docker + Docker Compose | не задокументировано |
| Docker Base | node:20-alpine | не задокументировано |
| Bot Mode | Long polling | не задокументировано |
| Session Storage | In-memory (grammY default) | не задокументировано |
| Logging | Custom console logger | не задокументировано |
| News Source Strategy | Curated RSS mix: OpenAI, Google DeepMind, Hugging Face, Apple ML, NVIDIA Technical Blog, Ars Technica AI, MIT Technology Review AI, The Decoder | Согласованные 8 RSS/Atom-фидов дают баланс официальных и независимых источников без API-ключей; все URL runtime-проверены |
| Scheduler Library | Embedded `node-cron` | Подходит для регулярного сбора и будущего дайджеста без отдельной инфраструктуры; проект работает в одном экземпляре |

## Решения по модели данных

| Решение | Выбор | Причина |
|----------|--------|--------|
| User ID | BigInt (autoincrement) | не задокументировано |
| Telegram ID | BigInt @unique | не задокументировано |
| Preferences | Separate 1:1 model | не задокументировано |
| Subscriptions | Topic + keywords array | не задокументировано |
| Articles | URL @unique, indexed | не задокументировано |
| Digests | Article ID array | не задокументировано |

## Недокументированные / Не решённые

| Область | Статус |
|------|--------|
| LLM Provider | Не решено |
| Webhook vs Polling (prod) | Polling for now, webhook TBD |
| Rate Limiting | Не реализовано |
| Multi-instance Session Store | Пока не требуется |
| Monitoring/Observability | Не решено |
| Backup Strategy | Не решено |
| Article Retention Policy | Не решено |
| User Data Export/Deletion | Не решено (GDPR) |
| Pinned Message Update Mechanism | Не решено |
| Cheat-sheet Content Source | Не решено |
