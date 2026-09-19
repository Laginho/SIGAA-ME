# BUG-026: Extrator aceita página de manutenção ou título sem corpo como notícia
Status: open
Stage: to-implement
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
