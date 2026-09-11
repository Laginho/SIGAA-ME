# A11Y-001 — Fix document, controls, and modal accessibility
Status: resolved
Stage: done
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
  - `tests/unit/sync-selection-a11y.test.ts`
  - `tests/unit/course-detail-a11y.test.ts`
  - `tests/unit/dashboard-a11y.test.ts`
  - `tests/unit/renderer-content-security.test.ts` (só o bloco do dashboard,
    `href` do link de notificação)

#### Required behavior

- Change language to `pt-BR`.
- Label icon-only controls with accessible names.
- Convert clickable cards/rows to semantic buttons or links.
- Add visible `:focus-visible` states and reduced-motion behavior.
- Add `aria-expanded`/`aria-controls` to the notification menu.
- Give the news modal dialog semantics, Escape handling, focus trapping,
  background inertness, and focus restoration.

#### Acceptance criteria

1. All primary flows work with keyboard only.
2. Modal focus cannot escape while open and returns to the trigger on close.
3. Automated accessibility checks have no critical/serious violations in the
   tested screens.

Critérios 4–8 desdobrados em 2026-09-11 dos achados da terceira revisão e da
`QA-007` (comentários abaixo). Todos são regressão ou lacuna introduzida pela
branch `a11y-001`.

4. `#modalMeta` é esvaziado a cada `openNewsModal`, junto com o reset de
   `#modalTitle`. Abrir uma notícia com sucesso, fechar, e abrir outra cuja
   busca falha (ou ainda carrega) deixa `#modalMeta.textContent === ''` —
   nunca a data ou o "🔔 Notificação enviada" da notícia anterior.
5. O `.news-title` dentro do `<button class="news-item">` tem `font-size` e
   `line-height` computados iguais aos do `body` (hoje `16px`/`24px`), não os
   do controle nativo (`13.3333px`/`normal`). Provado no Chromium, em
   `tests/e2e/accessibility.spec.ts`.
6. O teste de `:focus-visible` exige `outline-width` computada ≥ `1px` além de
   `outline-style !== 'none'` — sem a regra do `main.css` o Chromium devolve
   `auto`/`0px` e o teste fica vermelho. O teste "Tab alcança o sino" chega ao
   `#notificationBellBtn` por `keyboard.press('Tab')` a partir do `body`, com
   limite de tentativas, sem `bell.focus()`.
7. Asserções gêmeas com a mesma força, nos cinco pares:
   a. a verificação "sem heading e sem conteúdo inválido" roda em `btnFastSync`
      **e** `btnFullSync`;
   b. `aria-label` do `.modal-close` é exatamente `Fechar notícia`, como o do
      botão de download já é exato;
   c. `#modalTitle` é exatamente `Carregando notícia...` durante o carregamento
      e exatamente `Erro ao carregar notícia` nos dois caminhos de erro
      (`success: false` e `getNewsDetail` rejeitando), não só truthy;
   d. o `href` do `.notification-item` com `courseId` adversarial
      (`c1' onclick='alert(1)`) fica literal, como já é provado para o
      `.course-card` em `renderer-content-security.test.ts`;
   e. `aria-expanded` do sino volta a `false` nos três caminhos de fechamento:
      clique no sino, clique fora do painel, clique num item de notificação.
8. Nenhum `<button>` criado pela branch contém conteúdo de fluxo:
   `querySelector('div, p, h1, h2, h3, h4, h5, h6')` é `null` em
   `#btnFastSync`, `#btnFullSync` e `.news-item`. O layout não muda: os
   filhos viram `span` e o CSS repõe `display: block` onde a margem dependia
   do bloco (`.news-title`, `.news-date`).

#### Verification

```text
npx vitest run tests/unit/sync-selection-a11y.test.ts tests/unit/course-detail-a11y.test.ts tests/unit/dashboard-a11y.test.ts tests/unit/renderer-content-security.test.ts
npm run test:e2e -- accessibility
npm run quality
```

## Tests stage 2 writes (own commit, red)

Seams já usados pelos testes existentes; nenhum novo.

- `tests/unit/course-detail-a11y.test.ts`, seam `renderCourseDetailPage`:
  critério 4 (segunda notícia no `COURSE`, a primeira com `notification: 'Sim'`),
  7b e 7c. Vermelho: 4 porque a meta velha fica; 7b/7c passam hoje — são
  endurecimento, e ficam vermelhos se o texto mudar.
- `tests/unit/sync-selection-a11y.test.ts`, seam `renderSyncSelectionPage`:
  critérios 7a e 8 (cartões). Vermelho: 8 porque os cartões contêm `div`/`p`.
- `tests/unit/course-detail-a11y.test.ts`: critério 8 (`.news-item` contém
  `div`). Vermelho hoje.
