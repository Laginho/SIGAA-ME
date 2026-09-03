# SEC-000 — Credenciais reais expostas em repositório público
Status: resolved
Priority: P0
Tracker status at migration: `IN PROGRESS` — risco neutralizado; limpeza de histórico pendente

- Owner: Bruno
- Dependencies: none
- Descoberto: 2026-08-02, durante a auditoria de complexidade
- Primary files: `verify-scraper.ts:22-24`

#### Situação atual (2026-08-02)

| Ação | Status |
|---|---|
| Repositório tornado privado | **Feito** |
| Senha do SIGAA trocada | **Feito** — risco neutralizado |
| Remover `verify-scraper.ts` + `tsconfig.verify.json` do HEAD | **Feito** |
| Regra de lint contra credencial com fallback | **Feito** (`eslint.config.js`) |
| Limpar credencial do histórico | Pendente — via `git filter-repo` |
| Scanner de segredo no CI | **Feito** (`PIPE-006`) — previne reincidência; não substitui a limpeza do histórico |

> **Cuidado ao documentar incidente de credencial:** a primeira versão desta
> tarefa transcreveu a senha real como exemplo. Isso anularia o `filter-repo` —
> a senha voltaria nos commits novos, dentro da própria documentação da limpeza.
> Corrigido em 2026-08-02. **Ao documentar um leak, use placeholder.**

Exposição estimada: baixa. Repositório nunca divulgado, zero stars, zero forks.
Mesmo assim, a senha foi trocada — a única ação que realmente encerra o risco,
já que privacidade não é retroativa para quem tenha clonado antes.

#### O que aconteceu

```ts
// hardcoded for debugging, make sure to remove before release
const username = process.env.SIGAA_USER || '<usuário real>';
const password = process.env.SIGAA_PASS || '<senha real>';
```

Credenciais reais do SIGAA como valor padrão de fallback, em arquivo `.ts`
commitado, em repositório **público** (`github.com/Laginho/sigaa-me`).

O comentário na linha 22 registra a intenção de remover antes do release. Não
foi removido, e o release foi publicado.

#### Por que o `.gitignore` não pegou

O `.gitignore` (linhas 46-49) protege `.env` e `.env.*` corretamente. Mas
`verify-scraper.ts` é um arquivo de código comum — nenhuma regra o cobre, e não
havia por que cobrir. **A falha não foi de configuração: foi credencial escrita
em código-fonte.**

Lição estrutural: `.gitignore` protege arquivos designados para segredo. Não
protege segredo colocado onde não devia estar.

#### Remediação

1. ~~Trocar a senha do SIGAA.~~ **Feito 2026-08-02.**
2. Trocar a senha onde for reutilizada — verificação do autor.
3. Remover `verify-scraper.ts` do HEAD. Já previsto no Nível 1 da
   `docs/AUDITORIA_COMPLEXIDADE.md` (é código morto: nenhum script npm o usa).
4. Limpar o histórico — **decisão: `git filter-repo`**, não repo novo. Preserva
   os 269 commits e remove o arquivo de todos eles. Procedimento abaixo.
5. Prevenção no CI (`PIPE-002` e `PIPE-006`).

#### Procedimento de limpeza de histórico

Decisão (Bruno, 2026-08-02): `git filter-repo`. Descartado criar repositório
novo — jogaria fora 269 commits que registram o trabalho de engenharia reversa
do SIGAA, para resolver um problema que tem solução cirúrgica.

```bash
# 0. BACKUP primeiro — cópia da pasta inteira, fora do controle de versão
#    filter-repo reescreve todos os commits; não há undo.

pip install git-filter-repo

# 1. remover o arquivo de todo o histórico
git filter-repo --path verify-scraper.ts --invert-paths
git filter-repo --path tsconfig.verify.json --invert-paths

# 2. conferir que a credencial não aparece mais em nenhum commit
git log --all -p -S 'COLE_A_SENHA_ANTIGA_AQUI'   # deve retornar vazio
# (não deixe a senha escrita neste arquivo — rode o comando e apague do terminal)
git log --all --oneline -- verify-scraper.ts   # deve retornar vazio

# 3. auditar uma vez todo o histórico reescrito
#    o relatório é local e pode conter achados sensíveis; não o commite
gitleaks detect --source . --log-opts="--all" --report-path gitleaks-history.json

# 4. o filter-repo remove o remote por segurança; recolocar e forçar
git remote add origin https://github.com/Laginho/SIGAA-ME.git
git push --force --all
git push --force --tags
```

**Hipótese não testada:** as regras padrão do Gitleaks miram strings com formato
de chave ou token, enquanto o vazamento do `SEC-000` era uma senha comum. É
possível que a auditoria retroativa não a reconheça. Portanto, `no leaks found`
não prova que o histórico está limpo; para este incidente, a busca explícita com
`git log -S` pela senha antiga continua sendo a verificação determinante.

Efeitos colaterais esperados:

- Todos os SHAs de commit mudam. Clones antigos ficam incompatíveis — irrelevante
  aqui, o autor é o único.
- Tags de release apontam para SHAs novos; os binários já publicados no Releases
  não são afetados.
- Após o force-push, o GitHub pode manter objetos órfãos acessíveis por SHA direto
  até a coleta de lixo. Em repositório privado é irrelevante. **Conferir antes de
  reabrir ao público.**

#### Nota sobre o registro do incidente

Este item permanece documentado deliberadamente. Credencial hardcoded em arquivo
de debug é um dos erros mais comuns da profissão — o GitHub mantém secret
scanning justamente por isso. O que distingue não é a ausência do erro, é a
resposta: repo fechado, senha trocada, causa entendida, prevenção adicionada.

Remover a credencial do histórico é higiene. Apagar o registro de que houve um
incidente seria perder a única parte com valor.

#### Prevenção (`PIPE-002` e `PIPE-006`)

- Regra de lint proibindo string literal em variável chamada `password`,
  `senha`, `secret`, `token`.
- Scanner de segredo no CI com Gitleaks, implementado no `PIPE-006`. A prova por
  mutação bloqueou um token falso. Em `push`, a action executou com
  `--log-opts=-1`, então o checkout completo não transformou a primeira execução
  numa auditoria dos 269 commits: a limpeza histórica continua sendo o
  `git filter-repo` acima.
- Regra no `CLAUDE.md`: credencial só via `process.env`, **sem valor de
  fallback**. Se a variável não existir, o programa deve falhar, não usar um
  padrão.

#### Acceptance criteria

- Senha do SIGAA trocada (confirmado pelo autor).
- Nenhuma credencial literal em código-fonte.
- Decisão sobre reescrita de histórico registrada, com justificativa.
- CI tem verificação que impede reincidência.

#### Implementation notes

- Commit da prevenção no CI: `30dcbcd`
- Data da troca de senha: —
- Decisão sobre histórico: —
- Scanner: run-base
  [`31322967979`](https://github.com/Laginho/SIGAA-ME/actions/runs/31322967979)
  verde, sem licença exigida e sem achado porque a action usou `--log-opts=-1`;
  mutação no run
  [`31323088727`](https://github.com/Laginho/SIGAA-ME/actions/runs/31323088727)
  bloqueada com dois achados no arquivo falso. Nenhum valor de segredo foi
  transcrito neste documento.
