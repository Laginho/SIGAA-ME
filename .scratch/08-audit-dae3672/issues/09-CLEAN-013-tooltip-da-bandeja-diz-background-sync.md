# CLEAN-013: Tooltip do ícone da bandeja diz "SIGAA-ME Background Sync"
Status: open
Stage: implementing
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/main.ts` (`tray.setToolTip`, `:290`)

Reportado por Bruno em 2026-09-17 com screenshot: ao passar o mouse no ícone
da bandeja do Windows, o tooltip mostra "SIGAA-ME Background Sync". O nome do
app é "SIGAA-ME"; o resto é detalhe interno. Não é bug, é texto. Não vem da
auditoria `dae3672`.

#### What to build

Trocar a string em `electron/main.ts:290` para `'SIGAA-ME'`. Uma linha. O
menu de contexto (`Abrir SIGAA-ME`, `Sincronizar Agora`, `Sair`) já está
certo e não muda.

#### Acceptance criteria

1. `tray.setToolTip` recebe exatamente `'SIGAA-ME'`.
2. `grep -rn "Background Sync" electron src` só devolve comentários.
3. `npm run quality` verde.

#### Verification

    npm run quality
    grep -rn "Background Sync" electron src

## Tests stage 2 writes (own commit, red)

- Nenhum. String de UI numa chamada de API do Electron; o item 5 do
  `CLAUDE.md` vale para bug, e isto não é bug. Se o revisor quiser prova,
  o critério 2 é o teste.

## Comments

- Nenhum.
