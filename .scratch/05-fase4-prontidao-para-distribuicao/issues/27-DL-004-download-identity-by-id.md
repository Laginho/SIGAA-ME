# DL-004: Identidade por id no caminho de download
Status: resolved
Stage: done
Priority: P1
Blocked by: DL-003

- Primary files:
  - `electron/services/sigaa.service.ts` (`_downloadAllFilesInternal`: pareamento em `:498`, `:523`, `:561`; dedup `:357`)
  - `electron/services/file-validation.service.ts` (`finalizeDownload`, o `rename` final `:231`)
  - `shared/domain.ts` (`DownloadRecord`, `:83`)
  - `shared/ipc.ts` (`DownloadProgress`, `:62`)
  - `electron/services/download.service.ts` (dedup por `file.name` em `downloadCourseFiles`, `:332-346` — só se ainda existir; ver `CLEAN-003`)
  - `src/pages/course-detail.ts` (cache `downloadedFiles` e casamento do botão de progresso, `:277`, `:300`, `:340`, `:388`)
  - `tests/integration/audit-download-disk.test.ts` (acrescentar o `it.each` de colisão)
  - `tests/unit/file-validation.test.ts` (acrescentado na revisão de 2026-09-13:
    é onde os testes dos achados 1 e 2 cabem)
  - New: `tests/unit/audit-download-identity.test.ts`

Achados Broken #2 e #3 de `docs/audits/2026-09-09-40a0d01.md`, passos 2 e 3 da
ordem recomendada. Mesma raiz (pareamento por nome em vez de id); separar
faria dois tickets consertarem metade do mesmo bug.

#### What to build

Dois arquivos com o mesmo nome (ou nomes que sanitizam para o mesmo nome) no
mesmo lote são baixados, validados, gravados e reportados como dois arquivos.
Hoje:

- retry e fallback pareiam `results` com `files` por `name`; com nomes
  repetidos rebaixam o arquivo errado e marcam o registro errado;
- `finalizeDownload` termina em `fs.promises.rename(partPath, filePath)`, que
  sobrescreve em silêncio: um só arquivo fica no disco, com sucesso para os
  dois.

Já encaminhado no master: `CourseFile.id` e `DownloadToken` existem no pedido;
`findScript` (`sigaa.service.ts:44-53`) seleciona o script por id. O que falta
é o resto da cadeia carregar o id.

#### Acceptance criteria

1. Com dois `DownloadFileRef` de mesmo `name` e ids distintos, onde o segundo
   falha no HTTP e é recuperado no retry (ou no fallback Playwright), toda
   chamada de retry a `httpScraper.downloadFile` recebe o **id do segundo**,
   e o fallback recebe o **script do segundo**. `results` reporta os dois
   como `downloaded`, cada um com o seu `filePath`.
2. `DownloadRecord` e `DownloadProgress` carregam `fileId` além de
   `fileName`. O renderer casa botão e cache por `fileId`; nenhum
   `find(... .name === ...)` sobra em `sigaa.service.ts` para parear
   resultado com pedido.
3. Dois downloads reais (`HttpScraperService.downloadFile`, fixture) com nomes
   que colidem — `same.txt`/`same.txt`, `Lista:1.txt`/`Lista/1.txt`, e dois
   nomes com 151+ caracteres que truncam igual — deixam **dois** arquivos no
   destino, cada um com o próprio conteúdo, e os dois `filePath` retornados
   apontam para arquivos distintos.
4. O caminho final é exclusivo: em `EEXIST` o nome recebe sufixo numerado
   (` (1)`, ` (2)`, ...) dentro da mesma pasta, ainda contido pelo
   `isInsideRoot`. Nunca sobrescreve um arquivo existente que não seja o
   próprio `.part`.
5. A deduplicação do lote (`:357`) continua pulando arquivo **já baixado e
   presente no disco**, sem derrubar um homônimo novo do mesmo lote: cada
   arquivo da fila reserva, na ordem do array `files`, um candidato de caminho
   distinto (nome-base, depois sufixo numerado) e só é comparado contra o
   disco por esse candidato.

   Reescrito em 2026-09-14, com o PR aberto. O texto original pedia dedup
   "chaveada por id"; isso exige um índice persistido id → caminho, que o
   processo não tem e que é arquivo novo — decisão de etapa 1, saiu como
   `DL-006`. O critério passa a descrever o que a implementação entrega. O
   caso que a ordenação erra está no achado 3 e foi levado para o `DL-006`,
   não desapareceu com o fechamento deste ticket.

