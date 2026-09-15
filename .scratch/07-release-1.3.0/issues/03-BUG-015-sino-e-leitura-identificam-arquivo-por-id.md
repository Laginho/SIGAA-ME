# BUG-015: Sino e estado de leitura identificam arquivo por id
Status: resolved
Stage: done
Priority: P0
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/background-sync.service.ts` (montagem das notificações de arquivo, `:208-219`)
  - `shared/domain.ts` (`NotificationItem`, comentário do `id` em `:129`)
  - `src/utils/notification-store.ts` (`itemKey` para `file`, `pushNotifications`, `seedExistingItemsAsRead` `:136-160`, marca de versão do seed)
  - `src/pages/course-detail.ts` (`isItemRead('file', …)` e `dataset.fileId` em `:278-282`; marcação de lido no clique)
  - `tests/unit/notification-store.test.ts`
  - `tests/integration/background-sync.test.ts`
  - `tests/unit/course-detail.test.ts`

Item 5 do gabarito. Bloqueador de release.

#### What to build

O diff decide "novo" por `id` (`cache.service.ts:133-135`), mas a notificação
nasce com `id: file-${course.id}-${f.name}` e `itemId: f.name`, e o renderer
guarda leitura por nome. Professor reenvia `Lista.pdf` corrigida: é novo para
o diff, dispara notificação do SO e auto-download, mas no sino é descartado
como já existente/lido. Dois arquivos novos de mesmo nome no mesmo sync viram
duas entradas com o mesmo `id`.

Uma identidade só, `f.id`, no main e no renderer. O estado de leitura foi
semeado por nome; trocar a chave sem re-semear marca todo arquivo como não
lido. O seed precisa rodar de novo, por id, uma vez.

#### Acceptance criteria

1. O main monta notificações de arquivo com `id: file-${course.id}-${f.id}`,
   `itemId: f.id` e `itemTitle: f.name`.
2. No renderer, leitura de arquivo é chaveada por id: `isItemRead`/marcação
   no `course-detail`, `dataset.fileId` com o id, e `pushNotifications`
   deduplica pelo novo `id`.
3. Dois arquivos novos com o mesmo nome e ids distintos no mesmo sync viram
   duas entradas no sino, as duas não lidas.
4. Arquivo reenviado (mesmo nome, id novo) vira entrada nova não lida mesmo
   com a antiga já lida.
5. Migração: conta cujo `read-items` foi semeado por nome é re-semeada uma
   vez por id a partir do cache de turmas; nenhum item que existia no cache
   fica não lido depois da migração; o marcador distingue as duas gerações do
   seed e rodar duas vezes não re-semeia. Notícias (já por id) não mudam.
6. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/notification-store.test.ts tests/integration/background-sync.test.ts tests/unit/course-detail.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/background-sync.test.ts`: payload de notificação de
  arquivo carrega `id`/`itemId` por `f.id`; vermelho porque hoje é `f.name`.
- `tests/unit/notification-store.test.ts`: (a) `pushNotifications` com dois
  itens de mesmo nome e ids distintos guarda dois; (b) storage com seed v1
  (chaves por nome) e cache de turmas → depois do seed v2 todo arquivo do cache
  está lido por id e o marcador é v2; rodar de novo não altera. Vermelho porque
  o seed v2 não existe.
- `tests/unit/course-detail.test.ts`: ponto de não lido decidido por id;
  vermelho porque hoje consulta por nome.

## Comments

- O comentário em `shared/domain.ts:129` documenta o formato do `id`; ajuste
  para dizer que `itemId` é o id do material, não o nome. ✅ feito.

#### Resolution (2026-09-15)

Verdict: Approve

Uma identidade só (`f.id`) dos dois lados, e a migração do estado de leitura
fecha o buraco que a troca de chave abriria.

Critérios, um a um:

1. ✅ `background-sync.service.ts:210-215`: `id: file-${course.id}-${f.id}`,
   `itemId: f.id`, `itemTitle: f.name`.
2. ✅ `course-detail.ts:278` (`isItemRead` por `file.id`), `:282`
   (`dataset.fileId` com o id), `:331` (clique marca lido pelo `fileId` que já
   estava em escopo). `pushNotifications` deduplica por `n.id`, que agora
   carrega o `f.id` — nada a mudar lá, e o teste novo tranca isso.
3. ✅ `notification-store.test.ts`, "keeps two entries for two new files that
   share a name but not an id".
4. ✅ `course-detail.test.ts`, "distingue lido/não lido por id quando dois
   arquivos têm o mesmo nome".
5. ✅ `read-items-seed-version` = `v2`; conta em v1 é re-semeada por id a
   partir do cache, o seed passou a unir no set existente (`getReadSet()` em
   vez de `new Set()`), então leitura manual de notícia sobrevive. Notícias
   seguem por `n.id`, sem mudança.
6. ✅ gate verde.

Arquivos: `electron/services/background-sync.service.ts`, `shared/domain.ts`,
`src/pages/course-detail.ts`, `src/utils/notification-store.ts`,
`src/data/account-storage.ts`.

Vermelho-verde: em `651cb66` (commit só de teste), os três arquivos dão
`Test Files 3 failed (3) | Tests 4 failed | 21 passed (25)` — payload do sync
ainda por `f.name`, `course-detail` consultando por nome, e o seed v2
inexistente. Com `44c6fa5` por cima, os quatro passam.

Gate em `35423b0`: `Test Files 65 passed (65)`,
`Tests 739 passed | 5 skipped (744)`, ESLint `0 errors, 52 warnings`
(`no-explicit-any` pré-existentes), `tsc` limpo.

Correção do revisor: `course-detail.ts:316` lia `data-file-id` — que agora
carrega o id — para uma local ainda chamada `fileName`. Comportamento já
estava certo; renomeada para `fileId`, porque confusão nome/id neste arquivo é
exatamente o BUG-015.

Duas observações, nenhuma bloqueante:

- `src/data/account-storage.ts` está fora dos Primary files e foi editado: uma
  linha aditiva no union `AccountStorageKey`, sem a qual o critério 5 não
  compila. Registrado, não revertido.
- A migração deixa as chaves v1 por nome dentro do `read-items` (lixo inerte,
  limitado ao que já existia) e não reescreve os ids das notificações antigas
  já guardadas no sino. Efeito: uma entrada antiga do sino pode aparecer não
  lida enquanto a linha correspondente em disciplina já está lida; clicar nela
  resolve, e o histórico é limitado por `MAX_NOTIFICATIONS`. Não vale código
  novo.
