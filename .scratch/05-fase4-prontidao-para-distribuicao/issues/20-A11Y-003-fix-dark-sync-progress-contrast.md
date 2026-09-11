# A11Y-003: Corrigir o contraste do detalhe de progresso no tema escuro
Status: open
Stage: to-review
Priority: P2
Blocked by: A11Y-001

- Owner: —
- Dependencies: `A11Y-001`
- Primary files:
  - `src/styles/sync-selection.css` (`.progress-text`, `.back-link:hover`)
  - `tests/unit/sync-selection-a11y.test.ts` (regra temática do detalhe)

#### What to build

O overlay de sincronização usa tokens de tema em `.overlay-status`, mas o
irmão `.progress-text` fixa `color: #444` sobre
`background: var(--color-surface)`. No tema escuro isso produz cerca de
`1,50:1` sobre `#1e293b` e deixa o detalhe quase ilegível.

Faça o detalhe acompanhar o token de texto adequado nos dois temas sem mudar
o layout ou o fluxo da sincronização.

O mesmo arquivo tem uma segunda assimetria de cor, achada na revisão da
QA-007: `.back-link` está definida em `src/styles/settings.css:137` com
`var(--color-primary)` e em `src/styles/sync-selection.css:244` com
`color: #666`. No CSS construído a cópia do settings vem por último e vence a
cor base, mas `:hover { color: #333 }` existe só na cópia da sync-selection e
portanto vale nas duas telas — no tema escuro, cerca de `1,4:1` no link de
voltar do settings. Corrija o `:hover` com token; se a cor base da cópia da
sync-selection já é morta, apague-a em vez de deixar duas definições
divergentes.

**Antes de editar:** `src/styles/sync-selection.dark.css` é uma cópia
completa e não importada do arquivo (morta desde `7fd1c72`) e também define
`.progress-text`; `src/styles/dashboard.css:209` define uma terceira, também
morta. Um `grep` cai em três definições — a que vence no CSS construído é a
de `src/styles/sync-selection.css`, e é a única a mudar.

#### Acceptance criteria

1. `.progress-text` atende contraste AA sobre a superfície nos temas claro e
   escuro.
2. `.overlay-status` e `.progress-text` usam tratamento temático coerente.
3. `.back-link:hover` atende contraste AA nos dois temas, nas duas telas que
   usam a classe (settings e sync-selection).
4. Nenhuma cor ou comportamento fora do overlay de progresso e do link de
   voltar muda; nenhum dos dois arquivos mortos é editado.

#### Verification

```text
npx vitest run tests/unit/sync-selection-a11y.test.ts
```

```text
npm run test:e2e -- accessibility
```

```text
npm run quality
```

## Tests stage 2 writes (own commit, red)

- `tests/unit/sync-selection-a11y.test.ts`, no seam do stylesheet de produção:
  lê `src/styles/sync-selection.css` e exige que `.progress-text` use o token
  temático de texto secundário, não um literal de tema claro. Antes da mudança,
  falha em `color: #444`.

## Comments

### 2026-09-10 — origem QA-007

Pré-existente em `40a0d01`; não é retrabalho da `A11Y-001`. A relação de
contraste medida na auditoria foi aproximadamente `1,50:1` no tema escuro.

### 2026-09-10 — revisão da QA-007

O `.back-link` duplicado entrou aqui na etapa 3: é pré-existente e do mesmo
arquivo, mas a varredura da QA-007 não o pegou porque a categoria de classe
duplicada rodou só sobre classes alteradas pela branch. Detalhe no achado 9
de `docs/audits/2026-09-10-a11y-001-simetria.md`.

### 2026-09-11 — revisão etapa 3: critérios 1, 2 e 4 fechados, critério 3 volta sem prova

Branch `a11y-003`, commits `e6f95d0` (teste) e `bbee8fd` (código).
Separação dos commits confere: o commit de teste toca só
`tests/unit/sync-selection-a11y.test.ts`, o de código só
`src/styles/sync-selection.css`. Nada fora dos Primary files.

