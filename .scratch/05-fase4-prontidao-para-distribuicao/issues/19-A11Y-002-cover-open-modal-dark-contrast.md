# A11Y-002: Cobrir o modal aberto e corrigir o contraste dos metadados
Status: open
Stage: to-implement
Priority: P2
Blocked by: A11Y-001

- Owner: —
- Dependencies: `A11Y-001`
- Primary files:
  - `src/styles/course-detail.css` (`.modal-meta` no tema escuro)
  - `tests/e2e/accessibility.spec.ts` (estado aberto do modal no matrix axe)

#### What to build

O scan automático precisa provar o modal de notícia **aberto** nos temas claro
e escuro, não apenas a rota course-detail com o `<dialog>` invisível. No tema
escuro, `#modalMeta` conserva `color: #666` sobre `#1e293b`; o axe acusa os
dois spans de data/notificação como `color-contrast` de impacto `serious`.

Corrija a cor com o token/valor temático já usado pelos textos secundários e
inclua o estado aberto no scan existente. O teste deve abrir a notícia da
fixture pelo controle real antes de chamar axe.

#### Acceptance criteria

1. Data e estado de notificação do modal atendem contraste AA nos dois temas.
2. O scan do axe abre o modal nos temas claro e escuro e falha para violação
   crítica ou séria nesse estado.
3. As quatro rotas já cobertas continuam sem violação crítica ou séria.

#### Verification

```text
npm run test:e2e -- accessibility
```

```text
npm run quality
```

## Tests stage 2 writes (own commit, red)

- `tests/e2e/accessibility.spec.ts`, no seam `renderCourseDetailPage` exercitado
  pelo app real: abre `.news-item`, confirma `#newsModal[open]` e roda axe nos
  dois temas. Antes da correção, falha em `#modalMeta` no tema escuro.

## Comments

### 2026-09-10 — origem QA-007

Pré-existente em `40a0d01`; não é retrabalho da `A11Y-001`. Probe da QA-007
confirmou duas violações `color-contrast` sérias com o modal aberto.

### 2026-09-10 — revisão da QA-007

A lacuna do scan (item 4 da auditoria) foi introduzida pela branch, como os
itens 3 e 5, que foram para o retrabalho da `A11Y-001`. Ela vem para cá porque
o scan do modal aberto não fica verde antes de a cor ser corrigida: os dois
são a mesma entrega.

A fixture E2E (`tests/e2e/accessibility.spec.ts:19-26`) já traz a notícia com
`content`, então o caminho de cache monta o modal sem rede. Ela traz
`notification: ''`, que renderiza **um** span em `#modalMeta`, não os dois que
o probe da auditoria relata. Se o teste quiser provar os dois, a fixture
precisa de `notification: 'Sim'`.
