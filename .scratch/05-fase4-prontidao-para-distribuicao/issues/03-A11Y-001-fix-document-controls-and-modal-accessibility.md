# A11Y-001 — Fix document, controls, and modal accessibility
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `SEC-001`
- Primary files:
  - `index.html`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/sync-selection.ts`
  - `src/pages/settings.ts`
  - `src/styles/main.css`
  - `src/styles/dashboard.css`
  - `src/styles/course-detail.css`
  - `src/styles/sync-selection.css`
  - New: `tests/e2e/accessibility.spec.ts`

#### Required behavior

- Change language to `pt-BR`.
- Label icon-only controls with accessible names.
- Convert clickable cards/rows to semantic buttons or links.
- Add visible `:focus-visible` states and reduced-motion behavior.
- Add `aria-expanded`/`aria-controls` to the notification menu.
- Give the news modal dialog semantics, Escape handling, focus trapping,
  background inertness, and focus restoration.

#### Acceptance criteria

- All primary flows work with keyboard only.
- Modal focus cannot escape while open and returns to the trigger on close.
- Automated accessibility checks have no critical/serious violations in the
  tested screens.

#### Verification

```text
npm run test:e2e -- accessibility
```

#### Implementation notes

- Commit: —
- Automated scanner: —

## Comments

### 2026-09-10 — revisão devolveu a branch `a11y-001` para retrabalho

Branch `a11y-001` (3 commits sobre `40a0d01`, +643/-88) revisada nos dois eixos.
Fecha `lang="pt-BR"`, `aria-expanded`/`aria-controls`, `prefers-reduced-motion`,
os nomes acessíveis dos botões ícone do dashboard e a migração do modal para
`<dialog>` nativo (Escape, trap e restauração de foco vêm do navegador).

Cinco itens introduzidos pela própria branch voltam antes do merge:

1. **Tema escuro quebrado** — `src/styles/sync-selection.css:44,131,139` trocou
   `var(--color-text-muted)` por literais (`#333b4d`, `#303030`, `#404040`) para
   passar no contraste. O arquivo não tem nenhuma regra `[data-theme="dark"]` e o
   container usa `background: var(--color-background)`: no tema escuro fica texto
   quase preto em fundo escuro. Define o par claro/escuro, ou escurece o token no
   `main.css` e volta a usar a var. `course-detail.css:421` foi na direção oposta
   no mesmo commit — os dois hunks se contradizem.
2. **Asserção que não pode falhar** — `tests/e2e/accessibility.spec.ts:130`:
   `document.activeElement?.closest('.news-item') !== null` dá `undefined !== null`
   quando `activeElement` é nulo, ou seja, passa sem foco nenhum.
3. **Scan do axe só no tema claro** — as rotas existem, o tema não. É o que teria
   pego o item 1.
4. **Listener de backdrop acumulando** — `src/pages/course-detail.ts:500`:
   `openNewsModal` roda por abertura e re-registra o listener sem remoção, ao
   contrário do `closeBtn` logo acima, que usa `{ once: true }`.
5. **`aria-labelledby` pendurado** — `src/pages/course-detail.ts:47` aponta para
   `#modalTitle`, que só existe depois de `renderNewsIntoModal`. Nos estados de
   loading e erro o dialog fica sem nome acessível.

Fora desta volta, porque são pré-existentes e não foram criados aqui — viram
follow-up, não retrabalho da branch: `title` nos spans de status
(`course-detail.ts:282`), `markSeenOnHover` sem caminho de teclado
(`.file-item` continua `div` não focável), `:focus-visible` do `main.css:106`
perdendo por especificidade para `.form-input:focus { outline: none }` do
`login.css:63` (e a tela de login fora das rotas do scan), e a hierarquia de
headings do `sync-selection` (o card desabilitado ficou com o único `h2`).

