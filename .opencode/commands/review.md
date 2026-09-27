---
description: Запустить независимый read-only review текущих изменений
subagent: false
---

Организуй одно независимое ревью текущих изменений через project agent `reviewer` с ограниченным orchestration-level Model Fallback.

Команда выполняется в текущей Developer-сессии. Не переключай основной agent или модель Developer и не создавай background child. Один `pass` (`initial`, `recheck-1` или `recheck-2`) остаётся одним ревью независимо от количества model attempts. Выполни следующий фиксированный план:

1. Проверь наличие `pass`, `task`, `acceptance`, `verification` и, для recheck, `prior_findings`.
2. Выполни ровно по одному разу только эти read-only Git-команды и сохрани каждый полный output в памяти:

   ```text
   git status --short --branch --untracked-files=all
   git diff main...HEAD
   git diff --cached
   git diff
   ```

3. Убедись, что результаты полные и не truncated. Сформируй `changed_files` manifest точных путей с категориями `committed`, `staged`, `unstaged`, `untracked`; один путь может входить в несколько категорий.
4. Выполни описанный ниже security preflight по manifest и уже сохранённым Git diff. До завершения path preflight не читай ни один untracked-файл.
5. Только для прошедших path preflight untracked-путей прочитай каждый точный файл ровно один раз через `read` и сохрани полный результат в памяти. Не используй `glob`, `grep` или дополнительные Git-команды для восстановления содержимого.
6. Выполни content preflight для сохранённого содержимого untracked-файлов. При любом blocker остановись до вызова Reviewer.
7. Один раз сформируй полный immutable `review_payload`: исходный контекст, acceptance criteria, ограничения, verification, manifest, сохранённые outputs четырёх Git-команд и полный map `untracked_files` вида `path -> captured content`. После формирования не пересобирай snapshot, не перечитывай файлы и не изменяй payload между model attempts.
8. Запусти описанную ниже цепочку через один и тот же project agent `reviewer`. Каждый вызов выполняй в foreground, в новой child session, без `sessionID` предыдущей попытки и с явным model override. Не запускай другие subagents.
9. После успешного возврата результата оцени обоснованность findings в текущем Developer-контексте. Не запускай recheck автоматически и соблюдай ограничения активной задачи на исправления.

Если Git-команда завершилась ошибкой, output truncated или manifest нельзя однозначно построить, не запускай Reviewer: сообщи конкретный blocker.

## Security preflight

Security preflight выполняется локально в Developer до формирования `review_payload` и до любого вызова внешней модели. Он состоит из path preflight и content preflight.

### Path preflight

Проверь все пути `changed_files`, включая tracked и untracked. Считай потенциально секретными как минимум:

