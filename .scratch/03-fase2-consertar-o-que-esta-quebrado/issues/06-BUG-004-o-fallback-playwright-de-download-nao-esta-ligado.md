# BUG-004 — O fallback Playwright de download não está ligado
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — ciclo PTMR 01 validado pelo master dev; smoke do Bruno em 2026-09-01: o fallback disparou de verdade nos itens de tarefa (`BUG-011`), abriu Chrome dedicado e o log mostrou "Falling back to Playwright"

- Status: `DONE` — ciclo PTMR 01 validado pelo master dev; smoke do Bruno em
  2026-09-01: o fallback disparou de verdade nos itens de tarefa (`BUG-011`),
  abriu Chrome dedicado e o log mostrou "Falling back to Playwright"
- Priority: `P1`
- Owner: PTMR (PLAN 5.6 terra · TEST/READ mimo v2.5 · MAKE muse spark 1.2); master dev Claude
- Dependencies: `PIPE-002` (não mexer sem suíte executável)
- Primary files:
  - `electron/services/download.service.ts` (492 linhas)
  - `electron/services/playwright-login.service.ts:748-980`
  - `electron/services/sigaa.service.ts:149-280`
  - `ARCHITECTURE.md`

#### Problem

O `ARCHITECTURE.md` afirma que o download cai de volta no Playwright quando o
HTTP falha. **O código existe e nunca é alcançado.** Cadeia real verificada em
2026-08-02:

```
main.ts:163 → sigaaService.downloadFile
            → _downloadFileInternal (sigaa.service.ts:149)
            → httpScraper.downloadFile (:221)
            → retry: httpScraper.downloadFile (:261)   ← retry também é HTTP
```

`PlaywrightLoginService.downloadFile` (:748) e `downloadAllFiles` (:864) têm
**zero chamadores** em todo o repositório, incluindo testes. Eles são o único
lugar que carrega `download.service.ts` (via `await import()`). Logo, as 492
linhas do `download.service.ts` são inalcançáveis por transitividade.

Total: **771 linhas de código morto**, e um fallback documentado que não existe.

#### Histórico deste achado (por que exige cuidado)

Três conclusões erradas em sequência — ver a nota de método no `CODE_REVIEW.md`.
Resumo: busca por `import ... from` não vê `await import()`; e provar que um
arquivo é importado não prova que ele é alcançável.

#### Decisão tomada (Bruno, 2026-08-02): LIGAR o fallback

Dado decisivo, fornecido pelo autor: **o download por HTTP falha com frequência e
de forma imprevisível.** O SIGAA é um sistema antigo, malfeito e hostil a
automação.

Isso inverte a recomendação inicial. As 771 linhas **não são gordura — são a
resposta a um problema real que hoje não está conectada.** Apagá-las removeria
justamente a mitigação de uma falha frequente.

| Opção | Status |
|---|---|
| ~~A — apagar as 771 linhas~~ | **Descartada.** Removeria a mitigação de uma falha que ocorre de fato |
| **B — ligar o fallback** | **Escolhida.** Se o HTTP falhar após retry, tenta Playwright |

#### Ordem de execução obrigatória

`BUG-001` **antes** deste. Razão: o `BUG-001` faz o app apagar arquivos válidos
que baixaram com sucesso. Parte do que hoje aparece como "o download falhou" pode
ser o app destruindo o próprio resultado. Ligar um fallback antes de corrigir isso
significaria acionar o Playwright para casos em que o HTTP funcionou — mais lento,
sem ganho, e mascarando o bug real.

Sequência: corrigir `BUG-001` → observar a taxa de falha remanescente → ligar o
fallback para o que sobrar.

#### Escopo da implementação

- Em `sigaa.service.ts:_downloadFileInternal`, após o retry HTTP falhar
  (linha 261), chamar `playwrightLogin.downloadFile` em vez de retornar erro.
- Idem para `downloadAllFiles` → `playwrightLogin.downloadAllFiles`.
- O caminho Playwright **nunca rodou em produção**. Tratar como código novo, não
  como código existente: precisa de teste antes de ser confiável.
- Manter a ordem HTTP-primeiro: o ganho de ~10x é real e o Playwright é o plano B.

#### Acceptance criteria

- Falha de download por HTTP após retry aciona o caminho Playwright.
- Existe teste que exercita o fallback (hoje não há nenhum).
- `ARCHITECTURE.md` passa a descrever o comportamento real — que agora coincide
  com o pretendido.
