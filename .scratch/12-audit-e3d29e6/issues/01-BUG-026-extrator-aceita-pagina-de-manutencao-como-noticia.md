# BUG-026: Extrator aceita página de manutenção ou título sem corpo como notícia
Status: resolved
Stage: done
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/playwright-login.service.ts` (`getNewsDetail`, o `page.evaluate` de parse e a guarda final `:940-1052`)
  - `tests/unit/` — teste novo sob `// @vitest-environment jsdom` (etapa 2 escolhe o nome)

Achado 1 (Broken) da auditoria `docs/audits/2026-09-19-e3d29e6.md`,
reproduzido pelo auditor com Chrome real: clicar em `Visualizar` substituiu
o documento por `<div id="conteudo"><div>Sistema temporariamente indisponível
para manutenção. Tente novamente mais tarde.</div></div>`; o método devolveu
`success: true`, título vazio e o aviso como `content`. Controle com só
título devolveu sucesso com `content: ""`. Decisões 1 a 4 de `../spec.md`.

#### What to build

Quando o clique numa notícia termina numa página que não é notícia
(manutenção, sessão expirada, layout desconhecido) ou numa notícia sem corpo
reconhecível, o app devolve falha em vez de gravar esse texto no cache
offline. O lote (`BUG-025`) e o botão "Carregar todas" já tratam
`success: false`; o cache anterior fica intacto.

O `evaluate` passa a informar de onde o corpo veio. Corpo só conta quando
vem das estratégias 1 a 3 (rótulo "Texto", seletores de container). A
estratégia 4 (maior bloco em `#conteudo`) continua existindo só para o
diagnóstico: se for a única que achou algo, o serviço salva o HTML e
devolve `success: false`. Título vazio também é falha.

#### Acceptance criteria

1. Documento com tabela `Título`/`Texto` → `success: true`, título e
   corpo preenchidos, igual a hoje.
2. Documento de manutenção (`#conteudo` com um `div` de aviso, sem rótulo
   `Título`) → `success: false`; o aviso não aparece em `news.content`.
3. Documento com `Título` e sem corpo reconhecível → `success: false`, com
   mensagem distinta do critério 2.
4. Documento de sessão expirada (formulário de login dentro de
   `#conteudo`) → `success: false`.
5. Em todos os casos de falha, `diagnosticsService.saveRaw` é chamado com o
   HTML da página.
6. Teste de regressão vermelho sem a correção para os critérios 2 e 3. O
   teste roda o callback passado a `page.evaluate` contra o `document` do
   jsdom, com Page falsa que só expõe o que `getNewsDetail` chama
   (`evaluate`, `content`, `waitForLoadState`, `waitForTimeout`, `$$`/`click`
   ou o que o passo 2 usa para achar o link).
7. `news-detail-batch-failure.test.ts` e `sigaa-service.test.ts` passam sem
   edição.
8. Nenhum arquivo em `src/`, `shared/` ou `sigaa.service.ts` é tocado.
9. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/<teste novo> tests/unit/news-detail-batch-failure.test.ts tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Teste novo em `tests/unit/` com `// @vitest-environment jsdom`, mock de
  `electron`, do logger e de `diagnosticsService` (`saveRaw` como `vi.fn`).
  Instancia o `PlaywrightLoginService` real e injeta uma Page falsa cujo
  `evaluate(fn)` faz `document.body.innerHTML = fixture` e devolve `fn()`.
  Quatro fixtures inline: tabela título/texto, manutenção, só título,
  formulário de login. Cada caso confere `success`, `content` e a chamada de
  `saveRaw`.

#### Resolution (2026-09-19)

Verdict: Approve

**Decisão.** As quatro decisões do `spec.md` foram implementadas como escritas.
`getContent` devolve `{ html, source }`; só `label` (rótulo `Texto`) e
`container` (seletores conhecidos) contam como corpo (`:1068`). A estratégia 4
continua existindo marcada como `largest-block` e nunca vira sucesso. Título
vazio (`:1062`) e corpo não reconhecido (`:1069`) falham com mensagens
distintas, cada uma com `saveRaw` próprio. O `contentSource` fica no
`evaluate`: o objeto `news` devolvido é montado campo a campo e não vaza o
diagnóstico para o renderer nem para o cache.

Ganho lateral: os dois `saveRaw` novos usam `newsDetailSafeId` (sanitizado em
`:936`) no lugar do `${newsId}` cru que o código antigo interpolava no nome do
arquivo.

**Arquivos.**

- `electron/services/playwright-login.service.ts` (+42/−13), commit `e09ee9d`
- `tests/unit/news-detail-maintenance-page.test.ts` (novo, +107), commit
  `b22444f`

`diff --stat` separado: o commit de teste não toca fonte, o commit de fonte não
toca teste. Critério 8 confirmado — `src/`, `shared/` e `sigaa.service.ts`
intactos.

**Vermelho-verde.** Com `playwright-login.service.ts` revertido para `b22444f`
e o teste novo no lugar: `2 failed | 2 passed` — falham exatamente manutenção e
título-sem-corpo (critérios 2 e 3). Com a correção: `4 passed`.
`news-detail-batch-failure.test.ts` e `sigaa-service.test.ts` passam sem edição
(45 testes nos três arquivos, critério 7).

**Gate.** `npm run quality` verde: 0 erros de ESLint (40 warnings
`no-explicit-any`, todos pré-existentes), 76 arquivos, 837 passed | 5 skipped.
CI do PR #54 verde nos três jobs.

**Consumidores.** `loadAllNews` não empurra o item para `enrichedNews` quando o
detalhe falha e devolve `fail` com a contagem do BUG-025; `course-detail.ts` só
escreve no cache no ramo `result.success`. A cópia offline anterior sobrevive.

**Efeito aceito, registrado para não virar surpresa.** Uma notícia real cujo
corpo o portal não entrega agora reprova o lote inteiro de "Carregar todas" com
`N de M notícias sem conteúdo`, onde antes entrava com `content: ""`. É o que a
decisão 1 do spec escolheu ao preferir sync que falha a cache errado.

## Comments

Duas observações da revisão, nenhuma bloqueante e nenhuma virou ticket:

1. `expect(mocks.saveRaw).toHaveBeenCalled()` no caso de manutenção é fraca — o
   `saveRaw` de diagnóstico da linha 937 roda antes do parse e a satisfaria
   sozinho. A prova real do critério 2 é o `success: false`, e essa foi
   vermelha.
2. `playwrightLogin.getNewsDetail` continua devolvendo
   `{ success: boolean; news?; error? }` em vez de união discriminada (regra 6
   do `CLAUDE.md`). Pré-existente, está na assinatura (`:835`), fora da faixa
   declarada em Primary files, e o `sigaa.service` já converte para `AppResult`.
