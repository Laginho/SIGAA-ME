# CLEAN-013: Tooltip do ícone da bandeja diz "SIGAA-ME Background Sync"
Status: resolved
Stage: done
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

#### Resolution (2026-09-17)

Verdict: Approve

Decisão: a mudança é exatamente a linha que o ticket pediu, e os três
critérios passam. Nada fora dos Primary files.

Arquivos: `electron/main.ts:290` (`tray.setToolTip('SIGAA-ME')`), commit
`c4d2f06`.

Critérios:

1. ✅ `tray.setToolTip('SIGAA-ME')` — string exata, `electron/main.ts:290`.
2. ✅ `grep -rn "Background Sync" electron src` devolve só dois comentários
   (`electron/preload.ts:57`, `src/pages/settings.ts:172`).
3. ✅ gate verde.

Prova red-green: não se aplica. O ticket dispensou teste na etapa 1 e o
revisor concorda — é string de UI passada a uma API do Electron, sem lógica
que possa regredir em silêncio; o critério 2 é a checagem permanente. Nota
para a etapa 1: um teste que afirmasse o argumento do `setToolTip` seria
barato, porque seis suítes já mockam `Tray` com `setToolTip: vi.fn()`. Não
justifica reabrir por uma string cosmética.

Gate (`npm run quality`, Windows): typecheck limpo, ESLint 0 erros e 40
warnings (`no-explicit-any`, todos pré-existentes), vitest 71 arquivos,
801 passed | 5 skipped.

Observação fora do escopo: o `--max-warnings 40` do lint está exatamente no
limite — o próximo `any` que alguém adicionar derruba o gate. Não é desta
issue; vale um `CLEAN-*` se incomodar.