- `tests/unit/dashboard-a11y.test.ts`, seam `renderDashboardPage`: critério 7e
  (clique fora via `document.body.click()`, clique em `.notification-item`).
- `tests/unit/renderer-content-security.test.ts`, bloco do dashboard: critério
  7d.
- `tests/e2e/accessibility.spec.ts`: critérios 5 (vermelho — `13.3333px`) e 6
  (largura do contorno passa hoje; Tab real substitui o `focus()`).

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

### 2026-09-10 — QA-007: varredura mecânica de simetria

Relatório completo:
`docs/audits/2026-09-10-a11y-001-simetria.md`.

Além do `modalMeta` stale já registrado acima, a varredura encontrou quatro
itens introduzidos pela branch que pertencem ao retrabalho da `A11Y-001`:

1. **Conteúdo inválido nos novos botões.** Os cartões rápido/completo em
   `src/pages/sync-selection.ts:33-54` trocaram `h2` por `div`, mas continuam
   contendo `div` e `p`; o botão `.news-item` em
   `src/pages/course-detail.ts:201-216` também contém `div`. O modelo de
   conteúdo de `<button>` admite conteúdo phrasing, não esses elementos de
   fluxo. A conversão semântica ficou pela metade.
2. **Reset visual incompleto do `.news-item`.** A conversão repôs `display`,
   `width` e `text-align`, mas não `font-size`/`line-height`. No Chromium, o
   título passou de `16px/24px` para `13.3333px/normal`, herdado do controle
   nativo.
3. **Teste de foco com falso verde.** O teste de `:focus-visible` só exige
   `outlineStyle !== "none"`. Removida a regra de produção em runtime, o
   Chromium devolve `outline-style: auto` e `outline-width: 0px`, portanto a
   asserção continua verde sem contorno visível. O teste que diz que Tab chega
   ao sino também chama `bell.focus()` diretamente e não exercita Tab.
4. **Asserções gêmeas com força desigual.** O teste de sync procura heading
   só no cartão rápido; o `aria-label` do botão de fechar e os títulos de
   loading/erro aceitam qualquer texto truthy; o `href` adversarial é provado
   no course-card, mas não no link irmão de notificação; `aria-expanded` só é
   testado ao fechar pelo sino, não por clique externo ou seleção de item.

Os dois defeitos de cor pré-existentes encontrados na mesma varredura não são
retrabalho desta branch. Foram publicados como `A11Y-002` e `A11Y-003`.

### 2026-09-11 — etapa 1: achados desdobrados em critérios 4–8, handoff `rework-4`

O `#modalMeta` stale da terceira revisão e os quatro achados da `QA-007`
viraram critérios numerados no corpo (4 a 8), com os arquivos de teste
correspondentes adicionados aos Primary files. Sem isso a etapa 2 fazia só o
`modalMeta`: o handoff `rework-3` dizia "Um item" e comentário não desdobrado
é nota, não requisito.

Decisões desta etapa:

- **Conteúdo inválido nos botões (critério 8) fica nesta volta.** É a única
  regressão sem sintoma visível, mas a correção é `div`/`p` → `span` mais
  duas linhas de `display: block`; abrir ticket próprio custa mais que isso.
  Vai por último na ordem do handoff, para não segurar o critério 5.
- **Scan do axe com o modal aberto não entra aqui.** Só fica verde depois da
  cor do `.modal-meta` no escuro, que é pré-existente — continua no
  `A11Y-002`, como a `QA-007` roteou.
- O item "Tab alcança o sino" (achado 3 da `QA-007`, segunda metade) entrou
  no critério 6 em vez de ganhar número próprio: mesmo arquivo, mesmo teste.

Handoff: `.scratch/05-fase4-prontidao-para-distribuicao/handoffs/A11Y-001-rework-4.md`.
O `rework-3` fica como histórico; o `rework-4` o substitui.

### 2026-09-11 — etapa 2: retrabalho 4 implementado, pronto para revisão

Commits em `a11y-001`, nesta ordem — teste primeiro (`diff --stat` só em
`tests/`), depois código:

1. `test: harden and extend A11Y-001 rework-4 coverage (criteria 4-8)` —
   critérios 4, 5 (e2e), 8 vermelhos pelo motivo certo (meta vazando, `.news-item`
   e cartões ainda com `div`/`p`); 6, 7b-e já passavam hoje e ficaram
   endurecidos.
2. `test: fix two test bugs found while turning A11Y-001 rework-4 green` — dois
   bugs no teste novo, achados ao tentar deixá-lo verde: o mock padrão de
   `getNewsDetail` sempre devolvia `notification: ''`, então a asserção do
   critério 4 nunca teria pego a meta antiga de verdade; e o teste do critério 6
   lia `getComputedStyle` sincronamente após o foco, no meio da transição de
   `.btn-refresh` (`transition: all 0.2s`, animável em `outline-width`/
   `outline-color`) — passou a esperar o valor estabilizar.
