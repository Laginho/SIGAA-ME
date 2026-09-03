# CLEAN-001 — Nível 1 da auditoria de complexidade
Status: resolved
Priority: P3
Tracker status at migration: `DONE` — 2026-08-09, commit `700de9a`

- Status: `DONE` — 2026-08-09, commit `700de9a`
- Priority: `P3`
- Owner: Claude (sessão 2026-08-09)
- Dependencies: `PIPE-002`
- Primary files: `electron/services/sigaa-login-ufc.ts` (removido),
  `electron/services/playwright-login.service.ts`

#### O que foi removido

| Alvo | Linhas | Prova de inalcançabilidade |
|---|---|---|
| `electron/services/sigaa-login-ufc.ts` (arquivo todo) | −111 | Única ocorrência de `SigaaLoginUFC` no repo é a própria `export class`. Prova extra: depende de `sigaa-api`, que **não está no `package.json`** — não rodaria nem se fosse chamado |
| `PlaywrightLoginService.enterCourseDirect` | −91 | Única ocorrência é a própria assinatura. É a "Headless API Entry", abandonada; a entrada real é sempre `enterCourseAndGetHTML` |

Total: **−202 linhas, zero adições.** O `import * as cheerio` do
`playwright-login.service.ts` saiu junto: o `enterCourseDirect` era o único
consumidor, e o `noUnusedLocals` teria reprovado.

#### Como a prova foi feita (e por que busca por nome não bastou)

O caso do `download.service.ts` (ver `BUG-004`) já produziu três conclusões
erradas neste repositório. Então, além da busca por nome, foram feitas duas
verificações que aquele caso ensinou:

1. **Import dinâmico.** `await import(` aparece em quatro lugares no projeto:
   `playwright-login.service.ts:763,883` (ambos para `download.service`) e
   `tests/integration/scraper.test.ts:68,82`. Nenhum toca os alvos.
2. **Despacho por string.** Se algo fizesse `servico[nomeDoMetodo]()`, nenhuma
   busca por nome acharia. Zero ocorrências do padrão no repo.

**O que a prova não cobre:** ela é estática. Se algum desses caminhos já foi
alcançado por algo que não está mais no repositório, a busca não vê.

#### Alvo retirado do escopo por decisão do autor

`HttpScraperService.enterCourseHTTP` (−102 linhas) estava na lista e **não foi
removido**. Decisão do Bruno em 2026-08-09, depois de o `tsc` revelar o efeito
colateral: o método é o único leitor de `this.userAgent`, e removê-lo mata uma
cadeia de quatro saltos inteira. Ver `BUG-010`.

#### Verification

Container Linux, `npm install` limpo (a execução no Windows continua sendo a
autoridade):

| Comando | Antes | Depois |
|---|---|---|
| `npx tsc --noEmit` | limpo | **limpo** |
| `npx eslint .` | 0 erros, 125 avisos | **0 erros, 116 avisos** |
| `npx vitest run` | 64 passed, 4 skipped | **64 passed, 4 skipped** |

A catraca de avisos do `PIPE-002` foi respeitada: 125 → 116.

O número de testes não mudar é o resultado esperado e é o próprio argumento do
corte — código inalcançável não tem teste que o exercite, por definição.

#### Fechamento

`npm run quality` rodado no Windows por Bruno, e commitado em `700de9a` —
**junto com o `BUG-001` e com esta documentação**, não em três commits separados
como estava planejado. Ver a nota abaixo.

#### Nota sobre line endings

`http-scraper.service.ts` aparece como `M` no `git status`, mas
`git diff --exit-code` confirma conteúdo **idêntico ao HEAD**. Só o line ending
do working tree mudou (CRLF → LF), efeito de eu ter restaurado o arquivo com
`git show > arquivo` depois da decisão de manter o `enterCourseHTTP`. O
`text=auto` do `.gitattributes` normaliza na entrada, então nada disso chega ao
commit; um `git checkout` no Windows devolve o CRLF.
