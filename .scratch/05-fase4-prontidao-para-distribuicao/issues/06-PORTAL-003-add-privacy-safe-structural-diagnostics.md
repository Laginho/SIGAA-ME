# PORTAL-003 — Add privacy-safe structural diagnostics
Status: claimed
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `PARTIAL`

- Owner: —
- Dependencies: `PORTAL-001`, `OBS-001`
- Primary files:
  - `electron/services/playwright-login.service.ts`
  - New: `electron/services/diagnostics.service.ts`
  - New: `tests/unit/diagnostics-redaction.test.ts`

#### Current state

- Selector-drift tests and explicit errors exist.
- Development HTML captures exist but are not centrally sanitized or retained.

#### Acceptance criteria

- Failure diagnostics include state, URL family, title, selector counts,
  adapter version, and DOM structural fingerprint.
- Personal text, credentials, cookies, ViewState, and academic content are
  removed.
- HTML/screenshots/traces require development mode or explicit consent.
- Retention is bounded and clear-all removes diagnostics.

#### Verification

```text
npm run test:unit -- diagnostics-redaction
npm run test:integration -- portal
```

#### Implementation notes

- Commits: `5766cd3` (testes vermelhos), `4e1c5e7` (implementação)
- Branch: `PORTAL-003`
- Seam confirmado com o usuário antes do primeiro teste: a interface pública
  de `electron/services/diagnostics.service.ts` (funções puras
  `buildStructuralDiagnostic`/`domFingerprint`/`shouldCaptureRawArtifact` +
  `DiagnosticsService.record()/.clear()`), sem canal IPC novo e sem UI de
  consentimento nesta rodada.
- Decisões:
  - **Redação por construção, não por filtro.** A saída só carrega enum de
    estado (`classify()` do PORTAL-001), `urlFamily` (pathname, sem query/
    fragmento), `title`, contagens fornecidas pelo chamador, versão do adapter
    e um hash sha256 do esqueleto de nomes de tag. Nenhum desses campos copia
    texto livre do HTML — não existe canal para nome de aluno, ViewState,
    cookie ou nota vazar, mesmo sem lista de bloqueio.
  - **`selectorCounts` é responsabilidade do chamador.** O serviço não sabe
    quais seletores importam por tipo de página; só embute o que já foi
    contado no ponto de falha (mesmo padrão que já existia em
    `getCourses()` para `SELECTOR_DRIFT`).
  - **Consentimento sem UI nesta rodada.** `shouldCaptureRawArtifact(isPackaged,
    consent)` é pura e testada; o único call site convertido
    (`enterCourseAndGetHTML`, falha geral de navegação) passa `consent=false`
    fixo — comportamento observável idêntico ao `!app.isPackaged` de antes.
    Ligar consentimento de verdade (settings + UI) fica para outro ticket.
  - **Retenção: últimos 20, arquivo JSON por diagnóstico.** Nome de arquivo
    `${timestamp}-${uuid}.json`; a poda ordena pelo timestamp numérico
    embutido no nome, não pela string (`"10"` vem antes de `"2"` em ordem
    lexicográfica).
  - **`clear()` faz `existsSync` antes de `rmSync`.** Não é defesa contra
    corrida — é para não quebrar `tests/unit/sigaa-service.test.ts`, que
    mocka `fs` sem `rmSync`; com o guard, o mock de `existsSync` (sempre
    `false`) já evita a chamada.
  - **Único ponto de gravação: `getCourses()` no branch `SELECTOR_DRIFT`.**
    Esse branch já calculava `selectorDiagnostics` e antes não gravava
    diagnóstico nenhum. Outros pontos de falha (`enterCourseAndGetHTML`) só
    ganharam o gate de consentimento no dump de HTML cru existente — não
    ganharam gravação de diagnóstico estrutural nesta rodada, para manter o
    diff no tamanho do que o ticket pediu.
- Prova vermelho-verde: `git stash push -u` das três fontes tocadas →
  `tests/unit/diagnostics-redaction.test.ts` falha com "Cannot find module"
  (28 outros testes de `sigaa-service.test.ts` continuam verdes) → `git stash
  pop` → suíte completa verde.
- Gate: `tsc --noEmit` limpo; `eslint .` 0 erros, 67 warnings legado (nenhum
  introduzido pelos arquivos desta tarefa); `vitest run` 549 passed | 4
  skipped (553) — eram 538 passed | 4 skipped (542) antes desta tarefa (11
  testes novos).
