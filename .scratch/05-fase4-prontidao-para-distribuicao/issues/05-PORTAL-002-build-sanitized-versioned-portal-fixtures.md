# PORTAL-002 — Build sanitized, versioned portal fixtures
Status: resolved
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `PORTAL-001`
- Primary files:
  - New: `tests/fixtures/sigaa/README.md`
  - New fixtures under `tests/fixtures/sigaa/<adapter-version>/`
  - `tests/integration/portal-selector-resilience.test.ts`

#### Acceptance criteria

- Fixtures cover login, invalid credentials, student home, empty/populated
  courses, course home, empty/populated files, news, expired session, access
  denied, and maintenance.
- Fixtures contain no personal data, cookies, credentials, or real ViewState.
- Parser/state-classifier tests run against every fixture.

#### Verification

```text
npm run test:integration -- portal
```

#### Implementation notes

- Commit: eaf5da5 (sessão única, direto por pedido do usuário: sem separação
  especificar/implementar/revisar desta vez)
- Fixture version: `ufc-sigaa-2026.09-v1` (`PORTAL_ADAPTER_VERSION`)
- Escopo confirmado com o usuário antes de escrever teste: só fixtures +
  testes do comportamento atual. `NEWS_DETAIL` e `ACCESS_DENIED` existem como
  tipo em `portal-contracts.ts` mas nada em `portal-state-classifier.ts` os
  produz; `access-denied.html`/`maintenance.html` documentam isso (`classify()`
  → `UNKNOWN`), reconhecimento de verdade fica para `PORTAL-003`/`PORTAL-005`.
- `findCourseRow` e `httpScraper.getNewsDetail` seguem sem chamador em
  produção (achado da auditoria do `PORTAL-001`); novas fixtures não os
  exercitam, para não testar caminho morto como se fosse o real.
- "Notícia" e "arquivos vazio/populado" já tinham fixture e teste real
  (`course-page-with-news.html`, `course-page-with-files.html`,
  `course-page-empty.html` em `parser-real.test.ts`); não duplicados.
  `course-page-with-files.html` não serve para um teste de `classify()`
  isolado — o fixture tem `idTurma`/`turmaVirtual` incidentais que o
  classificam como `STUDENT_PORTAL` antes de chegar em `FILES_SECTION`.
- Verificação: `npx tsc --noEmit` limpo; `npx vitest run` — 538 passed, 4
  skipped, 0 falha; `npx eslint tests/integration/portal-selector-resilience.test.ts`
  limpo.
