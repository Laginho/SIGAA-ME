# PORTAL-004 — Live compatibility check, manual e pré-release
Status: open
Stage: reviewing
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `PARTIAL`

- Owner: —
- Dependencies: `PORTAL-001`, `PORTAL-003`, `QA-001`
- Primary files:
  - `tests/integration/scraper.test.ts`
  - `package.json`

Título original: "Add an opt-in scheduled live compatibility canary". Reescrito em
2026-09-12 depois de dois attempts do loop pararem nas mesmas três lacunas
(conta de teste, canal de alerta, cadência).

## Decisões (2026-09-12)

1. **Sem canário na nuvem.** Não existe conta SIGAA dedicada de privilégio
   mínimo e não há como criar uma; a alternativa seria a senha real do autor
   como secret do GitHub Actions, para um app desktop de um usuário. Não vale
   o risco (regra 5 do `CLAUDE.md`, e este repositório já vazou credencial uma
   vez). `.github/workflows/sigaa-canary.yml` sai do escopo. `Schedule` e
   `Alert destination` ficam vazios por decisão, não por esquecimento.
2. **O canário é o `npm run test:live`, manual, antes de release.** É o tier
   "Live smoke do scraper" do `CLAUDE.md`, que já existe; este ticket só o
   completa (classificação do portal, entrada em disciplina, estrutura de
   arquivos/notícias, logout) e dá o script.
3. **Não entra no loop.** Nenhum teste aqui fica vermelho/verde sem credencial,
   e rodar com credencial em ciclo é login automatizado repetido na conta real.
   Feito à mão em 2026-09-12, na branch `portal-004`. A etapa 3 confere tipos,
   lint, que a suíte offline continua pulando o bloco live, e que cada asserção
   nova aceita zero itens mas rejeita forma errada; não confere vermelho-verde.

#### Acceptance criteria

- PRs e `npm run quality` nunca exigem credencial: o bloco live continua
  `describe.skip` sem `.env` **e** `RUN_LIVE_SIGAA_TESTS=true`.
- O live check usa os mesmos pontos de entrada do app (`SigaaService`), numa
  única sessão de login: login, enumeração de disciplinas, entrada na primeira
  disciplina, estrutura de arquivos e notícias (arrays; cada item com os campos
  do modelo compartilhado), e logout.
- Classificação do portal é verificada pelo código de produção, não por cópia:
  `getCourses` e `getCourseFiles` só passam se os validadores do
  `portal-adapter` (`PORTAL-001`) reconheceram lista de turmas e entrada em
  disciplina; na falha o teste imprime `error.code`, e `SELECTOR_DRIFT` é
  mudança de estrutura.
- Não exige número fixo de disciplinas, arquivos ou notícias: zero itens é
  resultado válido, forma errada não é.
- `npm run test:live` roda só `tests/integration/scraper.test.ts` e é ele
  mesmo o opt-in: o teste aceita `RUN_LIVE_SIGAA_TESTS=true` **ou**
  `npm_lifecycle_event === 'test:live'` (npm põe o nome do script no ambiente
  do filho, em qualquer SO). Sem `.env` continua pulando.

#### Verification

```text
npm run test:live       # manual, precisa de .env; um login por rodada
npm run quality         # bloco live pulado, "Test Environment" passa
```

#### Implementation notes

- Commit: —
- Schedule: nenhum (decisão 1)
- Alert destination: nenhum (decisão 1)

#### Revisão (2026-09-12, etapa 3)

Critérios, um a um, conferidos contra o código de produção:

1. ✅ **Nunca exige credencial.** `describeOrSkip` só vira `describe` com
   `hasCredentials && runLiveSmokeTests`. `npm run quality` completo:
   **55 arquivos, 645 passaram, 5 pulados** — os 5 pulados são exatamente os
   `it` do bloco live.
2. ✅ **Pontos de entrada do app, uma sessão.** `SigaaService.login` →
   `getCourses` → `getCourseFiles` → `logout`, nessa ordem, num arquivo só
   (vitest roda os `it` de um arquivo em sequência). As assinaturas casam com
   `sigaa.service.ts:76,112,123,143`; os campos assertados existem em
   `shared/domain.ts` (`CourseSummary.period`, `CourseFile.type: 'file'|'link'`,
   `NewsSummary.date`). O `afterAll` chamar `logout()` de novo é seguro:
   `playwright-login.service.ts:1254` guarda em `this.browser`.
3. ✅ **Classificação pelo código de produção.** `getCourses` extrai com os
   seletores do adapter (`STUDENT_PORTAL`) e, se a lista de turmas não for
   reconhecida, sai em `SELECTOR_DRIFT` com
   `describeMissingCourseListSelectors` (`playwright-login.service.ts:394-405`).
   `getCourseFiles` passa por `validateCourseListDocument` antes do clique
   (`playwright-login.service.ts:509`) e por `validateCourseEntryEnd` na
   resposta (`http-scraper.service.ts:242`). `failFromResult` preserva o código
   na origem (`PORTAL-001`) e o `unwrap` do teste lança
   `${error.code}: ${message}`. Nenhuma cópia de parsing no teste.
4. ✅ **Sem número fixo.** Nenhum `toHaveLength`/`toBeGreaterThan` de contagem;
   os laços sobre `courses`/`files`/`news` não executam com zero itens.
   Observação, não achado: o ramo `if (courses.length === 0) return` é
   inalcançável na produção de hoje — `playwright-login.service.ts:394` trata
   zero `courseIdInput` como `SELECTOR_DRIFT`, então uma conta sem turma
   nenhuma falha antes de chegar ao teste. É comportamento pré-existente, fora
   do escopo deste ticket; a guarda no teste continua correta.
5. ✅ **`npm run test:live` é o opt-in.** Script confinado a
   `tests/integration/scraper.test.ts`. `npm_lifecycle_event` confirmado neste
   Windows/npm com um `package.json` descartável fora do repo: imprimiu
   `test:live`. Sem `.env`, `hasCredentials` é falso e o bloco continua pulado.

Separação de commits correta: `6e1929b` só toca o teste, `b15ae5a` só o
`package.json`. Sem vermelho-verde por decisão 3 do próprio ticket — nenhuma
asserção aqui roda sem credencial.

Dois achados, ambos fora dos Primary files, corrigidos nesta passada:

- `CLAUDE.md:166` afirmava que o tier live exige `RUN_LIVE_SIGAA_TESTS=true`.
  Depois deste ticket isso é uma de duas formas, e a tabela é onde uma sessão
  futura procura o comando do canário. Linha atualizada.
- `QA-001` lista `test:live` em "Required scripts". O script agora existe;
  nota adicionada nos `## Comments` de lá para não ser redefinido.

## Comments

- 2026-09-12 Attempts 1 e 2 do loop pararam para perguntar conta de teste,
  canal de alerta e cadência. Respondido nas Decisões acima; contador de
  attempts zerado junto com a reescrita.
