# OBS-003 — Gate raw HTML dumps, wire diagnostics clear, clean legacy logs
Status: resolved
Stage: done
Priority: P2
Blocked by: OBS-005

- Owner: —
- Dependencies: `PORTAL-003`, `OBS-001`, `OBS-004`, `OBS-005`. Por quê
  `OBS-005` e não só `OBS-001`: a limpeza de legado apaga `scraper.log`, que
  `OBS-004` é quem para de escrever; e os dumps que este ticket troca vivem no
  mesmo `playwright-login.service.ts` que `OBS-005` reescreve — em paralelo
  daria conflito de merge.
- Primary files:
  - `electron/services/diagnostics.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/ipc/register-handlers.ts`
  - `electron/main.ts`
  - New: `tests/unit/diagnostics-raw.test.ts`
  - New: `tests/unit/legacy-log-cleanup.test.ts`
  - Editados: `tests/integration/clear-all-data.test.ts`,
    `tests/unit/diagnostics-redaction.test.ts` (se o contrato de `clear`
    mudar), `tests/e2e/clear-all.spec.ts`
  - Editados (acrescentado pela revisão de 2026-09-12, 2ª reabertura):
    `tests/unit/navigation-policy.test.ts` — só o mock de `app.getPath`

Fatiado de `OBS-001` em 2026-09-08. É o seam "diagnóstico em disco": o que
fica no `userData` além do log, quanto fica, e quem apaga.

#### What to build

1. `DiagnosticsService.saveRaw(name, content)` grava HTML (ou JSON) cru em
   `diagnostics/`, só quando `shouldCaptureRawArtifact(isPackaged, false)`
   permite, reusando `dir` e `prune()` do serviço.
2. Os ~11 blocos `if (!app.isPackaged) { fs.writeFileSync(debug_*.html) }`
   de `playwright-login.service.ts` e `http-scraper.service.ts` viram uma
   chamada `diagnostics.saveRaw(name, html)` sem `if` — o método é o gate.
3. O handler `clear-all-data` chama `deps.diagnostics.clear()` e deixa de
   apagar `debug_*` por prefixo na raiz.
4. Limpeza de legado, idempotente, a cada boot em `main.ts`, depois do
   `setPath` de dev: apaga se existir `sigaa-me.log`, `scraper.log`,
   `debug_*.html`, `debug_*.json` da raiz do `userData` e `logs/app_*.log`.
   Nada mais.

#### Acceptance criteria

- HTML/trace só é gravado fora de produção; em produção `saveRaw` é no-op.
- `diagnostics/` nunca passa de 20 arquivos, JSON e HTML somados.
- Nenhum nome de `saveRaw` escapa de `diagnostics/` (containment).
- Clear-all apaga `diagnostics/`; hoje não apaga (`DiagnosticsService.clear()`
  não tem chamador).
- Quem atualizar perde os arquivos legados na primeira abertura; nada fora da
  lista é tocado.

#### Verification

```text
npx vitest run tests/unit/diagnostics-raw.test.ts tests/unit/legacy-log-cleanup.test.ts tests/integration/clear-all-data.test.ts
npm run quality
```

---

## Releitura (2026-09-08)

1. `PORTAL-003` deixou `DiagnosticsService` com `record()` (JSON estrutural,
   `${timestamp}-${uuid}.json`), `prune()` (`MAX_RETAINED = 20`, ordena pelo
   timestamp numérico do nome), `clear()` (`rmSync` da pasta, com `existsSync`
   antes por causa do mock de `sigaa-service.test.ts`), `dir` getter
   preguiçoso, e `shouldCaptureRawArtifact(isPackaged, consent)` pura.
2. **`DiagnosticsService.clear()` não tem chamador.** O `clear-all-data`
   (`register-handlers.ts:275-330`) chama `sigaaService.clearDiagnostics()`,
   que só reseta `scraper.log`; depois apaga `debug_*` da raiz por prefixo
   (`:313-317`). `diagnostics/` sobrevive ao clear-all. `OBS-004` remove
   `clearDiagnostics`; este ticket liga o `clear()` de verdade.
3. **Dumps de HTML cru:** `playwright-login.service.ts:157-161` (`debug_login_page.html`),
   `:336-341` (`debug_portal_page.html`), `:410-414` (`debug_courses.json`),
   `:553-556` (`debug_portal_fail_${courseId}.html`), `:632-635`
   (`debug_playwright_fail_${courseId}.html`, já gateado por
   `shouldCaptureRawArtifact(app.isPackaged, false)`), `:1087-1092`
   (`debug_playwright_news_fail_${safeId}.html`), `:1104-1109`
   (`debug_news_detail_${safeId}.html`), `:1222-1226`
   (`debug_playwright_news_${newsId}.html`); mais os de
   `http-scraper.service.ts` (contar no diff). Todos na raiz do `userData`,
   sem retenção. Nenhum uso de `page.tracing` no repo.
