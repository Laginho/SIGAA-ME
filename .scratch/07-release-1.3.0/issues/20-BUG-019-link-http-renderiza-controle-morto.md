# BUG-019: Link `http://` renderiza um controle que não abre nada
Status: blocked
Stage: blocked
Priority: P2
Blocked by: nenhum
Review: human

- Primary files:
  - `electron/services/sigaa.service.ts` (`extractLinkUrl`)
  - `electron/security/navigation-policy.ts` (`classifyNavigation`, `:51-70`)
  - `src/styles/course-detail.css` (`.btn-open-link`, novo)
  - `tests/unit/sigaa-service.test.ts`
  - `tests/unit/navigation-policy.test.ts`

Achado da revisão do `BUG-014` (2026-09-15). O `BUG-014` está fechado e o que
ele entregou funciona para `https:`; isto é o resto.

#### What to build

`BUG-014` critério 1 manda `toCourseFile` preservar URL `http:` **ou**
`https:`. O guard do `SEC-003` devolve `blocked` para todo esquema que não é
`https:` nem `mailto:` (`navigation-policy.ts:63`), e
`tests/unit/navigation-policy.test.ts:218` fixa isso como contrato. Resultado:
um material `http://` vira um `<a>` de aparência clicável que, ao clique, só
produz um `log.warn`. É a mesma queixa do `BUG-014` — material visível que não
abre — restrita ao subconjunto `http:`.

Os dois critérios não podem valer juntos. Quem escreve o spec escolhe um dos
dois caminhos; o outro vira "não fazer".

#### Acceptance criteria

1. **Depende da resposta em `## Comments`.** Caminho A: `extractLinkUrl`
   estreita para `https:`, e o material `http://` cai no ícone inerte com
   `title` "Link indisponível" do critério 3 do `BUG-014`. Caminho B:
   `classifyNavigation` passa a classificar `http:` como
   `{ kind: 'external', trusted: false }` — sempre com confirmação, nunca
   `trusted` — e o teste de contrato do `navigation-policy` muda junto.
2. `.btn-open-link` ganha regra em `src/styles/course-detail.css`, tema claro e
   escuro, com o mesmo alvo de clique do `.btn-download-file` ao lado (40px,
   redondo) e sem o sublinhado azul que o `<a>` sem estilo herda do Chromium.
3. `npm run quality` verde, e `npm run test:e2e -- accessibility` se o
   critério 2 mexer em cor de texto ou fundo (regra do `AGENTS.md`).

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts tests/unit/navigation-policy.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Caminho A — `tests/unit/sigaa-service.test.ts`: `toCourseFile` com
  `http://exemplo.br/x` omite `url`. Vermelho porque hoje ela é preservada.
- Caminho B — `tests/unit/navigation-policy.test.ts`: `classifyNavigation` de
  um `http://` fora do app devolve `external` com `trusted: false`. Vermelho
  porque hoje devolve `blocked`, e a linha 218 afirma o contrário.

## Comments

- **Pergunta para a etapa 1 (é o que trava este ticket):** vale a pena abrir
  `http:` no navegador do SO, ou material `http://` fica sem abrir? O caminho B
  afrouxa uma política de segurança que o `SEC-003` escreveu de propósito e que
  tem teste de contrato em cima; o caminho A deixa um material inacessível pelo
  app, ainda que o usuário possa copiar a URL de outro lugar. O caminho A é o
  padrão se ninguém decidir. Responda aqui, dobre a resposta no critério 1,
  ponha `Stage: to-implement` e commite.
- O critério 2 é cosmético e independe da resposta: pode ir junto, em commit
  próprio.