3. `fix: close A11Y-001 rework-4 (criteria 4, 5, 8)` — código.

Vermelho antes da correção (item 1 do handoff): `npx vitest run
tests/unit/course-detail-a11y.test.ts tests/unit/sync-selection-a11y.test.ts
tests/unit/dashboard-a11y.test.ts tests/unit/renderer-content-security.test.ts`
com 4 falhas (meta vazando, `.news-item` e os dois cartões com conteúdo de
fluxo) e 43 passando — os pares 6 e 7b-e já verdes, confirmando que eram só
endurecimento. Depois da correção: 47/47. `npm run quality`: 633 passed, 4
skipped, 0 erro de lint (62 warnings, todos pré-existentes — mesma linha de
base do `rework-3`). `npm run test:e2e -- accessibility`: 15/15, incluindo o
teste novo de tipografia do critério 5 (rebuild com `npx vite build` antes de
rodar — o e2e carrega `dist/`, não `src/`, direto).

Varredura de simetria (mecânica, pedida pelo handoff):

- `grep -n 'modalMeta\|modalTitle' src/pages/course-detail.ts` — confirma os
  quatro caminhos de saída de `openNewsModal` (cache, sucesso, `else` de erro,
  `catch`) cobertos pelo reset único no topo; os dois caminhos de erro só
  reescrevem o título, porque a meta já foi limpa antes de qualquer branch
  rodar.
- `grep -n 'news-title\|news-date\|news-notification' src/pages/course-detail.ts
  src/styles/course-detail.css` — os seletores de tema escuro
  (`course-detail.css:446-448`) são por classe, não por tag; não precisam mudar
  com `div`→`span`.
- `grep -n 'div\.\|p\.card\|h2\.card' src/styles/sync-selection.css` — vazio;
  confirma que nenhum seletor CSS ali é qualificado por tag, então a troca para
  `span` nos dois cartões-botão não quebra nada.
- `.sync-card.disabled` (o terceiro cartão, "Modo Backup") continua `div` com
  `h2`/`p` — não é `<button>`, então critério 8 não se aplica; não tocado.
- `.sync-card` tem o mesmo defeito de tipografia latente do `.news-item`
  (menção do handoff), mas todos os filhos já definem `font-size` próprio — sem
  sintoma, e o handoff marca como opcional. Não corrigido nesta volta.

Nenhum achado novo de assimetria além do que os itens 1-5 já cobriam.

Fora desta volta, sem mudança — decisões do autor e follow-ups repetidos das
revisões anteriores (ver comentários acima): `AGENTS.md:20-27`, o teste de
`SEC-001` reescrito, o commit misto `9a83c26`, `href` sem checar esquema em
`dom.ts`, CSS duplicado (`CLEAN-*`), `:focus-visible` perdendo para
`login.css:63`, `markSeenOnHover` sem teclado, hierarquia de headings do
`sync-selection`, `title` nos spans de status, e o defeito latente do
`.sync-card` citado acima.

### 2026-09-11 — quarta revisão: critérios 4–8 fechados, merge

Branch `a11y-001`, 13 commits sobre `40a0d01`, revisada nos dois eixos.
Rodados nesta revisão, não lidos do relatório: `npm run quality` verde (51
arquivos, **633 passed, 4 skipped, 0 erro de lint**, 62 warnings de
`no-explicit-any`, todos pré-existentes) e `npm run test:e2e -- accessibility`
verde (**15 passed**, 4 rotas × claro/escuro + o teste novo de tipografia).

Vermelho conferido de forma independente: `git revert --no-commit 375dcf6` na
árvore de trabalho e re-execução — **4 failed / 43 passed** nos quatro arquivos
de unidade (meta vazando, `.news-item` com `div`, os dois cartões com
`div`/`p`) e **1 failed / 14 passed** no e2e (só o de tipografia). Árvore
restaurada em seguida. Confere com o que a etapa 2 relatou.

Separação teste/código limpa: `98af5a4` e `793f0ca` só `tests/`, `375dcf6` só
`src/`, `749916d` só `.scratch/`. Nenhum arquivo fora dos Primary files.

Critério a critério, verificado no código e no teste:

- **4** — `course-detail.ts:503` reseta `#modalMeta` na linha seguinte ao
  reset do título, **depois** do guard `if (!modal || !modalBody) return` e
  **antes** de `showModal()` e de qualquer branch. Os quatro caminhos de saída
  (cache, sucesso, `else` de erro, `catch`) saem cobertos por um único reset —
  correção na origem, não por caminho. O `793f0ca` sobrescreve o mock de `n1`
  para a meta ficar de fato populada antes da segunda abertura, senão a
  asserção nunca pegaria a regressão.