- реальные env-файлы: `.env`, `.env.local`, `.env.production` и другие `.env.*`, кроме явно шаблонных `.env.example`, `.env.sample` и `.env.template`;
- файлы и пути с именами `credentials`, `credential`, `secrets`, `secret`, `service-account` и очевидными производными;
- приватные ключи и key stores: `id_rsa`, `id_ed25519`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`;
- credential-файлы в `.ssh`, `.aws`, `.azure`, `.gcp` и аналогичных каталогах.

Не читай содержимое path, заблокированного этим списком. Не полагайся на расширение файла как на доказательство безопасности. Шаблонный env-файл не блокируется только по имени, но его уже полученный diff или captured content всё равно должен пройти content preflight.

Если manifest содержит потенциально секретный path, не вызывай Reviewer, не передавай snapshot внешней модели и сообщи blocker только с безопасным путём и категорией риска. Не показывай и не пытайся читать значение секрета.

### Content preflight

Проверь уже сохранённые committed/staged/unstaged diff целиком, включая добавленные, удалённые и context lines, потому что весь diff предназначен для передачи Reviewer. После безопасного чтения untracked-файлов примени ту же проверку к их captured content.

Ищи только очевидные признаки утечки, например:

- PEM/private-key headers;
- bearer/basic authorization values или URL со встроенными credentials;
- известные token/key prefixes;
- JWT-подобные значения;
- непустые высокоэнтропийные значения рядом с `api_key`, `apikey`, `token`, `secret`, `password`, `private_key`, `client_secret` и аналогичными именами.

Не считай секретом очевидные placeholders и документированные ссылки на environment variable без значения. Если совпадение неоднозначно, считай его потенциальной утечкой и остановись fail-closed.

При обнаружении потенциальной утечки:

- не вызывай Reviewer и не отправляй никакую часть `review_payload` внешней модели;
- сообщи путь, источник (`committed`, `staged`, `unstaged` или `untracked`) и безопасную категорию detector;
- не цитируй совпавшую строку, значение или raw diff;
- не исправляй, не удаляй и не маскируй содержимое автоматически.

Это эвристическая проверка: успешный preflight снижает риск, но не гарантирует обнаружение всех секретов.

## Immutable snapshot

Четыре Git output, manifest и captured untracked content образуют один snapshot текущего `pass`:

- не запускай Git-команды повторно после их первого capture;
- каждый прошедший preflight untracked-файл прочитай ровно один раз и включи его полный captured content в `untracked_files`;
- если файл исчез, недоступен, оказался каталогом/бинарным, output truncated или превышает доступный лимит, остановись с конкретным blocker;
- если любой Git output или untracked content слишком велик для полной передачи, не сокращай и не разбивай snapshot между попытками — остановись;
- сериализуй `review_payload` один раз и передавай каждой model attempt идентичное содержимое byte-for-byte;
- изменения working tree после capture не включай в текущий `pass` и не пытайся синхронизировать повторным чтением.

Неполный snapshot нельзя передавать Reviewer и нельзя использовать как основание для fallback.

## Цепочка моделей

Для каждого `pass` допускается максимум три foreground-вызова Reviewer, строго в этом порядке:

1. `google/gemini-3.8-flash` — Primary;
2. `google/gemini-3.5-flash-lite` — Fallback 1;
3. `openai/gpt-5.6-luna-fast` — Fallback 2.

Всегда начинай с Primary. Каждую модель вызывай максимум один раз. При успешном завершении любой попытки немедленно останови цепочку и не вызывай оставшиеся модели. Не возвращайся к уже вызванной модели и не создавай циклический fallback.

Каждый вызов должен быть эквивалентен:

```text
subagent(
  agent=reviewer,
  model=<текущая модель цепочки>,
  background=false,
  prompt=<идентичный immutable review_payload>
)
```

Model override применяется только к child session. Не переключай model/agent основной Developer-сессии, не изменяй `.opencode/agents/reviewer.md` и не дублируй его инструкции в команде.

Перед попыткой `openai/gpt-5.6-luna-fast` допускается только уже существующее account-based OAuth-подключение OpenAI. Не создавай и не переключай provider connection, не запрашивай и не читай credentials, не используй API key. Если безопасные runtime metadata не подтверждают `credential/oauth`, Luna Fast не вызывай; зафиксируй её как `not attempted: account-based OAuth not confirmed`.

## Gate переключения модели

Fallback разрешён только когда сам foreground-вызов subagent завершился ошибкой и доступные структурированные runtime metadata однозначно подтверждают ошибку provider request из следующего allowlist:

- исчерпание квоты или явный quota code, например `RESOURCE_EXHAUSTED`/`QUOTA_EXCEEDED`;
- HTTP `429`;
- HTTP `500`, `502`, `503` или `504`, явно классифицированный как временная недоступность провайдера;
- явная транспортная ошибка provider request: timeout, connection reset/refused, временная DNS/network/TLS-недоступность.

HTTP `403` разрешает fallback только при отдельном явном structured quota indication. Один статус `403`, произвольный текст ошибки или предположение о квоте недостаточны.

Не классифицируй ошибку по тексту findings или обычному текстовому ответу Reviewer. Не включай raw provider message/payload в prompt следующей попытки или итоговый отчёт. Для причины переключения сохраняй только безопасную категорию, HTTP status и allowlisted error code, если они доступны.

Не выполняй fallback при:

- обычных findings или успешном ревью без замечаний;
- `REVIEW_INCOMPLETE`;
- `INSUFFICIENT_REVIEW_CONTEXT`;
- ошибке или неполноте входных данных;
- ошибке авторизации/credentials, включая HTTP `401` и generic HTTP `403`;
- неизвестной, неоднозначной или неклассифицированной ошибке;
- достижении лимита `12` model steps;
- interrupted/cancelled child session, пустом результате или отсутствии достаточных structured metadata.

Если результат неоднозначен, остановись без следующего вызова и сообщи конкретный blocker. Fallback attempt не является `recheck`: не изменяй `pass`, не увеличивай номер recheck и не добавляй recheck сверх `recheck-2`.

Если Primary и оба fallback-вызова завершились только подтверждёнными allowlisted provider errors, верни `REVIEW_UNAVAILABLE`. Приложи безопасный список попыток и причин без secrets, credentials и raw provider payload. Если Luna Fast не была вызвана из-за неподтверждённого account-based OAuth после подтверждённой недоступности двух Gemini-моделей, также верни `REVIEW_UNAVAILABLE` и явно отметь третью модель как `not attempted`, а не как provider failure.

Контекст задачи от Developer:

$ARGUMENTS

Ожидаемый минимальный формат контекста:

```text
pass=initial|recheck-1|recheck-2
task=<краткая задача и scope>
acceptance=<критерии приёмки и ограничения>
verification=<фактически выполненные проверки>
prior_findings=<для recheck: finding ID и исправления>
```

Developer добавляет к prompt Reviewer:

```text
changed_files=<точные пути и категории>
git_scope.status=<полный status>
git_scope.committed=<полный main...HEAD diff>
git_scope.staged=<полный cached diff>
git_scope.unstaged=<полный unstaged diff>
untracked_files=<точные пути и полный captured content безопасных untracked-файлов>
```

Если обязательного контекста нет, не запускай Reviewer и верни `INSUFFICIENT_REVIEW_CONTEXT` вместо предположений.

## Итоговый отчёт

После остановки цепочки обязательно укажи:

- фактически использованную для результата модель или `none`;
- выполнялся ли fallback;
- последовательность попыток с outcome каждой модели;
- безопасные причины каждого переключения;
- дословный результат Reviewer либо `REVIEW_UNAVAILABLE`/конкретный blocker;
- проверенный и непроверенный scope, а также ограничения проверки.

Явно напомни, что это bounded orchestration Developer, а не нативный гарантированный fallback OpenCode: механизм видит только ошибки, которые foreground subagent call вернул с достаточными structured metadata, не гарантирует перехват любой provider error и не восстанавливает прерванную child session.
