# CLEAN-003: Apagar o caminho de download em lote morto
Status: open
Stage: to-implement
Priority: P3
Blocked by: DL-004, OBS-003

- Primary files:
  - `electron/services/playwright-login.service.ts` (só `downloadAllFiles`, `:884` até o fim do método)
  - `electron/services/download.service.ts` (só `downloadCourseFiles`, `:313` até o fim; e o comentário de cabeçalho `:1-9`)
  - `electron/services/sigaa.service.ts` (só o comentário `ponytail:` em `:556`)

#### Leia antes: `downloadAllFiles` existe duas vezes

- `SigaaService.downloadAllFiles` (`sigaa.service.ts:319`) — **vivo**: handler
  IPC `register-handlers.ts:196`, `background-sync.service.ts:213`.
- `PlaywrightLoginService.downloadAllFiles` (`playwright-login.service.ts:884`)
  — **morto**, nenhum chamador. É o único que alcança
  `DownloadService.downloadCourseFiles` (`:972`).

O fallback Playwright de download **está ligado**, por
`PlaywrightLoginService.downloadFile:768` via
`SigaaService.downloadViaPlaywright` (`sigaa.service.ts:189`, chamado de
`:270`, `:311`, `:567`), que por sua vez carrega `DownloadService.downloadFile`
(`playwright-login.service.ts:783`, `:855`). **Esses ficam.** O que morre é só a
variante em lote. Um subagente errou isso em 2026-09-11 antes de subir a
cadeia; não repita.

#### What to build

Remover `PlaywrightLoginService.downloadAllFiles` e
`DownloadService.downloadCourseFiles` (~200 linhas somadas), atualizar o
comentário de cabeçalho de `download.service.ts` (que hoje cita o método morto)
e reescrever o `ponytail:` de `sigaa.service.ts:556`, que sugere trocar o
fallback por-arquivo pelo lote que deixará de existir.

#### Acceptance criteria

1. `grep -rn "downloadCourseFiles" electron src tests` não retorna nada;
   `grep -rn "downloadAllFiles" electron` só retorna `SigaaService`, o handler,
   o preload e o `background-sync`.
2. `PlaywrightLoginService.downloadFile` e `DownloadService.downloadFile`
   continuam intactos: `tests/unit/sigaa-service.test.ts` e
   `tests/integration/download-boundary.test.ts` passam sem alteração.
3. Nenhum `import` ou helper que só o código removido usava sobra
   (`tsc` e `eslint` limpos).

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts tests/integration/download-boundary.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: é remoção de código sem chamador. O critério 2 é a rede
  existente. Se o `tsc` mostrar um chamador que este ticket não listou,
  **pare** — a premissa caiu, volte para a etapa 1.

## Comments

- Decisão pendente do autor: apagar tira a otimização anotada no `ponytail:`
  (`sigaa.service.ts:556`) de trocar um browser por arquivo pelo lote quando o
  retry falhar em massa. Se quiser guardar essa porta, este ticket vira
  "documentar como morto" (comentário no topo de cada método citando este id)
  em vez de apagar. Confirmar antes da etapa 2; o ticket assume **apagar**.
- `docs/PLANO.md` seção 2.5 diz "não remover `download.service.ts`". Continua
  verdade para o arquivo (o `downloadFile` dele é o fallback vivo); só a
  variante em lote sai. Nada a editar no plano.
- Bloqueado por `OBS-003` porque os dois editam
  `playwright-login.service.ts`; por `DL-004` porque ele decide se ainda mexe
  em `download.service.ts:332-346`.
