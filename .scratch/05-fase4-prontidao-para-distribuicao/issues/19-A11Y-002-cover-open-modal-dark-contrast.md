# A11Y-002: Cobrir o modal aberto e corrigir o contraste dos metadados
Status: open
Stage: to-review
Priority: P2
Blocked by: A11Y-001

- Owner: —
- Dependencies: `A11Y-001`
- Primary files:
  - `src/styles/course-detail.css` (`.modal-meta` no tema escuro;
    `.news-notification` no tema claro — ver revisão de 2026-09-12)
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

1. ✅ Data e estado de notificação do modal atendem contraste AA nos dois temas.
2. ✅ O scan do axe abre o modal nos temas claro e escuro e falha para violação
   crítica ou séria nesse estado.
3. ✅ As quatro rotas já cobertas continuam sem violação crítica ou séria.
4. ✅ O scan cobre o course-detail **fechado e aberto** nos dois temas — o
   estado aberto não substitui o fechado.
5. ✅ `.news-notification` atende AA no tema claro.

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

### 2026-09-12 — revisão da etapa 3 (Opus): reaberta

Revisão de `2985e25`..`7f5f1b9`. Critérios 1 e 2 ficaram provados; o 3 caiu.

**O que está certo.** A separação de commits é a esperada: o commit de teste
não toca `src/`, o de código não toca `tests/`. A cor escolhida é a do irmão
`.news-date` (`--color-text-muted`), não um literal novo — `#94a3b8` sobre
`#1e293b` dá 5,7:1. O vermelho foi reproduzido: removendo só a linha 477 do
`course-detail.css`, o scan escuro falha com `#666666` sobre `#1e293b` = 2,54,
impacto `serious`, e acusa **os dois** spans — o
`notification: ''` → `'Sim'` da fixture se paga aí. `npm run quality` verde
(0 erro de lint, 685 passed / 5 skipped) e `test:e2e -- accessibility` com 15
passed.

**Por que caiu o critério 3.** Um `<dialog>` aberto por `showModal()` tira o
resto do documento da árvore de acessibilidade, e o axe não escaneia o que
ficou atrás. Como o `if (hash === '#/course/c1')` abre o modal **antes** da
única chamada ao `analyze()`, o course-detail deixou de ser verificado no
estado fechado. Medido, não deduzido: pintando `.course-header h1` de
`#fafafa` (1,02:1, `serious`), o scan **passa** com o modal aberto e **falha**
com ele fechado.

Isso não é só perda de cobertura hipotética — já está escondendo uma violação
real. A fixture com `notification: 'Sim'` passou a renderizar o badge
`.news-notification`, que no tema claro é `#28a745` sobre `#e6f9e9` = **2,84:1,
`serious`**. Com o modal fechado, o course-detail claro falha por causa dele. O
tema escuro tem override próprio (`course-detail.css:448`) e passa. Ou seja: a
branch está verde porque o modal tapa o que ela mesma passou a renderizar.

**O que falta (critérios 4 e 5).**

1. Escanear o course-detail nos dois estados, não em um só: `analyze()` com o
   modal fechado, depois abrir e `analyze()` de novo — em ambos os temas. Vale
   fechar o modal ao fim para não deixar estado vazando entre testes.
2. Corrigir `.news-notification` no tema claro para AA (≥ 4,5:1 sobre
   `#e6f9e9`), no espírito das correções da `A11Y-001` no mesmo arquivo: mesma
   cor, mais escura.

Reaberta em vez de corrigida aqui porque a correção mexe em arquivo de teste —
a etapa 3 não escreve teste — e porque `.news-notification` está fora do escopo
que a linha de Primary files declarava. Os dois pontos entraram como critérios
4 e 5, e o Primary files foi ampliado para `.news-notification`.

O trabalho continua na branch `a11y-002`, que já tem os dois commits bons.

### 2026-09-12 — retomada da etapa 2

Critérios 4 e 5, na ordem que a revisão pediu.

Teste (`17663af`): course-detail saiu do bloco que abria o modal antes do
único `analyze()`, virou um scan de estado fechado igual às outras rotas, e
ganhou um teste próprio de estado aberto por tema (fecha o modal no
`finally`, sem vazar estado pro próximo teste da matriz). Vermelho
reproduzido: `course-detail (tema light)` fecha e falha em
`.news-notification`, 2,84:1, igual ao relato da revisão — o modal escuro e
os dois testes de modal aberto já passavam, sem depender da correção.

Código (`e31fa3b`): `.news-notification` no tema claro trocou `#28a745` por
`#145c33`, o mesmo verde escurecido que `.btn-section-action--success` já usa
neste arquivo para o mesmo tipo de violação — ~7,3:1 sobre `#e6f9e9`, contra
os 2,84:1 antigos.

`dist/` estava por trás de um `vite build` antigo: o primeiro rerun pós-fix
ainda batia na cor velha porque o Electron de teste carrega o bundle, não o
CSS fonte. Rebuild resolveu; vale lembrar em qualquer sessão futura que rode
`test:e2e` sem ter acabado de buildar.

`test:e2e -- accessibility`: 17 passed. `npm run quality`: 0 erro de lint,
685 passed / 5 skipped.
