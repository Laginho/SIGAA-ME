# DL-008: Teto no laço de último recurso do lote: N falhas seguidas do fallback Playwright encerram a rodada
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/sigaa.service.ts` (`downloadAllFiles`, o laço em
    `:616-632` e o comentário `ponytail:` em `:612-615`)
  - `tests/unit/sigaa-service.test.ts`

Achado 4 da auditoria `docs/audits/2026-09-16-dae3672.md`.

#### What to build

Depois dos três retries HTTP, `downloadAllFiles` percorre `results` e chama
`downloadViaPlaywright` para **todo** arquivo ainda `failed`:

    // sigaa.service.ts:616
    for (let i = 0; i < results.length; i++) {
        if (signal.aborted) return CANCELLED;
        if (results[i].status !== 'failed') continue;
        ...
        const pwResult = await this.downloadViaPlaywright(courseId, courseName, fileName, basePath, fileId, script);

Cada chamada abre um Chrome **visível** (`playwright-login.service.ts:778`,
`headless: false`) e espera até 65 s (`download.service.ts:113`). Não há teto.
Quando o lote inteiro falha por uma causa comum, o caso típico é deriva de
seletor servindo HTML no lugar do binário, o HTTP falha, o retry com relogin
falha, e então são até 500 janelas em sequência (o limite de
`parseDownloadAllFilesPayload`), cada uma podendo levar 65 s. A próxima ação
do usuário fica na fila do coordenador atrás disso. O comentário `ponytail:`
da linha 612 nomeia "um browser por arquivo", mas não o custo nem a ausência
de limite.

Correção: contador de falhas consecutivas do fallback. Depois de N seguidas
(N = 3), sair do laço e deixar os restantes como `failed`, com um `log.warn`
literal dizendo que o fallback foi interrompido por falhas consecutivas. Um
sucesso zera o contador: falha isolada de um arquivo não pune os outros.
Atualizar o comentário `ponytail:` para nomear o teto e o custo por tentativa.

Fora do escopo: `headless: false`, o timeout de 65 s, e lote no Playwright
(`CLEAN-003` removeu e disse para não reviver).

#### Acceptance criteria

1. Com todo arquivo `failed` e `downloadViaPlaywright` falhando sempre, ele é
   chamado exatamente N = 3 vezes, independente do tamanho do lote.
2. Um sucesso entre falhas zera a contagem: sequência falha, falha, sucesso,
   falha, falha, falha chama o fallback 6 vezes e para na sexta.
3. Arquivos não tentados continuam `failed` em `results`, e `downloaded` /
   `failed` fecham com a contagem real.
4. O aviso de interrupção é `log.warn` com mensagem literal e `courseId` em
   `meta`; sem nome de arquivo nem de turma na mensagem.
5. `signal.aborted` continua retornando `CANCELLED` como hoje.
6. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/sigaa-service.test.ts`, no describe de `downloadAllFiles` que já
  mocka `httpScraper` e `playwrightLogin`: lote de 10 arquivos, HTTP falhando
  sempre, `playwrightLogin.downloadFile` sempre `{ success: false }`. Afirmar
  `toHaveBeenCalledTimes(3)` (critério 1). Vermelho hoje: 10 chamadas. Segundo
  caso para o critério 2 com `mockResolvedValueOnce` alternando.

## Comments

- Não é bug de correção: cada chamada individual faz o certo. É custo sem
  teto num caminho que só roda quando tudo já falhou, e é exatamente aí que
  500 janelas aparecem.
