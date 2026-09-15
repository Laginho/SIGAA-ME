# DL-007: Fallback Playwright reutiliza só o arquivo certo e não vazio
Status: open
Stage: implementing
Priority: P0
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/download.service.ts` (`downloadFile`: reuso por caminho `:75-80`, casamento do `freshAction` `:113-127`)
  - `electron/services/sigaa.service.ts` (`downloadViaPlaywright` e a chamada em `:600`: passar o id do material)
  - `electron/services/playwright-login.service.ts` (só a assinatura de `downloadFile` que repassa ao `download.service`)
  - `electron/services/file-validation.service.ts` (`sigMatches` `:49-51`, `validateHead` `:172-183`, `finalizeDownload` `:212-217`, `isReusableDownload`)
  - `tests/unit/file-validation.test.ts`
  - `tests/unit/audit-download-inspect.test.ts` (reescrever ou apagar; ver Comments)
  - New: `tests/unit/audit-download-fallback-identity.test.ts`

Itens 9 e 11 do gabarito. Bloqueador de release. Continuação de `DL-004`
(identidade por id no caminho HTTP) e `DL-005` (reuso de arquivo ininspecionável).

#### What to build

Item 9: o fallback Playwright reutiliza qualquer arquivo válido no `filePath`
derivado do nome e escolhe a ação no DOM por
`text === fname || text.includes(fname) || fname.includes(text)`: "Aula 1"
casa "Aula 10". `ParsedFile.id` já existe e está no `onclick` JSF de cada
linha; o nome serve para nomear em disco, não para escolher o material.

Item 11: `sigMatches` com cabeça vazia faz `sig.startsWith('')`, sempre
verdadeiro. Arquivo de 0 bytes é finalizado como válido e depois considerado
reutilizável, o que bloqueia o retry para sempre.

#### Acceptance criteria

1. `validateHead` com `head` vazio devolve `{ ok: false }` para qualquer
   extensão com assinatura registrada; cabeça menor que a assinatura só passa
   se for prefixo **não vazio**.
2. `finalizeDownload` de um `.part` com 0 bytes devolve `{ ok: false, reason: 'empty' }`,
   apaga o `.part` e não deixa arquivo final. `'empty'` entra na união de
   `reason`; consumidores que exibem `reason` tratam o valor novo.
3. Um arquivo de 0 bytes já em disco não é reutilizável nem pela dedup do lote
   (`known`) nem pelo fallback: o próximo lote baixa de novo.
4. O fallback recebe o id do material e escolhe a linha do DOM cujo `onclick`
   carrega esse id (o mesmo formato de que o parser extrai o `id`); texto da
   linha nunca decide. Sem linha com o id, o resultado é falha, sem `goto` e
   sem executar script de outra linha.
5. O ramo de reuso por caminho no `downloadFile` do fallback (`:75-80`) sai:
   quem chega ao fallback já passou pela dedup por id do lote, então ele sempre
   baixa e finaliza pelo mesmo caminho único de `finalizeDownload` (sem
   sobrescrever homônimo).
6. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/file-validation.test.ts tests/unit/audit-download-fallback-identity.test.ts tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/file-validation.test.ts`: `validateHead(Buffer.alloc(0), '.pdf')`
  reprova; `finalizeDownload` com `.part` vazio devolve `'empty'` e limpa;
  `isReusableDownload` de arquivo vazio é `false`. Vermelho pelos três motivos
  do item 11.
- `tests/unit/audit-download-fallback-identity.test.ts` (página falsa como em
  `audit-download-inspect.test.ts`): DOM com "Aula 1" (id 10) e "Aula 10"
  (id 100); pedido do id 10 executa o `onclick` da linha certa; pedido de id
  ausente falha sem `goto`. Vermelho porque hoje casa por texto.
- `tests/unit/audit-download-inspect.test.ts`: os casos de reuso deixam de
  existir com o critério 5. Reescrever como "arquivo existente no caminho, legível
  ou não, não impede o download" ou apagar, no mesmo commit vermelho, com a
  justificativa na mensagem.

## Comments

- O critério 5 tira o que `DL-005` consertou (reuso de arquivo
  ininspecionável) porque tira o reuso inteiro. É decisão de etapa 1: o
  fallback só roda para arquivo que o lote decidiu baixar; um segundo juízo por
  caminho de nome é onde o homônimo errado entra. Se a etapa 3 discordar, o
  caminho alternativo é reusar só quando `known` aponta o id para esse
  caminho — e isso exige passar `known` até o fallback.
- `SEC-004` põe allowlist no ramo `href` do mesmo `freshAction`. Sem gate;
  quem chegar depois resolve o conflito dentro dos Primary files. Com o
  critério 4, o `href` só é seguido para a linha casada por id.
- `CLEAN-009` remove os parâmetros mortos (`fileUrl`, `_downloadedFiles`) da
  mesma assinatura; por isso ele espera este ticket. Aqui só acrescente o id.
- Primary files não listava todo o raio de alcance dos critérios 4 e 5:
  passar o id por `DownloadService.downloadFile`/`playwrightLogin.downloadFile`
  muda a aridade das duas assinaturas, e o critério 5 apaga um comportamento
  que outros testes já afirmavam. Sem isso, o gate ficava vermelho com a
  mudança aprovada. Toquei, fora do Primary files declarado:
  - `tests/unit/sigaa-service.test.ts`: 3 `toHaveBeenCalledWith` só ganharam o
    novo argumento posicional (id), nenhuma asserção nova.
  - `tests/integration/logging-boundary.test.ts`: mesma coisa, 1 chamada.
  - `tests/integration/download-boundary.test.ts`: o helper `baixar` ganhou o
    id; e o teste "arquivo já existente... é preservado e reaproveitado"
    (linha 200) testava exatamente o reuso que o critério 5 remove — reescrito
    para provar sufixo numerado em vez de sobrescrita, mesmo padrão do DL-004.
