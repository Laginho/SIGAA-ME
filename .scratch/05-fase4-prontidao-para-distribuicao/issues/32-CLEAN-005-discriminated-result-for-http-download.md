# CLEAN-005: `downloadFile` devolve campos opcionais, não união discriminada
Status: open
Stage: to-implement
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

## Comments

- Bloqueado por `DL-004` porque ele reescreve a identidade do download e mexe
  nos mesmos call sites. Fazer os dois em paralelo é conflito garantido.
