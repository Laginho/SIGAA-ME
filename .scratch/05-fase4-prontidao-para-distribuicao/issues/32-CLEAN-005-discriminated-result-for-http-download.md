# CLEAN-005: `downloadFile` devolve campos opcionais, não união discriminada
Status: resolved
Stage: done
Priority: P3
Blocked by: DL-004

- Primary files:
  - `electron/services/http-scraper.service.ts` (só a assinatura de
    `downloadFile`, `:806`, e os `resolve`/`return` dela)
  - `electron/services/sigaa.service.ts` (só os quatro call sites: `:275`,
    `:303`, `:465`, `:517`)

Achado da revisão do `DL-003` (2026-09-11), fora dos Primary files daquele
ticket.

#### What to build

`HttpScraperService.downloadFile` devolve
`{ success: boolean; filePath?: string; error?: string; errorCode?: AppErrorCode }`.
É a forma que a regra 6 do `CLAUDE.md` existe para eliminar: `success` não
estreita nada, então todo chamador escreve `if (result.success && result.filePath)`
para convencer o `tsc` — quatro vezes em `sigaa.service.ts`. O `ARCH-001` já
estabeleceu `AppResult<T>` como a união do repositório, mas parou na fronteira
IPC; este método é interno e ficou de fora.

Trocar por união discriminada e apagar as quatro checagens duplas.

#### Acceptance criteria

1. `downloadFile` devolve uma união onde `success: true` garante `filePath:
   string` sem checagem extra.
2. Nenhum dos quatro call sites em `sigaa.service.ts` testa `filePath` além do
   `success`.
3. Nenhum teste existente muda de expectativa — é troca de tipo, não de
   comportamento.

#### Verification

    npx vitest run tests/integration/download-boundary.test.ts tests/integration/audit-download-disk.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: critério 3 diz que o comportamento não muda, e o que
  prova a mudança é o `tsc`. Se a etapa 2 achar que precisa de teste novo, o
  ticket está errado — volte para a etapa 1.

#### Resolution (2026-09-14)

Aprovado na primeira revisão, sem mudança de código. Commit `773e63b`, PR #26
(merge `f9c0a42`).

**Decisão.** A assinatura de `HttpScraperService.downloadFile` virou
`{ success: true; filePath: string } | { success: false; error: string; errorCode?: AppErrorCode }`,
união inline no próprio método. O `AppResult<T>` do `ARCH-001` não foi adotado:
o ticket o trata como forma de fronteira IPC, e este método é interno. Nenhum
alias de tipo novo, pela regra 7.

**Arquivos.** `electron/services/http-scraper.service.ts` (só a assinatura,
`:770-773`) e `electron/services/sigaa.service.ts` (os quatro call sites, hoje
em `:278`, `:306`, `:484`, `:537`). Nada fora dos Primary files.

**Prova.** Não há vermelho a reproduzir: o ticket declara que a prova é o `tsc`,
e a mudança não adiciona teste. O que a revisão conferiu à mão foram os nove
pontos de saída de `downloadFile` — `:781`, `:787`, `:851`, `:910`, `:913`,
`:920`, `:926`, `:937`, `:944` — todos casando com um dos dois braços, só o
`:910` sendo o de sucesso e carregando `filePath`. Os quatro call sites são
exatamente quatro (`grep 'httpScraper.downloadFile'`), e o diff não toca
nenhum arquivo de teste, o que fecha o critério 3.

**Gate** (Windows):

    npm run quality
    → eslint: 0 erros, 55 warnings (todos `no-explicit-any` pré-existentes)
    → vitest: 62 arquivos, 705 passed | 5 skipped (710)

CI verde nos três jobs (typecheck/lint/testes, E2E sem credencial, scanner de
segredo).

## Comments

- Bloqueado por `DL-004` porque ele reescreve a identidade do download e mexe
  nos mesmos call sites. Fazer os dois em paralelo é conflito garantido.
- O corpo citava os dois últimos call sites em `:465` e `:517`; depois do merge
  do `DL-004` eles estão em `:482` e `:535`. Deriva de linha, mesmos quatro
  sites.
- O `errorCode` do braço de falha não tem leitor: o caminho de erro do
  `_downloadFileInternal` cai para o Playwright em vez de chamar
  `failFromResult`. Anterior a este ticket e fora dos critérios; ficou como
  está.
