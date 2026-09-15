# CONC-002: Índice de downloads sem read-modify-write cruzado
Status: open
Stage: to-implement
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/course-detail.ts` (poda por existência `:243-268`; download único `:377-392`)
  - `src/data/account-storage.ts` (`recordDownloads`, `:116-127`; reutilizar, não duplicar)
  - `tests/unit/course-detail.test.ts`

Item 4 do gabarito. Opus e Astra, independentes.

#### What to build

No download único, o índice `downloads` é lido antes do `await` do IPC e
gravado depois; dois downloads concorrentes (dois cliques, um lento) gravam
cada um a sua cópia do índice e o segundo apaga o registro do primeiro. A poda
por existência tem a mesma janela: lê, `await checkFilesExistence`, grava. O
`recordDownloads` do `dashboard.ts:70` é síncrono e não participa; a
verificação refutou essa parte do achado.

#### Acceptance criteria

1. Dois `downloadFile` cujos IPCs resolvem intercalados deixam os dois
   registros no índice.
2. A poda relê o índice depois do `await` e antes de gravar; um registro
   acrescentado durante a espera é preservado.
3. O download único grava pelo `recordDownloads` de `account-storage.ts`
   (que já relê dentro), sem segunda cópia da lógica de escrita.
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/course-detail.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/course-detail.test.ts`: dois cliques de download com
  `window.api.downloadFile` controlado por promessas manuais; resolve o
  segundo antes do primeiro; o índice tem os dois `fileId`. Vermelho porque o
  primeiro a resolver por último sobrescreve.
- Poda: durante o `await checkFilesExistence`, gravar um registro novo no
  índice; depois da poda ele continua lá. Vermelho porque a poda grava a cópia
  antiga.

## Comments

- Isto é `localStorage` síncrono num só renderer; a janela é só o `await`. Não
  precisa de lock, precisa de reler depois de esperar.
