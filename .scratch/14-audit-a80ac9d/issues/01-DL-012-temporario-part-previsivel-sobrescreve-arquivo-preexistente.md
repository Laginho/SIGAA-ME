# DL-012: Temporário `.part` previsível sobrescreve arquivo preexistente
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/file-validation.service.ts` (helper novo de reserva do `.part`, ao lado de `finalizeDownload`)
  - `electron/services/http-scraper.service.ts` (`downloadFile`: criação do `partPath` e do `createWriteStream`)
  - `electron/services/download.service.ts` (os três `saveAs(filePath + '.part')` e os `partPath` passados a `finalizeDownload`/`rejectIfTooLarge`)
  - `tests/unit/` (caso novo por transporte; arquivo novo ou ao lado dos de download, etapa 2 escolhe)

Achado 1 (Broken) da auditoria `docs/audits/2026-09-20-a80ac9d.md`,
reproduzido pelo auditor nos dois transportes: baixar `notes.part` e depois
`notes` na mesma pasta devolve sucesso duas vezes e a pasta fica só com
`notes`. O segundo download usa `notes.part` como temporário, sobrescreve o
arquivo válido do primeiro e o `rename` de `finalizeDownload` o consome. Vale
igual para qualquer arquivo que o usuário já tenha com sufixo `.part`. O
`open('wx')` do finalizador protege só o nome definitivo.

#### What to build

Um download nunca escreve num caminho que já existe, nem no temporário. Se
`<nome>.part` já está ocupado, a operação reserva outro (`<nome> (1).part`,
`(2)`, ...) e segue; o arquivo preexistente fica intacto. O nome definitivo
continua decidido por `finalizeDownload` como hoje.

Correção mínima: uma função que recebe `dir` e `safeFileName`, tenta
`open(dir/<nome>.part, 'wx')` e, em `EEXIST`, aplica `withNumberedSuffix`
até conseguir (mesmo laço e mesmo teto de `finalizeDownload`), fecha o handle
e devolve o caminho reservado. HTTP abre o `createWriteStream` nesse caminho;
o fallback passa esse caminho ao `saveAs` (o placeholder de 0 byte é
sobrescrito pela própria operação, que é o desejado). Os dois passam o mesmo
caminho a `rejectIfTooLarge`/`finalizeDownload`. Reserva feita e download
abortado antes de escrever: o placeholder é removido pelo mesmo caminho de
limpeza que já apaga o `.part`.

#### Acceptance criteria

1. HTTP: com `notes.part` preexistente contendo `A`, baixar `notes` com
   conteúdo válido devolve sucesso; ao fim, `notes.part` ainda contém `A` e
   `notes` contém o novo conteúdo. Nenhum `(1).part` sobra.
2. Fallback Playwright (ramo direto de `download`): mesmo cenário do critério
   1, com `saveAs` falso que escreve no caminho recebido; mesma verificação.
3. Falha na segunda transferência (conteúdo HTML recusado pelo finalizador):
   `notes.part` original intacto, nenhum temporário reservado sobrando.
4. Sem colisão, o temporário continua sendo `<nome>.part` e o nome final não
   muda; testes existentes de download passam sem edição
   (`download-fallback-*.test.ts`, `audit-download-*.test.ts`,
   `download-path-security.test.ts`).
5. Os ramos de popup e reload do fallback usam o caminho reservado, não
   `filePath + '.part'` literal (grep zero ocorrências dessa concatenação no
   `download.service.ts`).
6. Testes vermelhos sem a correção para os critérios 1 e 2.
7. `playwright-login.service.ts` e `sigaa.service.ts` não são tocados.
8. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit
    grep -n "'.part'" electron/services/download.service.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Fallback: mesma costura de `download-fallback-early-exit.test.ts` (mock de
  `electron` e logger, `DownloadService` real, `basePath` em `mkdtempSync`).
  Pré-criar `notes.part` com `A`; Page falsa cuja `download.saveAs(p)` escreve
  bytes com assinatura PDF em `p`. Verificar conteúdo dos dois arquivos após
  o retorno.
- HTTP: `HttpScraperService` real com axios mockado devolvendo stream de
  bytes PDF (ver costura de `http-scraper-cookie-domain.test.ts` ou mock
  local); mesmo pré-arquivo e mesma verificação.
- Critério 3: variante com stream/`saveAs` que entrega HTML; `readdirSync`
  da pasta igual a `['notes.part']`.

## Comments

#### Resolution (2026-09-20)

Implementado por pedido direto, sem ticket-flow, na branch `codex/DL-012`.
Testes: `1f71e10`. Correção: `70d7860`.

- `file-validation.service.ts`: `reserveDownloadPart` reserva com `open('wx')`,
  sufixos numerados e o mesmo teto de 1000 tentativas do finalizador.
- `http-scraper.service.ts`: grava no caminho reservado, limpa falhas e captura
  erros da conexão durante a reserva assíncrona. O teste existente de conexão
  interrompida detectou esse intervalo e passou após a correção.
- `download.service.ts`: download direto, popup e reload usam a reserva;
  falhas em `saveAs` removem o placeholder antes de sair ou tentar o reload.
- `tests/unit/download-part-collision.test.ts`: 13 casos novos. Prova vermelha
  antes da implementação: **9 failed | 4 passed (13)**; verde: **13 passed (13)**.
  Inclui colisões consecutivas, HTML recusado e falha de gravação antes dos bytes.
- O nome definitivo continua decidido pelo finalizador. Com assinatura PDF,
  `notes` vira `notes.pdf`, como já acontecia; o original `notes.part` permanece.
- Testes existentes não foram editados. Zero ocorrências de `filePath + '.part'`
  no fallback. `playwright-login.service.ts` e `sigaa.service.ts` intactos.
- Gate final no Windows: `npm run quality` aprovado, typecheck limpo, lint
  **0 erros / 39 warnings**, **79 arquivos aprovados**, **858 passed | 5 skipped (863)**.
  Rodado fora do sandbox após timeouts na inicialização de workers no sandbox.
- `git diff --check` limpo. Sem login real no SIGAA, build ou E2E; não exigidos
  para esta correção de serviço.
