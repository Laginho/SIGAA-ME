# BUG-018: "Sair" do tray roda logout e flush
Status: resolved
Stage: done
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

#### Resolution (2026-09-15)

Verdict: Approve

A correção é a menor que o ticket previa: o "Sair" do tray perdeu o
`isQuitting = true` e chama só `app.quit()`. O `before-quit` vê a flag ainda
`false`, dá `preventDefault()` de forma síncrona (primeira instrução, antes de
qualquer `await`, então a prevenção vale), roda `logout()` sob o teto de 5 s,
`logger.flush()` e então o `app.quit()` de verdade — que reentra no handler já
com `isQuitting = true` e não repete nada. Critérios 1 e 2 atendidos. Nenhuma
abstração nova, nenhum módulo criado.

O outro consumidor da flag continua correto: o `win.on('close')`
(`electron/main.ts:191`) só esconde a janela enquanto `!isQuitting`, e no novo
caminho a flag já está `true` quando o quit real dispara o close.

Fora de escopo, não corrigido: dois cliques em "Sair" em sequência rápida ainda
abortam o desligamento pendente (o segundo `before-quit` vê a flag `true` e
deixa o quit seguir). É comportamento anterior à mudança, idêntico ao de
janela + tray, e a correção não o piora.

Arquivos: `electron/main.ts` (`:288`), `tests/unit/quit-shutdown.test.ts` (novo).
Ambos dentro dos Primary files.

Prova red-green: com `electron/main.ts` revertido para `32513e5`,
`npx vitest run tests/unit/quit-shutdown.test.ts` falha em
`quit-shutdown.test.ts:116` — `expected "vi.fn()" to be called 1 times, but got
0 times` (o `logout` não roda). Com a correção, passa. O teste importa
`electron/main` de verdade e dispara o `click` do item "Sair" capturado do
`Menu.buildFromTemplate`; não é cópia da lógica.

Gate: `npm run quality` verde — 0 erros de lint (52 warnings `no-explicit-any`
pré-existentes), 67 arquivos de teste, 753 passed | 5 skipped (758).

Merge: `ae15f3a`, na sessão `sweatshop/2026-09-15-2032`.
