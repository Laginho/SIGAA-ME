# PIPE-007: CI: catraca de warnings, `permissions:` e gitleaks pinado
Status: open
Stage: to-review
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
