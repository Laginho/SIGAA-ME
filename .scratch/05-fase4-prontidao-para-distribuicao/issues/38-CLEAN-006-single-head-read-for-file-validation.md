# CLEAN-006: ler os primeiros bytes de um arquivo tem três cópias
Status: open
Stage: to-review
Priority: P3
Blocked by: nenhum

- Primary files:
  - `electron/services/file-validation.service.ts` (só o `readHead`, `:88-97`,
    e o novo export síncrono)
  - `electron/services/download.service.ts` (só o `readHeadSync`, `:19-31`, e
    o uso dele em `checkAndClearCorruptFile`)
  - `electron/services/sigaa.service.ts` (só `KNOWN_HEAD_CHECK_SIZE` e
    `readKnownHead`, `:60-72`)

Achado 3 da revisão do `DL-006` (2026-09-14), fora dos Primary files daquele
ticket.

#### What to build

Três funções leem os primeiros 4096 bytes de um arquivo para entregar ao
`validateHead`:

- `readHead` — async, `file-validation.service.ts:88-97`, `HEAD_SIZE = 4096`
- `readHeadSync` — `download.service.ts:22-31`, `CHECK_HEAD_SIZE = 4096`
- `readKnownHead` — `sigaa.service.ts:63-72`, `KNOWN_HEAD_CHECK_SIZE = 4096`

As duas síncronas são idênticas byte a byte, incluindo o `finally` com
`closeSync`; a constante está escrita três vezes com três nomes. O cabeçalho do
`file-validation.service.ts:1-5` diz por que isso importa aqui: a tabela de
assinaturas e a detecção de HTML já viveram duplicadas nos dois lugares, e
desalinhar as cópias quebrou o repositório (`QA-005`/`BUG-007`). Uma leitura de
cabeça curta demais numa cópia e não na outra reproduz a mesma classe de falha —
`validateHead` aceita prefixo, então o sintoma seria um arquivo ruim passando,
não um erro.

Exportar a versão síncrona do `file-validation.service.ts`, ao lado do
`validateHead` que os três chamam logo depois, e apagar as outras duas. O
`readHead` async fica: `finalizeDownload` é async e não deve bloquear o
event loop no caminho de download.

Isto é consolidação de duplicata existente, não abstração nova: a regra 7 do
`CLAUDE.md` proíbe criar estrutura para um caso, e aqui são três chamadores.

#### Acceptance criteria

1. Existe **uma** função síncrona de leitura de cabeça, exportada de
   `file-validation.service.ts`, e **uma** constante de tamanho.
2. `download.service.ts` e `sigaa.service.ts` a importam; `readHeadSync` e
   `readKnownHead` não existem mais.
3. Comportamento idêntico: fd fechado em `finally` mesmo com erro de leitura, e
   retorno cortado em `bytesRead` (arquivo menor que 4096 não devolve buffer
   cheio de zeros).
4. Nenhum teste existente muda de expectativa — é movimentação, não mudança de
   comportamento. `tests/unit/audit-download-identity.test.ts` mocka `openSync`
   /`readSync`/`closeSync` e continua valendo.

#### Verification

    npx vitest run tests/unit/audit-download-identity.test.ts tests/integration/audit-download-disk.test.ts tests/integration/download-boundary.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo de comportamento: o critério 4 diz que nada muda, e quem
  prova a consolidação é o `tsc` mais a suíte existente. Se a etapa 2 concluir
  que a função unificada precisa de teste próprio, ele vai em
  `tests/unit/file-validation.test.ts`, no seam de `file-validation.service.ts`
  — arquivo de 0 byte e arquivo menor que 4096 são os dois casos que valem.

## Comments