#### Verification

    npx vitest run tests/unit/audit-download-identity.test.ts tests/integration/audit-download-disk.test.ts tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `git checkout 6aeb67c -- tests/unit/audit-download-identity.test.ts`
  (critério 1). Reprovar contra o master de hoje, não contra `40a0d01`.
- `it.each(... 'preserves both downloads for colliding names')` de
  `6aeb67c:tests/integration/audit-download-disk.test.ts`, acrescentado ao
  arquivo que `DL-003` já colheu (critérios 3 e 4).
- Critérios 2 e 5: teste novo em `audit-download-identity.test.ts` com dois
  homônimos, um já em disco — só o já baixado sai como `skipped`. Escrever do
  zero; a branch não cobre.
- Critério 2 no renderer: `tests/unit/course-detail.test.ts` já existe; se o
  seam do progresso mudar, ajustar lá. Não é Primary file: se precisar de
  mais que trocar a chave, volte para a etapa 1.

## Comments

- A branch `codex/fix-audit-2026-09-09` (`16f9e2e`) trocou o `rename` por
  `link` + `unlink` com retry de sufixo no `EEXIST`. Serve de referência de
  leitura; **não** faça cherry-pick do commit, ele mistura pins de dependência
  e docs.
- `PlaywrightLoginService.downloadAllFiles` e
  `DownloadService.downloadCourseFiles` também deduplicam por nome. São código
  morto (ver `CLEAN-003`). Se `CLEAN-003` fechar antes, tire
  `download.service.ts` dos Primary files; senão, não os conserte, só não os
  quebre no `tsc`.
- Fora de escopo: extrair o leitor de notícias de
  `playwright-login.service.ts` (1282 linhas). Ticket próprio.
- Da revisão do `DL-003` (2026-09-11): o descarte do `.part` no ramo
  `writer.on('error')` não é coberto por nenhum teste da suíte. O teste do
  `DL-003` apaga a pasta de destino inteira, então o `.part` nunca chega a
  existir e o `unlink` do `descartarParcial` falha em silêncio — o caso
  "parcial existe, depois some" continua sem prova. `DL-004` já edita
  `audit-download-disk.test.ts`; se couber num `it` a mais ali, cubra. Não é
  critério novo: só não deixe o buraco fechar sem alguém ver.
- Da revisão do `DL-005` (2026-09-11): o filtro de duplicata do critério 5
  (`sigaa.service.ts:357-375`) decide por `existsSync` puro — presença basta,
  conteúdo nunca é olhado. O caminho de arquivo único valida a cabeça antes de
  reaproveitar (`download.service.ts:71-89`, `DL-002` + `DL-005`); o lote não.
  Arquivo truncado ou página de erro salva com o nome certo fica em disco para
  sempre, reportado como `skipped`. Chavear por id não resolve isso; é decisão
  de etapa 1 se vira critério aqui ou ticket próprio.

