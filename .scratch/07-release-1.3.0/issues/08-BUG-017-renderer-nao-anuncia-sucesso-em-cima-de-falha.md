# BUG-017: Renderer não anuncia sucesso em cima de falha
Status: resolved
Stage: done
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/settings.ts` (as seis chamadas de `updateSetting`: `:148`, `:158`, `:174`, `:198`, `:208`, `:214`)
  - `src/pages/sync-selection.ts` (`loadAllNews` sem `else`, `:266-270`)
  - `src/main.ts` (promessa inicial de `getSettings` `:47`; rejeição do `tryAutoLogin` `:65`)
  - `src/pages/dashboard.ts` (`.catch(console.error)` em `:371`)
  - `tests/unit/sync-selection.test.ts`
  - New: `tests/unit/settings-result.test.ts`

Itens 3 e 12 do gabarito, mais as promessas sem tratamento da lista de Slop
(dois relatórios). Mesmo padrão: o renderer recebe um resultado e não olha.

#### What to build

Item 3: os seis controles de configuração descartam o `AppResult` de
`updateSetting`. O `fail('STORAGE')` que o `DATA-003` fez o main devolver vira
toast de sucesso e controle no valor novo, com o disco no valor antigo.

Item 12: no modo completo, `if (contentResult.success) news = …` sem `else`;
falha de `loadAllNews` não entra em `failures`, o `replaceSet` roda e a tela
anuncia "Finalizado!" com notícias faltando.

Promessas: a leitura inicial de settings em `src/main.ts:47` não tem `.catch`
(vira `unhandledrejection`); a rejeição do `tryAutoLogin` é indistinguível de
"sem sessão"; `dashboard.ts:371` faz `.catch(console.error)`, que é o
`try/catch` que só loga da regra 3 do `CLAUDE.md`.

#### Acceptance criteria

1. Cada um dos seis controles: `success: false` mostra toast de erro com a
   mensagem do resultado, volta o controle ao valor anterior e não mostra
   toast de sucesso; `success: true` mantém o comportamento de hoje.
2. Modo completo: falha de `loadAllNews` acrescenta a turma a `failures` com a
   mensagem; a turma ainda é mesclada com seus arquivos; a tela final é a de
   falha (sem `replaceSet`, sem "Finalizado!").
3. `src/main.ts`: rejeição da leitura inicial de settings não vira
   `unhandledrejection`; o tema fica no padrão.
4. `src/main.ts`: rejeição (exceção) do `tryAutoLogin` mostra toast de erro
   antes de rotear para o login; `success: false` continua silencioso.
5. `dashboard.ts:371`: o rótulo de último sync é cosmético; a falha é
   ignorada de forma explícita (comentário de uma linha), sem `console.error`.
6. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/settings-result.test.ts tests/unit/sync-selection.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/settings-result.test.ts` (montagem da página como em
  `tests/unit/settings-a11y.test.ts`): `window.api.updateSetting` resolvendo
  `{ success: false, error: { code: 'STORAGE', message } }` para cada um dos
  seis controles → toast de erro, controle revertido, nenhum toast de sucesso.
  Vermelho seis vezes.
- `tests/unit/sync-selection.test.ts`: `loadAllNews` falhando em modo completo
  → turma em `failures`, `replaceSet` não roda, mensagem final de falha.
  Vermelho porque hoje anuncia "Finalizado!".
- Critérios 3 a 5 não têm teste unitário razoável (boot do renderer); a etapa
  3 confere por leitura. Não é motivo para pular a etapa 2 nos outros.

#### Resolution (2026-09-15)

Verdict: Approve

PR #35, merge `86e6295`. Commits: `06e5d4a` (testes) e `d161c30` (correção).

Decisão: os seis controles passaram a checar `result.success`, reverter o
controle ao valor anterior e mostrar `toast.error(result.error.message)`, sem
toast de sucesso. O `syncIntervalSelect` reverte para `settings.syncInterval` do
mount e só atualiza esse campo no sucesso — a segunda tentativa reverte para o
valor certo. No sync completo, `loadAllNews` falho entra em `failures`; a turma
segue mesclada com seus arquivos e o `failures.length > 0` já existente bloqueia
o `replaceSet` e cai no `showError`. As três promessas: `.catch` na leitura
inicial de settings, `toast.error(errorMessage(error))` na rejeição do
`tryAutoLogin` antes do `route()`, e o `.catch(console.error)` do rótulo
cosmético do dashboard virou ignore comentado.

Arquivos: `src/pages/settings.ts`, `src/pages/sync-selection.ts`, `src/main.ts`,
`src/pages/dashboard.ts`, `tests/unit/settings-result.test.ts` (novo),
`tests/unit/sync-selection.test.ts`. Nada fora de `Primary files`.

Red-green: com o `src/` de `06e5d4a` e os testes de HEAD, `7 failed | 14 passed`
— os seis controles e o sync completo. Em HEAD, `21 passed`.

Gate: `npm run quality` verde — typecheck limpo, ESLint 0 erros (52 warnings de
`no-explicit-any`, pré-existentes), `67 arquivos, 757 passed | 5 skipped (762)`.
CI do PR verde nos três jobs.

Critérios 1 a 6 ✅. Os critérios 3 a 5 foram conferidos por leitura, como o
ticket previu. Nenhum achado de revisão; nada reaberto, nada parked em `CLEAN-*`.

## Comments

- O toast de erro do renderer já existe (`tests/unit/toast.test.ts`); use-o,
  não crie outro.
