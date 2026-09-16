# DL-008: Teto no laço de último recurso do lote: N falhas seguidas do fallback Playwright encerram a rodada
Status: resolved
Stage: done
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

#### Resolution (2026-09-16)

Verdict: Approve

Decisão: contador `consecutiveFailures` local ao laço de fallback, com o teto
em `PLAYWRIGHT_FALLBACK_FAILURE_LIMIT = 3` no topo do módulo. A checagem do
teto fica **antes** da tentativa e depois do `continue` de status, então só
conta arquivo que de fato foi ao Playwright; sucesso zera. O `break` garante
que o `log.warn` sai no máximo uma vez, e só quando ainda havia arquivo por
tentar — lote que acaba em três falhas nas últimas posições não gera aviso
falso.

Arquivos:

- `electron/services/sigaa.service.ts` — constante nova, comentário `ponytail:`
  reescrito nomeando o teto e os 65 s por tentativa, guarda e contador no laço
  (`:615-649`).
- `tests/unit/sigaa-service.test.ts` — dois casos novos no describe de
  `downloadAllFiles`.

Prova red-green (rodada pelo revisor, `sigaa.service.ts` revertido para a
versão da branch de sessão):

    × caps the Playwright fallback at 3 consecutive failures  → expected 3, got 10
    × resets the consecutive-failure count on a fallback success → expected 6, got 7
    Tests  2 failed | 35 passed (37)

Com a correção: `Test Files 71 passed (71)`, `Tests 800 passed | 5 skipped (805)`,
`eslint` 0 erros / 40 warnings (`no-explicit-any` pré-existentes), `tsc` limpo.

Critérios: 1 ✅ (teste, 3 chamadas em lote de 10), 2 ✅ (teste, 6 chamadas na
sequência f,f,s,f,f,f), 3 ✅ (teste afirma `downloaded`/`failed` e os 10
`failed` em `results`), 4 ✅ por leitura — `log.warn('Playwright fallback
interrupted by consecutive failures.', { courseId })`, sem nome de arquivo nem
de turma —, 5 ✅ (`signal.aborted` intacto no topo do laço), 6 ✅.

Observação, não bloqueia: o critério 4 não tem teste. A seção "Tests stage 2
writes" só pediu testes para 1 e 2, e o implementador ficou dentro do que foi
pedido. Se o formato do aviso virar contrato de observabilidade, abrir ticket
próprio — aqui seria teste novo, ou seja, fora do que a etapa 3 pode fazer.
