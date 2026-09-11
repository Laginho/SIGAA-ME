# A11Y-003: Corrigir o contraste do detalhe de progresso no tema escuro
Status: open
Stage: to-implement
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
