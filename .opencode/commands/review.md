---
description: Запустить независимый read-only review текущих изменений
subagent: false
---

Организуй ровно один независимый review pass текущих изменений через project agent `reviewer` с ограниченным orchestration-level Model Fallback.

Команда выполняется в текущей Developer-сессии. Developer остаётся координатором lifecycle; Reviewer только read-only анализирует переданный snapshot. Не переключай основной agent или модель Developer, не создавай background child, не вызывай `/review` рекурсивно и не запускай следующий pass из текущего вызова. Один `pass` (`initial`, `recheck-1` или `recheck-2`) остаётся одним ревью независимо от количества model attempts.

## Lifecycle gate перед одним pass

1. Прочитай актуальный раздел **«Reviewer policy»** в `AGENTS.md`, канонический state contract и общие инварианты в `.opencode/commands/handoff.md`, а также единый source-selection/freshness contract `.opencode/commands/start.md`. Не запускай эти Markdown-команды как вложенные slash-команды и не поддерживай здесь независимую копию глобальной state machine.
2. Выбери канонический task-level source строго по `/start`: stage checklist для `stage/NN-*`, body единственного корректного PR для опубликованной non-stage задачи, текущая Developer-сессия для non-stage без PR. Handoff-отчёт не является source of truth.
3. Проверь единственный bounded state section и общие инварианты `/handoff`. Отсутствующий durable state после смены сессии, duplicate/unbalanced markers, неизвестный уже начатый lifecycle position, противоречивые pass/counter/findings или невозможность подтвердить source означают `ORCHESTRATION_STATE_CONFLICT` либо `ORCHESTRATION_STATE_INCOMPLETE`: не восстанавливай значения предположениями и не вызывай Reviewer. Ещё не выполненная classification текущей задачи в той же Developer-сессии может быть установлена по подтверждённому scope и не считается восстановлением прошлого state.
4. После завершения implementation и применимой verification зафиксируй Reviewer classification (`required` или `not-required`) и конкретную причину, используя исключительно критерии `AGENTS.md`. Существующую classification не меняй без подтверждённого substantive scope change; после любого завершённого pass новая classification не превращает stale review в skip.
5. При мотивированном `not-required` и отсутствии ранее завершённых passes не собирай review snapshot и не вызывай Reviewer. Зафиксируй только подтверждённый skip по общей matrix `/handoff`: `Last completed pass: none`, `Unresolved finding IDs: none`, `Remaining rechecks: 0`, `Review gate: complete`; остальные Reviewer fields заполни подтверждёнными `none`/`not-applicable`, не меняя Architect или Stage plan state, затем заверши команду.
6. При `required` и подтверждённо новом lifecycle до initial зафиксируй `Last completed pass: none`, `Unresolved finding IDs: none`, `Confirmed fixes: none`, `Verification after fixes: not-applicable`, `Remaining rechecks: 2`, `Accepted residual risks: none`, `Review gate: pending`; `Reviewed scope revision` остаётся `unconfirmed` до завершённого pass. Не применяй эту инициализацию поверх существующего review state.
7. Не перезаписывай подтверждённые Architect outcome, Architecture Decision Gate или Stage plan approval. Reviewer lifecycle изменяет только Reviewer fields канонического state.

### Разрешённый переход

Запрошенный `pass` должен соответствовать подтверждённому state:

| Current last completed pass | Следующий pass | Дополнительные условия |
|---|---|---|
| `none` | `initial` | implementation и применимая verification завершены |
| `initial` | `recheck-1` | есть подтверждённые Reviewer findings либо подтверждённые post-review runtime/acceptance defects со stable IDs; внесены относящиеся к ним исправления и повторная verification успешна |
| `recheck-1` | `recheck-2` | остались подтверждённые findings, внесены новые исправления и повторная verification успешна |

Любой другой переход запрещён. `Fallback` внутри pass не меняет transition, `Last completed pass` или counter. После `recheck-2` новый автоматический pass запрещён.