- **5** — `.news-item` ganha `font-size`/`line-height: inherit`; nenhum
  ancestral (`.news-list`, `.news-section`, `#app`) declara os dois, então
  `inherit` chega ao `body`. O e2e compara contra `getComputedStyle(body)`.
- **6** — as duas asserções presentes (`outlineStyle !== 'none'` **e**
  `parseFloat(outlineWidth) >= 1`); o teste do sino faz `body.focus()` e
  `keyboard.press('Tab')` em laço de 20, sem `bell.focus()`.
- **7a–e** — os cinco pares subiram à força do gêmeo forte: `it.each` nos dois
  cartões; `toBe('Fechar notícia')`; três títulos exatos, erro por
  `success: false` **e** `mockRejectedValue`; `href` literal com `courseId`
  adversarial; `aria-expanded` de volta a `false` nos três caminhos.
- **8** — os dois cartões e o `.news-item` só têm `span` (`<strong>` é
  phrasing); `.news-title`/`.news-date` receberam `display: block`. Varredura
  de irmãos confirmada de forma independente: nenhum seletor em
  `src/styles/*.css` é qualificado por `div`/`p`/`span` — os únicos por tag são
  `h1`/`h2`/`h3` descendentes — e os blocos `[data-theme="dark"]` são por
  classe. `.sync-card.disabled` continua `div`, corretamente intocado.

Nenhum achado que segure o merge. Registrado, sem retrabalho:

1. **A causa raiz do critério 5 está um nível acima.** `main.css:99-102` reseta
   só `font-family` no `button`. `button { font: inherit }` fecharia
   `.news-item` e o defeito latente do `.sync-card` de uma vez e apagaria o
   hunk do `course-detail.css`. Conferido antes de pedir: **nenhuma** classe de
   botão do repo declara `font-size` própria, então a regra global mudaria o
   tamanho de todo botão do app — incluindo login e settings, telas fora do
   scan do axe. A correção por componente é o escopo certo aqui; a global vira
   ticket próprio se alguém quiser.
2. **O critério 5 só é protegido pelo tier e2e**, que está fora do
   `npm run quality` por decisão registrada no `AGENTS.md`. Reverter
   `course-detail.css:281-285` deixa o gate verde. É o motivo de a nota do
   `AGENTS.md` existir; rodado à mão aqui.
3. **O teste do critério 4 fixa só o caminho de erro.** Mover o reset para
   dentro do branch de erro deixaria o caminho de carregamento vazando com o
   teste verde. Resíduo pequeno — a correção está provada na origem por
   leitura, e a forma do teste foi ditada pelo handoff.
4. `expect.poll(...).toBe('2px')` fixa o valor do `main.css`, o que torna o
   `>= 1` seguinte tautológico. Inofensivo: o poll estoura se a regra sumir.
5. O mesmo racional de `span` vs `div` aparece quatro vezes
   (`course-detail.ts:207`, `sync-selection.ts:32`, `course-detail.css:294`,
   corpo do commit). Duas bastariam.

Decisões do autor, agora pela quarta volta sem mudança — seguem para o merge
como estão: `AGENTS.md:20-27` (nota do scan fora do gate, arquivo fora dos
Primary files, conteúdo o que a primeira revisão recomendou), o teste de
`SEC-001` reescrito de clique para leitura de atributo
(`renderer-content-security.test.ts:200`), e o commit misto `9a83c26`
(histórico, não corrigível sem reescrever a branch).

Follow-ups abertos, nenhum desta branch: `href` sem checar esquema em
`dom.ts:36`, `.btn-section-action--success` duplicado (`CLEAN-*`),
`:focus-visible` do `main.css:107` perdendo para `login.css:63` numa tela fora
do scan, `markSeenOnHover` sem caminho de teclado, hierarquia de headings do
`sync-selection`, `title` nos spans de status, tipografia latente do
`.sync-card`, e `A11Y-002`/`A11Y-003` já abertos.

#### Resolution (2026-09-11)

Quatro voltas de retrabalho, oito critérios. Fechada sem mudança de código na
revisão — merge direto em `master`.

- Commits: `fda43a2`, `1730807`, `9a83c26`, `9c7d4c7`, `442f1de`, `11e0918`,
  `173a634`, `98af5a4`, `793f0ca`, `375dcf6` (mais os de documentação).
- Arquivos de produção: `index.html`, `src/pages/{dashboard,course-detail,
  sync-selection,settings}.ts`, `src/utils/dom.ts`,
  `src/styles/{main,dashboard,course-detail,sync-selection}.css`.
- Prova vermelho-verde desta volta: 4 failed / 43 passed (unidade) e 1 failed /
  14 passed (e2e) contra o código não corrigido; 47/47 e 15/15 depois.
- Gate: `npm run quality` verde, 633 passed / 4 skipped / 0 erro de lint.
