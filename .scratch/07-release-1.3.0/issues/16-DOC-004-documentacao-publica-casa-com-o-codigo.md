# DOC-004: Documentação pública casa com o código
Status: open
Stage: done
Priority: P2
Blocked by: nenhum
Review: human

- Primary files:
  - `README.md` (`:5` badge do Electron; `:77` `npm install`; `:87-89` o que `npm test` roda; `:101` SQLite)
  - `ARCHITECTURE.md` (`:3-5` `HARDENING_TRACKER.md` como ativo; `:98-105` lista de serviços)
  - `CLAUDE.md` (`:182` `tests/unit/parser.test.ts`)
  - `tests/fixtures/README.md` (`:8`, `:20`)
  - `docs/agents/orchestration.md` (`:8`)
  - `ROADMAP.md` (`:18-19`)
  - `docs/PORTAL_COMPATIBILITY.md` (`:302-303`)
  - `.gitignore` (`:64`, comentário)
  - `docs/PLANO.md` (**só** a linha 3, "Nada aqui foi implementado"; autorização explícita deste ticket, exceção à regra de não editar o PLANO)
  - `.scratch/06-debitos-aceitos/issues/01-DEBITO-01-electron-30-fora-de-suporte.md` (texto de estado atual)
  - `electron/main.ts` (`:155`, só comentário)

Seção "Documentação que contradiz o código" do relatório mesclado: os quatro
relatórios, um ticket só, como o relatório recomenda.

#### What to build

Quem chega pelo README instala com o comando errado, espera testes de
integração real de `npm test`, lê que há SQLite e vê um badge de Electron 30.
O `ARCHITECTURE.md` aponta um tracker que é stub e lista 4 serviços de 18.
Três documentos citam `tests/unit/parser.test.ts`, que não existe mais. O
`PLANO.md` diz que nada foi implementado com 78 tickets `done` derivados dele.

#### Acceptance criteria

1. `README.md`: badge com a major do Electron do `package.json`; instalação
   por `npm ci`; `npm test` descrito como suíte offline, com o live smoke
   atrás de `npm run test:live`/`RUN_LIVE_SIGAA_TESTS=true`; persistência
   descrita como JSON em `userData` + `localStorage`, sem SQLite.
2. `ARCHITECTURE.md`: `HARDENING_TRACKER.md` deixa de ser citado como ativo
   (aponta para `.scratch/` e `docs/agents/issue-tracker.md`); a lista de
   serviços cobre os de `electron/services/` de hoje, um por linha, uma frase
   cada.
3. `CLAUDE.md:182`, `tests/fixtures/README.md:8,20` e
   `docs/agents/orchestration.md:8` param de citar `tests/unit/parser.test.ts`;
   a lição ("teste não espelha implementação") fica, apontando para um
   arquivo que existe.
4. `ROADMAP.md:18-19`: dark mode e persistência de settings marcados como
   feitos.
5. `docs/PORTAL_COMPATIBILITY.md:302-303`: o canário nightly com conta
   dedicada descrito como não existente (ou removido), sem prometer.
6. `.gitignore:64`: o comentário aponta `userData/diagnostics/`, não o cwd.
7. `docs/PLANO.md:3`: a linha de status diz que o plano foi executado (fases
   0–4 no `.scratch/`), com a data; nada mais muda no arquivo.
8. `DÉBITO-01` e o comentário em `electron/main.ts:155` descrevem o Electron
   atual (`package.json`) e o que falta para o débito fechar; fechar o débito
   é decisão do autor, não deste ticket.
9. Nenhuma das strings desatualizadas acima sobra (`grep` na Verification
   vazio). `npm run quality` verde.

#### Verification

    grep -rnE 'parser\.test\.ts' CLAUDE.md tests/fixtures/README.md docs/agents/orchestration.md
    grep -nE 'npm install|SQLite|sqlite|Electron.30|electron-30' README.md
    grep -nE 'HARDENING_TRACKER' ARCHITECTURE.md
    grep -nE 'Nada aqui foi implementado' docs/PLANO.md
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum. Ticket de documentação; a prova é o `grep` acima vazio e a leitura
  da etapa 3.

