# BUG-014: Link externo listado na turma abre no navegador
Status: open
Stage: implementing
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

## Comments

- Como o renderer abre links externos hoje: procure o padrão já usado (link do
  repositório nas configurações, se houver) antes de escolher `window.open`
  ou `<a target="_blank">`. Os dois caem no guard do `SEC-003`; não crie canal
  IPC novo para isso.
