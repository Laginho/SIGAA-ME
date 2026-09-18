# CLEAN-014: `--sigaa-dev` continua injetada no main sem consumidor no preload
Status: open
Stage: to-implement
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