Prova red-green do `.progress-text`: com `src/styles/sync-selection.css` do
`master`, `npx vitest run tests/unit/sync-selection-a11y.test.ts` falha em
`expect(block).toMatch(/color:\s*var\(--color-text-muted\)/)` com o bloco ainda
em `color: #444` (1 failed | 4 passed). Com a mudança, 5 passed.

Gate: `npm run quality` verde — typecheck limpo, ESLint 0 erros / 62 warnings
(todos `no-explicit-any` pré-existentes), vitest 51 arquivos, 634 passed,
4 skipped.

Scan de axe (`npm run test:e2e -- accessibility`, exigido pelo `AGENTS.md` para
mudança de cor em `src/styles/*.css`): 15 passed, claro e escuro.

#### ✔ Critério 1 — contraste do `.progress-text`

`var(--color-text-muted)` sobre `var(--color-surface)`: `#4b5563` em `#ffffff`
= 7,56:1 no claro; `#94a3b8` em `#1e293b` = 5,70:1 no escuro. O
`.progress-text` fica dentro do `.progress-list`, que é quem pinta
`background: var(--color-surface)`. Texto de 0,9rem precisa de 4,5:1 — passa
nos dois.

#### ✔ Critério 2 — tratamento coerente

`.overlay-status` e `.progress-text` usam agora o mesmo
`var(--color-text-muted)`.

#### ❌ Critério 3 — a cor está certa, mas nenhum teste a segura

`.back-link:hover` com `var(--color-primary-hover)` dá `#004482` sobre fundo
claro (9,8:1) e `#60a5fa` sobre `#1e293b` (5,76:1) — AA nos dois temas. A
remoção do `color: #666` da cópia da sync-selection é a decisão certa e é mais
limpa do que o ticket pedia: sobrou **uma** definição de cor base
(`src/styles/settings.css:139`, `var(--color-primary)`), então a divergência
acabou sem depender da ordem do CSS construído.

O que falta é prova. Reverter `var(--color-primary-hover)` para `#333` deixa a
suíte inteira e o scan de axe verdes: o axe-core não avalia estado `:hover`, e
nenhum teste lê esse bloco. É o item 5 do "Antes de commitar" do `CLAUDE.md`
não cumprido — pergunta "qual teste falharia se a correção fosse revertida?",
resposta "nenhum".

Não corrijo aqui: pela regra da `ticket-flow`, achado que precisa de teste novo
volta para a etapa 2, sem exceção.

#### ✔ Critério 4 — nada fora do escopo

`git diff master...a11y-003 --stat`: 3 arquivos, 18 inserções, 4 remoções.
`src/styles/sync-selection.dark.css` e `src/styles/dashboard.css` intocados.

#### O que a etapa 2 faz nesta volta

Um teste, no mesmo seam do que já existe (lê o stylesheet de produção), em
`tests/unit/sync-selection-a11y.test.ts`: o bloco `.back-link:hover` de
`src/styles/sync-selection.css` usa token temático na `color`, não literal de
tema claro. Vermelho em `color: #333` antes da mudança — para provar o
vermelho, rode o teste com o CSS do `master`.

Continue na branch `a11y-003`; o teste vai em commit próprio, antes de
qualquer código, como na primeira volta. Nada mais muda: os critérios 1, 2 e 4
estão fechados e o código do critério 3 já está certo.

### 2026-09-11 — etapa 2, segunda volta

Commit `613c3b5`, só teste: `tests/unit/sync-selection-a11y.test.ts` ganha um
bloco para `.back-link:hover`, exigindo `color: var(--color-primary-hover)` e
recusando um literal hex na linha `color:` (o negative lookbehind `(?<!-)`
evita falso positivo em `border-color: #bbb`, que não é o alvo do critério).

Vermelho confirmado contra `src/styles/sync-selection.css` do `master`
(`color: #333`): 2 failed, 4 passed. Verde contra o arquivo atual da branch:
6 passed — nenhum código mudou, o `var(--color-primary-hover)` já estava
certo desde `bbee8fd`.

Gate `npm run quality`: typecheck limpo, ESLint 0 erros / 62 warnings
(pré-existentes), vitest 51 arquivos, 635 passed, 4 skipped.
`npm run test:e2e -- accessibility`: 15 passed, claro e escuro.

Sem commit de código nesta volta. Segue para etapa 3.
