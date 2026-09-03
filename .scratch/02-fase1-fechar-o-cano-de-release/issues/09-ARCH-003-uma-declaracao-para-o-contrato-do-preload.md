# ARCH-003 — Uma declaração para o contrato do preload
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — implementado na sessão 2026-08-05

- Owner: Claude
- Dependencies: `PIPE-002`
- Primary files: `shared/ipc.ts`, `electron/preload.ts`, `src/vite-env.d.ts`,
  `tests/unit/preload-contract.test.ts`

#### Por que esta tarefa existe

Correção de raiz para a classe de bug que produziu `BUG-002`, `BUG-006`,
`BUG-007` e `BUG-008`: **duas pontas que deveriam se corresponder, e nada
verificando a correspondência.** Corrigir os quatro individualmente deixaria o
quinto igualmente possível.

No caso do `window.api`, a forma do contrato era escrita à mão em **dois**
arquivos — `src/vite-env.d.ts` (o que o renderer pode chamar) e
`electron/preload.ts` (o que a ponte implementa). Nada comparava os dois. Foi
assim que `getSettings` ficou declarada sem ponte.

#### Fix

`shared/ipc.ts` passou a exportar `RendererApi`, e as duas pontas o usam:

```ts
// electron/preload.ts
const api: RendererApi = { ... }
contextBridge.exposeInMainWorld('api', api)

// src/vite-env.d.ts
interface Window { api: RendererApi }
```

Ponte faltando deixou de ser bug de runtime e virou erro de compilação.

#### Por que não derivar o tipo da implementação

`api: typeof import('../electron/preload').api` seria menos código ainda e foi
descartado: `ipcRenderer.invoke` devolve `Promise<any>`, então derivar apagaria
todos os retornos declarados e reabriria a porta do `BUG-006` — campo lido que o
main nunca devolveu. O retorno anotado é justamente o que o typecheck confere.
Uma declaração explícita, verificada contra a implementação, é o ponto de
equilíbrio.

#### Detalhe que o compilador cobrou

Repetir a assinatura genérica de `updateSetting` na implementação **não compila**:
duas assinaturas genéricas com `Extract<...>` diferido não se provam
equivalentes. A solução é omitir os tipos na implementação e deixar a tipagem
contextual vir do `RendererApi` — menos código e mais estrito.

#### Verificação (mutação, não leitura)

| Mutação | Resultado |
|---|---|
| Remover a ponte `getSettings` do preload | `tsc` falha: `TS2741: Property 'getSettings' is missing in type ... but required in type 'RendererApi'` |
| Trocar o canal por `'get-app-settingz'` | `preload-contract.test.ts` falha, listando o canal órfão |
| Nenhuma mutação | `tsc` limpo, `eslint` 0 erros / 123 avisos, 64 passed / 4 skipped |

#### O que continua fora do alcance do tipo

O canal é uma string passada ao `ipcRenderer.invoke`; o `tsc` não sabe se existe
`ipcMain.handle` do outro lado. Amarrar isso exigiria uma **terceira** lista
escrita à mão — mais um par para divergir — ou reestruturar o `main.ts` para um
`Record<Channel, Handler>` exaustivo, que é escopo do `SEC-002`. Até lá, essa
metade fica com `tests/unit/preload-contract.test.ts`, que lê o `main.ts` (a
fonte da verdade) como texto.

Consequência: o teste de contrato perdeu o caso "declara no `vite-env.d.ts` tudo
que o preload expõe" — agora impossível por construção — e ficou com os dois que
o tipo não cobre: canal sem handler, e chamada escondida atrás de `as any`.