## Comments

- `Review: human`: é o texto que o usuário lê antes de instalar e que o
  próximo agente lê antes de trabalhar.
- O parágrafo "Desatualizado desde o `BUG-004`" do `CLAUDE.md` já se
  corrige sozinho; não mexa nele.

#### Resolution (2026-09-15)

Verdict: Needs your call: canário de compatibilidade descrito como "design,
não implementado" em vários lugares de `docs/PORTAL_COMPATIBILITY.md` — decisão
de construí-lo ou não é do autor, e a linha de `DÉBITO-01` sobre estar dentro
das três majors mais recentes do Electron também fica para o autor confirmar.

- Arquivos: `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`,
  `tests/fixtures/README.md`, `docs/agents/orchestration.md`, `ROADMAP.md`,
  `docs/PORTAL_COMPATIBILITY.md`, `.gitignore`, `docs/PLANO.md`,
  `.scratch/06-debitos-aceitos/issues/01-DEBITO-01-electron-30-fora-de-suporte.md`,
  `electron/main.ts`.
- Achados centrais: Electron foi de 30 para 41.10.7 pelo `DEP-005`
  (2026-09-14) — README, `main.ts` e `DÉBITO-01` citavam 30. Persistência é
  JSON + localStorage, sem SQLite. `tests/unit/parser.test.ts` foi removido;
  três documentos ainda o citavam como fonte de verdade — trocado por
  referência ao `tests/integration/parser-real.test.ts`, que chama produção.
  `HARDENING_TRACKER.md` é stub desde 2026-09-03; `ARCHITECTURE.md` ainda o
  apontava como ativo. Lista de serviços em `ARCHITECTURE.md` tinha 4 de 15
  arquivos reais. Dark mode e settings persistidos estão implementados
  (`ROADMAP.md` marcava como pendente). Canário nightly nunca existiu (sem
  workflow em `.github/workflows/`) — `PORTAL_COMPATIBILITY.md` o descrevia
  como rodando. `docs/PLANO.md` dizia "nada implementado" com as fases 0-4
  fechadas em `.scratch/`.
- Prova: os 4 `grep` da Verification voltam vazios; `npm run quality` verde
  (0 erros, 52 warnings pré-existentes, 69 arquivos, 768 passed, 5 skipped)
  antes e depois do fix de revisão.
- Revisão (etapa 3, `code-review` skill): achou um segundo `parser.test.ts`
  em `tests/fixtures/README.md:20` que o grep original pegava mas eu tinha
  lido errado na primeira passada — corrigido. Achou que a correção de
  Layer 4 (canário "não implementado") deixava "Live canary contract" e o
  runbook de incidente no mesmo arquivo tratando o canário como processo
  mandatório existente — `docs/PORTAL_COMPATIBILITY.md` (Primary file, sem
  teste novo necessário) corrigido como fix pequeno na própria etapa 3,
  commit `ebf3698`.
- Gate: `npx tsc --noEmit` limpo; `npx eslint .` 0 erros/52 warnings
  pré-existentes; `npx vitest run` 768 passed, 5 skipped, 69 arquivos.

- 2026-09-15 Attempt 1 failed: exit 0. Log tail: DOC-004 done — merged into the session branch `sweatshop/2026-09-15-2032` at `712c9e7`, `Stage: done`, ledger updated. Gate is green (768 passed, 5 skipped, 52 pre-existing lint warnings, 0 errors). /  / Verdict: **Needs your call** on two things left for you, noted in the ticket's Resolution block: / 1. Whether Electron 41.10.7 is still within the three most recent supported majors (DÉBITO-01 updated with current version, not closed). / 2. Whether to actually build the nightly live-compatibility canary, now documented as "design, not implemented" instead of a running process. /  / Stage-3 review caught a real gap in my first pass — a stale `parser.test.ts` citation I'd missed in `tests/fixtures/README.md:20`, and a contradiction where the Layer-4 fix said the canary doesn't exist but the runbook/contract sections still treated it as mandatory. Both fixed in a follow-up commit before merge. /
