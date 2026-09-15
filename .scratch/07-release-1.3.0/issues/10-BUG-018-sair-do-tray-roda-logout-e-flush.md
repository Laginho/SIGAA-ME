# BUG-018: "Sair" do tray roda logout e flush
Status: open
Stage: to-implement
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/main.ts` (`before-quit` `:199-222`; item "Sair" do tray `:288`)
  - New: `tests/unit/quit-shutdown.test.ts`

Item 16 do gabarito. Sol.

#### What to build

O item "Sair" do tray faz `isQuitting = true; app.quit()`. O handler de
`before-quit` é `if (!isQuitting)`, então nesse caminho `sigaaService.logout()`
(fecha o Chrome do Playwright) e `logger.flush()` não rodam. Fechar pela janela
faz o desligamento certo; sair pelo tray deixa Chrome órfão e log truncado.

#### Acceptance criteria

1. "Sair" do tray passa pelo mesmo desligamento: `logout()` com o teto de 5 s,
   depois `logger.flush()`, depois `app.quit()` de verdade.
2. O `app.quit()` reentrante de dentro do handler não repete o desligamento
   (a flag continua servindo a isso).
3. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/quit-shutdown.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/quit-shutdown.test.ts`, com o mesmo `vi.mock('electron', …)` e
  import do `main` que `tests/unit/updater-consent.test.ts:40-82` já usa:
  captura o template do `Menu.buildFromTemplate`, chama o `click` do item
  "Sair", e afirma que `sigaaService.logout` e `logger.flush` foram chamados
  antes de `app.quit` seguir. Vermelho porque hoje o clique só seta a flag.

## Comments

- A correção menor é o "Sair" chamar só `app.quit()` e deixar o `before-quit`
  fazer o resto. Se o teste ficar mais simples com o desligamento extraído
  numa função exportada, pode; não crie módulo novo para isso.
