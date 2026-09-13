# OBS-003 — Gate raw HTML dumps, wire diagnostics clear, clean legacy logs
Status: open
Stage: to-implement
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
