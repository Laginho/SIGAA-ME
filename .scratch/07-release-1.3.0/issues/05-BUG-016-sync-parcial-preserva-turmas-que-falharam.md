# BUG-016: Sync parcial em background preserva as turmas que falharam
Status: open
Stage: to-implement
Priority: P0
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/background-sync.service.ts` (montagem e publicação do resultado, `:275-281`, `:305-317`)
  - `shared/ipc.ts` (`BackgroundSyncUpdate`, `:173-184`)
  - `src/pages/dashboard.ts` (`handleBackgroundSyncUpdate` `:80`; listener de `click` em `document` `:206-212`)
  - `src/utils/ui-helpers.ts` (`mergeCoursesIntoCache`, só se precisar de opção nova)
  - `tests/unit/dashboard-listener.test.ts`
  - `tests/unit/merge-courses-cache.test.ts`
  - `tests/integration/background-sync.test.ts`

Itens 8 e 21 do gabarito. Bloqueador de release (item 8).

#### What to build

O background publica só `allCoursesData`, preenchido apenas para turmas que
deram certo. O dashboard mescla com `replaceSet: true` e
`ui-helpers.ts:144` faz `merged = [...incoming]`: uma turma com
`SELECTOR_DRIFT` ou timeout num ciclo perde arquivos e notícias em cache.
`sync-selection.ts:281-293` faz o oposto de propósito (falha bloqueia o
`replaceSet`). O background precisa do mesmo contrato: só um ciclo completo
pode apagar turma do cache.

Item 21, mesmo arquivo: o listener de `click` em `document` é adicionado a
cada render do dashboard e nunca removido; cada render vaza uma closure sobre
o `dropdown` antigo.

#### Acceptance criteria

1. `BackgroundSyncUpdate` diz se o ciclo cobriu todas as turmas (um booleano
   ou a lista das que falharam). O main marca incompleto quando qualquer
   turma falhou, deu timeout ou foi cancelada.
2. Ciclo incompleto: o dashboard mescla sem `replaceSet`; a turma que falhou
   mantém arquivos, notícias e conteúdo de notícia já baixado; as que deram
   certo são atualizadas.
3. Ciclo completo: comportamento atual, `replaceSet: true`, turma que saiu da
   matrícula some do cache.
4. O listener de fechar o dropdown ao clicar fora é registrado uma vez por
   montagem do dashboard e removido quando a página é renderizada de novo:
   depois de N renders há exatamente um listener ativo.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/dashboard-listener.test.ts tests/unit/merge-courses-cache.test.ts tests/integration/background-sync.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/background-sync.test.ts`: com uma turma falhando, o
  payload publicado marca o ciclo como incompleto; com todas ok, completo.
  Vermelho porque o campo não existe.
- `tests/unit/dashboard-listener.test.ts`: (a) payload incompleto sem a
  turma B preserva a turma B no cache com seus arquivos; (b) payload completo
  sem a turma B remove a turma B; (c) renderizar o dashboard três vezes deixa
  um só listener de `click` em `document` (espião em
  `document.addEventListener`/`removeEventListener`, ou comportamento: um
  clique fora fecha o dropdown uma vez). Vermelho em (a) e (c).

## Comments

- Não reaproveite o `failures`+`showError` do `sync-selection`; aqui não há UI
  de progresso, só a decisão de `replaceSet`.
