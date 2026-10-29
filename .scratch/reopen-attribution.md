# Reopen attribution

Uma linha por achado de cada reabertura, classificada pela rubrica do foreman (`foreman/SKILL.md`). Backfill de 2026-09-27 a partir do `git log`; revisor desconhecido (`?`) e `sonnet?` = sem trailer, Sonnet pelo binding.

| When | ID | Round | Implementer | Reviewer | Label | Finding | Why |
|---|---|---|---|---|---|---|---|
| 2026-09-03 | ARCH-001 | 1 | fable | ? | S2-explícito/código | `isRetryable` existe e ninguém consome | critério 4 pede exatamente isso (d53cedd) |
| 2026-09-03 | ARCH-001 | 1 | fable | ? | S2-implícito | falha de parse ainda grava snapshot vazio | regressão do próprio refactor para `AppResult` (d53cedd) |
| 2026-09-03 | ARCH-001 | 1 | fable | ? | S2-implícito | fallback de download do main perdido | regressão óbvia de outro fluxo (d53cedd) |
| 2026-09-03 | ARCH-001 | 1 | fable | ? | S2-implícito ? | `findScript` ainda casa por nome | casar só por id é cuidado, não decisão (d53cedd) |
| 2026-09-08 | PORTAL-003 | 1 | sonnet | ? | S2-explícito/teste | fiação de produção (drift grava, clear-all apaga) sem teste | critérios 1 e 4 sem prova; reverter não quebra nada (360180e) |
| 2026-09-08 | PORTAL-003 | 1 | sonnet | ? | S2-implícito | `app.getPath` no import (regressão do DEV-002) | convenção do repo (getter em cache/persistence) (360180e) |
| 2026-09-08 | PORTAL-003 | 1 | sonnet | ? | S2-implícito | falha ao gravar o diagnóstico apaga o `SELECTOR_DRIFT` | caminho de falha do código que a etapa 2 criou (360180e) |
| 2026-09-08 | PORTAL-003 | 1 | sonnet | ? | S2-explícito/código | só 1 de 3 pontos de drift instrumentado | AC1 fala de falhas, não de uma (360180e) |
| 2026-09-08 | PORTAL-003 | 1 | sonnet | ? | S3-ruído | AC3: converter os 11 dumps ou remover a abstração | gosto/YAGNI; a R2 manteve como ressalva, sem correção (360180e) |
| 2026-09-08 | PORTAL-003 | 2 | opus | ? | S2-explícito/código | `title` com texto livre (nome, nota) no JSON | AC2 e `PORTAL_COMPATIBILITY.md:211`; a R1 tinha rebaixado a ⚠️ e sugerido truncar (errado) (fa72252) |
| 2026-09-08 | PORTAL-003 | 2 | opus | ? | S2-explícito/código | `jsessionid` preservado no pathname | AC2 (credenciais e sessão removidas) (fa72252) |
| 2026-09-08 | PORTAL-003 | 2 | opus | ? | S2-explícito/código | falhas de login sem diagnóstico | AC1; a contagem da R1 estava incompleta (fa72252) |
| 2026-09-09 | OBS-004 | 1 | sonnet | ? | S1 | corrida do `clear()` não corrigida | pedida só em prosa; `logger.service.ts` fora dos Primary files e sem critério (o autor admite em 892022c) (90eb58d) |
| 2026-09-09 | OBS-004 | 1 | sonnet | ? | S2-explícito/teste | falta a asserção de contrato no `beforeEach` | estava literal em "Testes que a etapa 2 escreve" (90eb58d) |
| 2026-09-10 | A11Y-001 | 1 | sonnet? | ? | S2-implícito | literais de cor quebram o tema escuro | convenção de tokens e tema escuro do repo (81e6d76) |
| 2026-09-10 | A11Y-001 | 1 | sonnet? | ? | S2-explícito/teste | asserção de foco passa com `activeElement` nulo | teste oco para o critério 2 (81e6d76) |
| 2026-09-10 | A11Y-001 | 1 | sonnet? | ? | S2-implícito ? | scan do axe só no tema claro | o repo tem tema escuro; pede cuidado, não decisão (81e6d76) |
| 2026-09-10 | A11Y-001 | 1 | sonnet? | ? | S2-implícito | listener do backdrop acumula a cada abertura | limpeza do que a própria etapa 2 introduziu (81e6d76) |
| 2026-09-10 | A11Y-001 | 1 | sonnet? | ? | S2-implícito | `aria-labelledby` aponta para um id inexistente no loading | "dialog semantics" implica nome acessível (81e6d76) |
| 2026-09-10 | A11Y-001 | 2 | sonnet | ? | S2-implícito | item 4 corrigido pela metade (vaza por Escape/fundo) | mesma limpeza, causa raiz incompleta (d3b0691) |
| 2026-09-10 | A11Y-001 | 2 | sonnet | ? | S3-ruído ? | testes do tema escuro não confirmam que o tema pegou | os testes eram reais hoje; robustez futura (d3b0691) |
| 2026-09-10 | A11Y-001 | 3 | sonnet | ? | S2-implícito | `#modalMeta` fica com a notícia anterior entre aberturas | regressão da própria correção do item 5 da R1 (7a581ad) |
| 2026-09-10 | A11Y-001 | 3 | sonnet | ? | S2-implícito | `.news-title` herdou a fonte do `<button>` | regressão óbvia da troca div→button (7a581ad) |
| 2026-09-10 | A11Y-001 | 3 | sonnet | ? | S2-explícito/teste | teste de `:focus-visible` e do "Tab até o sino" fracos | o critério 1 (teclado) sem prova real (7a581ad) |
| 2026-09-10 | A11Y-001 | 3 | sonnet | ? | S2-explícito/teste ? | asserções gêmeas com força desigual | provas mais fracas num dos pares (7a581ad) |
| 2026-09-10 | A11Y-001 | 3 | sonnet | ? | S2-implícito | conteúdo de fluxo dentro de `<button>` | HTML inválido criado pela branch (7a581ad) |
| 2026-09-11 | A11Y-003 | 1 | sonnet | ? | S2-explícito/teste | critério 3 (`.back-link:hover`) sem teste | o fluxo exige teste por critério; a lista do ticket só pedia o do critério 1 (525e025) |
| 2026-09-11 | DL-005 | 1 | fable | ? | S2-explícito/teste | "cabeça inválida apaga e baixa" sem teste | metade do critério 2 sem prova (a lista só cobria o critério 1) (10b1ead) |
| 2026-09-11 | DATA-003 | 1 | fable | ? | S2-explícito/código | `select-download-folder` rejeita a invoke | Comments mandava fazer grep dos chamadores; handler em arquivo Primary (f828903) |
| 2026-09-11 | DATA-003 | 1 | fable | ? | S2-explícito/código | `forgetLastFile` muta antes de gravar | Primary files: "quem mais chama `saveCache`" (f828903) |
| 2026-09-11 | DATA-003 | 1 | fable | ? | S2-explícito/código ? | bg-sync `:263` derruba o push do ciclo; decisão não anotada | "decida caso a caso e anote" foi ignorado; o conserto exigiu estender o limite (f828903) |
| 2026-09-12 | OBS-002 | 1 | sonnet | ? | S2-explícito/código | `name` nunca vai para o `meta` da 1ª linha | está no Contrato; o autor depois **cortou o requisito** (fa8b5ef) (7ad6e05) |
| 2026-09-12 | OBS-003 | 1 | sonnet? | ? | S2-implícito | `removeLegacyLogs` no import apaga `%TEMP%` real no `npm test` | "Para o revisor" já dizia "antes de `createWindow()`"; o critério 8 do humano era inferível (92dcec3) |
| 2026-09-12 | OBS-003 | 2 | sonnet? | ? | S2-explícito/código ? | o mock síncrono de `whenReady` em `navigation-policy.test.ts` ainda apaga | viola a letra do critério 8; o conserto exigiu estender os Primary files (95d4db8) |
| 2026-09-12 | PORTAL-005 | 1 | sonnet? | ? | S2-explícito/código | retry pós-re-login não conta drift | consequência direta do critério 4 e do AC3 (5c5cd6a) |
| 2026-09-12 | PORTAL-005 | 1 | sonnet? | ? | S2-explícito/código | `onChange` repete com o mesmo state | decisão 5 do ticket (hoje inalcançável) (5c5cd6a) |
| 2026-09-12 | PORTAL-005 | 1 | sonnet? | ? | S2-implícito | `main.ts` sem guarda `isDestroyed` | convenção já usada no background-sync (5c5cd6a) |
| 2026-09-12 | A11Y-002 | 1 | sonnet? | ? | S2-explícito/teste | modal aberto mascara o scan do course-detail fechado | critério 3 perdeu a prova (2011388) |
| 2026-09-12 | A11Y-002 | 1 | sonnet? | ? | S2-implícito ? | `.news-notification` 2,84:1 exposta pela fixture | a violação apareceu pela fixture que a etapa 2 mudou; critério 5 inferível (2011388) |
| 2026-09-13 | DL-004 | 1 | sonnet? | ? | S2-implícito ? | `fs.link` falha em FAT32/exFAT | só cuidado; mas o ticket apontava a branch Codex com `link` como referência (ef55c4f) |
| 2026-09-13 | DL-004 | 1 | sonnet? | ? | S2-implícito | `unlink` do `.part` transforma sucesso em falha | caminho de falha do próprio código (ef55c4f) |
| 2026-09-13 | DL-004 | 1 | sonnet? | ? | S1 | critério 5 não é por id | impossível sem um índice persistido; o autor reescreveu o critério (59a411a) e abriu o DL-006 (ef55c4f) |
| 2026-09-13 | DL-004 | 1 | sonnet? | ? | S3-ruído | 2 arquivos fora dos Primary files não declarados | processo, sem efeito no comportamento (ef55c4f) |
| 2026-09-13 | DL-004 | 1 | sonnet? | ? | S3-ruído | cache do renderer não migra | o revisor aceitou como perda única (ef55c4f) |
| 2026-09-13 | DL-004 | 2 | sonnet? | ? | S2-implícito | placeholder de 0 byte vaza se o `rename` falha | caminho de falha; nasceu da direção sugerida pela R1 (5f88c8e) |
| 2026-09-13 | BUG-012 | 1 | sonnet? | ? | S2-explícito/teste ? | `catch` do `main.ts` sem teste (reverter não quebra nada) | o critério 1 é explícito, mas a lista do ticket prescreveu exatamente o teste oco e o seam estava fora do limite (0d5678a) |
| 2026-09-14 | DL-006 | 1 | sonnet? | ? | S1 | downloads do sync em background viram `X (1).pdf` | o spec escolheu um índice que o bg-sync não tem; o autor acrescentou o critério 6 (457ef43) |
| 2026-09-14 | DL-006 | 1 | sonnet? | ? | S3-ruído | `any` no renderer | estilo, fora da fronteira (457ef43) |
| 2026-09-14 | DL-006 | 1 | sonnet? | ? | S2-implícito | 3ª cópia da leitura de cabeça | o cabeçalho do `file-validation` avisa; parkado em CLEAN-006 (457ef43) |
| 2026-09-14 | DL-006 | 2 | sonnet? | ? | S2-explícito/teste ? | o fio `handleBackgroundSyncUpdate` → índice sem teste | critério 6 sem prova; o revisor diz "o buraco é da lista" (19e9e4c) |
| 2026-09-14 | DL-006 | 2 | sonnet? | ? | S2-implícito | loop novo antes do `try` tira o toast de quota | regressão de defesa já comentada no mesmo arquivo (19e9e4c) |
| 2026-09-15 | QA-001 | 1 | sonnet? | ? | S1 | coverage e `audit:prod` não rodam em nenhum workflow | buraco do spec; `quality.yml` fora do limite (listava um `ci.yml` que não existe); o autor acrescentou o critério 6 (414c35c) |
| 2026-09-15 | QA-001 | 1 | sonnet? | ? | S3-ruído ? | threshold agregado, não por arquivo | o critério 3 foi cumprido; não acionado (414c35c) |
| 2026-09-15 | QA-001 | 1 | sonnet? | ? | S3-ruído | margem zero em `functions` | provavelmente proposital; só nota (414c35c) |
| 2026-09-15 | PORTAL-007 | 1 | sonnet | ? | S2-explícito/teste | critério 3 (TypeError) sem teste | a lista não tinha teste para o critério 3 (a633d15) |
| 2026-09-15 | CLEAN-008 | 1 | sonnet | ? | S2-implícito | `preFetchedHtml` obrigatório esvaziou 2 testes (um de redação de cookie) | chamadores quebrados pela própria mudança; `tsc` não via `tests/` (97eb995) |
| 2026-09-15 | CLEAN-008 | 1 | sonnet | ? | S2-implícito | `ARCHITECTURE.md` descreve código apagado | docs acompanham o código (97eb995) |
| 2026-09-15 | CLEAN-008 | 1 | sonnet | ? | S1 | vizinhos ficaram sem chamador (`findCourseRow` etc.) | premissa falsa do ticket ("seam viva") (97eb995) |
| 2026-09-16 | BUG-019 | 1 | sonnet | ? | S2-explícito/código ? | id casa contra o `href` cru, não contra a URL resolvida | o critério 5 falha no caso real (`href` relativo) (bd3e77f) |
| 2026-09-16 | BUG-019 | 1 | sonnet | ? | S1 | nada chama `downloadFile` com id `link:` | o critério mirava código morto; o autor decidiu apagar (bd3e77f) |
| 2026-09-18 | BUG-022 | 1 | sonnet | ? | S2-implícito | continuação de `fetchCourseFiles` troca o `cleanupProgress` atual | o ticket dava o princípio ("capturar antes do await, comparar depois") (ef071ed) |
| 2026-09-18 | PORTAL-013 | 1 | fable | ? | S1 | a definição de "linha candidata" derruba o portal real | o spec não conhecia o painel "Habilitadas"; info só do dump real (4c271a0) |
| 2026-09-18 | PORTAL-013 | 1 | fable | ? | S2-explícito/código ? | `period` perdeu os `<br>` (a fixture escrita escondia) | critério 8 explícito; regressão innerText→`.text()` (4c271a0) |
