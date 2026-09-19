# BUG-024: "Limpar Padrão" reentra Configurações com a rota já trocada
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/settings.ts` (handler de `#clearDownloadsBtn`, `await updateSetting` seguido de `renderSettingsPage(container)` `:166-174`)
  - `tests/unit/settings-stale-response.test.ts` (teste novo, mesmo arquivo do BUG-023)

Janela residual apontada pela revisão do `BUG-023` (`## Comments` daquele
ticket). A guarda do BUG-023 compara o hash capturado na entrada de
`renderSettingsPage`. No handler de "Limpar Padrão" o `await
window.api.updateSetting(...)` acontece **antes** do re-render: se o usuário
navegar durante esse await, `renderSettingsPage` reentra com o hash já novo,
`routeAtMount` captura a rota nova, a guarda passa e Configurações sobrescreve
a página atual. Reproduzido em jsdom pela revisão. A decisão 12 do spec
(`../spec.md`) vedou código novo ali no BUG-023; este ticket a revoga para uma
linha.

#### What to build

No handler, antes de `renderSettingsPage(container)`:
`if (window.location.hash !== routeAtMount) return;` — `routeAtMount` já está
no escopo da closure. Nada mais.

#### Acceptance criteria

1. Montar Configurações, clicar em "Limpar Padrão" com `updateSetting` em
   Promise controlada, trocar o hash para `#/login` e montar login no mesmo
   container, resolver `updateSetting`: `.login-title` continua, `getSettings`
   foi chamado **uma** vez.
2. Os quatro testes existentes de `settings-*.test.ts` passam sem edição.
3. Teste vermelho sem a correção; `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/settings-stale-response.test.ts
    npm run quality
