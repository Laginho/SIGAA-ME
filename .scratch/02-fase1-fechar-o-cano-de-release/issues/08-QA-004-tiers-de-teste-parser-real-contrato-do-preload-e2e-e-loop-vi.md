# QA-004 — Tiers de teste: parser real, contrato do preload, E2E e loop visual
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — implementado na sessão 2026-08-05

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: `PIPE-002`, `QA-002`
- Primary files: `playwright.config.ts`,
  `tests/integration/parser-real.test.ts`, `tests/fixtures/` (+ `README.md`),
  `tests/unit/preload-contract.test.ts`,
  `tests/e2e/app.spec.ts`, `tests/e2e/visual.spec.ts`,
  `tests/e2e/helpers/launch.ts`

#### Por que esta tarefa existe

O `BUG-007` e o `BUG-008` foram encontrados **fora** da suíte, e nenhum dos dois
poderia ter sido encontrado dentro dela: um porque o teste exercitava uma cópia
do código, o outro porque nenhuma camada verificava a fronteira do `window.api`.
Corrigir os dois bugs sem fechar essas duas lacunas deixaria a próxima
ocorrência igualmente invisível.

#### O que foi construído

| Tier | Arquivo | Precisa de | Runner |
|---|---|---|---|
| Parser contra fixture | `tests/integration/parser-real.test.ts` | nada | vitest |
| Contrato do `window.api` | `tests/unit/preload-contract.test.ts` | nada | vitest |
| Visual | `tests/e2e/visual.spec.ts` | nada | playwright |
| E2E sem credencial | `app.spec.ts` (2 testes) | nada | playwright |
| E2E fluxo completo | `app.spec.ts` (3 testes) | `.env` | playwright |

- **Parser real.** Usa o parâmetro `preFetchedHtml` de `getCourseFiles()` para
  curto-circuitar a rede, então roda o mesmo caminho de código de produção sem
  credencial. As fixtures foram extraídas dos literais que estavam dentro do
  `parser.test.ts`.
- **Contrato do preload.** Lê `preload.ts`, `main.ts` e `vite-env.d.ts` como
  texto e cruza as três pontas: canal invocado sem handler, membro chamado pelo
  renderer sem ponte (inclusive escondido atrás de `as any`), ponte não
  declarada. Tem um teste de sanidade do próprio parser, para não passar vazio.
- **Loop visual.** `visual.spec.ts` abre o app de verdade, navega por hash em
  todas as rotas em tema claro e escuro, falha se alguma renderizar vazia e
  falha se sobrou erro no console. PNGs em `_agent_tmp/shots/` para inspeção
  humana — **não** são snapshots comparados automaticamente.

#### Regras que saíram daqui (já no `CLAUDE.md`)

- **`tests/e2e/` é só `*.spec.ts`.** O `playwright.config.ts` fixa
  `testMatch: '**/*.spec.ts'`. Sem isso o Playwright coletava os `*.test.ts` de
  vitest, morria na transformação e **zerava a coleta inteira** — 0 testes, sem
  erro óbvio.
- **Teste não espelha implementação.** Teste novo chama o código de produção.
- **Tier com credencial não roda em loop.** É login real na conta do aluno no
  portal da universidade; rodar em ciclo é dezenas de logins automatizados e
  risco de bloqueio. Manual, antes de release.

#### Limites conhecidos

- As fixtures são **sintéticas** — HTML escrito à mão imitando o SIGAA. Provam
  que o parser casa com a estrutura que assumimos, não que a estrutura assumida
  seja a verdadeira. Procedimento de gravação manual em
  `tests/fixtures/README.md`; gravador automatizado foi deliberadamente adiado
  (script de login não verificado apontado para o portal = risco de bloqueio de
  conta).
- O contrato do preload é checado por **regex sobre o texto** dos arquivos. É
  frágil a mudança de formatação; o teste de sanidade limita o estrago a um
  falso verde improvável, não impossível.
- O loop visual não roda no CI e não compara imagens. Ele responde "renderizou?",
  não "ficou certo?".
- **Conflito a resolver com o `BUG-003`:** o terceiro teste E2E depende de
  `window.api.simulateNewFile()`, que é exatamente a ação de desenvolvimento que
  o `BUG-003` quer remover de produção. Quando o `BUG-003` for feito, esse teste
  precisa de outro gancho ou sai junto.
