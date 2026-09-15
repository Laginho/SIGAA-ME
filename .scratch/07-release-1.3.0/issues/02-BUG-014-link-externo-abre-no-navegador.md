# BUG-014: Link externo listado na turma abre no navegador
Status: resolved
Stage: blocked
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `shared/domain.ts` (`CourseFile`, `:71-79`)
  - `electron/services/sigaa.service.ts` (`toCourseFile`, `:38-40`)
  - `src/pages/course-detail.ts` (linha do material com `type === 'link'`, `:285-296`)
  - `tests/unit/sigaa-service.test.ts`
  - `tests/unit/course-detail.test.ts`

Item 14 do gabarito. Mesmo dado do `SEC-004` visto do lado do usuário: lá o
link não pode ser baixado; aqui ele precisa ser abrível.

#### What to build

O parser devolve `ParsedFile.url` para materiais `type: 'link'`
(`http-scraper.service.ts:36-37`), `toCourseFile` descarta o campo,
`CourseFile` não o modela e o renderer mostra um 🔗 inerte. O usuário vê o
material e não consegue abrir. Preservar a URL validada e abrir pelo caminho
externo que o app já tem: o guard do `SEC-003` (`setWindowOpenHandler` /
`will-navigate` em `electron/security/navigation-policy.ts`) manda todo link
para o navegador do SO e pede confirmação para host fora da allowlist.

#### Acceptance criteria

1. `CourseFile` ganha `url?: string`, presente só em `type: 'link'`.
   `toCourseFile` copia `url` quando ela parseia como URL absoluta `http:` ou
   `https:`; qualquer outra coisa (`javascript:`, relativa, vazia) é omitida.
   Para `type: 'file'` nunca há `url`.
2. No `course-detail`, um `link` com `url` renderiza um controle real (botão
   ou `<a>`) com nome acessível "Abrir link externo <nome>" que abre a URL pelo
   mecanismo externo existente (o que o guard do `SEC-003` intercepta). A URL
   entra só como atributo/argumento, nunca por `innerHTML`; o nome via
   `textContent`.
3. Um `link` sem `url` (cache antigo, URL inválida) mantém o ícone inerte com
   `title` "Link indisponível". Sem `TypeError` com cache anterior a este
   ticket.
4. O filtro do "Baixar todos" (`course-detail.ts:462`) continua excluindo
   links.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts tests/unit/course-detail.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/sigaa-service.test.ts`: `toCourseFile` com `https://` mantém
  `url`; com `javascript:alert(1)` omite; `type: 'file'` com `url` no parse
  não carrega `url`. Vermelho porque hoje o campo não existe.
- `tests/unit/course-detail.test.ts`: link com `url` renderiza o controle e o
  clique dispara a abertura externa com exatamente essa URL; link sem `url`
  renderiza o ícone inerte. Vermelho porque hoje só existe o ícone.

#### Resolution (2026-09-15)

Verdict: Needs your call: o critério 1 manda passar `http:` e o guard do
`SEC-003` bloqueia tudo que não é `https:`, então um material `http://`
renderiza um controle que não abre nada.

Decisão: `CourseFile.url` opcional, preenchida em `toCourseFile` por
`extractLinkUrl` (parse com `new URL`, só `http:`/`https:`); no renderer o
link com `url` vira `<a href>` sem `target`, que cai no `will-navigate` e sai
pelo `shell.openExternal` do guard. Sem canal IPC novo, sem `window.open`
(o `setWindowOpenHandler` nega tudo). URL entra por `setAttribute('href')` e o
nome por `textContent`, via `h()`.

Arquivos: `shared/domain.ts`, `electron/services/sigaa.service.ts`,
`src/pages/course-detail.ts`, `tests/unit/sigaa-service.test.ts`,
`tests/unit/course-detail.test.ts`.

Critérios: 1 ✅ · 2 ✅ para `https:`, ❌ para `http:` (ver achado abaixo) ·
3 ✅ · 4 ✅ (o filtro de `course-detail.ts:462` segue excluindo `type === 'link'`,
intocado) · 5 ✅.

Prova red-green — em `771d883` (commit só de teste), `npx vitest run
tests/unit/sigaa-service.test.ts tests/unit/course-detail.test.ts`:
2 arquivos falharam, **3 testes vermelhos**, 29 verdes. Motivos certos:
`expected null not to be null` nos dois do renderer (o `<a>` e o `title`
"Link indisponível" não existiam) e o `toEqual` do serviço acusando a `url`
ausente. Na ponta da branch, `npm run quality` verde: ESLint 0 erros
(52 warnings `no-explicit-any`, todos pré-existentes), **736 testes passando,
5 skipped, 65 arquivos**.

Achados que ficam:

1. **`http:` abre um controle morto.** `extractLinkUrl` aceita `http:` porque o
   critério 1 pede, mas `classifyNavigation`
   (`electron/security/navigation-policy.ts:63`) devolve `blocked` para tudo
   que não é `https:` nem `mailto:` — e
   `tests/unit/navigation-policy.test.ts:218` fixa isso como contrato. Clicar
   num material `http://` só escreve um `log.warn`. Os dois critérios não
   podem valer juntos sem mudar o `SEC-003`: ou o critério 1 estreita para
   `https:` (e o `http:` cai no ícone inerte do critério 3), ou a política de
   navegação passa a abrir `http:`. É decisão de spec, não de revisão — foi
   para o `BUG-019`.
2. **`.btn-open-link` não tem CSS.** O ícone inerte usava `.status-done`, que é
   estilizado; o `<a>` novo entra sem regra nenhuma em
   `src/styles/course-detail.css` (fora dos Primary files), então herda o link
   padrão do Chromium — sublinhado, azul, sem o alvo de 40px que o
   `.btn-download-file` ao lado tem. Cosmético, e também no `BUG-019`.

Nada fora dos Primary files foi tocado. Testes em commit próprio (`771d883`),
código em `02283c7` e `465083f`, nenhum deles mexendo em arquivo de teste.

## Comments

- Como o renderer abre links externos hoje: procure o padrão já usado (link do
  repositório nas configurações, se houver) antes de escolher `window.open`
  ou `<a target="_blank">`. Os dois caem no guard do `SEC-003`; não crie canal
  IPC novo para isso.

- 2026-09-15 Review ended at to-review (exit 0); branch bug-014 holds the review; left for a human