Decisão em aberto, do autor: o scan do axe entra no `npm run quality` ou fica só
no `test:e2e`. Entrar põe Playwright no gate (~16s, e não roda no Linux montado).
A recomendação da revisão foi deixar fora e registrar no `AGENTS.md` que mudança
de cor exige o scan manual.

### 2026-09-10 — retrabalho dos 5 itens

Decisão em aberto resolvida como recomendado: scan fica fora do
`npm run quality`, nota adicionada no `AGENTS.md` (bloco de bindings do
`ticket-flow`).

1. `sync-selection.css` volta a usar `var(--color-text-muted)` (escurecido em
   `main.css`, #6b7280 → #4b5563) e `var(--color-text-main)` nas 3 linhas
   sinalizadas. O scan em tema escuro (item 3) achou mais dois pontos que o
   arquivo nunca cobriu — `.card-title`/`.card-subtitle` sem regra
   `[data-theme="dark"]`, e `.sync-card.disabled`/`:hover` com fundo claro
   fixo — os quatro corrigidos junto, senão o scan novo não fecha verde.
   `dashboard.css` (`.course-code`/`.course-files-count`) e `course-detail.css`
   (`.file-meta`) tinham o mesmo tipo de furo, só que pré-existente; ambos
   também corrigidos.
2. Asserção do teste de foco trocada por comparação de `data-id` — sem
   optional chaining que mascare `activeElement` nulo como "restaurado".
3. Scan do axe roda em tema claro e escuro nas 4 rotas (8 testes agora).
4. `openNewsModal` guarda o listener de clique no fundo numa variável e
   remove no evento `close` nativo do dialog.
5. `#modalTitle`/`#modalMeta` saíram de `modalBody` para o template estático
   do `<dialog>` — sempre existem; `openNewsModal`/`renderNewsIntoModal`
   atualizam o texto em vez de recriar o elemento.

Vermelho antes de qualquer mudança de produção: commit de teste isolado
(`diff --stat` só em `tests/`), rodado contra o código não corrigido antes do
commit de correção. `npx tsc --noEmit`, `npx vitest run` (626 passed, 4
skipped) e `npx playwright test accessibility` (14 passed, tema claro e
escuro) verdes depois.

### 2026-09-10 — segunda revisão: 4 de 5 fechados, item 4 volta

Branch `a11y-001`, 6 commits sobre `40a0d01` (+842/-100), revisada nos dois
eixos. `npm run quality` verde (626 passed, 4 skipped, 0 erro de lint) e
`npm run test:e2e -- accessibility` verde (14 passed, 4 rotas × claro/escuro),
ambos rodados nesta revisão.

Itens 1, 2, 3 e 5 do retrabalho: fechados, verificados no código, não na
descrição. O contraste no escuro usa token de novo e o bloco
`[data-theme="dark"]` que faltava existe; a asserção de foco compara `data-id`
e falha com `activeElement` nulo; o scan cobre os dois temas; `#modalTitle` e
`#modalMeta` são estáticos e recebem texto nos quatro caminhos (loading, dois
de erro, sucesso).

Dois itens seguram o merge:

1. **Item 4 fechou o listener errado** — `src/pages/course-detail.ts:510`:
   `closeBtn?.addEventListener('click', close, { once: true })`. O `once` só
   dispara no clique: fechar por Escape ou pelo fundo deixa o listener
   pendurado, e a abertura seguinte empilha mais um. É exatamente a acumulação
   que o item 4 apontava, agora no listener que o próprio item citava como o
   exemplo certo. `dialog.close()` é idempotente, então não quebra nada hoje —
   mas a causa raiz ficou pela metade. O teste que cobre o item 4
   (`tests/unit/course-detail-a11y.test.ts:121`) fecha pelo botão, o único
   caminho que não vaza; precisa de um que feche por Escape ou pelo fundo.

2. **Os 4 testes de tema escuro não conferem que o tema pegou** —
   `tests/e2e/accessibility.spec.ts:180` escreve `data-theme` **antes** do
   `goto(hash)` e nada verifica depois. Hoje o atributo sobrevive à navegação,
   então os testes são reais; no dia em que um render resetar, os 4 viram
   cópias silenciosas do tema claro sem falhar. Mesma classe do item 2 desta
   lista, que já voltou uma vez. Uma linha:
   `expect(document.documentElement.dataset.theme).toBe(theme)` depois do
   `goto`.

Fora do retrabalho, para o autor decidir:

- `AGENTS.md:20-27` fecha a decisão em aberto (scan fora do gate) como a
  revisão recomendou. Conteúdo certo, mas é arquivo fora dos Primary files e a
  decisão era do autor — confirme ou reverta.
- `tests/unit/renderer-content-security.test.ts:200` teve um teste de `SEC-001`
  reescrito pelo implementador (clique → leitura de atributo). A troca de
  `<div onClick>` por `<a href>` obrigava a algo, mas a asserção nova é mais
  fraca: prova o valor do atributo, não que ele não é interpretado na
  navegação.
- `9a83c26` é commit de código que edita `tests/e2e/accessibility.spec.ts` —
  quebra a separação teste/código. Os outros cinco commits estão limpos.

Follow-up, não retrabalho desta branch:

- `src/utils/dom.ts:35` aceita `href` sem checar esquema, no arquivo cujo
  contrato é ser seguro por construção (`SEC-001`). Os dois chamadores atuais
  prefixam `#/course/`; um `href: sigaaUrl` futuro torna `javascript:`
  executável.
- `.btn-section-action--success` duplicado em `sync-selection.css:291` e
  `course-detail.css:88`, mantido em sincronia por comentário — vira `CLEAN-*`.
- Os follow-ups da primeira revisão continuam abertos, incluindo o
  `:focus-visible` do `main.css:107` perdendo para `login.css:63` numa tela que
  o scan não cobre.

### 2026-09-10 — retrabalho 2 fechado

Os dois itens do handoff
(`.scratch/05-fase4-prontidao-para-distribuicao/handoffs/A11Y-001-rework-2.md`):

1. `closeBtn` não usa mais `{ once: true }` — o listener saía sozinho só
   quando o próprio botão disparava o `close()`; fechar pelo fundo ou Escape
   deixava-o pendurado, e a reabertura seguinte empilhava outro. Removido
   junto com o listener de fundo no `close` nativo do dialog, que dispara nos
   três caminhos. Teste novo fecha pelo fundo duas vezes e pelo botão na
   terceira; contra o código velho falhava em 5 chamadas de `close()` em vez
   de 3.
2. `accessibility.spec.ts` agora confere `data-theme` depois do `goto(hash)`,
   não só antes — hoje já passa (o atributo sobrevive à navegação), a
   asserção só existia para o dia em que parar de sobreviver.

Vermelho antes da correção: `npx vitest run tests/unit/course-detail-a11y.test.ts`
com o teste novo falhando sozinho (9 passed, 1 failed), commit de teste
isolado. Depois da correção: gate (`npm run quality`) verde — 627 passed, 4
skipped, 0 erro de lint — e `npm run test:e2e -- accessibility` verde, 14
passed.

### 2026-09-10 — terceira revisão: retrabalho 2 fechado, um item novo segura o merge

Branch `a11y-001`, 10 commits sobre `40a0d01` (+960/-101), revisada nos dois
eixos. `npm run quality` verde nesta revisão: 51 arquivos, **627 passed, 4
skipped, 0 erro de lint** (62 warnings de `no-explicit-any`, todos
pré-existentes).

Os dois itens do retrabalho 2: **fechados**, verificados no código.

1. `closeBtn?.addEventListener('click', close)` sem `{ once: true }`, e o
   listener do `close` nativo remove os dois (`course-detail.ts:513-524`). O
   `close` do dialog dispara nos três caminhos, então não sobra listener por
   caminho nenhum. O teste novo
   (`tests/unit/course-detail-a11y.test.ts:130`) fecha pelo fundo duas vezes
   antes de fechar pelo botão — é o caminho que o `once` não cobria.
2. `accessibility.spec.ts:182` confere `data-theme` depois do `goto`. A
   asserção falha se o atributo não sobreviver à navegação.

Separação teste/código respeitada nesta volta: `11e0918` só `tests/`,
`173a634` só `src/pages/course-detail.ts`.

#### ❌ Critério 3 (nenhuma violação nas telas testadas) — não é o que cai; cai a correção do item 5 da primeira volta

**`#modalMeta` nunca é limpo entre aberturas do modal.**
`src/pages/course-detail.ts:497` reseta `modalTitle` para "Carregando
notícia..." a cada `openNewsModal`, mas `#modalMeta` só é escrito dentro de
`renderNewsIntoModal` (linha 612). Antes do retrabalho isso não existia: o
header inteiro vivia dentro de `modalBody` e o `replaceChildren` o apagava em
todo caminho. Tirar `#modalTitle`/`#modalMeta` do `modalBody` (item 5 da
primeira volta) resolveu o `aria-labelledby` e abriu este furo.

Consequência, em dois caminhos:

- **Carregando** — abrir uma notícia não cacheada depois de já ter aberto
  outra mostra "Carregando notícia..." com a data e o "🔔 Notificação
  enviada" da notícia **anterior**, durante todo o fetch pelo Playwright
  (segundos).
- **Erro** — os dois caminhos de erro (linhas 586 e 592) trocam o título mas
  deixam a meta antiga embaixo de "Erro ao carregar notícia".

Reproduzido nesta revisão com um teste descartável sobre `renderCourseDetailPage`
(mesmo seam dos testes de `course-detail-a11y`): abrir `n1` com sucesso,
`modal.close()`, abrir `n2` com `getNewsDetail` falhando —
`#modalMeta.textContent` continua `📅 01/01/2026🔔 Notificação enviada`.

Cabe nos Primary files (`src/pages/course-detail.ts`) e é uma linha ao lado do
reset do título, mas **exige teste novo** — volta para a etapa 2 pela regra
mecânica, não por tamanho.

#### Decisões do autor ainda em aberto (repetidas da segunda revisão)

Nenhuma foi tocada no retrabalho 2, como o handoff mandou:

- `AGENTS.md:20-27` — nota de que o scan do axe fica fora do gate. Conteúdo
  certo, arquivo fora dos Primary files, decisão era do autor. Confirme ou
  reverta.
- `tests/unit/renderer-content-security.test.ts:200` — teste de `SEC-001`
  reescrito de clique para leitura de atributo. Mais fraco, mas o vetor antigo
  (interpolação em HTML) deixou de existir junto com o `onClick`.
- `9a83c26` mistura código e teste no mesmo commit. Histórico, não corrigível
  sem reescrever a branch.

#### Follow-up, não retrabalho desta branch

- `src/utils/dom.ts:36` aceita `href` sem checar esquema, no helper cujo
  contrato é ser seguro por construção (`SEC-001`). Foi **introduzido nesta
  branch**, ao contrário do que a segunda revisão disse. Não é explorável hoje
  (os dois chamadores prefixam `#/course/`), mas um `href: sigaaUrl` futuro
  torna `javascript:` executável. Merece ticket próprio, não uma quarta volta.
- Os follow-ups das duas revisões anteriores continuam abertos:
  `.btn-section-action--success` duplicado (`CLEAN-*`), `:focus-visible` do
  `main.css:107` perdendo para `login.css:63` numa tela fora do scan,
  `markSeenOnHover` sem caminho de teclado, hierarquia de headings do
  `sync-selection` (o card desabilitado ficou com o único `h2`), `title` nos
  spans de status do `course-detail`.
