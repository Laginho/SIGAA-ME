# PIPE-007: CI: catraca de warnings, `permissions:` e gitleaks pinado
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `package.json` (script `lint`)
  - `.github/workflows/quality.yml`
  - `tests/unit/audit-eslint-boundary.test.ts` (ou `audit-release-gate.test.ts`, o que já lê o arquivo em questão)

Seção "Processo" do relatório mesclado: três itens de um relatório cada.

#### What to build

O `lint` roda sem `--max-warnings`: os 52 warnings atuais só não crescem por
disciplina. O `quality.yml` não declara `permissions:`, então o `GITHUB_TOKEN`
do job vem com o padrão do repositório. O `gitleaks/gitleaks-action@v2` é tag
flutuante: quem controla a tag controla o que roda no CI com acesso ao
checkout.

#### Acceptance criteria

1. O script `lint` tem `--max-warnings <N>` com `N` igual à contagem atual no
   commit da implementação (catraca: só desce). `npm run lint` passa.
2. `quality.yml` declara `permissions:` no topo com `contents: read` e, por
   job, só o que aquele job precisa a mais.
3. A action do gitleaks é pinada por SHA de commit completo, com a versão em
   comentário na mesma linha.
4. Testes afirmam os três: o script contém `--max-warnings`; o workflow tem o
   bloco `permissions` antes do primeiro `jobs:`; a linha `uses:` do gitleaks
   casa `@[0-9a-f]{40}`.
5. `npm run quality` verde e o run do `quality.yml` na branch verde.

#### Verification

    npm run lint
    npm run quality
    gh run list --workflow quality.yml --branch <branch> --limit 1

## Tests stage 2 writes (own commit, red)

- No arquivo de teste que já lê `package.json`/workflows como texto (padrão
  do `QA-001`): os três `it` do critério 4. Vermelho porque nenhum dos três
  existe.

## Comments

- `release.yml` já tem `permissions` por job desde `REL-001`; fora do escopo.
- O piso de cobertura repo-wide (também na seção Processo) ficou fora: exige
  um número decidido, não um ticket.
- `gitleaks/gitleaks-action@v2` roda em Node 20, que o GitHub remove dos
  runners hospedados em 2026-09-16 — a v3 (Node 24) é um `uses:` de uma linha
  mais `actions/checkout@v6`. Fora do escopo daqui (o ticket pede pin por SHA,
  não upgrade de major); vale um ticket próprio antes daquela data.

#### Resolution (2026-09-15)

Verdict: Approve

Merge na sessão: `1d2b3d1`. Nenhuma correção de revisão foi necessária.

Critério 1 ✅ — `lint` virou `eslint . --max-warnings 52`, e 52 é a contagem
real no commit da implementação: o gate imprimiu `✖ 52 problems (0 errors, 52
warnings)` e saiu 0. A catraca é auto-executável, o próprio eslint falha no 53.

Critério 2 ✅ — `permissions: contents: read` no topo (linha 16), antes do
`jobs:` (linha 19); só o job `secrets` recebe `pull-requests: write` a mais.
Verificado que esse é o grant certo, não um palpite: a action pinada chama
`octokit.rest.pulls.createReviewComment` e `GET /repos/{owner}/{repo}/pulls/
{pull_number}/comments` (`src/gitleaks.js:233,263` em `ff98106`), ou seja a API
de pull request, não a de issues. `gate` e `e2e` só leem o repo —
`actions/upload-artifact@v4` usa o `ACTIONS_RUNTIME_TOKEN`, não o
`GITHUB_TOKEN`, então `contents: read` basta.

Critério 3 ✅ — `gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7 # v2`.
O SHA foi conferido contra o repositório de origem: a tag `v2` é anotada, o
objeto `dcedce43…` desreferencia para o commit `ff98106e…` ("bump cache",
2025-04-17). O pin aponta para o que a tag resolve hoje.

Critério 4 ✅ — três `it` novos em `tests/unit/audit-release-gate.test.ts`, no
padrão do `QA-001` (lê o arquivo de produção como texto, não uma cópia). O teste
do `permissions` compara índice de linha e continua válido se alguém tirar só o
bloco do topo: o `permissions:` do job `secrets` também dá `trim() ===
'permissions:'`, mas vem depois do `jobs:`, e a asserção falha.

Critério 5 ✅ para o gate local, parcial para o CI — `npm run quality` verde no
Windows: 0 erros de lint, 69 arquivos de teste, 768 passed / 5 skipped. O
`quality.yml` **não** rodou na branch `pipe-007` (`gh run list` vazio): no fluxo
de branch de sessão o ticket não é empurrado, o driver empurra a sessão no fim.
A metade de CI do critério 5 é validada no run da branch de sessão, e é lá que
ela tem de ser olhada — é justamente a mudança de `permissions` que só pode
falhar no CI.

Prova red-green: com `package.json` e `quality.yml` revertidos para `fea79c2`
(estado pré-fix), `npx vitest run tests/unit/audit-release-gate.test.ts -t
'PIPE-007'` deu **3 failed | 9 skipped**; com o fix, os três passam dentro dos
768. A separação exigida pelo loop está no `diff --stat`: `fea79c2` toca só o
teste e o `Stage:`, `d1ea22e` toca só `.github/workflows/quality.yml`,
`package.json` e o ticket — nenhum arquivo de teste no commit de código.

Arquivos: `package.json`, `.github/workflows/quality.yml`,
`tests/unit/audit-release-gate.test.ts`.

Nada fora dos Primary files foi tocado, e nenhuma pendência nova nasceu daqui —
o upgrade do gitleaks para v3 antes de 2026-09-16 já estava anotado acima e
continua sem ticket.
