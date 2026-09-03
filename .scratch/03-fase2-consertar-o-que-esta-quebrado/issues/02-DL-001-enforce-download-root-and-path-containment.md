# DL-001 — Enforce download root and path containment
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — ciclo PTMR 03 validado pelo master dev; Bruno confirmou no build instalado (2026-09-01): pasta persistida pelo main, download e "baixar todos" ok

- Status: `DONE` — ciclo PTMR 03 validado pelo master dev; Bruno confirmou no build
  instalado (2026-09-01): pasta persistida pelo main, download e "baixar todos" ok
- Priority: `P1`
- Owner: Bruno
- Dependencies: `SEC-002`
- Primary files:
  - New: `electron/services/download-path.service.ts`
  - `electron/main.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/download.service.ts`
  - `electron/services/persistence.service.ts`
  - `src/pages/course-detail.ts`
  - New: `tests/unit/download-path-security.test.ts`

#### Required behavior

- Renderer cannot provide a download root.
- Main resolves the root from a native folder selection persisted internally.
- Sanitize course and file components, including Windows reserved names and
  maximum lengths.
- Prove target containment with resolved/real paths and `path.relative()`.
- Reject absolute components, traversal, empty names, and symlink escapes.
- Write into a temporary `.part` file before atomic rename.
- Apply one shared path policy to HTTP and Playwright downloads.

#### Acceptance criteria

- `../`, absolute paths, drive prefixes, device names, and symlink escapes are
  rejected.
- Duplicate checks use the same sanitized final path as the writer.
- No renderer-provided path can cause reads outside the approved root.

#### Verification

```text
npm run test:unit -- download-path-security
npm run test:integration -- download-boundary
```

#### Implementation notes

- Commit: `8be340f` (TEST), `d759d16` (MAKE), `a0c04b6` (MASTER) — branch `traycer/lucid-lynx`, fast-forward em `master`
- Platform cases covered: Windows (gate autoritativo); junction cobre o caso de symlink; Linux não rodado nesta sessão

#### Resolution (2026-09-01) — ciclo PTMR 03

Ledger em `.scratch/dl-001/ledger.md`. O ciclo chegou com dois commits (TEST
`8be340f`, MAKE `d759d16`), **sem commit de READ e sem return handoff** — o
PLAN não fechou o ciclo. A validação abaixo é do master dev, no branch.

- `electron/services/download-path.ts` (novo, funções puras, sem classe):
  `sanitizeSegment` (chars ilegais → `_`, trim de pontos/espaços finais, lança
  em vazio ou só pontos, prefixa reservados do Windows, corta preservando a
  extensão), `isInsideRoot`, `resolveDownloadTarget`, `ensureDirInsideRoot`
  (`realpathSync`, pega junction/symlink). Os três sanitizadores antigos de
  `sigaa.service`, `http-scraper.service` e `download.service` morreram.
- Raiz só do main: `basePath` saiu dos dois payloads em `shared/ipc.ts`;
  `select-download-folder` persiste a pasta; `update-app-setting` rejeita em
  runtime `lastDownloadPath` não nulo (o renderer só limpa); `download-file` e
  `download-all-files` leem a raiz das settings e falham com "Nenhuma pasta de
  downloads definida" se não houver; `check-files-existence` devolve
  `exists: false` sem tocar o disco para caminho fora da raiz.
- `download.service.ts` (Playwright): `saveAs` para `.part`, a detecção de HTML
  lê e apaga o `.part`, `rename` é o último passo — nos três ramos (direto,
  popup, popup reload). Fatia não test-first, conferida no diff.
- `SEC-002` não bloqueou: contrato tipado + validação em runtime no main
  impedem o renderer de impor raiz mesmo pela ponte genérica do preload.
- Vermelho-verde provado pelo master dev com checkout das fontes de `master`
  (o `git stash` da receita não pega trabalho já commitado):
  `download-path-security.test.ts` inteiro (módulo ausente), 2 casos em
  `download-real.test.ts` e 2 em `preload-contract.test.ts` falham sem a
  correção e passam com ela.
- Correção do master dev (`a0c04b6`, `Role: MASTER`): a prova
  `rel.startsWith('..')` — **prescrita pelo plano do handoff** — rejeitava um
  filho legítimo chamado `..fora`. MAKE encobriu o falso positivo prefixando
  `_` em todo nome que começa com ponto (admitido em comentário), e dois testes
  reimplementaram a prova errada em vez de chamar `isInsideRoot`. Agora um
  helper decide para as três funções (vazio, `..`, `..<sep>` e absoluto ficam
  fora); teste de regressão `isInsideRoot(root, root/..fora/x.pdf) === true`.
  O caso novo de `sigaa-service.test.ts` passava em `master` por acidente (o
  mock de `enterCourseAndGetHTML` falhava antes); passou a afirmar que essa
  chamada não acontece, e falha contra `master`.
- Gate no Windows: `tsc` limpo, 0 erros de lint (112 avisos), **153 passed,
  4 skipped**.
- Aceito e registrado: caminhos antigos em `downloadedFiles` (localStorage)
  fora da raiz atual passam a reportar `exists: false` e a UI reoferece o
  download. `downloadCourseFiles` e `playwrightLogin.downloadAllFiles`
  continuam sem chamador, não tocados.
- Falta (do Bruno): um download real no app — o mesmo smoke cobre o `BUG-004`.