- Не выполняй повторный `initial`, если state и freshness подтверждают уже завершённый актуальный `initial` или более поздний pass.
- Recheck без подтверждённых исправлений, фактического изменения относящегося scope и успешной повторной verification запрещён. Post-review defect должен иметь stable ID, проверяемое runtime/acceptance evidence и явное подтверждение Developer или пользователя; произвольное новое требование не становится finding этим путём.
- Если ранее успешный review стал stale из-за новых substantive changes, которые не являются исправлениями подтверждённых findings, не маскируй их как recheck и не повторяй initial: сообщи отсутствие разрешённого transition и остановись.
- Если pass уже подтверждён для актуального substantive scope, заверши без model call и без расходования recheck.

### Переход для ORCH-FP-001 и ORCH-ENC-002

Для текущего согласованного recovery lifecycle исторический `initial` остаётся завершённым с `findings: none`, `Remaining rechecks: 2`, а его unversioned fingerprint имеет только `freshness: unconfirmed`. Подтверждённые post-review acceptance defects `ORCH-FP-001` и `ORCH-ENC-002` разрешают после исправлений и успешной повторной verification ровно следующий `recheck-1`:

- не запускай новый `initial` и не сбрасывай counters;
- не присваивай historical hash schema `ai-news-bot/substantive-scope@1` задним числом;
- передай оба stable defect ID, evidence, confirmed fixes и verification after fixes;
- создай новый полный immutable `review_payload` и новую согласованную пару `review_payload_sha256` + v1 `substantive_scope_sha256` для всего актуального scope;
- после успешного `recheck-1` установи `Remaining rechecks: 1`, сохранив historical initial identifiers отдельно как legacy evidence, а не как current reviewed revision.

## Фиксированный план одного pass

1. Проверь наличие `pass`, `task`, `acceptance`, `verification` и, для recheck, `prior_findings` с stable finding IDs, `confirmed_fixes` и `verification_after_fixes`.
2. Проверь lifecycle gate и readiness verification. Заявления без фактических результатов команд/проверок не подтверждают readiness. Не запускай `initial` до implementation verification и не запускай recheck до повторной verification после исправлений.
3. Выполни ровно по одному разу только эти read-only Git-команды и сохрани каждый полный output в памяти:

   ```text
   git status --short --branch --untracked-files=all
   git diff main...HEAD
   git diff --cached
   git diff
   ```

4. Убедись, что результаты полные и не truncated. Сформируй `changed_files` manifest точных путей с категориями `committed`, `staged`, `unstaged`, `untracked`; один путь может входить в несколько категорий.
5. Для immutable Reviewer payload дополнительно выполни ровно по одному разу и сохрани полные raw outputs:

   ```text
   git merge-base main HEAD
   git diff --raw -z --full-index --find-renames <review-base из предыдущей команды>
   ```

   Первый output задаёт `review_base`; второй остаётся evidence в payload. Он не используется как отдельная реализация fingerprint. Ошибка, truncated output, неоднозначная база или невозможность разобрать NUL-delimited raw metadata блокирует Reviewer.
6. Вызови `inspect` общего executable `.opencode/scripts/substantive-scope.mjs` со schema `ai-news-bot/substantive-scope@1` и точным `review_base`. `inspect` не читает file contents. Проверь schema, base, `inspection_sha256`, все paths и metadata; ошибка или malformed/unsupported output блокирует workflow.
7. Выполни описанный ниже path preflight по exact inspect paths и уже сохранённым Git manifests/diffs. До его завершения не читай untracked-файлы и не вызывай `calculate`.
8. Только для прошедших path preflight untracked-путей прочитай каждый точный небинарный файл ровно один раз через `read`, сохрани полный результат в памяти и выполни content preflight всех сохранённых diff/captured contents. Не используй `glob`, `grep` или дополнительные Git-команды для восстановления содержимого. Бинарный/special untracked-файл остаётся snapshot/security blocker. При любом blocker остановись до `calculate` и Reviewer.
9. Только после полного успешного security preflight сформируй `approved_paths` как точный отсортированный path set из результата `inspect` без добавления, удаления или преобразования путей. Вызови `calculate` того же executable с той же schema/base, подтверждёнными `inspection_sha256`, `approved_paths` и approved canonical stage-checklist path либо `null`. При любом расхождении остановись fail-closed без model call или lifecycle transition.
10. Один раз сформируй полный immutable `review_payload`: исходный контекст, acceptance criteria, ограничения, verification, для recheck — prior findings/fixes/reverification, manifest, сохранённые outputs исходных Git-команд, `review_base`, raw metadata output, возвращённый executable `normalized_final_content_manifest` и полный map `untracked_files` вида `path -> captured content`. После формирования не пересобирай snapshot, не перечитывай файлы и не изменяй payload между model attempts.
11. Рассчитай `review_payload_sha256` из exact immutable payload; `substantive_scope_sha256` бери только из успешного результата v1 `calculate`. До model call остановись, если requested transition не соответствует state, pass уже актуально завершён либо freshness невозможно надёжно определить.
12. Запусти описанную ниже цепочку непосредственно через один и тот же project agent `reviewer`. Каждый вызов выполняй в foreground, в новой child session, без `sessionID` предыдущей попытки и с явным model override. Не запускай другие subagents и не вызывай Markdown-команду `/review`.
13. После успешного возврата примени quality/evidence gate и обнови task-level state по разделам ниже. Текущий вызов на этом заканчивается: не исправляй findings и не запускай recheck рекурсивно.