- O caminho HTTP continua sendo o primeiro tentado.

#### Nota sobre o achado da auditoria

A `docs/AUDITORIA_COMPLEXIDADE.md` classificou estas 771 linhas como o maior
corte disponível. **Não são.** É o exemplo mais claro de por que auditoria de
complexidade não decide sozinha: código inalcançável e código desnecessário
parecem idênticos numa busca estática. A diferença estava num dado sobre o mundo
real — a taxa de falha do SIGAA — que nenhuma ferramenta tinha.

#### Enxugar ≠ deletar (observação do autor, 2026-08-02)

Manter o fallback não obriga a manter as 771 linhas como estão. Depois de ligado
e com teste cobrindo o caminho, ele pode encolher — e aí a refatoração é segura,
porque existe prova de que continua funcionando.

Candidatos, na ordem em que fazem sentido:

1. **Retry em 4 camadas** (`sigaa.service.ts:449-539`, ~60 linhas). Hoje
   `downloadAllFiles` tem retry que se sobrepõe ao retry interno de
   `downloadFile`. Com o fallback Playwright ligado, viram 4 níveis de tentativa
   para o mesmo arquivo. Provavelmente 2 bastam (HTTP com retry → Playwright).
   **Requer dado:** medir a taxa de sucesso por camada antes de cortar.
2. **Duplicação entre `download.service.ts` e `http-scraper.downloadFile`** —
   sanitização de nome, montagem de headers, validação. Extrair o que é comum.
3. `sanitizeFolderName` com regex duplicada e substituto inconsistente
   (`''` em `sigaa.service.ts:128` vs `'_'` em `http-scraper.service.ts:933`).
   Isso é inconsistência real, não só duplicação — dois caminhos geram nomes
   diferentes para o mesmo arquivo.

**Ordem obrigatória:** ligar → testar → medir → enxugar. Encolher antes de ter
teste é o mesmo erro de apagar antes de ter dado, só mais devagar.

#### Acceptance criteria

- Decisão registrada com justificativa.
- `ARCHITECTURE.md` descreve o comportamento real, não o pretendido.
- Se opção A: as 771 linhas removidas e `npx tsc --noEmit` passa.
- Se opção B: existe teste que exercita o caminho de fallback.

#### Resolution (2026-09-01) — ciclo PTMR 01

Opção B implementada (ledger em `.scratch/bug-004/ledger.md`, ciclo limpo):

- `sigaa.service.ts#downloadViaPlaywright()` (privado, união discriminada,
  `error` → `message`) chama `playwrightLogin.downloadFile` com **`basePath`**,
  não `targetDir` — o `DownloadService` cria a pasta da turma sozinho.
- `_downloadFileInternal`: o `return` de erro depois do segundo HTTP virou a
  chamada ao fallback. Ordem preservada: HTTP → refresh + HTTP → Playwright.
- `downloadAllFiles`: depois do passe de retry HTTP, cada `result` ainda `failed`
  com script vai ao fallback, com a mesma contabilidade do passe de retry
  (`downloaded++`, `failed--`, `results[i]` substituído, `onProgress('downloaded')`).
  Deliberado: por arquivo, não `playwrightLogin.downloadAllFiles` — um seam só;
  o custo (um browser por arquivo) está marcado com `// ponytail:` no código.
- `ARCHITECTURE.md` descreve o fluxo real.
- Testes em `sigaa-service.test.ts`: HTTP-first não toca Playwright; duas falhas
  HTTP → Playwright chamado 1× com `basePath`; fallback falha → `message` do
  Playwright; lote com script → `downloaded: 1` via fallback; lote sem script →
  Playwright não chamado. Vermelho-verde provado por MAKE (3 vermelhos).
- Nit do master dev (commit `Role: MASTER`): o teste antigo "fails after second
  HTTP attempt fails" passava por acidente depois da mudança (mock sem retorno →
  `TypeError` → `catch` → `success: false`). Removido; o cenário é coberto pelo
  teste "returns Playwright error message when fallback also fails".
- Pontos abertos, por decisão: o fallback abre browser **visível**
  (`headless: false`, `playwright-login.service.ts:695`) — deixado como estava
  para que uma falha no primeiro uso real seja atribuível; `sanitizeFolderName`
  divergente entre `SigaaService` (remove) e `DownloadService` (`_`, corta em
  100) — item 3 de "Enxugar ≠ deletar", só depois de medir.
