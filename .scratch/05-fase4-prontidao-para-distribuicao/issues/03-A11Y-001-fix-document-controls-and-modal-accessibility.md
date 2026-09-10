# A11Y-001 — Fix document, controls, and modal accessibility
Status: open
Stage: to-review
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
