# PORTAL-004 — Live compatibility check, manual e pré-release
Status: open
Stage: to-implement
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

## Comments

- 2026-09-12 Attempts 1 e 2 do loop pararam para perguntar conta de teste,
  canal de alerta e cadência. Respondido nas Decisões acima; contador de
  attempts zerado junto com a reescrita.