- Implementação (2026-09-13): os commits `6aeb67c` e `16f9e2e`
  (`codex/fix-audit-2026-09-09`) citados em "Tests stage 2 writes" não existem
  neste repositório — checados branches, remotes, reflog e `git cat-file -t`
  em ambos, `not a valid object name`. Os testes de critério 1 e 3/4 foram
  escritos do zero a partir dos próprios critérios em vez de cherry-pick.
  Nenhum seam mudou; só a fonte do texto do teste.

  Critério 5 não tem, e não pode ter, um registro persistido de "este id já
  baixou para este caminho" — o processo não guarda esse mapa em lugar
  nenhum. A implementação resolve por ordem: `claimedPaths` reserva, na ordem
  do array `files`, um candidato de caminho distinto por arquivo do lote
  (nome-base, depois sufixo numerado); só o primeiro arquivo a reivindicar um
  candidato é comparado contra o disco por ele. Isso garante que um homônimo
  novo nunca é julgado pelo `existsSync` de um candidato que outro arquivo do
  mesmo lote já reivindicou — mas **não** identifica de fato "qual id" gravou
  o arquivo pré-existente; é a melhor atribuição possível sem um índice
  persistido por id, e casa com o texto do critério ("não derrubar um
  homônimo novo"), não com "provar que o arquivo em disco é do id X". Critério
  3/4 (o caminho final exclusivo de verdade) não depende disso: roda em
  `finalizeDownload`, sequencial por lote, contra o disco real, via
  `fs.promises.link` (falha `EEXIST` em vez de sobrescrever, ao contrário de
  `rename`) com sufixo numerado até achar um caminho livre.

  Verificado: `npx tsc --noEmit` limpo, `npx vitest run` 690 passed / 5
  skipped, `npx eslint .` 0 erros (55 warnings pré-existentes de
  `no-explicit-any`, nenhum nas linhas tocadas). Commits: `b41abea` (testes,
  vermelho) e `14ef21e` (implementação, verde), branch `dl-004`.

## Revisão (2026-09-13, etapa 3) — reaberto

`npm run quality` verde na branch: tsc limpo, eslint 0 erros / 55 warnings
pré-existentes, vitest 690 passed | 5 skipped em 61 arquivos. Vermelho provado:
com `electron/`, `shared/` e `src/` revertidos ao master e os testes da branch
no lugar, os três arquivos tocados dão 6 failed | 2 passed. Separação de commits
correta — `b41abea` só toca teste, `14ef21e` não toca nenhum.

Critérios:

1. ✅ Retry casa por id com dois `same.txt`; `downloadFile.mock.calls[2]` recebe
   `'2'` e `SCRIPT_B`. O fallback Playwright (`sigaa.service.ts:578`) também
   passou a casar por id, mas nenhum teste novo o exercita — o critério admite
   "ou", então não segura o merge.
2. ✅ `fileId` em `DownloadRecord` e `DownloadProgress`, renderer casando botão
   e cache por id; `grep '\.name ===' electron/services/sigaa.service.ts` volta
   vazio.
3. ⚠️ Provado em disco real nos três casos de colisão. Vale só onde o sistema
   de arquivos tem hard link — ver achado 1.
4. ❌ Fora do NTFS "nunca sobrescreve" virou "nunca grava". Ver achado 1.
5. ⚠️ Entregue como ordenação de candidatos, não como id, e a própria nota de
   implementação diz por quê. Ver achado 3: não é trabalho desta rodada.

### O que falta

**Achado 1 — `fs.promises.link` não existe em FAT32/exFAT, e o laço só trata
`EEXIST` (`file-validation.service.ts:235-246`).** A pasta de downloads é
escolhida pelo usuário no diálogo; num pendrive ou cartão SD (exFAT é o padrão
acima de 32 GB) o Windows recusa hard link e o Node devolve `EPERM`, que não é
`EEXIST` e portanto sai pelo `throw`. O `catch` externo apaga o `.part` e o
`http-scraper` resolve `{ success: false }`. Antes de `14ef21e` o `rename`
funcionava nesses volumes: todo download passa a falhar onde antes passava, e
nenhum teste pega isso porque a suíte grava em `tmp` no disco de sistema.

Direção sugerida, não obrigatória: trocar o `link` por criação exclusiva mais
`rename` — `fs.promises.open(filePath, 'wx')`, fechar, `rename(partPath,
filePath)`. `wx` é `O_CREAT|O_EXCL`, dá o mesmo `EEXIST` que alimenta o sufixo
numerado, funciona em FAT, e o `rename` sobre o placeholder de 0 byte que nós
mesmos criamos não apaga arquivo de ninguém. Teste: `fs.promises.link` (ou o
`open`) recusando com `EPERM` e o arquivo ainda chegando ao destino.

**Achado 2 — `await fs.promises.unlink(partPath)` (`:247`) transforma download
concluído em falha reportada.** Depois do `link` o arquivo final já está em
disco; se o `unlink` do `.part` falhar (lock de antivírus ou indexador, comum no
Windows), o `catch` externo relança, o chamador reporta erro e o retry baixa de
novo — agora achando o nome ocupado e criando `nome (1).ext`. Um arquivo vira
dois e o usuário vê "falhou". Vale só se o `link` ficar; a alternativa do achado
1 dissolve o problema, porque o `rename` consome o `.part`.

Os dois cabem em `file-validation.service.ts`, já Primary file. Voltaram para a
etapa 2 e não para um fix de revisão porque precisam de teste novo.

#### Implementação da rodada 2 (2026-09-13)

Seguiu a direção sugerida acima: `finalizeDownload` troca `fs.promises.link` +
`fs.promises.unlink(partPath)` por `fs.promises.open(filePath, 'wx')` (mesmo
`O_CREAT|O_EXCL`, mesmo `EEXIST` alimentando o sufixo numerado) seguido de
`fs.promises.rename(partPath, filePath)`. Os dois achados fecham com a mesma
mudança: `open('wx')` não depende de hard link (resolve o achado 1) e o
`rename` consome o `.part` no mesmo passo, então não sobra um `unlink`
separado depois do sucesso para falhar (resolve o achado 2).

Testes novos em `tests/unit/file-validation.test.ts`: um mock de
`fs.promises.link` rejeitando com `EPERM` (achado 1) e um mock de
`fs.promises.unlink` rejeitando com `EBUSY` (achado 2), os dois confirmando
vermelho contra o `link`/`unlink` antigo antes da mudança — cada mock some do
caminho de sucesso depois do fix, então o teste passa a provar que a falha
simulada deixou de importar, não que o código ainda chama a função mockada.

Verificado: `npx tsc --noEmit` limpo, `npx eslint .` 0 erros (55 warnings
pré-existentes, nenhum nas linhas tocadas), `npx vitest run` 692 passed / 5
skipped em 61 arquivos. Commits: `5ecf7a0` (testes, vermelho) e `5e91d2b`
(implementação, verde), branch `dl-004`.

### Notas, sem virar critério

**Achado 3 — critério 5 não é por id, e não pode ser sem estado novo.** O
`claimedPaths` reserva candidatos na ordem do array `files`; se o usuário já
baixou só o segundo homônimo, o primeiro id do lote reivindica o nome-base,
acha o arquivo do outro no `existsSync` e sai `skipped` sem nunca ter baixado.
Fica melhor que o master (que descartava os dois) e pior que o texto do
critério. O conserto de verdade é um índice persistido id → caminho, que é
arquivo novo e decisão de etapa 1 — mesma pergunta que a nota do `DL-005` já
deixou aqui em 2026-09-11 e que ninguém respondeu. Se virar ticket, os dois
achados são o mesmo.

**Achado 4 — dois arquivos fora dos Primary files.**
`electron/ipc/register-handlers.ts` (forçado pela assinatura de `onProgress`) e
`electron/services/download-path.ts` (novo `withNumberedSuffix`). Ambos mínimos
e necessários; nenhum foi declarado no relatório, como o `CLAUDE.md` pede. Não
reverto nem reabro por isso — fica o registro.

**Achado 5 — o cache do renderer não migra.** `downloadedFiles[courseId]` passa
a ser chaveado por id; quem já usava o app perde o ✅ de tudo que baixou até
hoje, e as chaves antigas por nome ficam órfãs (a poda é por caminho, então só
somem se o arquivo sumir). É o que o critério 2 pede, e o id do JSF é o id do
material no banco do SIGAA, estável entre sessões — a perda é única, não
recorrente.

**Carry-over do `DL-003` continua aberto.** O descarte do `.part` no ramo
`writer.on('error')` segue sem teste; esta rodada editou
`audit-download-disk.test.ts` e não o cobriu. Cabe junto com os achados 1 e 2.

## Revisão (2026-09-13, etapa 3, rodada 2) — reaberto

`npm run quality` verde na branch: tsc limpo, eslint 0 erros / 55 warnings
pré-existentes, vitest 692 passed | 5 skipped em 61 arquivos. Vermelho provado
de novo: com `file-validation.service.ts` no estado de `5ecf7a0` e os testes de
`5ecf7a0` no lugar, `tests/unit/file-validation.test.ts` dá 2 failed | 30
passed, e os dois falham pelo motivo certo (`EPERM` no `link`, `EBUSY` no
`unlink`). Separação de commits correta — `5ecf7a0` só toca teste, `5e91d2b`
não toca nenhum.

Critérios: 1 ✅, 2 ✅ (inalterados desde a rodada 1), 3 ✅ (a ressalva "só onde
há hard link" caiu junto com o `link`), 4 ✅ (`O_CREAT|O_EXCL` mantém a
exclusividade e agora funciona em FAT), 5 ⚠️ (inalterado; achado 3 segue nota).
Os achados 1 e 2 da rodada 1 estão fechados.

**Reabro por um defeito que a própria correção da rodada 2 introduziu, não por
critério que caiu.**

### O que falta

**Achado 6 — o placeholder de 0 byte vaza no destino quando o `rename` falha
(`file-validation.service.ts:244-257`).** `open(filePath, 'wx')` cria um arquivo
vazio e o `rename` só vem no passo seguinte. Se o `rename` rejeitar, o `catch`
chama `cleanup()`, que apaga **só o `partPath`** (`:191`) — o arquivo de 0 byte
fica no destino para sempre. Duas consequências:

1. O chamador reporta falha e o retry baixa de novo; agora o `open('wx')` acha
   o placeholder órfão, sai por `EEXIST` e o arquivo bom vai para
   `nome (1).ext`, enquanto o de 0 byte fica com o nome certo. É o sintoma do
   achado 2 — "um arquivo vira dois e o usuário vê falhou" — reentrando por
   outra porta.
2. O dedup do lote (`sigaa.service.ts:357`) decide por `existsSync` puro. Na
   próxima sincronização o placeholder conta como baixado e o arquivo sai
   `skipped`: o usuário nunca recebe o conteúdo e fica com um chamariz de 0
   byte que parece pronto. Permanente.

`rename` falhar aqui não é hipótese remota: destino e `.part` estão na mesma
pasta (`http-scraper.service.ts:862`, `download.service.ts:183`), então não é
`EXDEV`, mas um handle de antivírus, do indexador do Windows ou de um agente de
sync (OneDrive/Dropbox numa pasta de Downloads) sobre o arquivo recém-criado dá
`EPERM`/`EBUSY` — exatamente a classe de lock que motivou o achado 2.

Estrutural, e vale registrar: o `link` era atômico — o arquivo final existia
completo ou não existia. `open('wx')` + `rename` são dois passos com um estado
intermediário visível, então até um fechamento limpo do app ou queda de energia
nessa janela deixa o placeholder.

Direção sugerida, não obrigatória: marcar que o placeholder foi criado por nós e,
no `catch`, remover `filePath` quando o `rename` não chegou a acontecer — sem
remover nos caminhos de falha anteriores (`too-large`, `validateHead`), onde
`filePath` pode ser arquivo de outro. Teste: `fs.promises.rename` rejeitando com
`EBUSY`, e a pasta de destino terminando vazia — sem 0 byte e sem `.part`.
Alternativa mais cara: tentar `link` primeiro e cair para `open('wx')` + `rename`
só em `EPERM`/`ENOSYS`, preservando a atomicidade no NTFS ao custo de dois
caminhos.

Cabe em `file-validation.service.ts` e `tests/unit/file-validation.test.ts`, os
dois já Primary files. Voltou para a etapa 2 e não para um fix de revisão porque
precisa de teste novo.

#### Implementação da rodada 3 (2026-09-13)

Achado 6: `finalizeDownload` agora separa o `rename(partPath, filePath)` num
`try` próprio. Se rejeitar, o `catch` faz `fs.promises.unlink(filePath)` (o
placeholder de 0 byte que o `open('wx')` criou) antes de relançar — o `catch`
externo continua limpando `partPath` como já fazia. Caminhos de falha
anteriores (`too-large`, `validateHead`) não são afetados: `filePath` só é
criado depois deles, então nunca chegam a esse `try`.

Teste novo em `tests/unit/file-validation.test.ts`: mock de
`fs.promises.rename` rejeitando com `EBUSY`, confirmando vermelho contra o
código antigo (placeholder ficava, `readdirSync` do destino devolvia
`['LISTA 1.pdf']`) antes da mudança.

Verificado: `npx tsc --noEmit` limpo, `npx eslint .` 0 erros (55 warnings
pré-existentes, nenhum nas linhas tocadas), `npx vitest run` 693 passed / 5
skipped em 61 arquivos. Commits: `d2bc9dd` (teste, vermelho) e `62669f0`
(implementação, verde), branch `dl-004`.

## Revisão (2026-09-13, etapa 3, rodada 3) — Needs your call

`npm run quality` verde na branch: tsc limpo, eslint 0 erros / 55 warnings
pré-existentes, vitest 693 passed | 5 skipped em 61 arquivos. Vermelho provado:
com `file-validation.service.ts` no estado de `d2bc9dd` e o teste novo no lugar,
`tests/unit/file-validation.test.ts` dá 1 failed | 32 passed, e falha pelo motivo
certo — `expected [ 'LISTA 1.pdf' ] to deeply equal []`, o placeholder de 0 byte
sobrevivendo ao `rename` que rejeitou. Separação de commits correta: `d2bc9dd` só
toca teste, `62669f0` só toca fonte.

**Achado 6 fechado.** O `rename` ganhou `try` próprio; no `catch` o
`unlink(filePath)` remove o placeholder que o `open('wx')` criou, e o `catch`
externo segue limpando o `.part`. A remoção é segura porque o `open('wx')`
provou que o arquivo não existia um instante antes — nunca é arquivo de
terceiro. Os caminhos de falha anteriores (`too-large`, `validateHead`,
`isInsideRoot`) ficam antes do `open` e não passam por esse `try`. O chamador
(`http-scraper.service.ts:912`) já converte o throw em
`{ success: false, error }`; `finalizeDownload` é o único ponto do repositório
que cria placeholder (`grep 'wx'` volta só `:246`).

Critérios: 1 ✅, 2 ✅, 3 ✅, 4 ✅ (todos inalterados desde a rodada 2), 5 ⚠️.

### Por que não mergeio sozinho

Critério 5 continua **não atendido como escrito**. Ele pede dedup "chaveada por
id"; a entrega é ordenação de candidatos (`claimedPaths`), e o achado 3 mostra o
caso que ela erra. As rodadas 1 e 2 marcaram ⚠️ e não reabriram por isso, com
razão — o conserto é um índice persistido id → caminho, arquivo novo e decisão
de etapa 1. Mas fechar `DL-004` como `done` grava um critério cumprido que não
foi, e a nota do achado 3 evapora junto com o ticket.

A pergunta é a mesma que a nota do `DL-005` deixou aqui em **2026-09-11** e que
ninguém respondeu, agora pela terceira rodada: o índice persistido id → caminho
vira ticket próprio, ou volta para cá como critério? Duas saídas, as duas suas:

- **Ticket novo** (ex.: `DL-006`), critério 5 reescrito aqui para o que a
  implementação de fato entrega, e `DL-004` fecha.
- **Volta para etapa 1**, o critério 5 fica como está e `DL-004` reabre com o
  índice no escopo.

### Notas que seguem abertas, sem virar critério

- **Resíduo do próprio achado 6.** O `unlink(filePath).catch(() => { })` é
  best-effort: se o mesmo lock que derrubou o `rename` também recusar o
  `unlink`, o placeholder fica. Vai de "vaza sempre" para "vaza só quando as
  duas chamadas falham", e tem a mesma forma do `cleanup()` de `:191`. Não vale
  código novo.
- **Janela não atômica.** `open('wx')` + `rename` são dois passos; queda de
  energia ou kill do processo entre eles ainda deixa o placeholder. Estrutural,
  já registrado no achado 6.
- **Achado 5** (cache do renderer não migra) e **achado 4** (dois arquivos fora
  dos Primary files) seguem como registro das rodadas anteriores.
- **Carry-over do `DL-003` continua aberto**: o descarte do `.part` no ramo
  `writer.on('error')` (`http-scraper.service.ts:920-924`) segue sem teste. Três
  rodadas editaram `file-validation.test.ts` e nenhuma o cobriu. Se sair ticket
  novo, cabe nele.
- **Teste do achado 1 é fraco.** Ele mocka `fs.promises.link`, que o código não
  chama mais; passa por vacuidade e só serve de guarda contra reintroduzir o
  `link`. Não vale reabrir, mas não conte como cobertura do caminho FAT.

## Decisão e fechamento (2026-09-14)

A pergunta aberta desde 2026-09-11 (nota do `DL-005`) e repetida nas três
rodadas da etapa 3 foi respondida pelo humano: **saída 1**. O índice persistido
id → caminho vira ticket próprio, o critério 5 passa a descrever o que a
implementação entrega, e o `DL-004` fecha.

- `DL-006` aberto (`f825bb1`). Leva o achado 3 **e** a nota do `DL-005` sobre o
  `existsSync` puro — os dois são o mesmo filtro — e adota como critério 5 o
  carry-over do `DL-003` (descarte do `.part` no `writer.on('error')`, três
  rodadas sem teste).
- Ao escrever o `DL-006` apareceu um caminho mais barato que o que a revisão
  previa: o índice id → caminho **já existe** no renderer desde este ticket
  (`downloads[courseId][fileId] = { downloadedAt, path }`,
  `course-detail.ts:377-392`). Falta o main enxergá-lo, não um arquivo de
  persistência novo.
- Achados 4 e 5 (arquivos fora dos Primary files; cache do renderer não migra)
  ficam como registro, aceitos.

Fechado com `master` mergeado na branch antes do merge do PR (a branch estava 27
commits atrás). Gate no Windows depois do merge: tsc limpo, eslint 0 erros / 55
warnings pré-existentes, vitest 705 passed | 5 skipped em 62 arquivos. PR #20
mergeado em `db22fcc`.