4. **Legado no disco de quem atualizar:** `logs/app_*.log` (183 arquivos,
   135 MB no `userData` do autor), `sigaa-me.log` (24 MB), `scraper.log`
   (até 6 MB), 60+ `debug_news_detail_*.html` (~3,5 MB). `OBS-001` e
   `OBS-004` param de criar tudo isso; ninguém apaga o que já existe.

## Decisões

1. **Uma pasta, uma poda.** JSON estrutural e HTML cru dividem `diagnostics/`
   e o mesmo teto de 20, podados por timestamp. Um HTML pode expulsar um
   JSON; pior caso em disco ~4 MB. Duas pastas com duas podas é duplicação
   (regra 7). Inverte a decisão 1 do spec de `OBS-001` de 2026-09-07, que
   pôs `saveDiagnostic` no logger antes de o `DiagnosticsService` existir.
2. **Nome:** `${timestamp}-${sanitizeSegment(name)}` com a extensão do
   chamador (`.html`/`.json`). `sanitizeSegment` (`download-path.ts:15-23`)
   troca `/` e `\` por `_` e preserva pontos internos: `../evil.html` vira
   `.._evil.html`, dentro de `diagnostics/`. **O critério de traversal é
   containment**, não ausência de `..` no nome. Não alterar `download-path.ts`
   (auditoria cega de 2026-09-07, achado 2).
3. **`saveRaw` não redige.** O propósito é o HTML cru para depurar o parser;
   a proteção é o gate de modo. `record()` continua redigido por construção.
4. **Consentimento fica dev-only.** `shouldCaptureRawArtifact(app.isPackaged,
   false)` em todos os call sites. Não há canal para o usuário mandar
   diagnóstico, então setting + UI de consentimento seria abstração para zero
   casos. O gate já está no lugar para quando houver canal.
5. **Falha de `saveRaw` não derruba o chamador.** Mesmo padrão do
   `recordDiagnostic()` do `PORTAL-003` (A-3): loga via `logger` e segue; o
   erro do scraper que motivou o dump é o que volta ao usuário.
6. **Limpeza de legado idempotente, sem flag.** Roda em `main.ts` a cada boot,
   depois do `setPath` de dev e antes de `createWindow()`, apaga se existir.
   Sem flag em `settings.json`, sem migração de schema; quem voltar para uma
   versão velha e atualizar de novo também é limpo. Custa um `readdir` da raiz
   do `userData`. Falha é logada e ignorada: legado que não deu para apagar
   hoje é tentado no próximo boot.
7. **`clear()` passa a `fs.promises`** e rejeita com o erro da exclusão, como
   o `logger.clear()` de `OBS-001`, para o handler agregar a falha em
   `STORAGE` (DATA-002). O `existsSync` antes do `rm` sai junto (era
   contorno de mock).

## Contrato

```ts
// electron/services/diagnostics.service.ts (acréscimos)
export class DiagnosticsService {
    record(diagnostic: StructuralDiagnostic): void;        // continua
    /** `diagnostics/<timestamp>-<sanitizeSegment(name)>`. No-op quando `shouldCaptureRawArtifact(app.isPackaged, false)` é falso. Mantém os 20 mais novos, JSON e cru somados. Nunca lança. */
    saveRaw(name: string, content: string): void;
    /** Apaga `diagnostics/` via `fs.promises`. Rejeita com o erro da exclusão. */
    clear(): Promise<void>;
}

// electron/main.ts
/** Apaga `sigaa-me.log`, `scraper.log`, `debug_*.html|json` da raiz e `logs/app_*.log`. Idempotente. Nunca lança. */
export function removeLegacyLogs(userDataPath: string): Promise<void>;