Если Git-команда завершилась ошибкой, output truncated или manifest нельзя однозначно построить, не запускай Reviewer: сообщи конкретный blocker.

## Security preflight

Security preflight выполняется локально в Developer после `inspect`, но до `calculate`, формирования `review_payload` и любого вызова внешней модели. Он состоит из path preflight и content preflight. Executable не является sandbox, не подтверждает безопасность содержимого и не заменяет эту проверку.

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

Исходные четыре Git output, два freshness-metadata output, manifests и captured untracked content образуют один snapshot текущего `pass`:

- не запускай вручную ни одну snapshot Git-команду повторно после её первого capture; внутренние повторные Git inspections общего executable являются обязательной частью v1 TOCTOU/freshness contract и не пересобирают raw Reviewer snapshot;
- каждый прошедший preflight untracked-файл прочитай ровно один раз и включи его полный captured content в `untracked_files`;
- если файл исчез, недоступен, оказался каталогом/бинарным, output truncated или превышает доступный лимит, остановись с конкретным blocker;
- если любой Git output или untracked content слишком велик для полной передачи, не сокращай и не разбивай snapshot между попытками — остановись;
- сериализуй `review_payload` один раз и передавай каждой model attempt идентичное содержимое byte-for-byte;
- рассчитай `review_payload_sha256` по UTF-8 bytes этой единственной сериализации и не пересчитывай его из реконструированного payload;
- изменения working tree после capture не включай в текущий `pass` и не пытайся синхронизировать повторным чтением.

Неполный snapshot нельзя передавать Reviewer и нельзя использовать как основание для fallback.

## Freshness и scope revision: единый executable contract

Единственная реализация content-based fingerprint — `.opencode/scripts/substantive-scope.mjs`, schema `ai-news-bot/substantive-scope@1`. `/review`, `/start`, `/stage-status`, `/handoff` и `/stage-close` обязаны вызывать этот файл; независимо воспроизводить serialization, path sorting, Git operations, normalization или hashing в Markdown запрещено.

CLI получает один JSON object через UTF-8 stdin и возвращает один JSON object без file contents:

```json
{"action":"inspect","schema":"ai-news-bot/substantive-scope@1","review_base":"<full commit oid>","repo_root":"<repository root>"}
```

После проверки inspect output и полного security preflight:

```json
{"action":"calculate","schema":"ai-news-bot/substantive-scope@1","review_base":"<тот же full commit oid>","repo_root":"<repository root>","expected_inspection_sha256":"<подтверждённый inspect hash>","approved_paths":["<точный inspect path set>"],"state_checklist_path":"<approved canonical checklist path или null>"}
```

Вызов выполняй как отдельный Node.js process без shell interpolation путей. Request передавай как UTF-8 bytes, проверяй успешный exit и strict JSON response. Не выводи captured file contents. Обязательный порядок неизменен:

```text
inspect
→ проверить schema/review_base/paths/metadata/inspection_sha256
→ выполнить path и content security preflight
→ сформировать exact approved_paths
→ calculate с тем же schema/base и подтверждённым inspection_sha256
```

