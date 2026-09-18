# CLEAN-014: `--sigaa-dev` continua injetada no main sem consumidor no preload
Status: resolved
Stage: done
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/main.ts` (`:154`)
  - `tests/unit/preload-dev-gate.test.ts` (`:82`, `:104`, `:126`)

Achado 3 da auditoria `docs/audits/2026-09-17-c80ce5d.md`; restante do Slop
"flag dev morta" da auditoria anterior.

#### What to build

O preload decide o bridge de dev por `SIGAA_DEV_BRIDGE` (`preload.ts:78`).
A flag `--sigaa-dev` em `main.ts:154` não é lida por ninguém. Três casos de
`preload-dev-gate.test.ts` ainda filtram argv por ela em preparo que não
influencia o que afirmam.

Retirar a injeção no main e os filtros sem efeito nos três casos. Preservar o
teste que prova que argv **não** autoriza o bridge em produção.

#### Acceptance criteria

1. `grep -rn "sigaa-dev" electron src tests` retorna só o teste que prova que
   argv não autoriza o bridge (ou nada, se ele não precisar da string).
2. Os testes de `preload-dev-gate.test.ts` continuam com as mesmas asserções.
3. `npm run quality` verde.

#### Verification

    grep -rn "sigaa-dev" electron src tests
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: é remoção de código morto. Etapa 2 pula o commit vermelho
  e registra isso no relatório.

#### Resolution (2026-09-18)

Verdict: Needs your call: os três critérios estão cumpridos, mas o corte zera a
entrada adversarial da leg empacotada do teste do `DEV-001` — o motivo exato
pelo qual `DEV-001` (revisão), `CLEAN-007` (item 8) e `CLEAN-011` (item 4) não
cortaram e registraram "quem quiser o corte reescreve aquele teste primeiro".

Decisão: mesclada na branch de sessão `sweatshop/2026-09-18-0902` em `584ef85`
(`--no-ff`). Rebase dispensado: a ponta da sessão (`db16a4a`) é a base da
branch. Em runtime a mudança é segura: a autoridade do bridge é
`SIGAA_DEV_BRIDGE` (`preload.ts:78`, `main.ts:143-147`), e as legs 1 e 2 do
teste de fronteira continuam a prová-la. O que fica para decidir é a leg 3,
sob `## Comments`.

Arquivos: `electron/main.ts` (-1), `tests/unit/preload-dev-gate.test.ts` (-8/+1
na etapa 2; -2/+1 na revisão, só comentário), este ticket.

Commits: `7b3f7e0` (corte da injeção e do setup morto, etapa 2), `68bab02`
(revisão: cabeçalho do teste, só texto). Sem commit vermelho — remoção de código
morto, como o ticket manda; o corpo de `7b3f7e0` registra isso.

Prova vermelho-verde: não se aplica, nenhum teste novo. O que prova o corte é o
critério 1: `grep -rn "sigaa-dev" electron src tests` devolve só
`tests/integration/dev-cache-mutation-boundary.test.ts` (`:111`, `:138`,
`:169`); nada em `electron/` nem em `src/`.

Gate `npm run quality` (2026-09-18, em `7b3f7e0` e em `68bab02`): typecheck
limpo; ESLint 0 erros, 40 warnings (`no-explicit-any` legado, nenhum novo);
vitest `Test Files 72 passed (72)`, `Tests 806 passed | 5 skipped (811)`.

Critérios: 1 ✅ (só o teste de fronteira; ver achado 1), 2 ✅ (quatro `it`,
todos os `expect` idênticos aos da base; saíram `originalArgv`, o save/restore
dele e os três filtros), 3 ✅.

Achados (Standards e Spec, dois agentes cegos, convergentes no primeiro):

1. **A leg 3 do `DEV-001` ficou vazia.** `bootMain` devolve
   `additionalArguments ?? []` (`:117`); sem a linha do `main.ts`, `devArgs` e
   `productionArgs` são `[]`, e `loadPreload([...productionArgs, ...devArgs])`
   (`:179`) passou a ser igual a `loadPreload(productionArgs)` (`:173`). `:169`
   afirma `not.toContain` sobre `[]`; o título em `:138` nomeia uma flag que
   ninguém injeta. Uma regressão do preload para
   `env === '1' || argv.includes('--sigaa-dev')` passaria a suíte; antes deste
   corte, `:180` pegava. O que continua provado: a autoridade por env (leg 1
   expõe `testApi` com env, leg 2 não expõe sem env) e a regressão para gate só
   por argv (leg 1 falharia). O corpo de `7b3f7e0` ("still proves argv alone
   does not authorize the bridge") afirma mais do que o teste exercita hoje;
   fica corrigido por este bloco. O conserto exige editar
   `tests/integration/dev-cache-mutation-boundary.test.ts`, fora dos Primary
   files; nenhum critério numerado caiu, então não é reabertura — é decisão da
   etapa 1, sob `## Comments`. O cabeçalho de `preload-dev-gate.test.ts`
   apontava esse cenário como coberto; `68bab02` tirou a cláusula.
2. **Commit misto, letra da regra.** `7b3f7e0` edita `electron/main.ts` e
   `tests/unit/preload-dev-gate.test.ts` juntos; a regra é "stage 2 does not
   touch test files in a code commit", e a cláusula do ticket dispensa só o
   commit vermelho. Conferido hunk a hunk: nenhum `expect` mudou, só setup morto
   (o preload nunca leu `process.argv`), então o que a separação protege — o
   `diff --stat` provar que o teste não foi dobrado ao código — está intacto.
   Precedente: `CLEAN-011` item 4 fez a mesma limpeza em commit próprio. Não
   reescrevi histórico. Para a etapa 1: ticket de código morto que toca arquivo
   de teste deve dizer "limpeza do teste em commit próprio".
3. Sem violação das regras 1–7 do `CLAUDE.md`; nenhum smell da baseline
   introduzido (o diff é só remoção). `ARCHITECTURE.md` não cita
   `additionalArguments` nem a flag; nada a atualizar.

## Comments

Decisão pendente (revisão 2026-09-18) sobre a leg 3 de
`tests/integration/dev-cache-mutation-boundary.test.ts:176-182`, fora dos
Primary files deste ticket. Três saídas; a etapa 1 escolhe e, nas duas
primeiras, abre ticket com esse arquivo em Primary files e critério numerado:

- (a) Alimentar a leg empacotada com um token literal
  (`loadPreload([...productionArgs, '--sigaa-dev'])`) e ajustar `:138`/`:169`
  ao que sobra. É a única forma de manter uma entrada adversarial de argv agora
  que o main não injeta nada. A revisão do `DEV-001` preferia ler a injeção real
  do main a um literal; com a injeção removida, essa preferência não tem mais
  objeto. Recomendação da revisão.
- (b) Aceitar que argv não participa mais e apagar a leg 3 e as referências à
  flag em `:111`, `:138`, `:169`.
- (c) Reverter o corte (restaurar `additionalArguments` no `main.ts`), como as
  três revisões anteriores escolheram.