// electron/ipc/register-handlers.ts — IpcDeps
diagnostics: Pick<DiagnosticsService, 'clear'>;
// removido: o loop de debug_* por prefixo
```

## Critérios de aceite (detalhados)

1. **Gate.** Com `app.isPackaged = true`, `saveRaw` não cria arquivo nem
   pasta. Com `false`, cria em `diagnostics/`, não na raiz.
2. **Retenção compartilhada.** 15 `record()` + 10 `saveRaw()` deixam 20
   arquivos, os 20 mais novos pelo timestamp do nome, independente do tipo.
3. **Containment.** `saveRaw('../evil.html')` e `saveRaw('..\\..\\evil.html')`
   deixam exatamente dois arquivos, ambos dentro de `diagnostics/`, e nada em
   `userData/`, no pai de `userData/` nem em `userData/../evil.html`.
4. **Clear-all.** `clear-all-data.test.ts` prova que o handler chama
   `deps.diagnostics.clear()` e não apaga caminho nenhum por conta própria;
   com `clear()` rejeitando, a falha aparece agregada em `STORAGE`.
   `diagnostics-redaction.test.ts` prova, no serviço real, que `clear()`
   rejeita com `EPERM` injetado em `fs.promises.rm` e a pasta continua.
5. **Legado.** Pasta temporária com `sigaa-me.log`, `scraper.log`,
   `debug_a.html`, `debug_b.json`, `logs/app_2025-01-01.log`, **e**
   `settings.json`, `cache.json`, `logs/app.log`, `diagnostics/x.json`,
   `debug/` (pasta): `removeLegacyLogs` apaga os cinco primeiros e nenhum dos
   outros. Segunda chamada não lança. Com `unlink` rejeitando `EPERM`, resolve
   e loga uma vez.
6. **Call sites.** Grep no diff: nenhum `fs.writeFileSync` com `debug_` e
   nenhum `app.isPackaged` inline ao lado de dump sobrou em
   `playwright-login.service.ts` e `http-scraper.service.ts`. Prova do
   revisor; esses métodos lançam Chromium.
7. **`prune()` robusto a nome fora do padrão.** `Number(name.split('-')[0])`
   dá `NaN` para qualquer arquivo estranho na pasta, e `NaN` na comparação
   deixa a ordem arbitrária — pode apagar o arquivo errado. Filtrar por
   `Number.isFinite` antes do `sort`. Teste: 20 arquivos válidos mais
   `sujeira.json` deixam os 20 válidos, não 19 válidos e o intruso. Menor
   herdado do `PORTAL-003`.

## Testes que a etapa 2 escreve

- `tests/unit/diagnostics-raw.test.ts` — critérios 1 a 3, 7 e a falha de
  `clear()`, `fs` real em pasta temporária, `electron` mockado só para
  `app.getPath`/`app.isPackaged`.
- `tests/unit/legacy-log-cleanup.test.ts` — critério 5.
- `tests/integration/clear-all-data.test.ts` — `IpcDeps` com `diagnostics`,
  sem o loop de `debug_*`; ordem e agregação de falha.
- `tests/e2e/clear-all.spec.ts` — planta `diagnostics/debug_*.html` em vez de
  `debug_*` na raiz. Não roda no loop.

## Para o revisor

- `main.ts`: `removeLegacyLogs` chamado depois do `setPath` (`:20-25`), antes
  de `createWindow()`; não bloqueia o boot além do `readdir`.
- Nenhum `try/catch` novo que só logue (regra 3): em `saveRaw` e
  `removeLegacyLogs` o erro é tratado por decisão (seguir sem o artefato),
  não engolido; o comentário no código diz isso.
- `record()` e a redação por construção do `PORTAL-003` intocados.

## Correção da releitura, vinda da revisão do `OBS-004` (2026-09-09)

O item 2 da "Releitura (2026-09-08)" está **errado** nos dois pontos, e a lição
do `CLAUDE.md` ("suba a cadeia, não confie no documento") vale contra ele:

- `DiagnosticsService.clear()` **tinha** chamador. Em `master` (`d1d2f4e`),
  `sigaa.service.ts` fazia `clearDiagnostics() { diagnosticsService.clear();
  return this.httpScraper.resetLog(); }` — não "só reseta `scraper.log`".
- `diagnostics/` **era** apagado pelo clear-all, por esse caminho, e havia teste
  provando: `tests/unit/sigaa-service.test.ts`, `clearDiagnostics apaga os
  diagnósticos estruturais (PORTAL-003)`.

O `OBS-004` removeu `clearDiagnostics` como o ticket dele mandava e apagou esse
teste junto. Consequência: **de agora até este ticket, "limpar tudo" deixa
`userData/diagnostics/` em disco** (até 20 JSONs estruturais). Não é regressão
de escopo do `OBS-004` — é este ticket que religa o `clear()` —, mas é
regressão real na janela entre os dois, e a cobertura que a provava não existe
mais. O critério "Clear-all apaga `diagnostics/`" vira reparo, não melhoria, e
o teste em `clear-all-data.test.ts` precisa cobrir `deps.diagnostics.clear()`
com a mesma força do que foi apagado.

## Ressalvas herdadas do `PORTAL-003` (2026-09-09)

O `PORTAL-003` fechou com AC3 e AC4 parciais e cinco menores em aberto, sem
ticket próprio. Este ticket é o dono deles; nada ficou solto:

| Ressalva do `PORTAL-003` | Onde fecha aqui |
|---|---|
| AC3 — ~11 dumps com `!app.isPackaged` inline | itens 1 e 2 do "What to build", critério 6 |
| AC3 — `shouldCaptureRawArtifact` sem call site com `consent=true` | decisão 4: fica dev-only e o gate passa a ter 11 call sites reais, então deixa de ser abstração para zero casos (regra 7) |
| AC4 — `debug_*.html` sem limite de retenção | decisão 1 e critério 2, teto de 20 compartilhado |
| Menor — `existsSync` redundante em `clear()`, moldado pelo mock de `fs` | decisão 7, já registrada: sai junto com a passagem para `fs.promises`; o conserto do mock é `rm: vi.fn()` |
| Menor — `NaN` no `prune()` | critério 7 |

Dois menores decididos como **não corrigir**, em 2026-09-09, para não voltarem
a cada revisão:

- **Três parses de cheerio em `buildStructuralDiagnostic`.** Passar o `$`
  adiante obrigaria a mudar a assinatura de `classify()`, que é API pública do
  `PORTAL-001`, por um caminho que só roda quando o scraping já falhou.
- **`el.type === 'tag'` dentro de `$('*')` não é sempre verdadeiro.** O
  `domhandler` tipa `<script>` e `<style>` como `ElementType` próprios, então a
  guarda exclui os dois do fingerprint — corpo de script muda sem a estrutura
  mudar, e excluir é o comportamento desejado. A etapa 2 confirma com `tsc` e
  troca a linha por um comentário dizendo isso, não por correção.

## Comments

- 2026-09-11, corte da auditoria `40a0d01`: `tests/unit/audit-diagnostics.test.ts` de `19ba8aa` (branch `codex/fix-audit-2026-09-09`, nunca mergeada) cobre o teto de retenção compartilhado (24 crus + 24 estruturais deixam 20), containment de nome hostil, no-op em `isPackaged` e falha de captura que não derruba o chamador. Serve de ponto de partida para os critérios 1 a 3 e 7. Diferenças de contrato: lá o método é `captureRaw(name, () => string, ext)` assíncrono e `clear()` síncrono; aqui é `saveRaw(name, content)` e `clear(): Promise<void>` (decisão 7). Adaptar, não colher literalmente. Estado no master confirmado hoje: `DiagnosticsService` só expõe `record()`, e cada dump cru continua `fs.writeFileSync` ad-hoc atrás do próprio `!app.isPackaged` (`playwright-login.service.ts:159,338,411,556,1089,1224`; `http-scraper.service.ts:202,249,319,726`), nome fixo, sem teto.
- 2026-09-12, herdado do `OBS-005` via `OBS-002`, que fechou sem tocar nessas
  linhas: `playwright-login.service.ts` ainda tem ~12 chamadas que interpolam
  valor no texto da mensagem em vez de passar em `meta` — `currentUrl`,
  `page.url()`, `newsId`, `courses.length`. Nenhum é dos cinco valores não
  confiáveis que o `OBS-005` nomeia, e todos passam o grep do critério 3
  daquele ticket, então ficaram. Este ticket tem o arquivo nos Primary files;
  se mexer nessas linhas, é a hora barata de mover o valor para `meta` junto
  (`url` já está em `CONTENT_KEYS`, `newsId` não precisa estar). Nota, não
  requisito: só vira critério se a etapa 1 dobrar para o corpo.
- 2026-09-12, ao fechar: a nota acima **não** foi recolhida. A etapa 1 nunca a
  dobrou para o corpo, então nunca foi requisito deste ticket, e as rodadas que
  tocaram `playwright-login.service.ts` foram antes dela chegar aqui. Fica sem
  dono agora que `OBS-003` fechou — se ainda interessar, vira `CLEAN-*` próprio.

## Nota da etapa 2 (2026-09-12)

Implementado em três commits na branch `obs-003`: testes vermelhos
(`557d071`, mais o conserto de harness `6bc7e92`), depois o código
(`24e0048`), gate verde. Prova vermelho-verde antes deste relatório:
`git revert --no-commit 24e0048` → `npm test` → 14 testes falham pelo
motivo certo (`saveRaw`/`removeLegacyLogs` inexistentes, `clear()` ainda
síncrono, `IpcDeps` sem `diagnostics`) → `git restore --source=HEAD
--staged --worktree` devolve o código e a suíte volta a 656 passed | 4
skipped (660). `npm run quality`: 0 erros, 55 warnings (`no-explicit-any`,
legado, nenhum novo).

Um desvio deliberado do critério 6 (nenhum `app.isPackaged` inline ao
lado de um dump): `debug_portal_page.html`
(`playwright-login.service.ts`, dump de `debug_portal_page.html` logo
após o clique em "Menu Discente") mantém
`shouldCaptureRawArtifact(app.isPackaged, false)` guardando o
`page.content()` antes do `saveRaw`. Nesse único ponto o fetch existe só
para o dump — sem gate, `getCourses()` chamaria `page.content()` uma vez
a mais mesmo empacotado, e `tests/integration/portal-selector-resilience.test.ts`
("preserva o SELECTOR_DRIFT quando nem o HTML da página pode ser lido",
fora do Primary files desta ticket, não editado) depende da contagem
exata de chamadas — sem o gate ali o teste quebra porque a chamada extra
consome o valor mockado que o teste reserva para a leitura de diagnóstico
real. Os outros ~10 call sites não têm essa dependência de contagem e
ficaram sem `if`, como o critério pede.

## Revisão da etapa 3 (2026-09-12)

Veredito: **Needs your call** — um achado, abaixo.

Separação de commits conferida no `diff --stat`: `557d071` e `6bc7e92` só
tocam `tests/`, `24e0048` só toca `electron/`. Vermelho-verde refeito nesta
sessão, não aceito do relatório: `git revert --no-commit 24e0048` → `npm test`
→ **14 failed | 642 passed | 4 skipped**, pelo motivo certo
(`removeLegacyLogs is not a function`, `clear()` devolvendo `undefined` para
`.rejects`, `IpcDeps` sem `diagnostics`); restaurado, `npm run quality` →
0 erros, 55 warnings (`no-explicit-any`, todos legados),
**656 passed | 4 skipped (660)**.

Critérios detalhados 1 a 5 e 7: ✅, cada um com teste que falha sem o código.
Critério 4 cobre os dois lados que a regressão do `OBS-004` abriu — o handler
chamando `deps.diagnostics.clear()` com `fsMock.unlinked` vazio, e o serviço
real rejeitando com `EPERM` injetado em `fs.promises.rm`.

Critério 6: ✅ para `fs.writeFileSync` com `debug_` (zero restantes nos dois
arquivos). O desvio declarado pela etapa 2 — o `shouldCaptureRawArtifact`
inline em `playwright-login.service.ts:333` — foi verificado, não aceito de
palavra: `tests/integration/portal-selector-resilience.test.ts:25` mocka
`isPackaged: true`, então a guarda de fato fecha a chamada extra de
`page.content()` e a contagem que o teste reserva se mantém. A justificativa
de custo também procede: sem a guarda, `getCourses()` pagaria um round-trip no
Chromium em produção para descartar o resultado. Desvio aceito.

Correção pequena aplicada por esta etapa (dentro dos Primary files, sem teste
novo): o comentário sobre `el.type === 'tag'` em `domFingerprint`, que a seção
"Ressalvas herdadas" mandava a etapa 2 escrever e ficou de fora. Claim
conferido em `domhandler/lib/esm/node.d.ts:172` (`ElementType.Tag | Script |
Style`) antes de virar comentário.

#### Achado — `removeLegacyLogs` roda no import do módulo

`main.ts:84` é `void removeLegacyLogs(app.getPath('userData'))` em escopo de
módulo. Em produção isso é exatamente o que a decisão 6 pede. O efeito colateral
está no teste: três arquivos importam `electron/main` com `app.getPath` mockado
para `os.tmpdir()` — `legacy-log-cleanup.test.ts`, `navigation-policy.test.ts`,
`updater-consent.test.ts` — então **todo `npm test` apaga de verdade
`%TEMP%/sigaa-me.log`, `%TEMP%/scraper.log`, `%TEMP%/debug_*.html|json` e
`%TEMP%/logs/app_*.log`** do diretório temporário do sistema. Nenhum teste
falha por isso e não há flake (os diretórios que a suíte cria não casam com os
padrões), mas é exclusão de arquivo fora do repositório, disparada por rodar a
suíte, e é nova neste commit.

Não corrigido aqui pela regra mecânica: a correção natural é mover a chamada
para dentro do `whenReady()`, logo antes de `createWindow()` — leitura mais
literal da decisão 6 do que o escopo de módulo —, e provar isso exige teste
novo ("não é chamado no import"), o que tira o conserto da etapa 3. Se você
concordar, vira `CLEAN-*` ou reabre este ticket; se achar aceitável, o merge
segue como está.

## Decisão do humano (2026-09-12): reabre

Exclusão de arquivo fora do repositório disparada por `npm test` não fica.
Reaberto para a etapa 2 na mesma branch `obs-003`, que já tem tudo o mais.
Escopo da rodada: só o achado acima. Nada mais do ticket muda.

8. **Sem efeito colateral no import.** Importar `electron/main` não chama
   `removeLegacyLogs` nem toca o filesystem; a chamada fica dentro do
   `whenReady()`, antes de `createWindow()`. Teste em
   `tests/unit/legacy-log-cleanup.test.ts`: com `app.getPath` apontando para
   uma pasta temporária semeada com `sigaa-me.log`, importar `electron/main`
   deixa o arquivo lá; resolver o `whenReady` mockado faz o arquivo sumir.
   Commit de teste separado do commit de código, como nos outros critérios.

- 2026-09-12 Reaberto pelo humano com o critério 8; branch preservada.

## Nota da etapa 2 — critério 8 (2026-09-12)

Escopo desta rodada: só o critério 8. Dois commits na branch `obs-003`:
teste vermelho (`4e69bb3`), depois o código (`a80d289`).

`void removeLegacyLogs(app.getPath('userData'))` saiu do escopo do módulo
e entrou como primeira linha do callback de `app.whenReady().then(...)`,
antes do `try` de detecção do Chrome e de `createWindow()`.

Prova vermelho-verde antes deste relatório: `git stash push -- electron/main.ts`
(isola só o código, o teste fica) → `npx vitest run
tests/unit/legacy-log-cleanup.test.ts` → 1 failed | 3 passed pelo motivo
certo (`expected false to be true` — o arquivo semeado sobrevive ao
import porque `removeLegacyLogs` não roda mais nele; a asserção que
prova isso falha antes do código voltar) → `git stash pop` → mesma suíte
verde, 4 passed.

`npm run quality`: 0 erros, 55 warnings (`no-explicit-any`, todos
legados, nenhum novo). `npx vitest run` completo: 657 passed | 4 skipped
(661) — um a mais que o baseline da revisão anterior (656), o teste novo
deste critério.

## Revisão da etapa 3 — critério 8 (2026-09-12)

Veredito: **reabre**. Critério 8 ❌.

Gate reconferido nesta sessão: `npm run quality` → 0 erros, 55 warnings
(`no-explicit-any`, todos legados), **657 passed | 4 skipped (661)**.
Separação de commits ok no `diff --stat`: `4e69bb3` só toca `tests/`,
`a80d289` só toca `electron/main.ts`. Vermelho-verde do teste novo refeito,
não aceito do relatório: `git revert --no-commit a80d289` → `npx vitest run
tests/unit/legacy-log-cleanup.test.ts` → **1 failed | 3 passed**, pelo motivo
certo (`expected false to be true` em `legacy-log-cleanup.test.ts:186`, a
asserção de que o legado sobrevive ao import); restaurado, 4 passed.

#### ❌ Critério 8 — a exclusão saiu do import e continua acontecendo

A chamada mudou de escopo de módulo para dentro do `whenReady()`, mas
`tests/unit/navigation-policy.test.ts` mocka `whenReady` para **disparar o
callback na hora** (`:92`, `then: (cb) => { cb(); }`) e `app.getPath` para
`os.tmpdir()` (`:85`). O import daquele módulo, portanto, ainda chama
`removeLegacyLogs` contra o temp real do sistema — que é exatamente o que a
decisão do humano ("exclusão de arquivo fora do repositório disparada por
`npm test` não fica") proíbe, e também o que a letra do critério 8 proíbe
("importar `electron/main` não chama `removeLegacyLogs` nem toca o
filesystem").

Medido, não deduzido: com `fs.appendFileSync` temporário na primeira linha de
`removeLegacyLogs` gravando o `userDataPath` recebido, `npx vitest run
tests/unit/navigation-policy.test.ts tests/unit/updater-consent.test.ts`
deixou uma linha no arquivo de prova — `C:\Users\Lage\AppData\Local\Temp`.
A instrumentação foi revertida; a árvore está limpa.

Os outros dois importadores de `electron/main` estão limpos **por acidente**,
não por construção: `updater-consent.test.ts:48` e o mock do topo de
`legacy-log-cleanup.test.ts:56` usam `then: vi.fn()`, que nunca dispara o
callback, e o teste novo do critério 8 captura o callback num `importRoot`
próprio. Basta um deles passar a disparar o `whenReady` para o efeito voltar.

Por que o teste do critério 8 passa mesmo assim: ele prova que a chamada saiu
do escopo de módulo, com o `getPath` apontando para uma pasta própria. Ele não
tem como ver o que outro arquivo da suíte faz. A cobertura que falta é sobre a
suíte, não sobre `main.ts`.

#### O que falta

1. `tests/unit/navigation-policy.test.ts` deve mockar `app.getPath` para uma
   pasta temporária própria do teste (padrão do `importRoot` que o critério 8
   já usa), não para `os.tmpdir()` cru. É a correção mínima e fecha o caso
   real.
2. Cobertura que não dependa de alguém lembrar: um teste que falhe se algum
   importador de `electron/main` rodar `removeLegacyLogs` contra
   `os.tmpdir()`. Fica a critério da etapa 2 escrever isso em
   `legacy-log-cleanup.test.ts` ou preferir só o item 1 e registrar aqui o
   porquê.

Não corrigido por esta etapa pela regra mecânica: a correção é em arquivo de
teste fora do `Primary files`, e etapa 3 não escreve teste. `Primary files`
foi estendido com `tests/unit/navigation-policy.test.ts` (só o mock de
`app.getPath`) para a etapa 2 não ficar sem limite onde trabalhar. Escopo
desta rodada: só o item acima; nada mais do ticket muda. A branch `obs-003`
tem todo o resto e é onde o trabalho continua.

Critérios 1 a 7: ✅, sem mudança desde a revisão anterior.

## Nota da etapa 2 — critério 8, item 1 do achado da revisão anterior (2026-09-12)

Escopo desta rodada: só o item 1 do "O que falta" (o mock de `getPath` em
`navigation-policy.test.ts`). Dois commits na branch `obs-003`: teste vermelho
(`543513d`), depois o ajuste do mock (`5922ddb`).

`getPath: vi.fn(() => os.tmpdir())` virou
`getPath: vi.fn(() => path.join(os.tmpdir(), 'sigaa-me-navigation-policy-test'))`,
mesmo padrão do `importRoot` que `legacy-log-cleanup.test.ts` já usa. `path`
passou a vir de `await import('node:path')` dentro do próprio factory do
`vi.mock('electron', ...)`, ao lado do `os` que já estava lá — referenciar o
`import path from 'path'` do topo do arquivo de dentro do factory arriscava o
hoisting do `vi.mock`.

Prova vermelho-verde antes deste relatório: com o teste novo já commitado e
o mock ainda no `os.tmpdir()` cru, `npx vitest run
tests/unit/navigation-policy.test.ts` → **1 failed | 73 passed (74)**, pelo
motivo certo (`AssertionError: expected 'C:\Users\Lage\AppData\Local\Temp'
not to be 'C:\Users\Lage\AppData\Local\Temp'`); com o mock ajustado, mesma
suíte → **74 passed**. `npm run quality`: 0 erros, 55 warnings
(`no-explicit-any`, todos legados, nenhum novo). `npx vitest run` completo:
**658 passed | 4 skipped (662)** — um a mais que o baseline da revisão
anterior (657/661), o teste novo deste critério.

Item 2 do "O que falta" (cobertura que não dependa de alguém lembrar, contra
qualquer importador futuro de `electron/main`) **não foi escrito**, decisão
explicitamente deixada a critério desta etapa. Duas formas cogitadas e
descartadas:

- Varredura estática de `tests/unit/*.test.ts` por regex procurando a
  combinação "`getPath` retorna `os.tmpdir()` cru" + "`whenReady` dispara o
  callback". É acoplada à formatação exata do mock (o próprio anti-padrão
  "implementation-coupled" que a skill `tdd` lista) e frágil a qualquer
  reformatação — o oposto de uma rede de segurança confiável.
- Plantar um arquivo-canário em `os.tmpdir()` de verdade para provar que
  nada o apaga reproduz, em menor escala, exatamente o problema que a
  decisão do humano baniu: gravação/exclusão na raiz do temp do sistema
  disparada por `npm test`.

O critério 8, como escrito, cobre o caso concreto que motivou a reabertura
(`navigation-policy.test.ts`). Os outros dois importadores de
`electron/main` (`updater-consent.test.ts`, e o mock do topo de
`legacy-log-cleanup.test.ts`) continuam seguros por não disparar o callback
do `whenReady` (`then: vi.fn()`), como a revisão anterior já registrou — sem
mudança nesta rodada.

Critérios 1 a 7: ✅, sem mudança desde a revisão anterior.

## Revisão da etapa 3 — critério 8, item 1 (2026-09-12)

Veredito: **Approve**. Critério 8 ✅.

Separação de commits no `diff --stat`: `543513d` só acrescenta a asserção (13
linhas), `5922ddb` só muda o mock (5 linhas). Ambos em
`tests/unit/navigation-policy.test.ts`, o único arquivo da rodada — dentro do
`Primary files` estendido pela revisão anterior. O `describe` novo vai além da
letra "só o mock de `app.getPath`", mas é o que torna a correção vermelho-verde:
sem asserção não há vermelho.

Vermelho-verde refeito nesta sessão, não aceito do relatório:
`git revert --no-commit 5922ddb` → `npx vitest run
tests/unit/navigation-policy.test.ts` → **1 failed | 73 passed (74)**, pelo
motivo certo (`expected 'C:\Users\Lage\AppData\Local\Temp' not to be
'C:\Users\Lage\AppData\Local\Temp'`, `navigation-policy.test.ts:151`);
restaurado, `npm run quality` → 0 erros, 55 warnings (`no-explicit-any`, todos
legados), **658 passed | 4 skipped (662)**.

**Medido, não deduzido.** Com `fs.appendFileSync` temporário na primeira linha
de `removeLegacyLogs` gravando o `userDataPath` recebido, `npx vitest run` sobre
os quatro importadores de `electron/main` registrou exatamente três caminhos,
todos em pasta dedicada:

    C:\...\Temp\sigaa-me-import-side-effect-14216
    C:\...\Temp\sigaa-me-legacy-cleanup-14216
    C:\...\Temp\sigaa-me-navigation-policy-test

Nenhuma raiz de temp do sistema. A instrumentação foi revertida; a árvore está
limpa e nenhuma dessas pastas fica para trás depois da suíte (`removeLegacyLogs`
não cria diretório: o `readdirSync` dá ENOENT e é ignorado). A condição do
humano — "exclusão de arquivo fora do repositório disparada por `npm test` não
fica" — está satisfeita.

#### Correção do registro: são quatro importadores, não três

As duas revisões anteriores enumeraram três importadores de `electron/main`.
Existe um quarto, `tests/integration/dev-cache-mutation-boundary.test.ts:107`, e
ele **dispara** o callback do `whenReady` (`:15`, `whenReady: () =>
Promise.resolve()` — promise real, o `.then` agenda o callback). Não é vazamento:
o `getPath` dele (`:11`) devolve `'dev-001-user-data'`, caminho relativo que
resolve para `<repo>/dev-001-user-data`, que não existe — `readdirSync` dá
ENOENT, os dois `unlink` dão ENOENT, nada é apagado, nada sai do repositório.
Por isso ele não aparece na medição acima. Fica registrado para o próximo leitor
não herdar a contagem errada.

#### Risco residual aceito

O item 2 do "O que falta" (guarda que não dependa de alguém lembrar) não foi
escrito, e a revisão anterior autorizou explicitamente essa escolha desde que o
porquê ficasse registrado — ficou, com duas alternativas descartadas por razão
válida (varredura por regex é acoplada à formatação; canário no temp real
reproduz o que o humano baniu). O que sobra: a asserção nova é estreita, compara
com `os.tmpdir()` e nada mais. Um mock futuro que devolva `os.homedir()` ou
`process.cwd()` passa por ela. Aceito — fechar o caso concreto era o escopo da
rodada, e a alternativa custava mais fragilidade do que cobria.

Critérios 1 a 7: ✅, sem mudança desde a revisão anterior. Nenhuma correção de
código feita por esta etapa.

#### Resolution (2026-09-12)

Fechada com 13 commits em `obs-003`, três reaberturas (critério 8 duas vezes) e
nenhuma mudança de código na revisão final.

- **Decisão.** Dumps crus passam por `DiagnosticsService.saveRaw`, gateado por
  `shouldCaptureRawArtifact`, com teto de 20 compartilhado com `record()`;
  `clear-all-data` volta a apagar `diagnostics/` via `deps.diagnostics.clear()`;
  `removeLegacyLogs` roda dentro do `whenReady()`, não no import do módulo.
- **Arquivos.** `electron/services/diagnostics.service.ts`,
  `electron/services/playwright-login.service.ts`,
  `electron/services/http-scraper.service.ts`,
  `electron/ipc/register-handlers.ts`, `electron/main.ts`; testes em
  `tests/unit/diagnostics-raw.test.ts`, `tests/unit/legacy-log-cleanup.test.ts`,
  `tests/unit/navigation-policy.test.ts`,
  `tests/integration/clear-all-data.test.ts`,
  `tests/unit/diagnostics-redaction.test.ts`, `tests/e2e/clear-all.spec.ts`.
- **Vermelho-verde.** Rodada principal: `git revert --no-commit 24e0048` →
  14 failed. Critério 8: `git revert --no-commit a80d289` → 1 failed. Item 1:
  `git revert --no-commit 5922ddb` → 1 failed. Todos refeitos pelo revisor.
- **Gate.** `npm run quality` → 0 erros, 55 warnings (`no-explicit-any`, todos
  legados), 658 passed | 4 skipped (662).
- **Desvio aceito.** Um `shouldCaptureRawArtifact` inline permanece em
  `playwright-login.service.ts:333`, verificado na primeira revisão: sem ele,
  `getCourses()` pagaria um `page.content()` extra em produção.