`calculate` до полного успешного preflight запрещён. Любая ошибка процесса, неизвестная/отсутствующая schema, path/metadata blocker, changed inspection manifest, несовпадение approved paths, unsupported file type, неоднозначная checklist normalization или изменение файла означает `freshness: unconfirmed` и fail-closed: не вызывай Reviewer и не выполняй автоматический lifecycle transition.

Результат `calculate` является единственным источником `normalized_final_content_manifest` и `substantive_scope_sha256`. Полный `review_payload` всё равно содержит исходные Git snapshots/categories и bounded state без исключения; executable их не заменяет. Fingerprint идентифицирует scope, но не доказывает качество review или безопасность содержимого. Он стабилен при category-only commit неизменённых bytes и меняется при substantive path/content/type/mode/base delta; точные гарантии и ограничения задаются versioned executable и `docs/DECISIONS.md`.

После завершённого pass сохрани в `Reviewed scope revision`: `substantive-scope-schema=ai-news-bot/substantive-scope@1; review-payload-sha256=<exact hash>; substantive-scope-sha256=<calculate hash>; review-base=<commit>` и normalization summary. При следующей проверке сравни schema, base и воспроизведённый calculate hash:

- совпадение означает current scope; category-only movement и bounded state-only updates не делают pass stale;
- различие означает `stale` до разрешённого transition;
- unknown/missing schema, legacy unversioned hash или недоказуемая equivalence означает `unconfirmed`, а не v1 compatibility;
- исправления подтверждённых Reviewer findings либо разрешённых post-review defect IDs после повторной verification могут открыть следующий bounded recheck; другое новое изменение recheck не разрешает.

Обновление bounded section в PR body не входит в Git fingerprint. Любая запись PR body выполняется только по UTF-8 safety protocol `/handoff`, сохраняя весь текст вне единственной marker-пары.

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

## Quality и evidence gate результата

Успешный model call не равен завершённому review pass. До обновления counters Developer обязан проверить:

- Reviewer проверил весь подтверждённый changed scope либо явно вернул `REVIEW_INCOMPLETE`;
- каждый finding содержит stable finding ID, severity, точное место/hunk, доказательство, последствие и минимальное исправление;
- finding относится к captured scope и противоречит acceptance criterion, решению или проверяемому инварианту;
- результат не объявляет фактически выполненную verification отсутствующей без конкретного доказательства;
- вывод отделяет findings от limitations и residual risks.

`REVIEW_INCOMPLETE`, `INSUFFICIENT_REVIEW_CONTEXT`, `REVIEW_UNAVAILABLE`, security/snapshot blocker, incomplete manifest, пустой/неоднозначный результат или существенный непроверенный changed scope не завершают pass: не меняй `Last completed pass` и `Remaining rechecks`, не перезаписывай последний подтверждённый scope/findings/fixes/verification, поставь `Review gate: blocked` и сообщи точный blocker. Не переключай модель из-за содержательной неполноты, несогласия Developer с выводом или недоказанного finding.

После полного результата Developer:

1. проверяет доказательность каждого finding независимо;
2. сохраняет в `Unresolved finding IDs` только подтверждённые stable IDs вместе с severity;
3. на recheck сохраняет исходный ID предыдущего finding для статуса resolved/unresolved; новый подтверждённый finding получает новый ID, а существующие IDs не перенумеровываются;
4. неподтверждённые замечания кратко отклоняет в текущем отчёте с причиной, но не сохраняет как unresolved finding и не сохраняет полный transcript;
5. определяет минимальные исправления только для подтверждённых findings;
6. не считает pass основанием пропустить build/tests/runtime/user verification, документационный gate или CI.

## Обновление task-level state после pass

Обновляй только Reviewer fields в каноническом source, выбранном до pass. Сохраняй подтверждённые значения, а не полный ответ Reviewer. Если source — non-stage PR body, до и после записи примени полный UTF-8 safety protocol `/handoff`; используй UTF-8 без BOM temporary file и `gh --body-file`, никогда console/PowerShell pipeline:

- `Last completed pass` — фактически завершённый `initial`, `recheck-1` или `recheck-2`;
- `Reviewed scope revision` — exact и substantive identifiers из текущего immutable snapshot;
- `Unresolved finding IDs` — подтверждённые severity + stable ID либо подтверждённое `none`;
- `Confirmed fixes` — finding ID и краткое фактическое исправление; до исправлений `none`;
- `Verification after fixes` — фактически выполненные команды/результаты; для initial без исправлений `not-applicable`;
- `Remaining rechecks` — только по общей matrix: `initial → 2`, `recheck-1 → 1`, `recheck-2 → 0`;
- `Accepted residual risks` — сохраняй существующие подтверждённые значения; новое значение возможно только по правилам ниже;
- `Review gate` — `complete` при актуальном scope без непринятых findings, `blocked` при подтверждённых blocking findings, `stale` при substantive scope change, `unconfirmed` при недоказанной freshness.

Model fallback и неуспешные/incomplete attempts не изменяют pass или counter. Обновление bounded orchestration state после pass считается служебной delta по freshness rules выше и не запускает новый review само по себе. Не изменяй никакие Architect или Stage plan fields.

### Действия между отдельными вызовами

Если после `initial` или `recheck-1` остались подтверждённые findings, текущий вызов завершается с `Review gate: blocked`. Внешний Developer workflow затем отдельно:

1. исправляет только подтверждённые findings;
2. фиксирует `Confirmed fixes` по stable finding IDs;
3. выполняет применимую повторную verification и сохраняет фактические результаты;
4. повторно вызывает этот single-pass protocol с разрешённым следующим `pass`.

Отсутствие исправлений, substantive change и повторной verification блокирует recheck. Команда не вызывает себя и не объединяет несколько passes в одну child session.

## Residual risks после recheck-2

После завершённого `recheck-2` значение `Remaining rechecks` всегда `0`. Если подтверждённые findings остались:

- останови автоматический workflow и не выполняй дополнительные model calls;
- покажи пользователю IDs, severity и проверяемые доказательства;
- `P0`, `P1` и `P2` оставь blocking и не предлагай принять их как residual risk;
- конкретный `P3` можно добавить в `Accepted residual risks` только после явного решения пользователя с finding ID и описанием принятого риска; сам ID сохраняется в `Unresolved finding IDs` как явно принятый residual finding;
- молчание, отсутствие ответа или общий призыв продолжить не являются согласием.

После явного принятия всех оставшихся P3 обнови только `Accepted residual risks` и, если substantive scope всё ещё актуален и других blockers нет, `Review gate: complete`. Для этого не запускай Reviewer повторно. Accepted risk не отменяет verification, CI или ручной merge.

Контекст задачи от Developer:

$ARGUMENTS

Ожидаемый минимальный формат контекста:

```text
pass=initial|recheck-1|recheck-2
task=<краткая задача и scope>
acceptance=<критерии приёмки и ограничения>
verification=<фактически выполненные проверки>
prior_findings=<для recheck: подтверждённые severity + stable Reviewer finding ID и/или stable post-review defect ID с evidence>
confirmed_fixes=<для recheck: finding ID + фактическое исправление>
verification_after_fixes=<для recheck: повторные команды/проверки и результаты>
```

Developer добавляет к prompt Reviewer:

```text
changed_files=<точные пути и категории>
git_scope.status=<полный status>
git_scope.committed=<полный main...HEAD diff>
git_scope.staged=<полный cached diff>
git_scope.unstaged=<полный unstaged diff>
git_scope.review_base=<полный merge-base commit ID>
git_scope.raw_final=<полный NUL-delimited raw diff относительно review_base>
normalized_final_content_manifest=<paths, operations, modes/types и content hashes>
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
- `review_payload_sha256`, `substantive_scope_sha256` и применённую state-only normalization без содержимого snapshot;
- завершённый pass либо указание, что pass не завершён и counters не изменены;
- подтверждённые/отклонённые finding IDs, следующий разрешённый transition и текущий review gate.

Явно напомни, что это bounded orchestration Developer, а не нативный гарантированный fallback OpenCode: механизм видит только ошибки, которые foreground subagent call вернул с достаточными structured metadata, не гарантирует перехват любой provider error и не восстанавливает прерванную child session.
