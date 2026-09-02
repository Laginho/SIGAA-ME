# SIGAA-ME Hardening Tracker

This document is the repository-owned source of truth for the security,
reliability, privacy, accessibility, dependency, and release work identified in
`CODE_REVIEW.md`.

It is deliberately written so a new chat, contributor, or coding agent can
resume work without needing the original review conversation.

## How to use this tracker

1. Read the **Current handoff** section.
2. Select one task whose dependencies are complete.
3. Change its status to `IN PROGRESS` and add an owner or task/thread name.
4. Read every file and acceptance criterion listed for that task.
5. Keep the task scoped. If new work is discovered, add a linked task instead
   of silently expanding the current one.
6. Run the task's verification commands.
7. Record the commit, test results, relevant design decisions, and remaining
   risks in the task's implementation notes.
8. Change the status to `DONE` only when every acceptance criterion passes.

Agents must not delete completed tasks. The history is part of the handoff.

## Status vocabulary

| Status | Meaning |
|---|---|
| `NOT STARTED` | No implementation is in progress. |
| `IN PROGRESS` | An owner is actively implementing the task. |
| `BLOCKED` | Work cannot continue; the blocker must be recorded. |
| `IN REVIEW` | Implementation is complete and awaiting review/verification. |
| `DONE` | Acceptance criteria and verification are complete. |
| `PARTIAL` | Some protection exists, but the task is not complete. |

## Priority vocabulary

| Priority | Release meaning |
|---|---|
| `P0` | Distribution blocker; exploitable trust-boundary failure. |
| `P1` | Beta/release blocker; significant privacy or reliability risk. |
| `P2` | Must be scheduled before broader distribution. |
| `P3` | Maintainability or defense-in-depth improvement. |

## Current baseline

- Baseline commit: `5968a40`
- Typecheck: passing at the baseline.
- Deterministic Vitest suite: 68 passed, 4 live tests skipped.
- Live SIGAA smoke tests: opt-in with `RUN_LIVE_SIGAA_TESTS=true`.
- Production dependency audit on 2026-08-09: 5 high-severity production
  packages; full tree has 18 findings (1 low, 15 high, 2 critical). Ver
  `DEP-001`.
- Vite/Vitest aligned: Vite `6.4.3`; Vitest `4.1.4`. Clean `npm ci`, quality
  gate and Windows packaging passed (`DEP-002`).
- `CODE_REVIEW.md` is the originating review; this tracker supersedes it for
  implementation status.

**Atualização 2026-08-05** (working tree sobre `38ff29b`, ainda não commitado):

- A suíte deixou de depender do ambiente (`QA-002` fechada) e roda num Linux.
- Novo tier de testes: parser real contra fixture, contrato do `window.api`,
  E2E de Electron e loop de verificação visual (`QA-004`).
- `npm ci` **não roda neste repositório** — lock fora de sincronia com o
  `package.json`. Registro histórico; resolvido pelo `DEP-002` em 2026-08-09.

## Master dependency order

> **REVISADO 2026-08-02.** A ordem abaixo é a de *dependência técnica* e
> continua correta. A **ordem de execução** foi alterada: a fase de pipeline
> (`PIPE-001`..`PIPE-004`) vem antes de tudo. Justificativa completa na seção 3
> de `docs/PLANO.md`; resumo no fim desta seção.

The safe implementation order is:

1. `ARCH-001` shared domain and IPC contracts.
2. `SEC-001` renderer content safety.
3. `SEC-002` typed preload and validated IPC.
4. `SEC-003` navigation and external-link policy.
5. `DATA-001` stable account identity and account-scoped cache.
6. `DATA-002` logout and clear-all semantics.
7. `CONC-001` Playwright operation coordinator.
8. `DL-001` download path containment.
9. `DL-002` content-type and file validation.
10. `OBS-001` bounded, redacted logging and diagnostics.
11. `A11Y-001` accessibility remediation.
12. `DEP-001` dependency/security upgrade set.
13. `QA-001` deterministic quality gates and coverage.
14. `REL-001` signing and gated publishing.
15. `PORTAL-*` tasks may begin after `ARCH-001`; their live canary must be in
    place before claiming portal compatibility for a release.

Tasks from later phases may be researched early, but their implementation must
not bypass incomplete trust-boundary work.

### Ordem de execução revisada (2026-08-02)

```
FASE 0   DOC-001, DOC-002                    fundação de processo
FASE 1   PIPE-001..004                       gate de release       ← COMEÇA AQUI
FASE 2   BUG-001, DL-001, BUG-002, BUG-003   bugs de uso diário
FASE 3   ARCH-001 → SEC-001 → SEC-002 → SEC-003 → DATA-001 → DATA-002 → CONC-001
FASE 4   DEP-001, OBS-001, A11Y-001, PORTAL-*, REL-001
```

**Por que o pipeline vem antes do `ARCH-001`:** hoje não existe forma de rodar a
suíte em modo não interativo (ver `PIPE-002`). Começar pelo `ARCH-001` significa
refatorar 9 arquivos de fronteira sem nenhum teste que prove que nada quebrou.
O pipeline é também o único item que **impede a regressão** — os outros são
limpeza pontual.

**Isto viola a regra da linha 79?** Não. A Fase 1 não toca a fronteira de
confiança. A Fase 2 mexe em `http-scraper.service.ts` e `main.ts` antes do
`ARCH-001`, o que é flexibilização consciente — mas essas tarefas **reduzem**
superfície (removem código morto, removem ação dev de produção) em vez de
ampliá-la. A restrição existe para impedir crescimento de superfície, não
manutenção corretiva.

---

## INCIDENTE — precede todas as fases

### SEC-000 — Credenciais reais expostas em repositório público

- Status: `IN PROGRESS` — risco neutralizado; limpeza de histórico pendente
- Priority: `P0`
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

---

## FASE 0 — Fundação de processo

### DOC-001 — Corrigir os documentos de auditoria

- Status: `DONE`
- Priority: `P1`
- Owner: Claude (sessão 2026-08-02)
- Dependencies: none
- Primary files: `CODE_REVIEW.md`, `docs/HARDENING_TRACKER.md`, `docs/PLANO.md`

#### Acceptance criteria

- `CODE_REVIEW.md` não contém mais o erro factual sobre a chave não fechada.
- A escala do achado de `innerHTML` está precisada (9 sinks, não 47).
- `notification-store.ts` e `settings.ts` removidos da lista de afetados;
  `toast.ts` adicionado.
- Os 5 achados novos estão registrados como tarefas neste tracker.
- A refutação do `download.service.ts` como código morto está documentada.

#### Implementation notes

- Commit: —
- Decisões: auditoria original mantida como registro histórico, com correções
  marcadas inline como `[CORRIGIDO 2026-08-02]` em vez de reescrita. Preserva o
  rastro do que foi pensado e quando.

### DOC-002 — Escrever `CLAUDE.md`

- Status: `DONE` — `CLAUDE.md` existe na raiz (sessão 2026-08-02)
- Priority: `P1`
- Owner: —
- Dependencies: `DOC-001`
- Primary files: New: `CLAUDE.md` (raiz)

#### Required content

- Comandos do projeto (dev, build, test, quality).
- Arquitetura em uma frase + ponteiro para `ARCHITECTURE.md`.
- Regras invioláveis: nunca `innerHTML` com dado do SIGAA; nunca `as any` para
  atravessar IPC; todo canal IPC novo precisa de tipo e validação; nunca
  `try/catch` que só faz `console.error`.
- O que verificar antes de commitar.
- Ponteiro para este tracker e para `docs/PLANO.md`.

#### Acceptance criteria

- Um agente sem contexto prévio consegue trabalhar no repositório sem repetir os
  erros conhecidos (`pauseSync`, `as any` em IPC, `innerHTML` com dado externo).

#### Rationale

Este é o artefato que teria evitado boa parte da dívida atual. Codifica o
julgamento do projeto num lugar que agentes futuros herdam automaticamente.

---

## FASE 1 — Gate de release

### PIPE-001 — Pausar a publicação automática

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P0`
- Owner: Claude
- Dependencies: none
- Primary files: `.github/workflows/release.yml`, `package.json`

#### Problem

`npm run release` termina em `electron-builder --win --publish always`. A flag
publica **incondicionalmente**. Combinado com auto-update ativo, existe um
caminho sem freio entre "commitei uma tag" e "o app na máquina do usuário foi
substituído" — sem que teste algum tenha rodado.

#### Acceptance criteria

- Nenhum push de tag publica binário sem passo explícito.
- O build local segue funcionando sem alteração de fluxo para o autor.

#### Verification

Push de tag de teste não gera release publicado.

#### Implementation notes (2026-08-05)

Duas mudanças, e a segunda é a que importa:

1. `release.yml` perdeu o gatilho `push: tags: v*.*.*` e ficou só com
   `workflow_dispatch`, com um input booleano `publish` que **começa
   desmarcado**. Desmarcado, o workflow compila e sobe o instalador como
   artefato; marcado, publica no GitHub Releases.
2. O `package.json` trocou `--publish always` por `--publish never` no script
   `release`. A flag que substitui o app dos usuários passou a existir **só**
   dentro do `release.yml`.

Por que as duas: tirar só o gatilho deixaria `npm run release` publicando da
máquina do autor sem cerimônia. Tirar só a flag deixaria o push de tag rodando um
build inútil a cada versão. O caminho perigoso era a **combinação**
`release:patch` (que faz `git push --follow-tags`) + gatilho de tag + `always`.

`RELEASE_GUIDE.md` foi atualizado no mesmo commit — ele descrevia o fluxo antigo
("o push inicia o build"), e guia que mente sobre publicação é pior que guia
ausente.

**Passo manual necessário:** `.github/workflows/` é protegido contra escrita por
ferramenta remota (é a superfície com que um agente poderia se dar permissões no
CI). O `release.yml` foi **entregue no chat** e precisa ser salvo por cima do
arquivo à mão. Confirme o diff antes de commitar.

### PIPE-002 — Criar os scripts npm que faltam

- Status: `DONE` — `npm run quality` verde no Windows em 2026-08-04
  (68 passed, 4 skipped). Ver o `QA-003` para o que isso **não** prova.
- Priority: `P0`
- Owner: Claude (sessão 2026-08-02) / revisão de Bruno
- Dependencies: none
- Primary files: `package.json`, `eslint.config.js`, `shared/ipc.ts`,
  `electron/preload.ts`, `electron/main.ts`, `src/vite-env.d.ts`,
  `electron/services/persistence.service.ts`, `tsconfig.json`

#### Estado da implementação (2026-08-02)

| Item | Status |
|---|---|
| Scripts `test`, `typecheck`, `lint`, `quality` | Feito |
| `eslint.config.js` com zonas | Feito |
| Remoção de `verify-scraper.ts` + `tsconfig.verify.json` | Feito |
| Regra contra credencial com fallback | Feito |
| Tipagem da fronteira (`preload.ts`, `main.ts`) | Feito |
| `shared/ipc.ts` criado e incluído no tsconfig | Feito |
| Consumidores de `window.api` ajustados | Feito (sessão 2026-08-04) |
| `prefer-const` (13 sítios) | Feito |
| `tsc --noEmit` | **0 erros** (verificado 2026-08-04) |
| `eslint .` | **0 erros**, 125 avisos (verificado 2026-08-04) |
| `npm run quality` no Windows | **Verde** — 68 passed, 4 skipped (2026-08-04) |

Primeira execução (antes da tipagem): typecheck limpo, testes 68 passed /
4 skipped, lint com 34 erros e 149 avisos. Os 34 eram: 18 `any` na fronteira,
14 `prefer-const`, 2 `catch {}` vazios e 1 falso positivo da regra de credencial
(corrigido — a regra pegava qualquer `process.env.X || fallback`, inclusive
`VITE_PUBLIC || path.join(...)`).

#### Fechamento da tipagem (sessão 2026-08-04)

O suspeito nº 3 se confirmou: 30 erros de `tsc`, todos nos consumidores de
`window.api`. Os suspeitos 1 e 2 não deram problema.

Decisão do autor sobre o escopo: **corrigir o contrato declarado, validar o
`unknown` no call site — sem antecipar o `ARCH-001`.**

Os 30 erros eram de três naturezas diferentes, e a distinção é o que evitou
transformar o `PIPE-002` numa tarefa de Fase 3:

**a) Contrato declarado incompleto (22 erros).** O `vite-env.d.ts` foi escrito
por leitura parcial do main. Faltavam campos que o main devolve de fato:
`account` (`sigaa.service.ts:38`), `photoUrl` (`:70`), `skipped` e `results`
(`:282`), e o formato real de `news` (`playwright-login.service.ts:1183`).
Aqui o call site estava certo e a **declaração** estava errada. Modelados em
`shared/ipc.ts`: `AccountSummary`, `DownloadResultItem`, `NewsDetail` — todos
lidos do código, nenhum inventado.

**b) União discriminada faltando (4 erros).** `selectDownloadFolder` declarava
`{ success: boolean; folderPath?: string }`, então `if (!res.success) return`
não estreitava nada e `folderPath` seguia `string | undefined` para sempre.
Trocado por `{ success: true; folderPath: string } | { success: false }`, que é
o que o main realmente devolve (`main.ts:149-159`). **Os 4 erros de
`string | null` no DOM desapareceram sem tocar em nenhum call site** — eram
sintoma, não causa. Padrão a reconhecer: erro de `null`/`undefined` espalhado
por call sites geralmente é uma união discriminada ausente na origem.

**c) O `unknown` fazendo o trabalho dele (4 erros).** `courses?: unknown[]` em
`sync-selection.ts`. Em vez de criar `CourseSummary` (que é `ARCH-001`), foi
adicionado o type guard `isCourseLike` validando a forma mínima que a página
precisa. Efeito colateral útil: se o SIGAA mudar de formato, isso passa a falhar
alto com mensagem de deriva de seletor em vez de gravar `undefined` no cache.

#### Problem

Dos 9 scripts exigidos por `QA-001`, **zero existem**. Os únicos scripts de teste
(`test:ui`, `test:watch`) estão ambos em modo watch e nunca terminam — não há
forma de rodar a suíte em CI. Não há ESLint no projeto.

#### Escopo mínimo (ver nota de simplificação abaixo)

- `test` — `vitest run` (não watch)
- `typecheck` — `tsc --noEmit`
- `lint` — ESLint
- `quality` — os três em sequência

#### Nota de simplificação

`QA-001` exige 9 scripts. Os 4 acima cobrem o gate; os outros 5
(`test:unit`, `test:integration`, `test:live`, `coverage`, `audit:prod`) entram
quando houver necessidade concreta. Criar script que ninguém roda é cerimônia.

#### Decisão sobre ESLint (Bruno, 2026-08-02): estrito

Estrito **por zona**, para não quebrar o build em 113 pontos antes de existir
teste:

- **Erro** em `electron/preload.ts`, handlers IPC de `electron/main.ts`,
  `shared/**` (quando existir), e todo arquivo novo.
- **Aviso** no resto do código existente.
- **Erro em qualquer lugar:** `as any` em chamada de IPC — foi o mecanismo exato
  que escondeu o `BUG-002`.
- Catraca como disciplina, não como ferramenta: o número de avisos só pode cair.

#### Acceptance criteria

- `npm test` roda a suíte e **termina sozinho**.
- `npm run quality` roda typecheck + lint + testes em sequência.
- O build não quebra por causa dos `any` existentes.

### PIPE-003 — CI de pull request

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P0`
- Owner: Claude
- Dependencies: `PIPE-002`
- Primary files: `.github/workflows/quality.yml` (o nome ficou `quality`, não
  `ci`)

#### Problem

Não existe CI para PR. O único workflow tem triggers `workflow_dispatch` e push
de tag. Nenhum PR jamais foi verificado.

#### Acceptance criteria

- Abrir PR dispara `npm run quality`.
- Não requer credenciais do SIGAA — só testes determinísticos.
- Um PR com teste quebrado mostra falha visível.

#### Implementation notes (2026-08-05)

`quality.yml` roda em `push` de qualquer branch, em `pull_request` e por
`workflow_dispatch`, com `concurrency` cancelando execução anterior do mesmo
branch. Dois jobs:

- `gate` — `windows-latest`, typecheck → lint → testes, em passos separados para
  que a aba do Actions diga **qual** falhou.
- `e2e` — os specs de Playwright que não precisam de credencial, com
  `continue-on-error: true` e upload de `playwright-report/`,
  `test-results/` e `_agent_tmp/shots/`. Não bloqueia o gate: se o Electron não
  subir no runner, o resultado do typecheck/lint/testes continua legível.

Por que `windows-latest` e não `ubuntu`: é a plataforma do autor e a que baixa os
binários nativos que o app usa de verdade. Rodar o gate num Linux verificaria
uma árvore de dependências que ninguém executa.

Sem credencial no ambiente, os 3 testes de login real entram em skip pelo
`describeOrSkip`. É intencional — credencial de portal universitário não vai para
secret de CI, e o CI não deve logar na conta de ninguém a cada push.

**Ressalva registrada no próprio YAML:** o passo de instalação usa
`npm install`, não `npm ci`, por causa do `DEP-002`. O CI existe e roda; o que
ele não é ainda é **reproduzível** — ele resolve versões por conta própria em vez
de instalar o que o lock descreve.

**Follow-up 2026-08-09:** ressalva resolvida. O `DEP-002` alinhou Vite/Vitest,
regenerou o lock e trocou os passos para `npm ci`. O `PIPE-005` tornou o E2E
bloqueante e o `PIPE-006` adicionou o terceiro job, de scanner de segredo.

### PIPE-004 — Gate no release

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P0`
- Owner: Claude
- Dependencies: `PIPE-002`, `PIPE-003`
- Primary files: `.github/workflows/release.yml`

#### Acceptance criteria

- Jobs encadeados por `needs`: `quality` → `build` → `publish`.
- É impossível publicar com teste falhando.
- Checksums SHA-256 gerados no release (ver `REL-001` revisado).

#### Implementation notes (2026-08-05)

Atendido, mas **não** com `needs:` entre jobs — o GitHub não permite depender de
um job de outro workflow, e o gate vive no `quality.yml`. O gate roda como passos
dentro do próprio job de release, antes do build: `typecheck` → `lint` → `test` →
`Build` → `Publish` (condicional). Falha em qualquer um interrompe o job, então
não existe binário nem release.

Custo aceito: os três comandos aparecem em dois arquivos. A alternativa
(`workflow_call` reutilizável) é mais máquina do que este projeto precisa hoje —
e a duplicação aqui é de *invocação*, não de *definição*: os dois chamam os
mesmos scripts do `package.json`, que continuam sendo a única descrição do gate.
Se algum dia o gate mudar de forma, muda no `package.json`.

O passo `Publish` empacota uma segunda vez (~1-2 min a mais), e isso está
comentado no YAML: a alternativa era repetir os passos do script `release` dentro
do workflow, criando duas descrições do build que podem divergir.

**Não atendido:** checksums SHA-256. Continua no `REL-001`.

---

### PIPE-005 — Tornar o E2E bloqueante e limitar o tempo dos jobs

- Status: `DONE` — implementado e verificado em 2026-08-09
- Priority: `P1`
- Owner: Codex
- Dependencies: `QA-006`
- Primary files: `.github/workflows/quality.yml`

#### Problem

O job `e2e` tinha `continue-on-error: true`, então uma regressão que impedisse o
Electron de subir ainda deixava o workflow verde. Os jobs `gate` e `e2e` também
não tinham `timeout-minutes` e herdavam o teto padrão de seis horas do GitHub.

#### Fix

- Removidos `continue-on-error: true` e o comentário que o justificava.
- Adicionado `timeout-minutes: 15` aos jobs `gate` e `e2e`.
- Preservado `if: always()` no upload do relatório e dos screenshots.

#### Acceptance criteria

- Uma falha no E2E deixa o workflow `Quality` vermelho.
- Os dois jobs têm teto de 15 minutos.
- O artefato de diagnóstico continua sendo enviado mesmo quando o E2E falha.

#### Verification

Prova por mutação no branch descartável `codex/pipe-005-proof`, commit
`142c48e`: o helper de lançamento do E2E lançou um erro deliberado, sem alterar
nenhum spec do Playwright. O run
[`31322548186`](https://github.com/Laginho/SIGAA-ME/actions/runs/31322548186)
concluiu com `failure`; `Typecheck, lint e testes` passou e
`E2E sem credencial` falhou. O branch foi removido depois da prova.

#### Implementation notes

- Commit da implementação: `b4656c0`
- O commit `142c48e` existiu apenas no branch de mutação descartável.
- Divergências da especificação: nenhuma.

---

### PIPE-006 — Bloquear novos segredos no CI

- Status: `DONE` — implementado e verificado em 2026-08-09
- Priority: `P1`
- Owner: Codex
- Dependencies: none
- Primary files: `.github/workflows/quality.yml`

#### Problem

A regra de ESLint do `SEC-000` só reconhece o padrão específico de credencial em
fallback. Nada no CI detectava uma credencial genérica adicionada em outro
formato ou arquivo.

#### Fix

Adicionado o job separado `secrets`, em `ubuntu-latest`, com teto de 10 minutos,
checkout de histórico completo (`fetch-depth: 0`) e
`gitleaks/gitleaks-action@v2`. A action usa o `GITHUB_TOKEN` efêmero do próprio
run. Nenhuma licença adicional foi necessária para a conta individual
`Laginho`.

#### Acceptance criteria

- O scanner executa em push e pull request sem credencial externa.
- Um novo token detectável deixa o workflow vermelho.
- O resultado e o limite da primeira execução estão registrados no `SEC-000`.

#### Verification

1. Run-base
   [`31322967979`](https://github.com/Laginho/SIGAA-ME/actions/runs/31322967979),
   commit descartável `4a149b6`: os três jobs passaram e o Gitleaks informou
   `no leaks found`.
2. Mutação
   [`31323088727`](https://github.com/Laginho/SIGAA-ME/actions/runs/31323088727),
   commit descartável `4860c95`: gate e E2E passaram; o scanner falhou com dois
   achados (`generic-api-key` e `github-pat`) no arquivo falso
   `tests/fixtures/pipe-006-fake-secret.ts`. O workflow concluiu com `failure`.
3. O branch `codex/pipe-006-proof` foi removido depois da prova.

#### Divergência da especificação

A primeira execução deveria ficar vermelha por causa da credencial antiga do
`SEC-000`, mas ficou verde. O log mostra que `gitleaks-action@v2` acrescentou
`--log-opts=-1`, analisando apenas o commit mais recente nesse evento `push`.
Assim, `fetch-depth: 0` disponibiliza o histórico, mas não ordena uma auditoria
integral. Não foi adicionada uma flag não especificada para mudar esse
comportamento. O `PIPE-006` fecha a prevenção de novos segredos; a remoção do
segredo antigo continua sendo o `git filter-repo` do Bruno.

Decisão do arquiteto em 2026-08-09: manter assim. Guarda do futuro roda em todo
push; auditoria do passado roda uma vez, manualmente, junto do `filter-repo`.
Fazer o CI reauditar o histórico antes da limpeza deixaria o gate
permanentemente vermelho e ensinaria o projeto a ignorá-lo.

#### Implementation notes

- Commit da implementação: `30dcbcd`
- Os commits `4a149b6` e `4860c95` existiram apenas no branch descartável.
- Nenhum valor de segredo real foi exibido ou registrado.

---

## FASE 2 — Bugs de uso diário

### BUG-001 — Download apaga arquivos válidos

- Status: `DONE` — 2026-08-09, commit `700de9a`
- Priority: `P0` (**promovido** de P2 no review original)
- Owner: Claude (sessão 2026-08-09)
- Dependencies: `PIPE-002`
- Primary files: `electron/services/http-scraper.service.ts`,
  `tests/integration/download-real.test.ts` (novo)

#### Problem

Cadeia confirmada:

1. linha 918-922: sem extensão detectada → `detectedExtension = '.pdf'`
2. linha 926-927: extensão anexada ao nome
3. linha 956-958: valida magic bytes conforme extensão → procura `%PDF`
4. linha 960-965: falha → `fs.promises.unlink(filePath)`

Qualquer `.txt`, `.csv`, `.py`, `.odt` servido como `application/octet-stream` é
baixado e **imediatamente apagado**. O fallback inventa uma mentira sobre o tipo
e a validação seguinte pune o arquivo por ela.

**Por que é P0:** perda de dados no caminho principal do app.

#### Required behavior

- Remover o fallback para `.pdf`.
- Resolver tipo nesta ordem: extensão existente segura → `Content-Disposition` →
  MIME conhecido → magic bytes.
- Usar `.bin` ou sem extensão quando genuinamente desconhecido.
- Continuar rejeitando páginas HTML de login/erro.
- Não rejeitar binário legítimo apenas por não ter assinatura registrada.

#### TDD — esta tarefa é o exercício de ciclo vermelho-verde

Escrever **primeiro** o teste que baixa um `.txt` servido como `octet-stream` e
afirma que o arquivo sobrevive. Ele **deve falhar** antes da correção.

#### Acceptance criteria

- Fixture de octet-stream não-PDF sobrevive à validação.
- HTML disfarçado de PDF continua sendo rejeitado e o temporário é removido.
- Download falho não deixa arquivo final parcial.

#### Implementation notes (2026-08-09)

**A correção não foi apagar o fallback.** Apagar as cinco linhas do chute faria
o `.txt` sobreviver e faria **todo PDF voltar a cair sem extensão** — consertaria
o caso raro quebrando o comum. O fallback existia porque a maioria dos anexos de
um portal universitário é PDF e o SIGAA serve muitos deles como `octet-stream`
sem `Content-Disposition`. Ele acertou o problema; o defeito era o passo
seguinte tratar o palpite como fato.

A raiz: **o passo 1 inventava um tipo e o passo 6 punia a invenção.** Enquanto
os dois existissem, era uma contradição esperando o arquivo errado.

O que foi feito:

1. A extensão passa a ser **deduzida do conteúdo** (`detectExtension`), usando a
   mesma tabela de magic bytes que a verificação usa. Detecção e verificação
   leem os mesmos bytes, então não têm como se contradizer. `''` é resposta
   válida quando nenhuma assinatura casa — sem extensão é inconveniente, apagado
   é perda de dado.
2. A tabela `SIGNATURES` virou campo único da classe. Duas tabelas que precisam
   concordar é o padrão que já quebrou este repositório em `QA-005` e `BUG-007`.
3. O download grava em **`.part`** e só é renomeado depois de verificado. Isso é
   o que permite (1) — a extensão vem de bytes que só existem depois de gravados
   — e é o que atende o terceiro critério de aceitação: um download interrompido
   nunca deixa um arquivo com o nome final.
4. `verifyFileContent` foi dividida em `readHead` + `verifyHead`, para o arquivo
   ser lido uma vez só. Único chamador, refatoração contida.

**`.zip` vem por último na ordem de detecção**, de propósito: docx/xlsx/pptx têm
a mesma assinatura, então sem `Content-Disposition` não há como distinguir, e
`.zip` é a resposta honesta em vez de um chute entre os três.

#### Achado durante o teste do terceiro critério

`pipe()` **não propaga erro do source para o destino.** Se a conexão caísse no
meio do stream, o `writer` nunca emitia `finish` nem `error`, e a Promise do
`downloadFile` **nunca resolvia** — a UI ficava em "baixando" para sempre e o
parcial ficava no disco. Não era o `BUG-001`, mas está no mesmo bloco e cabe no
mesmo critério de aceitação, então foi corrigido junto: handler de `error` no
`response.data`, que destrói o writer, descarta o parcial e resolve.

#### Verification

Ciclo vermelho-verde, como o `PLANO.md` pedia para esta tarefa. O teste foi
escrito **antes** e falhou pelo motivo previsto — o log da execução vermelha
registra `Deleted invalid file: .../LISTA 1.pdf`.

`tests/integration/download-real.test.ts`, 6 testes, chamando o
`downloadFile` de produção com só o `axios` mockado:

| Teste | Critério |
|---|---|
| `.txt` como octet-stream sobrevive | 1 |
| PDF como octet-stream ganha `.pdf` pelo conteúdo | regressão do caso comum |
| extensão que já veio da UI é respeitada | regressão |
| HTML com `Content-Disposition: .pdf` é rejeitado, destino vazio | 2 |
| HTML sem `Content-Disposition` é rejeitado, destino vazio | 2 |
| conexão interrompida: sem arquivo e sem Promise pendurada | 3 |

**Prova por mutação** (regra 5 do `CLAUDE.md`), duas, em cópia descartável:

1. Devolver o chute (`this.detectExtension(head) || '.pdf'`) → **só** o primeiro
   teste fica vermelho. Os outros cinco continuam verdes, o que mostra que a
   asserção é específica.
2. Desligar o handler de erro do stream (`'error'` → `'erro-desligado'`) → o
   sexto teste estoura por timeout em 8s, que é exatamente a Promise nunca
   resolvendo.

Gate no container Linux (o Windows continua sendo a autoridade):

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npx eslint .` | 0 erros, **115 avisos** (eram 116 depois do `CLEAN-001`, 125 no início da sessão) |
| `npx vitest run` | **70 passed, 4 skipped** (eram 64 + 4) |

#### O que este trabalho NÃO fechou

- **`DL-001` (path containment) continua aberto.** O `.part` + rename é parte da
  mecânica que o `DL-001` pede, mas a validação estrutural com
  `path.resolve` + `path.relative` **não foi feita**. A única defesa contra
  traversal continua sendo a lista negra de caracteres.
- **`DL-002`** se sobrepõe a esta tarefa e precisa de releitura: parte do que ele
  descreve foi feito aqui.
- As fixtures de resposta são sintéticas. Isto prova que a lógica de tipo e
  verificação está correta contra as respostas que **assumimos** que o SIGAA dá.
  Gravar uma resposta real do portal é o passo que prova a suposição.

#### Fechamento

`npm run quality` rodado no Windows por Bruno, e commitado em `700de9a`.

**O commit ficou único, e isto é um desvio do planejado.** O plano eram três
commits — remoção, correção, documentação —, para que um `git revert` da
correção do download não arrastasse junto a remoção de código morto nem 300
linhas de markdown. Na prática o `git commit` sem `-m` abriu o editor, o buffer
saiu sem conteúdo (o git remove toda linha iniciada por `#` antes de validar, e
o que sobrou foi string vazia), e o lote acabou num commit só.

Consequência aceita: o `700de9a` é indivisível. Se algum dia for preciso
reverter só o `BUG-001`, será um revert manual do
`electron/services/http-scraper.service.ts`, não um `git revert` do commit.

O commit foi amendado depois para que a mensagem descrevesse o conteúdo real —
ela dizia `docs:` enquanto continha uma correção P0. Um commit que mente no
`git log` é o mesmo problema que o `RELEASE_GUIDE` desatualizado e o
`ARCHITECTURE.md` descrevendo um fallback desligado: documento que engana custa
mais que documento ausente.

Mensagem original planejada para esta tarefa, preservada porque descreve a
correção melhor que a mensagem consolidada:

```
fix: stop deleting valid downloads with an unknown content type

A file with no extension in its UI name, served as octet-stream with no
Content-Disposition, was assigned .pdf by a fallback. The next step then
checked magic bytes against that guess, found no %PDF, and unlinked the
file. Any .txt, .csv or .odt served that way was downloaded and
immediately destroyed.

The fix is not removing the fallback: most attachments in a university
portal really are PDFs served as octet-stream, so removing it would fix
the rare case and break the common one. Instead the extension is now
derived from the magic bytes, using the same table the verification
uses, so detection and verification read the same bytes and cannot
contradict each other. Unknown content gets no extension rather than a
lie.

Downloads now stream to .part and are renamed only after verification.
That is what lets the extension come from content, and it means an
interrupted download never leaves a file under the final name.

Fixed alongside, found while testing that last point: pipe() does not
forward source errors to the destination, so a connection dropped
mid-stream left the downloadFile promise pending forever and the UI
stuck on "downloading".

Red-green: tests/integration/download-real.test.ts was written first and
failed with "Deleted invalid file: LISTA 1.pdf".
```

### BUG-002 — Remover o `pauseSync()` morto

- Status: `DONE` — fechado na sessão 2026-09-01
- Priority: `P1`
- Owner: Claude (sessão 2026-09-01)
- Dependencies: none
- Primary files: `src/pages/course-detail.ts`

#### Problem

`(window as any).api.pauseSync()` em `src/pages/course-detail.ts:58` e `:124`.
O método não existe no preload nem no main. Três defesas falharam: o cast
`as any` desligou o TypeScript, o `try/catch` engoliu o `TypeError`, e nenhum
teste exercitava o caminho. O código *parece* implementar proteção contra
concorrência e não implementa nada.

#### Decisão (Bruno, 2026-08-02): remover

Razão: nunca foi usado de fato e a ausência nunca foi sentida. A serialização
real é o `CONC-001`, na Fase 3.

#### Acceptance criteria

- As chamadas e seus `try/catch` foram removidos.
- `CONC-001` registra que a proteção está ausente e é conhecida.
- Nenhum `(window as any)` restante em `course-detail.ts` para acesso a `api`.

#### Rationale

Código que mente sobre o que faz é pior que código ausente. Remover torna o
débito visível. Ver anexo 7 de `docs/PLANO.md`.

#### Implementation notes (2026-09-01)

As chamadas a `pauseSync()` e seus `try/catch` já tinham sido removidas num
commit anterior (o arquivo tem comentários no lugar explicando a ausência), mas
a tarefa não foi marcada e **um critério ainda falhava**: restava um
`(window as any).api.loadAllNews(...)` em `course-detail.ts:80`. O método já
estava declarado no contrato `RendererApi` (`shared/ipc.ts`), então o cast era
puro resíduo — trocado por `window.api.loadAllNews`. Os
`(window as any).cleanupProgress` das linhas 292/294 não são acesso a `api` e
ficam para o `ARCH-001`/`SEC-002`.

A ausência da proteção contra concorrência está registrada no `CONC-001` (ver
nota lá) e no `DÉBITO-03`.

### BUG-003 — `[Dev] Simular Arquivo Novo` funciona em produção

- Status: `DONE` — ciclo PTMR 01 validado pelo master dev; Bruno confirmou no build
  empacotado 1.2.0 (2026-09-01) que o tray não tem `[Dev] Simular Arquivo Novo`
- Priority: `P1` (**promovido** de P2)
- Owner: PTMR (PLAN 5.6 terra · TEST/READ mimo v2.5 · MAKE muse spark 1.2); master dev Claude
- Dependencies: none
- Primary files: `electron/main.ts`, `electron/preload.ts`

#### Problem — a guarda existente está na ponta errada

| Ponta | Guardado? | Local |
|---|---|---|
| Handler IPC | Sim | `electron/main.ts:230` |
| Item do menu tray | **Não** | `electron/main.ts:344-361` |
| Preload `simulateNewFile` | **Não** | `electron/preload.ts:50-51` |

O item do tray **não passa por IPC** — a lógica está inline no callback `click`,
manipulando `cacheService['cache']` direto. A guarda protege a ponta que o
usuário não alcança e deixa livre a que ele vê e clica.

#### Acceptance criteria

- Tray de produção não contém comando de mutação de cache.
- Preload de produção não expõe `simulateNewFile`.
- Removido o acesso a membros privados por bracket notation
  (`cacheService['cache']`, `cacheService['saveCache']()`).

#### Resolution (2026-09-01) — primeiro ciclo PTMR do repositório

Ciclo limpo (ledger em `.scratch/bug-003/ledger.md`): três commits, um por fase,
`Role:` no trailer. Desenho do handoff seguido sem desvio:

- `cache.service.ts#forgetLastFile()` (público, retorna `{courseId, fileId} | null`)
  substitui as duas cópias inline e apaga todo `cacheService['...']` do `main.ts`.
- `main.ts`: uma função local `simulateNewFile()` alimenta o handler IPC (já
  guardado) e o item do tray, que agora só entra no menu com `!app.isPackaged`.
  `createWindow` passa `additionalArguments: ['--sigaa-dev']` só fora do pacote.
- `preload.ts`: `simulateNewFile` só é incluído no `api` quando
  `process.argv` tem `--sigaa-dev`; `RendererApi.simulateNewFile` virou opcional.
  Nenhum código em `src/` chamava o método.
- Conflito com o E2E (`QA-004`) resolvido sem tocar em `tests/e2e/`:
  `electron .` é não empacotado, então o gancho continua existindo no E2E.
- Testes: 3 em `cache-service.test.ts` (`forgetLastFile`), 2 em
  `preload-dev-gate.test.ts` (ponte presente com o flag, ausente sem — importa o
  preload de verdade com `electron` mockado), 1 em `preload-contract.test.ts`
  (nenhum `cacheService['` no `main.ts`). Vermelho-verde provado por MAKE.
- `npm run quality` no worktree: 0 erros de lint, 121 testes passando, 4 skipped.

### BUG-004 — O fallback Playwright de download não está ligado

- Status: `DONE` — ciclo PTMR 01 validado pelo master dev; smoke do Bruno em
  2026-09-01: o fallback disparou de verdade nos itens de tarefa (`BUG-011`),
  abriu Chrome dedicado e o log mostrou "Falling back to Playwright"
- Priority: `P1`
- Owner: PTMR (PLAN 5.6 terra · TEST/READ mimo v2.5 · MAKE muse spark 1.2); master dev Claude
- Dependencies: `PIPE-002` (não mexer sem suíte executável)
- Primary files:
  - `electron/services/download.service.ts` (492 linhas)
  - `electron/services/playwright-login.service.ts:748-980`
  - `electron/services/sigaa.service.ts:149-280`
  - `ARCHITECTURE.md`

#### Problem

O `ARCHITECTURE.md` afirma que o download cai de volta no Playwright quando o
HTTP falha. **O código existe e nunca é alcançado.** Cadeia real verificada em
2026-08-02:

```
main.ts:163 → sigaaService.downloadFile
            → _downloadFileInternal (sigaa.service.ts:149)
            → httpScraper.downloadFile (:221)
            → retry: httpScraper.downloadFile (:261)   ← retry também é HTTP
```

`PlaywrightLoginService.downloadFile` (:748) e `downloadAllFiles` (:864) têm
**zero chamadores** em todo o repositório, incluindo testes. Eles são o único
lugar que carrega `download.service.ts` (via `await import()`). Logo, as 492
linhas do `download.service.ts` são inalcançáveis por transitividade.

Total: **771 linhas de código morto**, e um fallback documentado que não existe.

#### Histórico deste achado (por que exige cuidado)

Três conclusões erradas em sequência — ver a nota de método no `CODE_REVIEW.md`.
Resumo: busca por `import ... from` não vê `await import()`; e provar que um
arquivo é importado não prova que ele é alcançável.

#### Decisão tomada (Bruno, 2026-08-02): LIGAR o fallback

Dado decisivo, fornecido pelo autor: **o download por HTTP falha com frequência e
de forma imprevisível.** O SIGAA é um sistema antigo, malfeito e hostil a
automação.

Isso inverte a recomendação inicial. As 771 linhas **não são gordura — são a
resposta a um problema real que hoje não está conectada.** Apagá-las removeria
justamente a mitigação de uma falha frequente.

| Opção | Status |
|---|---|
| ~~A — apagar as 771 linhas~~ | **Descartada.** Removeria a mitigação de uma falha que ocorre de fato |
| **B — ligar o fallback** | **Escolhida.** Se o HTTP falhar após retry, tenta Playwright |

#### Ordem de execução obrigatória

`BUG-001` **antes** deste. Razão: o `BUG-001` faz o app apagar arquivos válidos
que baixaram com sucesso. Parte do que hoje aparece como "o download falhou" pode
ser o app destruindo o próprio resultado. Ligar um fallback antes de corrigir isso
significaria acionar o Playwright para casos em que o HTTP funcionou — mais lento,
sem ganho, e mascarando o bug real.

Sequência: corrigir `BUG-001` → observar a taxa de falha remanescente → ligar o
fallback para o que sobrar.

#### Escopo da implementação

- Em `sigaa.service.ts:_downloadFileInternal`, após o retry HTTP falhar
  (linha 261), chamar `playwrightLogin.downloadFile` em vez de retornar erro.
- Idem para `downloadAllFiles` → `playwrightLogin.downloadAllFiles`.
- O caminho Playwright **nunca rodou em produção**. Tratar como código novo, não
  como código existente: precisa de teste antes de ser confiável.
- Manter a ordem HTTP-primeiro: o ganho de ~10x é real e o Playwright é o plano B.

#### Acceptance criteria

- Falha de download por HTTP após retry aciona o caminho Playwright.
- Existe teste que exercita o fallback (hoje não há nenhum).
- `ARCHITECTURE.md` passa a descrever o comportamento real — que agora coincide
  com o pretendido.
- O caminho HTTP continua sendo o primeiro tentado.

#### Nota sobre o achado da auditoria

A `docs/AUDITORIA_COMPLEXIDADE.md` classificou estas 771 linhas como o maior
corte disponível. **Não são.** É o exemplo mais claro de por que auditoria de
complexidade não decide sozinha: código inalcançável e código desnecessário
parecem idênticos numa busca estática. A diferença estava num dado sobre o mundo
real — a taxa de falha do SIGAA — que nenhuma ferramenta tinha.

#### Enxugar ≠ deletar (observação do autor, 2026-08-02)

Manter o fallback não obriga a manter as 771 linhas como estão. Depois de ligado
e com teste cobrindo o caminho, ele pode encolher — e aí a refatoração é segura,
porque existe prova de que continua funcionando.

Candidatos, na ordem em que fazem sentido:

1. **Retry em 4 camadas** (`sigaa.service.ts:449-539`, ~60 linhas). Hoje
   `downloadAllFiles` tem retry que se sobrepõe ao retry interno de
   `downloadFile`. Com o fallback Playwright ligado, viram 4 níveis de tentativa
   para o mesmo arquivo. Provavelmente 2 bastam (HTTP com retry → Playwright).
   **Requer dado:** medir a taxa de sucesso por camada antes de cortar.
2. **Duplicação entre `download.service.ts` e `http-scraper.downloadFile`** —
   sanitização de nome, montagem de headers, validação. Extrair o que é comum.
3. `sanitizeFolderName` com regex duplicada e substituto inconsistente
   (`''` em `sigaa.service.ts:128` vs `'_'` em `http-scraper.service.ts:933`).
   Isso é inconsistência real, não só duplicação — dois caminhos geram nomes
   diferentes para o mesmo arquivo.

**Ordem obrigatória:** ligar → testar → medir → enxugar. Encolher antes de ter
teste é o mesmo erro de apagar antes de ter dado, só mais devagar.

#### Acceptance criteria

- Decisão registrada com justificativa.
- `ARCHITECTURE.md` descreve o comportamento real, não o pretendido.
- Se opção A: as 771 linhas removidas e `npx tsc --noEmit` passa.
- Se opção B: existe teste que exercita o caminho de fallback.

#### Resolution (2026-09-01) — ciclo PTMR 01

Opção B implementada (ledger em `.scratch/bug-004/ledger.md`, ciclo limpo):

- `sigaa.service.ts#downloadViaPlaywright()` (privado, união discriminada,
  `error` → `message`) chama `playwrightLogin.downloadFile` com **`basePath`**,
  não `targetDir` — o `DownloadService` cria a pasta da turma sozinho.
- `_downloadFileInternal`: o `return` de erro depois do segundo HTTP virou a
  chamada ao fallback. Ordem preservada: HTTP → refresh + HTTP → Playwright.
- `downloadAllFiles`: depois do passe de retry HTTP, cada `result` ainda `failed`
  com script vai ao fallback, com a mesma contabilidade do passe de retry
  (`downloaded++`, `failed--`, `results[i]` substituído, `onProgress('downloaded')`).
  Deliberado: por arquivo, não `playwrightLogin.downloadAllFiles` — um seam só;
  o custo (um browser por arquivo) está marcado com `// ponytail:` no código.
- `ARCHITECTURE.md` descreve o fluxo real.
- Testes em `sigaa-service.test.ts`: HTTP-first não toca Playwright; duas falhas
  HTTP → Playwright chamado 1× com `basePath`; fallback falha → `message` do
  Playwright; lote com script → `downloaded: 1` via fallback; lote sem script →
  Playwright não chamado. Vermelho-verde provado por MAKE (3 vermelhos).
- Nit do master dev (commit `Role: MASTER`): o teste antigo "fails after second
  HTTP attempt fails" passava por acidente depois da mudança (mock sem retorno →
  `TypeError` → `catch` → `success: false`). Removido; o cenário é coberto pelo
  teste "returns Playwright error message when fallback also fails".
- Pontos abertos, por decisão: o fallback abre browser **visível**
  (`headless: false`, `playwright-login.service.ts:695`) — deixado como estava
  para que uma falha no primeiro uso real seja atribuível; `sanitizeFolderName`
  divergente entre `SigaaService` (remove) e `DownloadService` (`_`, corta em
  100) — item 3 de "Enxugar ≠ deletar", só depois de medir.

### BUG-005 — Encanamento morto no payload de download

- Status: `IN REVIEW` — implementado na sessão 2026-09-01; falta a verificação
  de download manual no app (Bruno)
- Priority: `P3`
- Owner: Claude (sessão 2026-09-01)
- Dependencies: none
- Primary files:
  - `shared/ipc.ts` (`DownloadFilePayload`, `DownloadAllFilesPayload`)
  - `electron/services/sigaa.service.ts:132-157` (`downloadFile`)
  - `src/pages/course-detail.ts:344-353, 427-435`

#### Problem

`fileUrl` e `downloadedFiles` fazem o caminho completo
localStorage → renderer → preload → IPC → `SigaaService`, e chegam como
`_fileUrl` / `_downloadedFiles` — o prefixo `_` existe porque
`noUnusedParameters` está ligado e eles **não são usados**.

O renderer lê e serializa o mapa de downloads a cada chamada para nada.

#### Por que não foi removido junto da tipagem da fronteira

Deliberado. A tipagem da fronteira (`PIPE-002`) já tocava 6 arquivos; remover
estes dois parâmetros toca também os call sites do renderer. Misturar as duas
coisas num diff só dificultaria a revisão — que é o mecanismo de aprendizado
combinado neste projeto. Dois commits pequenos e revisáveis valem mais que um
grande.

#### Acceptance criteria

- Os dois parâmetros somem de `shared/ipc.ts`, da assinatura de
  `SigaaService.downloadFile`/`downloadAllFiles`, do handler em `main.ts` e dos
  call sites em `course-detail.ts`.
- `npm run quality` passa.
- Download manual continua funcionando (verificação no app).

#### Implementation notes (2026-09-01)

Removidos `fileUrl` e `downloadedFiles` de `DownloadFilePayload` e
`downloadedFiles` de `DownloadAllFilesPayload`, e os parâmetros
correspondentes de `downloadFile`/`_downloadFileInternal`/`downloadAllFiles`
no `sigaa.service.ts`, do handler em `main.ts` e dos call sites. Um call site
a mais que o previsto: `background-sync.service.ts:161` passava `{}` como
`downloadedFiles` no auto-download. O renderer continua lendo
`downloadedFiles` do localStorage para a contabilidade local (marcar ✅ depois
do sucesso) — o que morreu foi só o envio pelo IPC. O parâmetro `fileUrl` de
`downloadSingleFile` saiu junto; o atributo `data-file-url` e a guarda
`(fileUrl || script)` do click handler ficaram como estavam.

Gate verde no Windows (typecheck, lint 0 erros/115 avisos, 109 passed +
4 skipped). Falta o critério de verificação no app — download manual — que é
do Bruno.

### DOC-003 — Anotar arquivos carregados por import dinâmico

- Status: `NOT STARTED`
- Priority: `P3`
- Owner: —
- Dependencies: `BUG-004`
- Primary files: qualquer arquivo carregado via `await import()`

#### Acceptance criteria

- Arquivos carregados dinamicamente têm comentário no topo indicando quem os
  carrega e a partir de qual ponto de entrada, para que busca estática futura não
  chegue a conclusão errada.
- Só se aplica ao que sobrar depois da decisão do `BUG-004`.

### CLEAN-001 — Nível 1 da auditoria de complexidade

- Status: `DONE` — 2026-08-09, commit `700de9a`
- Priority: `P3`
- Owner: Claude (sessão 2026-08-09)
- Dependencies: `PIPE-002`
- Primary files: `electron/services/sigaa-login-ufc.ts` (removido),
  `electron/services/playwright-login.service.ts`

#### O que foi removido

| Alvo | Linhas | Prova de inalcançabilidade |
|---|---|---|
| `electron/services/sigaa-login-ufc.ts` (arquivo todo) | −111 | Única ocorrência de `SigaaLoginUFC` no repo é a própria `export class`. Prova extra: depende de `sigaa-api`, que **não está no `package.json`** — não rodaria nem se fosse chamado |
| `PlaywrightLoginService.enterCourseDirect` | −91 | Única ocorrência é a própria assinatura. É a "Headless API Entry", abandonada; a entrada real é sempre `enterCourseAndGetHTML` |

Total: **−202 linhas, zero adições.** O `import * as cheerio` do
`playwright-login.service.ts` saiu junto: o `enterCourseDirect` era o único
consumidor, e o `noUnusedLocals` teria reprovado.

#### Como a prova foi feita (e por que busca por nome não bastou)

O caso do `download.service.ts` (ver `BUG-004`) já produziu três conclusões
erradas neste repositório. Então, além da busca por nome, foram feitas duas
verificações que aquele caso ensinou:

1. **Import dinâmico.** `await import(` aparece em quatro lugares no projeto:
   `playwright-login.service.ts:763,883` (ambos para `download.service`) e
   `tests/integration/scraper.test.ts:68,82`. Nenhum toca os alvos.
2. **Despacho por string.** Se algo fizesse `servico[nomeDoMetodo]()`, nenhuma
   busca por nome acharia. Zero ocorrências do padrão no repo.

**O que a prova não cobre:** ela é estática. Se algum desses caminhos já foi
alcançado por algo que não está mais no repositório, a busca não vê.

#### Alvo retirado do escopo por decisão do autor

`HttpScraperService.enterCourseHTTP` (−102 linhas) estava na lista e **não foi
removido**. Decisão do Bruno em 2026-08-09, depois de o `tsc` revelar o efeito
colateral: o método é o único leitor de `this.userAgent`, e removê-lo mata uma
cadeia de quatro saltos inteira. Ver `BUG-010`.

#### Verification

Container Linux, `npm install` limpo (a execução no Windows continua sendo a
autoridade):

| Comando | Antes | Depois |
|---|---|---|
| `npx tsc --noEmit` | limpo | **limpo** |
| `npx eslint .` | 0 erros, 125 avisos | **0 erros, 116 avisos** |
| `npx vitest run` | 64 passed, 4 skipped | **64 passed, 4 skipped** |

A catraca de avisos do `PIPE-002` foi respeitada: 125 → 116.

O número de testes não mudar é o resultado esperado e é o próprio argumento do
corte — código inalcançável não tem teste que o exercite, por definição.

#### Fechamento

`npm run quality` rodado no Windows por Bruno, e commitado em `700de9a` —
**junto com o `BUG-001` e com esta documentação**, não em três commits separados
como estava planejado. Ver a nota abaixo.

#### Nota sobre line endings

`http-scraper.service.ts` aparece como `M` no `git status`, mas
`git diff --exit-code` confirma conteúdo **idêntico ao HEAD**. Só o line ending
do working tree mudou (CRLF → LF), efeito de eu ter restaurado o arquivo com
`git show > arquivo` depois da decisão de manter o `enterCourseHTTP`. O
`text=auto` do `.gitattributes` normaliza na entrada, então nada disso chega ao
commit; um `git checkout` no Windows devolve o CRLF.

### BUG-010 — O User-Agent real do navegador é buscado e descartado

- Status: `IN REVIEW` — código e testes prontos (sessão 2026-09-01); falta só a
  medição de taxa de falha em uso real, que é do Bruno
- Priority: `P2`
- Owner: Claude (sessão 2026-09-01)
- Dependencies: `BUG-001` (não mexer no caminho de download antes)
- Primary files: `electron/services/http-scraper.service.ts:118-123,198,254,351,685,870`,
  `electron/services/sigaa.service.ts:104-105`,
  `electron/services/playwright-login.service.ts:1131`

#### Problem

A arquitetura do projeto é "o Playwright mantém a sessão JSF, o HTTP pega os
cookies emprestados". O empréstimo dos cookies funciona. O do **User-Agent**
não.

Existe uma cadeia de quatro saltos construída exatamente para isso:

```
playwright-login.service.ts:1131   getUserAgent()        ← 1 chamador
        ↓
sigaa.service.ts:104-105           setUserAgent(ua)      ← 1 chamador
        ↓
http-scraper.service.ts:118        this.userAgent        ← 1 leitor
        ↓
                                   enterCourseHTTP       ← 0 chamadores
```

O único leitor de `this.userAgent` é o `enterCourseHTTP`, que é inalcançável
(ver `CLEAN-001`). Os **cinco requests que rodam de verdade** — linhas 198, 254,
351, 685 e 870 — hardcodam:

```
'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
```

Isso é um User-Agent **truncado**: falta o sufixo `Chrome/xxx Safari/537.36` que
qualquer navegador real envia. Ou seja, os requests HTTP se apresentam ao SIGAA
com uma identidade que não bate com a do navegador que criou aquela sessão.

#### Por que isto importa mais do que parece

Bruno relatou que **o download por HTTP falha com frequência e de forma
imprevisível** — foi o dado que decidiu o `BUG-004` (ligar o fallback Playwright
em vez de apagá-lo). Um portal JSF que valide consistência entre a sessão e o
cliente que a criou é um candidato plausível a essa causa, e é barato de testar.

Não é prova. É a hipótese mais barata disponível para uma falha que hoje não tem
explicação.

#### Ordem

Depois do `BUG-001`. Mesmo motivo do `BUG-004`: enquanto o app apagar arquivos
que baixaram com sucesso, a taxa de falha observada não é confiável para julgar
se o UA mudou alguma coisa.

#### Required behavior

- Os cinco requests usam `this.userAgent` em vez da string literal.
- Existe teste que afirma que o header `User-Agent` enviado é o que foi
  configurado por `setUserAgent`, e que falharia se alguém reintroduzisse a
  string literal (regra 5 do `CLAUDE.md`).

#### Acceptance criteria

- Nenhum User-Agent literal restante em `http-scraper.service.ts`.
- Teste do parágrafo acima existe e passa.
- Medida a taxa de falha de download antes e depois, registrada aqui. Se não
  mudar nada, isso também é resultado e deve ficar escrito — a hipótese fica
  descartada em vez de voltar daqui a seis meses.

#### Decisão relacionada (Bruno, 2026-08-09)

O `enterCourseHTTP` foi **mantido** por causa desta tarefa, mesmo sendo
inalcançável. Removê-lo levaria a cadeia do UA junto, e o `BUG-010` viraria
"reconstruir e ligar" em vez de "ligar". Custo aceito: 102 linhas de código
morto de pé até esta tarefa fechar.

#### Implementation notes (2026-09-01)

Os cinco requests reais (`http-scraper.service.ts` — entrar na disciplina,
dashboard, abrir seção de arquivos, notícias, download) trocaram a string
literal por `this.userAgent`. A cadeia `getUserAgent → setUserAgent →
this.userAgent` já existia e já era chamada no login; ela só não tinha leitor
vivo. Diff: 5 linhas.

Dois testes novos em `tests/integration/download-real.test.ts`:

1. **Comportamento** — `setUserAgent(ua)` e depois `downloadFile`; afirma que o
   header `User-Agent` enviado ao axios é o `ua` configurado.
2. **Tripwire de fonte** — nenhum `'User-Agent': '` literal restante no
   serviço. Cobre os quatro call sites que o teste de comportamento não
   exercita.

**Prova vermelho-verde:** os dois testes rodaram contra o código sem a correção
(2 failed, 6 passed — os testes do `BUG-001` continuam verdes, então a asserção
é específica) e com ela (8 passed).

**O que falta para `DONE`:** o terceiro critério — medir a taxa de falha de
download antes/depois em uso real. Isso é observação do Bruno no dia a dia; se
não mudar nada, registrar aqui e descartar a hipótese.

O `enterCourseHTTP` continua de pé e continua sendo o único leitor *morto* da
cadeia; agora que os requests vivos leem `this.userAgent`, remover o
`enterCourseHTTP` (102 linhas) voltou a ser seguro — candidato a limpeza num
`CLEAN-002` futuro.

---

## P0 security work

### BUG-006 — Falha de download exibia sempre "Erro desconhecido"

- Status: `DONE` — corrigido na sessão 2026-08-04
- Priority: `P2`
- Owner: Claude
- Dependencies: none
- Primary files: `src/pages/course-detail.ts`

#### Problem

`course-detail.ts:372` lia `result.error` no retorno de
`window.api.downloadFile`. Esse campo **nunca existiu**: o serviço devolve
`message` (`sigaa.service.ts:231,273,278`). Como o retorno era `any`, ninguém
reclamou. Em toda falha de download o usuário via
`Erro no download: Erro desconhecido` em vez da causa real — a informação era
produzida pelo main, atravessava o IPC, e era descartada no último passo.

#### Fix

`result.error` → `result.message`.

#### Por que registrar isto

Foi **o typecheck que encontrou**, no minuto em que o retorno deixou de ser
`any`. É a evidência concreta de que o gate da Fase 1 se paga: o mesmo
mecanismo do `BUG-002` (tipo desligado esconde acesso a campo inexistente),
mas com sintoma silencioso em vez de no-op. Ninguém ia achar isso lendo código.

---

### QA-002 — A suíte não é portável: locale e caminho absoluto do Windows

- Status: `DONE` — corrigido na sessão 2026-08-05
- Priority: `P1` — não bloqueia mais o `PIPE-003`; `DEP-002` também fechou em
  2026-08-09
- Owner: Claude
- Dependencies: `PIPE-002`
- Primary files: `src/utils/ui-helpers.ts`,
  `tests/unit/ui-helpers.test.ts`,
  `tests/integration/persistence-auth-recovery.test.ts`

#### Problem

Descoberto ao rodar a suíte fora do Windows pt-BR (sessão 2026-08-04): 3 testes
falham por dependerem do ambiente, não do código.

**a) Locale (2 testes).** `ui-helpers.ts:21,25` usa
`toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`. O `[]` quer
dizer "use o locale do sistema". Em pt-BR sai `10:30`; em en-US sai
`10:30 AM`. Os testes afirmam `/\d{2}:\d{2}$/`, que só vale em locale de 24h.

Runner do GitHub Actions é en-US **inclusive no `windows-latest`**. Ou seja: o
`PIPE-003` nasceria vermelho, e por um motivo que não tem nada a ver com o PR
sendo testado. Gate que nasce vermelho é gate que se aprende a ignorar.

Não é só teste: é bug de UI pequeno e real. Um aluno com Windows em inglês vê
hoje `hoje às 10:30 AM` — metade em português, metade em formato americano.

**b) Caminho absoluto do Windows (1 teste).**
`persistence-auth-recovery.test.ts:63` grava em
`'C:\\tmp\\sigaa-me-persistence-tests\\credentials.json'`, literal. Fora do
Windows o arquivo nunca é encontrado, `loadCredentials()` devolve `null` pelo
caminho de "arquivo ausente" em vez do de "payload corrompido", e o
`expect(errorSpy).toHaveBeenCalled()` falha. O teste **passa por acidente** no
Windows: ele não está exercitando o que diz exercitar.

#### Acceptance criteria

- `toLocaleTimeString` recebe locale explícito (`'pt-BR'`); a saída do app é a
  mesma em qualquer máquina.
- O teste de persistência monta o caminho com `path.join` + `os.tmpdir()`.
- A suíte passa com `LANG=en-US` e em sistema de arquivos POSIX.

#### Rationale

Teste que depende do ambiente da máquina do autor não é gate, é coincidência.
Consertar isto é pré-requisito do `PIPE-003` — sem isso o CI reprova PRs bons.

#### Implementation notes (2026-08-05)

**a) Locale.** `ui-helpers.ts` agora tem uma função `formatClock` única, com
locale explícito: `toLocaleTimeString('pt-BR', { hour: '2-digit',
minute: '2-digit', hour12: false })`. O comentário no arquivo registra o motivo.
Note que a correção **não** foi no teste: era bug de UI real (um Windows em
inglês mostrava `hoje às 12:30 PM` no meio de uma frase em português), e o teste
só o tornou visível.

**b) Caminho absoluto.** `persistence-auth-recovery.test.ts` não escreve mais em
disco: o `fs` é mockado por um `storage.files` em memória e os dois testes leem
de lá. Não sobrou nenhum literal `C:\` na suíte — o caminho deixou de existir em
vez de ficar portável, que é a correção mais forte das duas.

**O que isto prova:** o gate rodou verde num Linux (ver `CLAUDE.md`, tabela do
container), o que é exatamente a condição que faltava. **O que não prova:** a
execução no Windows para este lote ainda não aconteceu — e ela continua sendo a
autoridade. Rodar antes de commitar.

---

### QA-003 — O que a suíte verde **não** prova

- Status: `DONE` — os dois testes existem e cada um falha com a proteção
  correspondente revertida (sessão 2026-09-01)
- Priority: `P2`
- Owner: Claude (sessão 2026-09-01, direto — tarefa só de teste, sem fase MAKE)
- Dependencies: `PIPE-002`
- Primary files: `tests/unit/course-detail.test.ts` (novo),
  `tests/unit/sync-selection.test.ts`

#### Por que esta tarefa existe

Em 2026-08-04 o `npm run quality` ficou verde e o `PIPE-002` fechou. O risco
imediato a partir daí é ler "68 passed" como "o comportamento está verificado".
Não está, e a diferença precisa estar escrita em algum lugar que não seja a
memória de quem participou da sessão.

Uma suíte verde prova exatamente uma coisa: **as 68 coisas que ela cobre
continuam funcionando.** Ela não diz nada sobre o que não cobre — e o silêncio
tem exatamente a mesma aparência nos dois casos.

#### Cobertura real das mudanças da sessão 2026-08-04

| Mudança | Coberta? | Por quê |
|---|---|---|
| `isCourseLike` no `sync-selection` | **Parcial** | `sync-selection.test.ts` exercita o caminho feliz (mocks devolvem `id`/`name` string). **Nenhum teste manda curso malformado**, então o `throw` de deriva de seletor nunca roda |
| `BUG-006` (`result.error` → `result.message`) | **Não** | Zero testes tocam o fluxo de erro de download. A correção está certa por leitura do código, não por prova |
| Contrato do `window.api` | Não, e **não pode ser** | Tipo é apagado em runtime. O teste dele é o `tsc` — que passou |
| União discriminada do `selectDownloadFolder` | Idem | Mesma coisa: verificado por `tsc`, não por vitest |
| 13 `prefer-const` | Não precisa | ESLint provou ausência de reatribuição. Inerte em runtime |

Conclusão honesta: dos 5 itens, **1 tem prova de comportamento, 2 têm prova de
tipo, 1 tem prova de lint, e 1 não tem prova nenhuma** (o `BUG-006`).

#### Acceptance criteria

- Teste que manda `getCourses` devolver `[{ id: 42 }]` e afirma que o
  `startSync` falha com a mensagem de deriva de seletor — hoje esse `throw`
  é código não exercitado.
- Teste que afirma que uma falha de download exibe a `message` vinda do main, e
  **não** `"Erro desconhecido"`. Deve falhar se alguém reverter o `BUG-006`.

#### Rationale

Regra 5 do `CLAUDE.md`: "se corrigiu um bug, existe um teste que falharia sem a
correção." O `BUG-006` foi corrigido sem esse teste. Esta tarefa é a dívida
correspondente, registrada em vez de esquecida.

Vale notar o que **realmente** pegou o `BUG-006`: não foi teste, foi o
verificador de tipos, no minuto em que o retorno deixou de ser `any`. Tipo e
teste provam coisas diferentes — tipo prova que o campo existe, teste prova que
o valor certo chega na tela. Os dois são necessários porque nenhum cobre o
outro.

---

#### Resolution (2026-09-01)

Feito direto, sem PTMR: são dois testes de caracterização sobre comportamento
que já existe, então não há fase vermelha natural nem trabalho para MAKE. A prova
de que cada teste morde foi feita por **mutação**, não por stash:

- `tests/unit/sync-selection.test.ts`, describe `Sync: selector drift (QA-003)`:
  `getCourses` devolve `[{ id: 42 }]`; o overlay mostra "1 disciplina(s) em
  formato desconhecido", `getCourseFiles` não é chamado e nada vai para o
  `localStorage`. Com a guarda trocada por `if (false)` o teste falha.
- `tests/unit/course-detail.test.ts` (novo): renderiza a página com uma turma
  em `coursesWithFiles`, clica em `.btn-download-file`, `downloadFile` devolve
  `{ success: false, message: 'Sessão expirada no SIGAA' }` e o teste afirma
  `toast.error('Erro no download: Sessão expirada no SIGAA')`. Com a leitura
  revertida para `(result as any).error` o teste falha com "Erro desconhecido".
- Duas armadilhas do render que o teste documenta: a lista de arquivos aparece
  depois de `await`s em `fetchCourseFiles` (é preciso drenar a fila), e a página
  assina `window.api.onDownloadProgress` no render — sem esse mock ela cai no
  `error-message` e não há botão nenhum.

### BUG-007 — Parser de notícias devolvia zero item, em silêncio

- Status: `DONE` — corrigido na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: none
- Primary files: `electron/services/http-scraper.service.ts`,
  `tests/integration/parser-real.test.ts`

#### Problem

Uma das estratégias de extração de notícia casava o id assim:

```ts
const idMatch = onclick.match(/['"](\\d+)['"]/)
```

Dentro de um literal de regex, `\\d` é **barra invertida seguida da letra d**,
não "um dígito". A expressão nunca casava. A estratégia devolvia zero notícia e
não registrava erro — o app simplesmente mostrava a turma sem avisos.

Havia 14 testes verdes em cima disso. Eles passavam porque
`tests/unit/parser.test.ts` testa uma **cópia** do parser mantida dentro do
próprio teste, e a cópia não tinha o defeito.

#### Fix

O id vem do `onclick` do JSF na forma `...,id,777,...`, então o padrão correto é
`/,id,([^,'"]+)/`. O comentário acima da linha explica o escape duplo, para que a
próxima pessoa não o reintroduza.

#### Verificação

`tests/integration/parser-real.test.ts` chama `getCourseFiles()` de verdade com
`preFetchedHtml` e afirma `result.news.every(n => !!n.id)`. Esse teste falha se a
correção for revertida — regra 5 do `CLAUDE.md` cumprida.

#### Por que registrar isto

É o caso mais claro do repositório de **suíte verde que não protege nada**: o
teste e o código sob teste eram arquivos diferentes. Ver `QA-004` para a regra
que saiu daqui.

---

### BUG-008 — `getSettings` declarado, com handler, e sem ponte no preload

- Status: `DONE` — corrigido na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: none
- Primary files: `electron/preload.ts`, `tests/unit/preload-contract.test.ts`

#### Problem

`src/vite-env.d.ts` declarava `getSettings`, o `main.ts` atendia o canal
`get-app-settings`, e o `contextBridge` do preload **não expunha a ponte**. As
duas extremidades existiam e o meio não. Cinco call sites do renderer lançavam
`window.api.getSettings is not a function` em runtime, com `tsc` verde — porque
o `.d.ts` é uma declaração, não uma verificação.

#### Fix

`getSettings: () => ipcRenderer.invoke('get-app-settings')` no preload.

#### Por que registrar isto

Mesmo mecanismo do `BUG-002` (`pauseSync`) e do `BUG-006`: a fronteira IPC tem
três pontas — declaração, ponte e handler — e o TypeScript só olha a primeira.
Uma ponta solta é invisível para o compilador e para a suíte. Foi o que motivou
o teste de contrato do `QA-004`.

---

### QA-004 — Tiers de teste: parser real, contrato do preload, E2E e loop visual

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: `PIPE-002`, `QA-002`
- Primary files: `playwright.config.ts`,
  `tests/integration/parser-real.test.ts`, `tests/fixtures/` (+ `README.md`),
  `tests/unit/preload-contract.test.ts`,
  `tests/e2e/app.spec.ts`, `tests/e2e/visual.spec.ts`,
  `tests/e2e/helpers/launch.ts`

#### Por que esta tarefa existe

O `BUG-007` e o `BUG-008` foram encontrados **fora** da suíte, e nenhum dos dois
poderia ter sido encontrado dentro dela: um porque o teste exercitava uma cópia
do código, o outro porque nenhuma camada verificava a fronteira do `window.api`.
Corrigir os dois bugs sem fechar essas duas lacunas deixaria a próxima
ocorrência igualmente invisível.

#### O que foi construído

| Tier | Arquivo | Precisa de | Runner |
|---|---|---|---|
| Parser contra fixture | `tests/integration/parser-real.test.ts` | nada | vitest |
| Contrato do `window.api` | `tests/unit/preload-contract.test.ts` | nada | vitest |
| Visual | `tests/e2e/visual.spec.ts` | nada | playwright |
| E2E sem credencial | `app.spec.ts` (2 testes) | nada | playwright |
| E2E fluxo completo | `app.spec.ts` (3 testes) | `.env` | playwright |

- **Parser real.** Usa o parâmetro `preFetchedHtml` de `getCourseFiles()` para
  curto-circuitar a rede, então roda o mesmo caminho de código de produção sem
  credencial. As fixtures foram extraídas dos literais que estavam dentro do
  `parser.test.ts`.
- **Contrato do preload.** Lê `preload.ts`, `main.ts` e `vite-env.d.ts` como
  texto e cruza as três pontas: canal invocado sem handler, membro chamado pelo
  renderer sem ponte (inclusive escondido atrás de `as any`), ponte não
  declarada. Tem um teste de sanidade do próprio parser, para não passar vazio.
- **Loop visual.** `visual.spec.ts` abre o app de verdade, navega por hash em
  todas as rotas em tema claro e escuro, falha se alguma renderizar vazia e
  falha se sobrou erro no console. PNGs em `_agent_tmp/shots/` para inspeção
  humana — **não** são snapshots comparados automaticamente.

#### Regras que saíram daqui (já no `CLAUDE.md`)

- **`tests/e2e/` é só `*.spec.ts`.** O `playwright.config.ts` fixa
  `testMatch: '**/*.spec.ts'`. Sem isso o Playwright coletava os `*.test.ts` de
  vitest, morria na transformação e **zerava a coleta inteira** — 0 testes, sem
  erro óbvio.
- **Teste não espelha implementação.** Teste novo chama o código de produção.
- **Tier com credencial não roda em loop.** É login real na conta do aluno no
  portal da universidade; rodar em ciclo é dezenas de logins automatizados e
  risco de bloqueio. Manual, antes de release.

#### Limites conhecidos

- As fixtures são **sintéticas** — HTML escrito à mão imitando o SIGAA. Provam
  que o parser casa com a estrutura que assumimos, não que a estrutura assumida
  seja a verdadeira. Procedimento de gravação manual em
  `tests/fixtures/README.md`; gravador automatizado foi deliberadamente adiado
  (script de login não verificado apontado para o portal = risco de bloqueio de
  conta).
- O contrato do preload é checado por **regex sobre o texto** dos arquivos. É
  frágil a mudança de formatação; o teste de sanidade limita o estrago a um
  falso verde improvável, não impossível.
- O loop visual não roda no CI e não compara imagens. Ele responde "renderizou?",
  não "ficou certo?".
- **Conflito a resolver com o `BUG-003`:** o terceiro teste E2E depende de
  `window.api.simulateNewFile()`, que é exatamente a ação de desenvolvimento que
  o `BUG-003` quer remover de produção. Quando o `BUG-003` for feito, esse teste
  precisa de outro gancho ou sai junto.

---

### DEP-002 — `npm ci` não rodava: lock fora de sincronia com o `package.json`

- Status: `DONE` — implementado e verificado no Windows em 2026-08-09
- Priority: `P1` — degradação de reprodutibilidade resolvida; ver nota histórica
  de 2026-08-05 no fim desta tarefa
- Owner: Bruno + Codex (execução no Windows)
- Dependencies: none
- Primary files: `package-lock.json`, `package.json`,
  `.github/workflows/quality.yml`, `.github/workflows/release.yml`, `CLAUDE.md`

#### Problem

Descoberto na sessão 2026-08-05, ao montar o ambiente do gate num Linux:
`npm ci` falha porque o lock não descreve a árvore que o `package.json` pede.
`vitest@4.1.4` exige `vite@^6 || ^7 || ^8`; o lock tem `vite@5.4.21`.

Isso não é problema de plataforma — **quebra em qualquer máquina, inclusive no
Windows**. A consequência prática é dupla:

1. `PIPE-003` não pode usar `npm ci`, que é o comando que existe justamente para
   dar instalação reproduzível no CI. Com `npm install` o CI resolve versões por
   conta própria e deixa de testar o que o lock descreve.
2. As versões instaladas divergem do lock. Foi assim que uma execução de agente
   acusou erros de tipo do `axios` que **não existem** no repositório real —
   sinal falso vindo de árvore diferente.

#### Acceptance criteria

- `npm ci` completa numa árvore limpa.
- `npm run quality` passa depois dele, no Windows.
- O lock commitado corresponde ao `package.json` (`vite` numa major que o
  `vitest` aceite).

#### Fix (2026-08-09)

- Vite `5.4.21` → `6.4.3`, a menor major aceita pelo Vitest `4.1.4`.
- Os plugins instalados `vite-plugin-electron@0.28.8` e
  `vite-plugin-electron-renderer@0.14.6` não declaram peer range de Vite; não foi
  necessária uma migração dos plugins para suas majors novas.
- Lock regenerado no Windows e os três passos de instalação dos workflows
  trocados de `npm install` para `npm ci`.
- `CLAUDE.md` atualizado para tratar `npm ci` como caminho autoritativo.

#### Verification (Windows)

| Comando | Resultado |
|---|---|
| `npm ci` | Pass — 675 pacotes instalados a partir do lock |
| `npm ls` | Pass — árvore válida, sem peer inválido |
| `npm run quality` | Pass — typecheck limpo, lint 0 erros/123 avisos, 64 passed/4 skipped |
| `npm run build` | Pass — Vite 6.4.3 compilou renderer/main/preload; NSIS e portátil gerados |
| `npm audit --omit=dev` | 5 high, 0 critical — registrado para `DEP-001` |
| `npm audit` | 18 total: 1 low, 15 high, 2 critical — registrado para `DEP-001` |

Artefatos gerados:

- `release/1.1.0-beta.2/SIGAA-ME-Windows-1.1.0-beta.2-Setup.exe`
- `release/1.1.0-beta.2/SIGAA-ME-Windows-1.1.0-beta.2-Portable.exe`

#### Remaining risk

O lock agora é reproduzível, mas isso não torna as dependências seguras. A
auditoria de produção ainda aponta `axios`, `electron-updater` e três transitivas
com severidade alta. Correção de vulnerabilidades e atualização de Electron
continuam no `DEP-001`; não foram misturadas nesta migração de build.

#### Implementation notes

- Commit: —
- Decisão: menor major compatível (`vite@6.4.3`), sem atualizar os plugins
  Electron junto.

#### Rationale

Sem `npm ci` o CI não é reproduzível, e um gate não reproduzível reprova PRs bons
e aprova ruins sem padrão discernível. Fica com o autor porque mexer em `vite`
major toca o build do Electron, e build é Windows.

#### Correção de 2026-08-05: bloqueio → degradação

Escrito antes como "bloqueia o `PIPE-003`". Errado, e o erro foi meu: eu não
tinha listado `.github/` e não vi que o `quality.yml` já existia. Ele resolve o
problema com `npm install` e um comentário apontando para esta tarefa.

A distinção importa: **o CI existe e roda**. O que falta é reprodutibilidade — o
CI instala uma árvore que pode não ser a do lock, então um verde no CI não prova
que a árvore do autor está verde, nem o contrário. É degradação silenciosa, que é
pior que bloqueio ruidoso, mas não impede a Fase 1 de fechar.

---

### ARCH-003 — Uma declaração para o contrato do preload

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: `PIPE-002`
- Primary files: `shared/ipc.ts`, `electron/preload.ts`, `src/vite-env.d.ts`,
  `tests/unit/preload-contract.test.ts`

#### Por que esta tarefa existe

Correção de raiz para a classe de bug que produziu `BUG-002`, `BUG-006`,
`BUG-007` e `BUG-008`: **duas pontas que deveriam se corresponder, e nada
verificando a correspondência.** Corrigir os quatro individualmente deixaria o
quinto igualmente possível.

No caso do `window.api`, a forma do contrato era escrita à mão em **dois**
arquivos — `src/vite-env.d.ts` (o que o renderer pode chamar) e
`electron/preload.ts` (o que a ponte implementa). Nada comparava os dois. Foi
assim que `getSettings` ficou declarada sem ponte.

#### Fix

`shared/ipc.ts` passou a exportar `RendererApi`, e as duas pontas o usam:

```ts
// electron/preload.ts
const api: RendererApi = { ... }
contextBridge.exposeInMainWorld('api', api)

// src/vite-env.d.ts
interface Window { api: RendererApi }
```

Ponte faltando deixou de ser bug de runtime e virou erro de compilação.

#### Por que não derivar o tipo da implementação

`api: typeof import('../electron/preload').api` seria menos código ainda e foi
descartado: `ipcRenderer.invoke` devolve `Promise<any>`, então derivar apagaria
todos os retornos declarados e reabriria a porta do `BUG-006` — campo lido que o
main nunca devolveu. O retorno anotado é justamente o que o typecheck confere.
Uma declaração explícita, verificada contra a implementação, é o ponto de
equilíbrio.

#### Detalhe que o compilador cobrou

Repetir a assinatura genérica de `updateSetting` na implementação **não compila**:
duas assinaturas genéricas com `Extract<...>` diferido não se provam
equivalentes. A solução é omitir os tipos na implementação e deixar a tipagem
contextual vir do `RendererApi` — menos código e mais estrito.

#### Verificação (mutação, não leitura)

| Mutação | Resultado |
|---|---|
| Remover a ponte `getSettings` do preload | `tsc` falha: `TS2741: Property 'getSettings' is missing in type ... but required in type 'RendererApi'` |
| Trocar o canal por `'get-app-settingz'` | `preload-contract.test.ts` falha, listando o canal órfão |
| Nenhuma mutação | `tsc` limpo, `eslint` 0 erros / 123 avisos, 64 passed / 4 skipped |

#### O que continua fora do alcance do tipo

O canal é uma string passada ao `ipcRenderer.invoke`; o `tsc` não sabe se existe
`ipcMain.handle` do outro lado. Amarrar isso exigiria uma **terceira** lista
escrita à mão — mais um par para divergir — ou reestruturar o `main.ts` para um
`Record<Channel, Handler>` exaustivo, que é escopo do `SEC-002`. Até lá, essa
metade fica com `tests/unit/preload-contract.test.ts`, que lê o `main.ts` (a
fonte da verdade) como texto.

Consequência: o teste de contrato perdeu o caso "declara no `vite-env.d.ts` tudo
que o preload expõe" — agora impossível por construção — e ficou com os dois que
o tipo não cobre: canal sem handler, e chamada escondida atrás de `as any`.

---

### QA-005 — Apagar o parser espelhado em vez de mantê-lo

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: `QA-004`
- Primary files: `tests/unit/parser.test.ts` (**apagado**),
  `tests/integration/parser-real.test.ts`

#### Por que esta tarefa existe

A outra metade da correção de raiz. `tests/unit/parser.test.ts` mantinha uma
cópia do parser dentro do próprio arquivo de teste — 11 testes verdes sobre
código que não é o de produção. Foi o que permitiu o `BUG-007` passar.

Manter as duas coisas seria manter o problema: enquanto a cópia existe, ela pode
voltar a divergir, e um verde nela continua não significando nada.

#### Fix

Arquivo apagado (241 linhas). As asserções que valiam a pena foram para
`parser-real.test.ts`, que chama o `HttpScraperService` de verdade:

| Asserção da cópia | Destino |
|---|---|
| nomes de arquivo, página vazia, títulos de notícia | já existiam no `parser-real` |
| ids de arquivo (`555`/`556`) | **trazida** — e revelou o `BUG-009` |
| ids de notícia exatos (`777`/`778`), data | **trazidas** |
| 2 testes de ViewState | **descartados** — afirmavam que o cheerio lê um atributo de um literal declarado no mesmo arquivo; não exercitavam código do projeto |

Saldo: 11 testes que não provavam nada → 4 testes sobre o código de produção.
A suíte caiu de 76 para 64, e cobre estritamente mais.

#### Rationale

Teste que espelha implementação é pior que teste ausente: ausente não mente.

---

### QA-006 — Teste de download escrevia no filesystem real

- Status: `DONE` — implementado e verificado em 2026-08-09
- Priority: `P1`
- Owner: Codex
- Dependencies: none
- Primary files: `tests/unit/sigaa-service.test.ts`

#### Problem

Os testes de `SigaaService.downloadFile()` passavam `/mock/downloads` como
`basePath`, mas não mockavam o módulo `fs`. O serviço executava `existsSync` e
`mkdirSync` de verdade antes do download: no Windows o caminho era criado em
`C:\mock\downloads`, enquanto num sistema POSIX sem acesso à raiz os testes
falhavam com `EACCES` antes das asserções relevantes.

#### Fix

O teste agora mocka `fs` antes de importar o serviço. `existsSync` retorna
`false` e `mkdirSync` é inerte. O retorno `false` mantém o cenário padrão de
arquivo ainda não baixado e evita que testes futuros de download em lote pulem
o caminho exercitado.

#### Acceptance criteria

- `npx vitest run` produz 64 passed / 4 skipped no Windows e no Linux.
- Nenhum teste de unidade ou integração escreve no filesystem real; os specs de
  E2E apagam `.test-user-data` de propósito, e devem.
- `electron/services/sigaa.service.ts` permanece inalterado.

#### Verification

- Linux, medido pelo Claude antes da implementação: 10 arquivos, 64 passed / 4
  skipped.
- Windows, medido pelo Codex depois da implementação: 10 arquivos, 64 passed /
  4 skipped.
- `rg -n "mkdirSync|writeFileSync" tests` encontrou quatro ocorrências, todas
  em mocks de unidade ou integração. Essa busca não cobre `rmSync`: os três
  usos em `tests/e2e/` removem `.test-user-data` deliberadamente.

#### Implementation notes

- Commit: `f93b2a5`
- Divergências da especificação: nenhuma.

---

### BUG-009 — Id de arquivo capturado com o apóstrofo do JSF

- Status: `IN REVIEW` — código e testes prontos (sessão 2026-09-01); falta uma
  sincronização real com o `cache.json` antigo confirmando zero "arquivo novo",
  que é do Bruno
- Priority: `P2`
- Owner: Claude (sessão 2026-09-01)
- Dependencies: none
- Primary files: `electron/services/http-scraper.service.ts` (linhas ~428 e
  ~467), `electron/services/cache.service.ts`,
  `tests/integration/parser-real.test.ts`

#### Problem

Descoberto em 2026-08-05 pela asserção de id trazida do parser espelhado
(`QA-005`): o id de **arquivo** sai como `555'`, com apóstrofo.

```ts
const idMatch  = onclick.match(/,id,([^,]+)/);      // captura `555'`
const keyMatch = onclick.match(/,key,([^,'"]+)/);   // classe correta, linha seguinte
```

A classe certa está literalmente na linha de baixo, no mesmo bloco. O `onclick`
termina em `...,id,555','');`, então `[^,]+` engole a quote. Acontece nas duas
estratégias de detecção de arquivo (~428 e ~467). O parser de **notícia** já foi
corrigido no `BUG-007`.

#### Por que não foi corrigido junto

O download não usa esse id — ele reparseia o `script` inteiro
(`http-scraper.service.ts:829`), e é por isso que o defeito nunca apareceu como
falha de download. Mas o id **é** usado como identidade do arquivo:
`background-sync.service.ts:110` grava `allFileIds` no `cache.json`, e
`cacheService.diffCourseState` compara os ids da varredura nova com os
armazenados.

Corrigir a regex muda a identidade de todo arquivo já em cache. Na primeira
sincronização depois da atualização, todos aparecem como novos — e para quem tem
`autoDownloadUpdates` ligado, isso dispara **re-download de tudo**, com o
`BUG-001` (download apagando arquivo válido) ainda aberto no caminho.

Ou seja: a correção de uma linha tem consequência de migração de dados. É
decisão do autor, não de quem passava por perto.

#### Acceptance criteria

- As duas ocorrências passam a usar uma extração única e correta (uma função,
  não três cópias da mesma regra).
- Existe migração ou tolerância no `cache.service.ts`: ou os ids em cache são
  normalizados na leitura, ou o diff compara id sem a quote — de modo que a
  atualização **não** produza uma enxurrada de "arquivo novo".
- A ordem é: fechar o `BUG-001` **antes**, para que um re-download acidental não
  possa apagar arquivo válido.
- `parser-real.test.ts` passa a afirmar `'555'`; o assert atual fixa o valor
  defeituoso de propósito e falha quando a correção chegar.

#### Rationale

Registrado em vez de corrigido porque a mudança é barata no parser e caríssima
no cache. Vale como exemplo do padrão: **três cópias da mesma regra de
extração**, duas com uma classe de caracteres e uma com outra. Mesma família do
`BUG-007`, mesma família do `ARCH-003`.

#### Resolution (2026-09-01)

Decisão do Bruno: **normalizar na leitura**, sem versão de cache nem wipe.

- `http-scraper.service.ts`: uma função de módulo `jsfParam(onclick, name)`
  com a classe `[^,'"]+` substitui as três cópias (dois `id` de arquivo, um
  `id` de notícia, mais os dois `key`).
- `cache.service.ts#loadCache`: cada `files[]` passa por
  `id.replace(/['"]$/, '')` ao carregar. Um `cache.json` gravado com `555'`
  diffa limpo contra `555`; a próxima `updateCourseState` já persiste sem a
  quote. Nenhum campo novo no arquivo.
- Raio de efeito verificado: só o diff de sync usa o id. Download reparseia o
  `script`; renderer e sino de notificação usam o **nome** do arquivo.
- Vermelho-verde provado: `parser-real.test.ts` (`'555'`, `'556'`) e o teste
  novo em `cache-service.test.ts` (cache semeado com `555'` × varredura `555`
  → `newFiles: []`) falham com `git stash` das fontes e passam com a correção.
- `npm run quality`: 0 erros de lint, 115 testes passando.

---

### BUG-011 — Tarefa listada como arquivo dispara download e fallback Playwright

- Status: `DONE` — Bruno sincronizou e fez "baixar todos" em SINAIS E SISTEMAS no
  build instalado (2026-09-01): nenhum Chrome abriu, toast verde
- Priority: `P2`
- Owner: Claude (sessão 2026-09-01)
- Dependencies: none
- Primary files: `electron/services/http-scraper.service.ts` (`getCourseFiles`,
  varredura de `<a>`), `tests/integration/parser-real.test.ts`,
  `tests/fixtures/course-page-real-with-tasks.html`

#### Problem

Descoberto no smoke do `DL-001`/`BUG-004` (2026-09-01): depois de um "baixar
todos" bem-sucedido, um Chrome abriu sozinho. O log do app mostra a sequência:
"Atividade 1" e "Atividade 2" (tarefas do SIGAA) estavam na lista de arquivos;
o download HTTP recebeu a página "Responder tarefa" (46 KB de HTML); a
verificação do `BUG-001` rejeitou 3 vezes e descartou o `.part`; o fallback do
`BUG-004` abriu o Playwright para cada uma, que não achou link de download e
morreu esperando o evento `download`. Nada foi gravado errado no disco.

Causa: a Strategy 1 do parser aceita qualquer `<a>` com `jsfcljs(...,id,...)`.
Tarefa usa exatamente esse padrão; só o componente muda:
`idEnviarMaterialTarefa` (sem `key`) contra `idInserirMaterialArquivo` (com
`key`).

#### Resolution (2026-09-01)

Direto, sem PTMR (uma linha e uma fixture).

- `http-scraper.service.ts`: antes das duas estratégias, `<a>` cujo `onclick`
  contém `idEnviarMaterialTarefa` é ignorado. Antes das duas porque uma tarefa
  chamada "Lista 5" cairia na Strategy 2 pelo texto. Marcado com
  `// ponytail:`: só tarefa é conhecida; questionário e fórum entram quando
  aparecerem numa fixture.
- `tests/fixtures/course-page-real-with-tasks.html`: **primeira fixture gravada
  do portal** (procedência e limpeza no README de lá). 7 arquivos, 2 tarefas.
- `parser-real.test.ts`: contra a fixture real, a lista tem 7 itens, inclui
  `Plano de Ensino`/`Aula 3`/`Aula4 - Parte 1` e o id `3998953`, não inclui
  `Atividade 1`/`Atividade 2`, e nenhum `script` contém `Tarefa`. Vermelho sem
  a correção (9 itens, com as tarefas), verde com ela.
- Efeito colateral bom: a fixture real exercita o resto do parser contra HTML
  de verdade pela primeira vez, e ele passou sem outra mudança.
- Gate no Windows: `tsc` limpo, 0 erros de lint, **154 passed, 4 skipped**.
- Atenção no smoke: a lista salva no `localStorage` do app ainda tem as duas
  tarefas até a próxima sincronização, e "baixar todos" manda essa lista ao
  main. Sincronizar primeiro, depois baixar.

---

### ARCH-001 — Shared domain models and IPC result contracts

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: none
- Primary files:
  - New: `shared/domain.ts`
  - New: `shared/ipc-contracts.ts`
  - New: `shared/errors.ts`
  - `tsconfig.json`
  - `src/vite-env.d.ts`
  - `electron/electron-env.d.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/playwright-login.service.ts`

#### Required interfaces

- `AccountId`, `AccountProfile`
- `CourseId`, `CourseSummary`, `CourseSnapshot`
- `CourseFile`, `NewsSummary`, `NewsDetail`
- `DownloadToken`, `DownloadRecord`, `DownloadResult`
- `AppResult<T>` as a discriminated success/failure union
- Stable `AppErrorCode` values for validation, session expiry, selector drift,
  cancellation, storage, downloads, and portal availability
- `RendererApi` as the only public preload contract

Renderer-facing file records must not contain JSF scripts, `onclick` content,
ViewState values, cookies, or internal SIGAA URLs.

#### Acceptance criteria

- Main, preload, and renderer import the same contract definitions.
- No IPC method returns an untyped `Promise<any>`.
- Existing flows compile against `AppResult<T>`.
- Error consumers distinguish retryable portal failures from invalid requests.
- `tsconfig.json` includes the shared contract directory.

#### Verification

```text
npm run typecheck
npm test
```

#### Implementation notes

- Commit: —
- Decisions: —
- Follow-ups: —

### SEC-001 — Prevent untrusted SIGAA content from executing in the renderer

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `src/security/html-sanitizer.ts`
  - New: `src/utils/dom.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/settings.ts`
  - `src/components/toast.ts`
  - `index.html`
  - `package.json`
  - `package-lock.json`
  - New: `tests/unit/html-sanitizer.test.ts`
  - New: `tests/unit/renderer-content-security.test.ts`

#### Required behavior

- Render account names, course names, course codes, periods, filenames,
  notification titles, dates, paths, and errors with `textContent`.
- Replace inline `onclick` and `onerror` attributes with event listeners.
- Keep untrusted values out of HTML attributes and inline route strings.
- Permit rich HTML only for news bodies and only after a strict allowlist
  sanitizer.
- Sanitize news content before caching and again before rendering.
- Reject event attributes, forms, iframes, SVG, scripts, styles, and unsafe URL
  protocols.
- Add a production Content Security Policy that does not permit inline scripts
  or `unsafe-eval`.

#### Acceptance criteria

- Malicious fixtures cannot create executable renderer nodes.
- No untrusted value is interpolated into `innerHTML`.
- `toast.error('<img onerror=...>')` displays literal text.
- Course cards and notification rows use listeners rather than inline handlers.
- The CSP blocks inline event-handler execution as defense in depth.

#### Verification

```text
npm run test:unit -- html-sanitizer renderer-content-security toast
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Sanitizer/version: —
- Allowlist changes: —

### SEC-002 — Replace unrestricted IPC with a typed, validated API

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/ipc/register-handlers.ts`
  - New: `electron/ipc/validation.ts`
  - New: `electron/ipc/sender-policy.ts`
  - New: `electron/services/session-catalog.service.ts`
  - `electron/preload.ts`
  - `electron/main.ts`
  - `electron/electron-env.d.ts`
  - `src/vite-env.d.ts`
  - `src/main.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/settings.ts`
  - `src/pages/sync-selection.ts`
  - New: `tests/unit/ipc-validation.test.ts`

#### Required API changes

- Remove `window.ipcRenderer` completely.
- Expose only explicitly named `RendererApi` methods.
- Validate the sender frame/origin before executing every handler.
- Validate payload types, lengths, allowed properties, and identifiers.
- Replace arbitrary `updateSetting(key, value)` with a discriminated union.
- Exclude `lastBackgroundSync` and the download root from renderer-mutable
  settings.
- Move JSF scripts and internal file URLs into `SessionCatalogService`.
- Renderer downloads reference an opaque `DownloadToken`.
- Renderer course/news requests send stable IDs, not trusted names or scripts.
- Renderer must not submit arbitrary base directories or filesystem paths.
- Event subscriptions expose data only, never the Electron event object.
- Move `simulateNewFile` into an optional development-only `testApi`.

#### Acceptance criteria

- `window.ipcRenderer` is undefined in the packaged renderer.
- Unknown channels cannot be invoked from renderer code.
- Invalid payloads return `INVALID_REQUEST` without touching services.
- JSF scripts never cross the IPC boundary.
- Download tokens expire on logout/relogin.
- Production builds do not expose the cache mutation test API.

#### Verification

```text
npm run typecheck
npm run test:unit -- ipc-validation
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Channel migration: —
- Removed APIs: —

### SEC-003 — Enforce BrowserWindow navigation and external-link policy

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `SEC-002`
- Primary files:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `shared/ipc-contracts.ts`
  - New: `tests/unit/navigation-policy.test.ts`
  - New: `tests/e2e/security-boundaries.spec.ts`

#### Required behavior

- Explicitly set `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, and `webSecurity: true` after preload compatibility is
  verified.
- Deny unexpected `will-navigate` destinations.
- Deny renderer-created windows through `setWindowOpenHandler`.
- Open links only through a validated `openExternal` operation.
- Permit only HTTPS links without embedded credentials.
- Directly allow documented UFC/SIGAA and project GitHub hosts.
- Require confirmation for other HTTPS hosts or deny them according to the
  final product policy.
- Reject `javascript:`, `file:`, `data:`, `blob:`, and unknown schemes.

#### Acceptance criteria

- An external navigation cannot inherit the preload API.
- `window.open()` is denied by default.
- Unsafe schemes never reach `shell.openExternal`.
- Approved links open in the OS browser, not inside the Electron window.

#### Verification

```text
npm run test:unit -- navigation-policy
npm run test:e2e -- security-boundaries
```

#### Implementation notes

- Commit: —
- Approved domains: —
- Sandbox exceptions: —

---

## P1 privacy and reliability work

### DATA-001 — Bind all persisted state to a stable account identity

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`, `SEC-002`
- Primary files:
  - New: `electron/services/account-context.service.ts`
  - New: `src/data/account-storage.ts`
  - New: `src/data/session-store.ts`
  - `electron/services/cache.service.ts`
  - `electron/services/persistence.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/main.ts`
  - `src/main.ts`
  - `src/pages/login.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/sync-selection.ts`
  - `src/utils/notification-store.ts`
  - `src/utils/ui-helpers.ts`
  - New: `tests/unit/account-storage.test.ts`
  - New: `tests/integration/account-isolation.test.ts`

#### Required schema

Backend cache:

```text
CacheFileV2
  schemaVersion: 2
  accounts[accountId]
    courses[courseId]
    updatedAt
```

Renderer keys:

```text
sigaa-me:v2:<accountId>:courses
sigaa-me:v2:<accountId>:downloads
sigaa-me:v2:<accountId>:notifications
sigaa-me:v2:<accountId>:read-items
sigaa-me:v2:<accountId>:photo
```

#### Required behavior

- Derive the same one-way account ID from normalized username for manual and
  automatic login.
- Never log the username or hash input.
- Make the account ID part of `AccountProfile` and background update events.
- Stop pages from reading or writing raw unscoped localStorage keys.
- Reject background events for a different account.
- Invalidate session catalogs when the active account changes.
- Quarantine or delete legacy cache because it cannot be safely attributed to
  an account.

#### Acceptance criteria

- Account B cannot view account A's courses, files, news, photo, notifications,
  read state, or download history.
- Returning to account A may reuse only account A's namespaced cache.
- Legacy unscoped data cannot appear after another user logs in.
- Cache and settings schemas are versioned and runtime-validated.

#### Verification

```text
npm run test:unit -- account-storage
npm run test:integration -- account-isolation
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Migration decision: reset or quarantine
- Schema version: —

### DATA-002 — Implement complete logout and clear-all transactions

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `DATA-001`, `CONC-001`
- Primary files:
  - `electron/main.ts`
  - `electron/services/persistence.service.ts`
  - `electron/services/cache.service.ts`
  - `electron/services/logger.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `src/pages/dashboard.ts`
  - `src/data/account-storage.ts`
  - `src/data/session-store.ts`
  - New: `tests/integration/clear-all-data.test.ts`

#### Logout transaction

1. Cancel background synchronization.
2. Wait for the active session operation to reach a safe boundary.
3. Close browser contexts and clear in-memory cookies.
4. Clear remembered credentials.
5. Clear active account/catalog context.
6. Unsubscribe renderer listeners.
7. Clear sessionStorage.
8. Preserve only inaccessible account-scoped cache if the product chooses to
   support fast return for the same account.

#### Clear-all transaction

In addition to logout, remove:

- All backend account caches.
- All renderer account namespaces.
- Settings and in-memory settings state.
- Download history metadata.
- Notification/read state.
- Browser storage for the application partition.
- Logs and diagnostic captures.

Downloaded documents outside Electron `userData` must not be deleted silently.
The confirmation UI must state that explicitly.

#### Acceptance criteria

- The handler returns success only after deletion completes.
- A restart after clear-all behaves like first launch.
- Clear-all cannot race a background write that recreates deleted state.
- Partial deletion returns a specific storage error and records safe recovery
  instructions.

#### Verification

```text
npm run test:integration -- clear-all-data account-isolation
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Stores cleared: —
- Intentionally preserved data: downloaded documents only

### CONC-001 — Serialize and cancel shared Playwright operations

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/services/session-operation-coordinator.service.ts`
  - New: `shared/operation.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/main.ts`
  - `src/pages/course-detail.ts`
  - New: `tests/unit/session-operation-coordinator.test.ts`
  - New: `tests/integration/background-sync-serialization.test.ts`

#### Required behavior

- Replace `busyCount`; it currently does not serialize work.
- Permit only one Playwright/session-mutating operation at a time.
- Represent operations as `interactive`, `background`, `auth`, or `shutdown`.
- Use `AbortSignal` for cancellation.
- Allow logout/clear-all to cancel queued work and wait for a safe boundary.
- Let interactive work cancel or supersede background work without corrupting
  cookies, ViewState, or page navigation.
- Check cancellation between courses, news items, retry attempts, and downloads.
- ~~Remove nonexistent renderer calls to `pauseSync()` and `resumeSync()`.~~
  **Feito no `BUG-002` (2026-09-01).** Registro: a proteção contra concorrência
  que o `pauseSync` fingia dar está **ausente e é conhecida** — nada serializa
  sync em background e ação do usuário sobre a mesma página Playwright até esta
  tarefa ser implementada. Ver `DÉBITO-03`.
- Return `OPERATION_CANCELLED` rather than a generic failure.

#### Acceptance criteria

- Background sync and course navigation cannot use the same Playwright page
  concurrently.
- Nested background calls do not deadlock by reacquiring the coordinator.
- Logout does not close a browser underneath an untracked operation.
- A cancelled background sweep does not publish partial data as a complete
  successful sync.

#### Verification

```text
npm run test:unit -- session-operation-coordinator
npm run test:integration -- background-sync-serialization
```

#### Implementation notes

- Commit: —
- Queue policy: —
- Cancellation boundaries: —

---

## Download safety work

### DL-001 — Enforce download root and path containment

- Status: `DONE` — ciclo PTMR 03 validado pelo master dev; Bruno confirmou no build
  instalado (2026-09-01): pasta persistida pelo main, download e "baixar todos" ok
- Priority: `P1`
- Owner: Bruno
- Dependencies: `SEC-002`
- Primary files:
  - New: `electron/services/download-path.service.ts`
  - `electron/main.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/download.service.ts`
  - `electron/services/persistence.service.ts`
  - `src/pages/course-detail.ts`
  - New: `tests/unit/download-path-security.test.ts`

#### Required behavior

- Renderer cannot provide a download root.
- Main resolves the root from a native folder selection persisted internally.
- Sanitize course and file components, including Windows reserved names and
  maximum lengths.
- Prove target containment with resolved/real paths and `path.relative()`.
- Reject absolute components, traversal, empty names, and symlink escapes.
- Write into a temporary `.part` file before atomic rename.
- Apply one shared path policy to HTTP and Playwright downloads.

#### Acceptance criteria

- `../`, absolute paths, drive prefixes, device names, and symlink escapes are
  rejected.
- Duplicate checks use the same sanitized final path as the writer.
- No renderer-provided path can cause reads outside the approved root.

#### Verification

```text
npm run test:unit -- download-path-security
npm run test:integration -- download-boundary
```

#### Implementation notes

- Commit: `8be340f` (TEST), `d759d16` (MAKE), `a0c04b6` (MASTER) — branch `traycer/lucid-lynx`, fast-forward em `master`
- Platform cases covered: Windows (gate autoritativo); junction cobre o caso de symlink; Linux não rodado nesta sessão

#### Resolution (2026-09-01) — ciclo PTMR 03

Ledger em `.scratch/dl-001/ledger.md`. O ciclo chegou com dois commits (TEST
`8be340f`, MAKE `d759d16`), **sem commit de READ e sem return handoff** — o
PLAN não fechou o ciclo. A validação abaixo é do master dev, no branch.

- `electron/services/download-path.ts` (novo, funções puras, sem classe):
  `sanitizeSegment` (chars ilegais → `_`, trim de pontos/espaços finais, lança
  em vazio ou só pontos, prefixa reservados do Windows, corta preservando a
  extensão), `isInsideRoot`, `resolveDownloadTarget`, `ensureDirInsideRoot`
  (`realpathSync`, pega junction/symlink). Os três sanitizadores antigos de
  `sigaa.service`, `http-scraper.service` e `download.service` morreram.
- Raiz só do main: `basePath` saiu dos dois payloads em `shared/ipc.ts`;
  `select-download-folder` persiste a pasta; `update-app-setting` rejeita em
  runtime `lastDownloadPath` não nulo (o renderer só limpa); `download-file` e
  `download-all-files` leem a raiz das settings e falham com "Nenhuma pasta de
  downloads definida" se não houver; `check-files-existence` devolve
  `exists: false` sem tocar o disco para caminho fora da raiz.
- `download.service.ts` (Playwright): `saveAs` para `.part`, a detecção de HTML
  lê e apaga o `.part`, `rename` é o último passo — nos três ramos (direto,
  popup, popup reload). Fatia não test-first, conferida no diff.
- `SEC-002` não bloqueou: contrato tipado + validação em runtime no main
  impedem o renderer de impor raiz mesmo pela ponte genérica do preload.
- Vermelho-verde provado pelo master dev com checkout das fontes de `master`
  (o `git stash` da receita não pega trabalho já commitado):
  `download-path-security.test.ts` inteiro (módulo ausente), 2 casos em
  `download-real.test.ts` e 2 em `preload-contract.test.ts` falham sem a
  correção e passam com ela.
- Correção do master dev (`a0c04b6`, `Role: MASTER`): a prova
  `rel.startsWith('..')` — **prescrita pelo plano do handoff** — rejeitava um
  filho legítimo chamado `..fora`. MAKE encobriu o falso positivo prefixando
  `_` em todo nome que começa com ponto (admitido em comentário), e dois testes
  reimplementaram a prova errada em vez de chamar `isInsideRoot`. Agora um
  helper decide para as três funções (vazio, `..`, `..<sep>` e absoluto ficam
  fora); teste de regressão `isInsideRoot(root, root/..fora/x.pdf) === true`.
  O caso novo de `sigaa-service.test.ts` passava em `master` por acidente (o
  mock de `enterCourseAndGetHTML` falhava antes); passou a afirmar que essa
  chamada não acontece, e falha contra `master`.
- Gate no Windows: `tsc` limpo, 0 erros de lint (112 avisos), **153 passed,
  4 skipped**.
- Aceito e registrado: caminhos antigos em `downloadedFiles` (localStorage)
  fora da raiz atual passam a reportar `exists: false` e a UI reoferece o
  download. `downloadCourseFiles` e `playwrightLogin.downloadAllFiles`
  continuam sem chamador, não tocados.
- Falta (do Bruno): um download real no app — o mesmo smoke cobre o `BUG-004`.

### DL-002 — Correct content-type detection and file validation

- Status: `NOT STARTED`
- Priority: `P2`
- Owner: —
- Dependencies: `DL-001`
- Primary files:
  - New: `electron/services/file-validation.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/download.service.ts`
  - New: `tests/unit/file-validation.test.ts`
  - New: `tests/integration/download-boundary.test.ts`

#### Required behavior

- Remove the unknown-to-PDF fallback.
- Resolve type from safe existing extension, Content-Disposition, known MIME,
  and magic bytes in that order.
- Use `.bin` or no extension when content genuinely remains unknown.
- Always reject HTML/login/error pages.
- Reject known extensions with incompatible signatures.
- Do not reject legitimate unknown binary data solely because no signature is
  registered.
- Set maximum response size and streamed-byte limits.
- Share validation logic between HTTP and Playwright download paths.

#### Acceptance criteria

- Valid octet-stream non-PDF fixtures survive validation.
- HTML masquerading as PDF is rejected and the temporary file is removed.
- Known Office/archive/image signatures are recognized.
- Failed downloads leave no partial final file.

#### Verification

```text
npm run test:unit -- file-validation
npm run test:integration -- download-boundary
```

#### Implementation notes

- Commit: —
- Supported signatures: —
- Maximum size: —

---

## Operational quality work

### OBS-001 — Centralize, redact, rotate, and clear logs

- Status: `NOT STARTED`
- Priority: `P2`
- Owner: —
- Dependencies: `ARCH-001`, `DATA-002`
- Primary files:
  - `electron/services/logger.service.ts`
  - New: `electron/services/diagnostics.service.ts`
  - `electron/main.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/download.service.ts`
  - New: `tests/unit/logger-redaction.test.ts`

#### Required behavior

- Remove global console monkeypatching.
- Remove the separate unbounded scraper log.
- Use one injected logger with component scopes and operation IDs.
- Buffer writes and rotate by size with finite retention.
- Redact passwords, cookies, headers, usernames, full paths, raw HTML, JSF
  scripts, course names, and filenames from normal production logs.
- Keep HTML/trace diagnostics development-only or explicit-consent only.
- Apply retention and deletion to diagnostics.

#### Acceptance criteria

- Secrets and academic content do not appear in production logs.
- Log growth is bounded.
- Clear-all removes logs and diagnostics.
- Logger failures do not recursively call the same failing logger.

#### Verification

```text
npm run test:unit -- logger-redaction
```

#### Implementation notes

- Commit: —
- Rotation policy: —
- Redaction policy: —

### A11Y-001 — Fix document, controls, and modal accessibility

- Status: `NOT STARTED`
- Priority: `P2`
- Owner: —
- Dependencies: `SEC-001`
- Primary files:
  - `index.html`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/sync-selection.ts`
  - `src/pages/settings.ts`
  - `src/styles/main.css`
  - `src/styles/dashboard.css`
  - `src/styles/course-detail.css`
  - `src/styles/sync-selection.css`
  - New: `tests/e2e/accessibility.spec.ts`

#### Required behavior

- Change language to `pt-BR`.
- Label icon-only controls with accessible names.
- Convert clickable cards/rows to semantic buttons or links.
- Add visible `:focus-visible` states and reduced-motion behavior.
- Add `aria-expanded`/`aria-controls` to the notification menu.
- Give the news modal dialog semantics, Escape handling, focus trapping,
  background inertness, and focus restoration.

#### Acceptance criteria

- All primary flows work with keyboard only.
- Modal focus cannot escape while open and returns to the trigger on close.
- Automated accessibility checks have no critical/serious violations in the
  tested screens.

#### Verification

```text
npm run test:e2e -- accessibility
```

#### Implementation notes

- Commit: —
- Automated scanner: —

### DEV-001 — Remove production developer cache mutation actions

- Status: `PARTIAL`
- Priority: `P2`
- Owner: —
- Dependencies: none
- Primary files:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/vite-env.d.ts`
  - `tests/e2e/app.spec.ts`

#### Current state

- The IPC handler is guarded by `!app.isPackaged`.
- The tray still always includes `[Dev] Simular Arquivo Novo`.
- The preload still always exposes `simulateNewFile`.

#### Acceptance criteria

- Production tray contains no cache mutation command.
- Production preload exposes no simulation method.
- E2E retains an explicit development-only test bridge.

#### Verification

```text
npm run build
npm run test:e2e
```

#### Implementation notes

- Commit: —

### DEP-001 — Upgrade vulnerable and incompatible dependencies

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: security tests should be in place before broad upgrades
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `vite.config.ts`
  - `vitest.config.ts`
  - `playwright.config.ts`

#### Required sequence

1. Upgrade Axios to a release outside the current vulnerable ranges.
2. Select a Vite major supported by Vitest 4 and the Electron Vite plugins.
3. Upgrade Electron and Playwright as a tested runtime set.
4. Upgrade electron-builder and electron-updater together.
5. Align all Vitest browser/UI/coverage packages to one version.
6. Regenerate the lockfile from a clean dependency install.
7. Run `npm ls`, full audit, production audit, packaging, and scraper tests.

#### Acceptance criteria

- `npm ls` reports no invalid peer tree.
- Production audit has no high or critical findings.
- Full audit findings are documented or fixed before release.
- Packaged Electron login/navigation/download smoke tests pass.

#### Verification

```text
npm ls
npm audit
npm audit --omit=dev
npm run quality
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Selected Vite major: —
- Audit summary: —

### QA-001 — Add deterministic test, lint, coverage, and audit gates

- Status: `PARTIAL`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`, critical security tests
- Primary files:
  - `package.json`
  - `vitest.config.ts`
  - `playwright.config.ts`
  - New: `eslint.config.js`
  - New: `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - Existing tests under `tests/`

#### Current state

- Unit suite parse failure is fixed.
- Live SIGAA tests are opt-in.
- `package.json` still has no default `test`, lint, coverage, audit, or quality
  script.
- Release workflow publishes after only install/build.

#### Required scripts

- `test`
- `test:unit`
- `test:integration`
- `test:live`
- `typecheck`
- `lint`
- `coverage`
- `audit:prod`
- `quality`

#### Acceptance criteria

- Pull requests run deterministic checks without SIGAA credentials.
- Live canary is separate and opt-in/scheduled.
- Coverage thresholds protect sanitizer, IPC validation, account storage,
  coordinator, and download path modules.
- Publishing cannot start unless quality checks pass.
- Lint prevents new unrestricted `any` usage in shared/security code.

#### Verification

```text
npm ci
npm run quality
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Coverage thresholds: —

### REL-001 — Sign and verify Windows releases

- Status: `NOT STARTED` — **ESCOPO ALTERADO 2026-08-02**
- Priority: `P1`
- Owner: —
- Dependencies: `DEP-001`, `QA-001`

> **Decisão (Bruno, 2026-08-02): não comprar certificado de assinatura.**
> Projeto open source sem receita; certificado de code signing para Windows custa
> centenas de dólares por ano.
>
> **Mas o problema que esta tarefa resolvia não desaparece.** Sem assinatura, o
> SmartScreen alerta, e hoje o `README.md` instrui o usuário a clicar em "Mais
> informações" → "Executar assim mesmo". Para um app que pede as credenciais do
> SIGAA, isso treina o usuário a ignorar avisos de segurança do sistema
> operacional — o mesmo passo que um malware pediria.
>
> **Escopo substituto:**
> - Checksums SHA-256 publicados em cada release.
> - Build público e auditável via GitHub Actions, com log mostrando de qual
>   commit o binário saiu. É uma forma de confiança que assinatura paga não dá:
>   qualquer um pode verificar a origem.
> - README honesto: explicar por que o aviso aparece, o que pode ser verificado
>   antes de aceitar, e que o código é auditável. Em vez de mandar clicar em
>   "executar assim mesmo" sem contexto.
> - Reavaliar se aparecerem usuários externos: existem programas de certificado
>   gratuito ou subsidiado para open source.
>
> Os critérios de aceitação abaixo que mencionam assinatura ficam suspensos até
> essa reavaliação.
- Primary files:
  - `.github/workflows/release.yml`
  - `electron-builder.json5`
  - `package.json`
  - `README.md`
  - `RELEASE_GUIDE.md`

#### Required workflow

1. Quality job.
2. Package job.
3. Sign-and-verify job.
4. Checksum generation.
5. Publish job dependent on all previous jobs.

#### Acceptance criteria

- CI uses `npm ci`.
- Published installer and portable executable have a verified expected
  publisher signature.
- CI fails on unsigned or unexpectedly signed artifacts.
- Release includes SHA-256 checksums.
- README no longer tells users to bypass SmartScreen.
- Signing secret setup, rotation, and revocation are documented.

#### Verification

```text
npm run quality
npm run package:win
Get-AuthenticodeSignature <artifact>
```

#### Implementation notes

- Commit: —
- Signing provider/publisher: —

---

## SIGAA portal compatibility work

Detailed operating procedures live in `docs/PORTAL_COMPATIBILITY.md`.

### PORTAL-001 — Centralize the SIGAA compatibility adapter

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/sigaa/selectors.ts`
  - New: `electron/sigaa/portal-contracts.ts`
  - New: `electron/sigaa/portal-state-classifier.ts`
  - New: `electron/sigaa/portal-adapter.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/http-scraper.service.ts`

#### Acceptance criteria

- Selectors and portal structural assumptions are not scattered through
  services.
- Each operation validates starting and ending portal state.
- Adapter failures use stable selector/state error codes.

#### Verification

```text
npm run test:integration -- portal
```

#### Implementation notes

- Commit: —

### PORTAL-002 — Build sanitized, versioned portal fixtures

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`
- Primary files:
  - New: `tests/fixtures/sigaa/README.md`
  - New fixtures under `tests/fixtures/sigaa/<adapter-version>/`
  - `tests/integration/portal-selector-resilience.test.ts`

#### Acceptance criteria

- Fixtures cover login, invalid credentials, student home, empty/populated
  courses, course home, empty/populated files, news, expired session, access
  denied, and maintenance.
- Fixtures contain no personal data, cookies, credentials, or real ViewState.
- Parser/state-classifier tests run against every fixture.

#### Verification

```text
npm run test:integration -- portal
```

#### Implementation notes

- Commit: —
- Fixture version: —

### PORTAL-003 — Add privacy-safe structural diagnostics

- Status: `PARTIAL`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`, `OBS-001`
- Primary files:
  - `electron/services/playwright-login.service.ts`
  - New: `electron/services/diagnostics.service.ts`
  - New: `tests/unit/diagnostics-redaction.test.ts`

#### Current state

- Selector-drift tests and explicit errors exist.
- Development HTML captures exist but are not centrally sanitized or retained.

#### Acceptance criteria

- Failure diagnostics include state, URL family, title, selector counts,
  adapter version, and DOM structural fingerprint.
- Personal text, credentials, cookies, ViewState, and academic content are
  removed.
- HTML/screenshots/traces require development mode or explicit consent.
- Retention is bounded and clear-all removes diagnostics.

#### Verification

```text
npm run test:unit -- diagnostics-redaction
npm run test:integration -- portal
```

#### Implementation notes

- Commit: —

### PORTAL-004 — Add an opt-in scheduled live compatibility canary

- Status: `PARTIAL`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`, `PORTAL-003`, `QA-001`
- Primary files:
  - `tests/integration/scraper.test.ts`
  - New: `.github/workflows/sigaa-canary.yml`
  - `package.json`

#### Current state

- Live smoke tests exist and are opt-in.
- There is no scheduled workflow, compatibility fingerprint, or alerting.

#### Acceptance criteria

- Canary uses a dedicated minimum-privilege test account.
- Normal pull requests never require SIGAA credentials.
- Canary validates login, portal classification, course enumeration, course
  entry, files/news structure, and logout.
- It does not require a fixed number of courses or files.
- Failures produce privacy-safe diagnostics and notify maintainers.
- Temporary SIGAA outages do not block ordinary development.

#### Verification

```text
RUN_LIVE_SIGAA_TESTS=true npm run test:live
```

#### Implementation notes

- Commit: —
- Schedule: —
- Alert destination: —

### PORTAL-005 — Add compatibility degradation and kill-switch behavior

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`, `CONC-001`
- Primary files:
  - New: `electron/services/portal-compatibility.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/sync-selection.ts`

#### Acceptance criteria

- Repeated structural failures disable background sync and auto-downloads.
- Cached account-scoped data remains viewable.
- UI explains that SIGAA changed and sync is temporarily unavailable.
- App avoids repeated login attempts that could lock an account.
- A successful verified canary/manual check can restore compatibility state.

#### Verification

```text
npm run test:integration -- portal-compatibility
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Trigger threshold: —

---

## Débitos técnicos aceitos conscientemente

Formato: o quê, por quê, e **o que faz voltar**. Débito sem gatilho de
reavaliação não é decisão, é esquecimento.

### DÉBITO-01 — Electron 30 fora de suporte

- **O quê:** o projeto roda Electron 30.5.1. O Electron mantém apenas as três
  majors mais recentes; vulnerabilidades de Chromium não recebem mais patch.
- **Por quê adiado:** atualizar muda a versão do Chromium embutido, e o scraper
  depende de comportamento de navegador (Playwright, cookies, sessão JSF). Risco
  real de quebrar o núcleo funcionante sem testes que provem o contrário.
- **Gatilho:** assim que a Fase 1 estiver completa e existir suíte executável em
  CI. Com testes rodando, a atualização passa a ser verificável em vez de
  apostada. **Obrigatório antes de distribuição pública ampla** — não é aceitável
  entregar Chromium sem patch a terceiros.
- **Mitigação:** superfície reduzida enquanto é uso pessoal e o app navega apenas
  para `si3.ufc.br`. Cai mais depois do `SEC-003`.

### DÉBITO-02 — Sem assinatura de código

- **O quê:** binários Windows não assinados; SmartScreen alerta.
- **Por quê adiado:** custo do certificado vs. projeto open source sem receita.
- **Gatilho:** se aparecerem usuários externos em número que justifique, checar
  programas de certificado gratuito/subsidiado para open source.
- **Mitigação:** checksums, build público auditável, README honesto. Ver
  `REL-001`.

### DÉBITO-03 — Sem proteção contra concorrência no Playwright

- **O quê:** sync em background e ação do usuário podem navegar a mesma página
  Playwright simultaneamente. O `pauseSync` que deveria evitar isso nunca
  existiu de fato (`BUG-002`).
- **Por quê adiado:** a solução correta é o `CONC-001`, trabalho de Fase 3.
- **Gatilho:** obrigatório na Fase 3. Sobe de prioridade imediatamente se
  aparecer qualquer bug de sincronização corrompendo dados.
- **Mitigação:** nenhuma. O risco existe hoje e é conhecido.

---

## Current handoff

> **Leia nesta ordem ao retomar:** `CLAUDE.md` (regras) → `docs/PLANO.md`
> (plano e decisões) → esta seção. Não existe documento de handoff separado; os
> arquivos do repositório são o handoff, por decisão de projeto — documento
> paralelo duplicaria e divergiria.

### Próximo passo imediato

> **Atualizado em 2026-08-09.** O lote agêntico foi fechado: `QA-006`,
> `PIPE-005` e `PIPE-006` estão `DONE`, revisados pelo Claude e provados no
> Windows/GitHub Actions. O documento temporário `docs/ORDEM_DE_TRABALHO.md` foi
> removido como previsto; as decisões e evidências definitivas estão nas tarefas
> e no ledger deste tracker.
>
> **`DEP-002` concluído no Windows em 2026-08-09.** Vite `6.4.3`, lock
> regenerado, `npm ci`, gate e empacotamento passaram; os workflows agora usam
> instalação reproduzível. Após revisão/commit deste lote, a ordem do plano volta
> ao `BUG-001` (download apagando arquivos válidos). As 5 vulnerabilidades altas
> de produção encontradas na auditoria ficam registradas separadamente no
> `DEP-001` e não foram misturadas nesta migração.

> **Atualizado em 2026-08-09, fim da sessão.** A Fase 2 começou: `CLEAN-001` e
> `BUG-001` estão `DONE` no commit `700de9a`, com o gate rodado no Windows. O
> `BUG-010` (User-Agent real buscado e descartado) foi aberto e é o candidato
> mais barato para a falha imprevisível de download por HTTP.
>
> **Próximo:** `BUG-009` — id de arquivo capturado com o apóstrofo do JSF.
> Precisa de conversa antes de começar: a correção invalida o `cache.json` e pode
> disparar re-download geral em quem tem `autoDownloadUpdates` ligado.

> **Atualizado em 2026-09-01.** Lote trivial fechado direto (decisão do Bruno:
> tarefas pequenas sem PTMR): `BUG-002` `DONE` (restava um `(window as any)` e
> a marcação), `BUG-010` `IN REVIEW` (5 requests usando `this.userAgent`,
> vermelho-verde provado; falta a medição de taxa de falha em uso real) e
> `BUG-005` `IN REVIEW` (encanamento morto removido; falta o download manual de
> verificação no app). Três commits: `ff1d794`, `ddee28a`, `cf96bc6`. As
> tarefas médias em diante (`BUG-003`, `QA-003`, `BUG-004`, Fase 3) vão por
> PTMR, com a tarefa do tracker como spec. O `BUG-009` continua sendo o item
> bloqueado em conversa.
>
> **`BUG-009` desbloqueado e feito na mesma sessão** (decisão: normalizar ids na
> leitura do `cache.json`, direto, sem PTMR). Está `IN REVIEW` até uma
> sincronização real com cache antigo confirmar zero "arquivo novo". Próximo:
> `setup-ptmr` no repositório e `BUG-003` como primeiro ciclo PTMR.
>
> **`BUG-003` fechou o primeiro ciclo PTMR** (branch `traycer-bug-003-clean-base`,
> ciclo 01 limpo, validado pelo master dev, fast-forward em `master`). Um worktree
> `traycer/noble-hawk` de uma tentativa abandonada sobre base divergente ficou
> para trás — não contém nada a aproveitar. Próximo pela ordem: `QA-003`, depois
> `BUG-004`.
>
> **`QA-003` `DONE`, direto** (dois testes, prova por mutação). `BUG-003` também
> `DONE` depois que o Bruno conferiu o build empacotado. Próximo pela ordem:
> `BUG-004` (fallback Playwright de download), via PTMR.
>
> **`BUG-004` fechou o ciclo PTMR 02 do repositório** (branch
> `traycer/snappy-lemur`, limpo, fast-forward em `master`, um nit `MASTER`).
> Fallback Playwright ligado, `IN REVIEW` até o smoke manual do Bruno. Da Fase 2
> resta `DL-001` (contenção do caminho de download). Próximo pela ordem:
> `DL-001`, depois Fase 3 a partir do `ARCH-001`.
>
> **`DL-001` fechou o ciclo PTMR 03** (branch `traycer/lucid-lynx`, fast-forward
> em `master`). O ciclo veio sem fase READ e sem return handoff; o master dev
> validou no branch e corrigiu a prova de contenção, que o próprio plano tinha
> prescrito errada (`a0c04b6`). `IN REVIEW` até um download real. **Fase 2
> concluída.** Próximo pela ordem: Fase 3, a partir do `ARCH-001`.
>
> **Smoke do `DL-001` feito pelo Bruno:** pasta persistida pelo main, "baixar
> todos" ok. Ele revelou o `BUG-011` (tarefa listada como arquivo, fallback
> Playwright abrindo Chrome à toa), corrigido direto com a primeira fixture real
> do portal; `IN REVIEW` até um "baixar todos" depois de sincronizar. Typo
> "Sempre pergunta" corrigido em `28774e6`.
>
> **Segundo smoke do Bruno: sincronizar + "baixar todos", nenhum Chrome, toast
> verde.** `DL-001`, `BUG-004` e `BUG-011` marcados `DONE`. Fase 2 fechada de
> fato; `BUG-009` continua `IN REVIEW` (falta conferir zero "arquivo novo" na
> sincronização com cache antigo). Próximo: Fase 3, `ARCH-001`.

**Registro histórico — rodar o gate no Windows e commitar o lote de 2026-08-05.** Havia um
working tree acumulado sobre `38ff29b` que ainda não tinha passado pela execução
autoritativa:

```
shared/ipc.ts                                    ARCH-003 (RendererApi)
electron/preload.ts                              BUG-008 + ARCH-003
src/vite-env.d.ts                                ARCH-003
tests/unit/parser.test.ts                        QA-005 — APAGADO (git rm)
electron/services/http-scraper.service.ts        BUG-007
src/utils/ui-helpers.ts                          QA-002 (locale pt-BR explícito)
tests/integration/persistence-auth-recovery.test.ts   QA-002 (fs em memória)
playwright.config.ts                             QA-004 (novo)
tests/e2e/app.spec.ts, visual.spec.ts, helpers/launch.ts   QA-004 (novos)
tests/integration/parser-real.test.ts            QA-004 (novo)
tests/unit/preload-contract.test.ts              QA-004 (novo)
tests/fixtures/*.html, tests/fixtures/README.md  QA-004 (novos)
.github/workflows/quality.yml                    PIPE-003 (novo)
.github/workflows/release.yml                    PIPE-001 + PIPE-004  ⚠️ ver abaixo
package.json                                     PIPE-001 (--publish never)
RELEASE_GUIDE.md                                 PIPE-001 (fluxo novo)
CLAUDE.md, .gitignore                            documentação do loop de verificação
```

⚠️ **O `release.yml` não foi escrito no disco.** `.github/workflows/` é protegido
contra escrita por ferramenta remota. O arquivo foi entregue no chat da sessão
2026-08-05 e precisa ser salvo à mão por cima do atual. Se ele ainda tiver
`push: tags:` no topo, a substituição não aconteceu e o `PIPE-001` não está de
pé.

Ordem sugerida:

1. `npm run quality` — precisa passar no Windows. O gate rodou verde num Linux
   nesta sessão, o que é sinal, não autoridade.
2. `npx playwright test visual.spec.ts` (opcional, mas é o que prova que o app
   ainda abre e renderiza).
3. `git rm tests/unit/parser.test.ts` — o agente não tem permissão de apagar na
   pasta montada, então o arquivo ainda está lá. Ver `QA-005`.
4. Quatro commits, porque são quatro coisas distintas:

```
fix: extract news ids and bridge getSettings across the preload

test: add fixture parser, preload contract, and playwright e2e tiers

refactor: derive window.api from a single RendererApi contract

ci: gate the release and require an explicit publish step
```

Separar importa: o primeiro é correção de comportamento com teste que falha sem
ela; o segundo é infraestrutura de verificação; o terceiro é a correção de raiz
que torna o primeiro impossível de repetir. Misturados, um `git revert` do bug
arrasta os tiers de teste.

### Depois disso, em ordem

> **A Fase 1 fechou em 2026-08-05.** `PIPE-001`..`PIPE-004` estão `DONE`, com a
> ressalva do `release.yml` acima. O marco declarado no `PIPE-004` — "nada piora
> sem alguém perceber" — vale a partir do primeiro push depois do commit.

1. ~~`DEP-002` — regerar o lock e trocar os workflows para `npm ci`.~~ **DONE
   2026-08-09:** Vite 6.4.3, instalação limpa, gate e build Windows verdes.
2. ~~**gitleaks no `quality.yml`** — prevenção do `SEC-000`.~~ **DONE
   2026-08-09 (`PIPE-006`)**, com prova por mutação no GitHub Actions.
3. ~~**Nível 1 da `docs/AUDITORIA_COMPLEXIDADE.md`**~~ — **`DONE` 2026-08-09
   (`CLEAN-001`, commit `700de9a`).** −202 linhas. Menor que as ~700 previstas:
   `verify-scraper.ts` e `sync-selection.dark.css` já tinham saído, e o
   `enterCourseHTTP` foi retirado do escopo (`BUG-010`).
4. ~~`BUG-001` — download apagando arquivos válidos.~~ **`DONE` 2026-08-09
   (commit `700de9a`).** Ciclo vermelho-verde cumprido, 6 testes novos, duas
   provas por mutação, avisos de lint 125 → 115 na sessão. A correção **não** foi
   apagar o fallback `.pdf` — ver as notas da tarefa.
5. `BUG-009` — id de arquivo capturado com o apóstrofo do JSF. **Depois do
   `BUG-001`**, porque a correção invalida o `cache.json` e pode disparar
   re-download geral em quem tem `autoDownloadUpdates` ligado.
6. `QA-003` — os dois testes que faltam (curso malformado no `startSync`; falha
   de download exibindo a `message` real). O tier novo do `QA-004` **não** cobre
   nenhum dos dois.
7. `BUG-004` — ligar o fallback Playwright, depois de medir a taxa de falha
   remanescente.

Atenção ao fazer o `BUG-003`: o terceiro teste E2E depende de
`window.api.simulateNewFile()`, que é a ação que o `BUG-003` remove. Ver limites
conhecidos do `QA-004`.

### Pendente fora do código (Bruno)

- `git filter-repo` para limpar a credencial do histórico. Procedimento completo
  no `SEC-000`. **Fazer backup da pasta antes.** A senha já foi trocada, então
  isso é higiene, não urgência.

- ~~**Apagar `_to_delete/` e `_agent_tmp/`.**~~ **Feito** — as duas pastas não
  existem mais em 2026-08-09.

  Fica registrado o motivo de o item recorrer: **o agente não tem permissão de
  `unlink` na pasta montada**, só de escrever e mover. Apagar arquivo é sempre
  seu. Consequência colateral vista nesta sessão: um `git checkout --` do agente
  falha no meio e deixa `.git/index.lock` para trás, o que bloqueia `git add` e
  `git commit` até alguém apagar o lock à mão. Se o git reclamar de "another git
  process seems to be running" sem processo nenhum rodando, é isso.

- **Triagem do `.claude/skills/`: encerrada por decisão sua.** As skills foram
  vendorizadas no commit `38ff29b` (`chore: vendor claude skills used in this
  project`). Registrado aqui para o item não voltar como pendência: a decisão foi
  versionar, não mover para escopo de usuário.

### Recently completed

- `BUG-001` / `CLEAN-001` / `BUG-010` — **`700de9a`** (2026-08-09). O download
  parou de apagar arquivo válido: a extensão passou a sair dos magic bytes em vez
  de um chute `.pdf`, e o arquivo vai para `.part` até ser verificado. Achado de
  brinde, corrigido junto: `pipe()` não propaga erro do source, então conexão
  caída no meio deixava a Promise do `downloadFile` pendurada para sempre.
  −202 linhas de código inalcançável no mesmo lote. `BUG-010` aberto.
  **Os três num commit só** — ver a nota de fechamento do `BUG-001`.

- `PIPE-001` / `PIPE-004` — **`DONE`** (2026-08-05). Release só por
  `workflow_dispatch`, com input `publish` desmarcado por padrão; gate
  (`typecheck`/`lint`/`test`) como passos antes do build; `--publish always` fora
  do `package.json`, que agora usa `--publish never`. `RELEASE_GUIDE.md`
  atualizado. **Pendente:** salvar o `release.yml` à mão (pasta protegida).
- `PIPE-003` — **`DONE`** (2026-08-05, sessão anterior). `.github/workflows/quality.yml`:
  gate em `windows-latest` em push/PR, mais job de E2E sem credencial com
  artefatos. Desde o `DEP-002` usa `npm ci`; `PIPE-005` tornou o E2E bloqueante
  e `PIPE-006` acrescentou o scanner de segredo.
- `ARCH-003` — **`DONE`** (sessão 2026-08-05). `RendererApi` em `shared/ipc.ts`,
  usada pela ponte e pela declaração. Ponte faltando virou erro de compilação;
  provado por mutação (remover `getSettings` → `TS2741`).
- `QA-005` — **`DONE`** (sessão 2026-08-05). `tests/unit/parser.test.ts` apagado
  (241 linhas, parser espelhado). Asserções úteis migradas para o
  `parser-real.test.ts`. Suíte 76 → 64 testes, cobrindo estritamente mais.
- `QA-004` — **`DONE`** (sessão 2026-08-05). Tier de parser real contra fixture,
  teste de contrato do `window.api`, E2E de Electron e loop de verificação
  visual. Saiu como resposta direta ao `BUG-007` e ao `BUG-008`.
- `BUG-008` — **`DONE`** (2026-08-05). `getSettings` declarado no `.d.ts` e
  atendido pelo main, sem ponte no preload. Cinco call sites quebrados em runtime
  com `tsc` verde. Encontrado pelo teste de contrato.
- `BUG-007` — **`DONE`** (2026-08-05). Regex de id de notícia com `\\d` dentro de
  literal (barra invertida + "d", não dígito): nunca casava, e a estratégia
  devolvia zero notícia em silêncio, com 14 testes verdes em cima — porque os
  testes exercitavam uma **cópia** do parser.
- `QA-002` — **`DONE`** (2026-08-05). Locale fixado em `pt-BR` no `ui-helpers`
  (era bug de UI real, não só de teste) e o teste de persistência passou a usar
  `fs` mockado em memória. A suíte deixou de depender do ambiente.
- `PIPE-002` — **`DONE`** (2026-08-04). `npm run quality` verde no Windows.
  Contrato do `window.api` corrigido contra o que o main devolve de fato, união
  discriminada em `selectDownloadFolder`, type guard `isCourseLike` no
  `sync-selection`, 13 `prefer-const`. `tsc` 0 erros, `eslint` 0 erros /
  125 avisos (era 34 / 149).
- `BUG-006` — falha de download mostrava sempre "Erro desconhecido"
  (`result.error` num objeto que devolve `message`). Encontrado **pelo
  typecheck**, no minuto em que o retorno deixou de ser `any`.
- `SEC-000` — senha trocada e repositório fechado. Limpeza de histórico pendente.
- `DOC-001` — documentos de auditoria corrigidos.
- `DOC-002` — `CLAUDE.md` escrito.
- Commits: `58983c2` (`PIPE-002` + `DOC-002` + `BUG-006`), `38ff29b` (skills
  vendorizadas). Antes disso, `5968a40` era o baseline.
- Unit-suite unmatched closure fixed in commit `5968a40`.
- Live SIGAA smoke tests made opt-in in commit `5968a40`.
- Selector-drift and persistence recovery tests added in commit `5968a40`.

### O padrão que aparece em todo bug deste repositório

> **Fechado na raiz em 2026-08-05** pelo `ARCH-003` (uma declaração para o
> contrato do preload) e pelo `QA-005` (apagar o parser espelhado). O que sobrou
> sem verificação de tipo — canal sem handler — está em
> `tests/unit/preload-contract.test.ts`, e o caminho para tipá-lo é o `SEC-002`.


Quatro dos bugs registrados aqui — `BUG-002` (`pauseSync`), `BUG-006`
(`result.error`), `BUG-007` (regex de notícia) e `BUG-008` (`getSettings`) —
têm a mesma forma: **duas pontas que deveriam se corresponder, e nada
verificando a correspondência.**

| Bug | As duas pontas | Quem devia ter pegado |
|---|---|---|
| `BUG-002` | chamada no renderer ↔ método que não existe | o `tsc`, desligado por `as any` |
| `BUG-006` | campo lido ↔ campo devolvido | o `tsc`, desligado por `any` |
| `BUG-007` | teste ↔ código de produção (eram arquivos diferentes) | um teste que chamasse o parser real |
| `BUG-008` | declaração `.d.ts` ↔ ponte do preload ↔ handler do main | nada olhava as três |

A lição de processo: quando você encontrar um bug aqui, a pergunta útil não é
"onde está o erro" — é **"que verificação estava ausente para isso ser
possível"**. Nos quatro casos a correção do código levou minutos e a correção da
verificação foi o trabalho de verdade.

### Três erros de análise cometidos na sessão 2026-08-04, para não repetir

Registrados porque cada um quase virou uma mudança errada no código:

1. **`download.service.ts` declarado morto** por busca de `import ... from`.
   Era carregado por `await import()`. Depois, declarado vivo — mas os métodos
   que o carregam não têm chamador. Ver nota de método no `CODE_REVIEW.md`.
2. **"A zona de fronteira já passa limpa no lint"** — baseado em não haver
   `as any` em `electron/`. Verdade, e irrelevante: o que quebrou foram 18 `: any`
   de anotação, número que já constava da auditoria.
3. **Senha real transcrita como exemplo** na documentação do próprio incidente
   de credencial — anularia o `filter-repo`. Ver aviso no `SEC-000`.

Padrão comum aos três: conclusão confiante a partir de evidência parcial. O
antídoto que funcionou nas três vezes foi verificar antes de agir — e nos casos 1
e 2, foi o autor conhecendo o comportamento real do app que pegou o erro.

### Restrição de ambiente (importante para agentes)

**A tabela canônica está no `CLAUDE.md`** (seções "Comandos" e "Loop de
verificação visual"). Resumo do que mudou desde 2026-08-04, para não deixar
informação errada aqui:

- `npm install` continua sendo do autor, no Windows: o app depende de binários
  nativos por plataforma (Electron, Playwright).
- **Copiar o repositório (sem `node_modules`) para o ambiente do agente e
  instalar as dev-deps lá é o caminho bom** — o gate inteiro em ~12s, contra
  ~40s **por arquivo** de `eslint` na pasta montada (limitado por I/O da
  montagem, não por CPU).
- **Correção do que estava escrito aqui:** o `vitest` **não** é impossível fora
  do Windows. Ele falhava porque o `node_modules` montado foi instalado no
  Windows e só tem o binding `win32`; o lock lista as 15 plataformas. Instalado
  num Linux, roda (68 passed em 5,8s, medido em 2026-08-05).
- O que não sai de um Linux: `npm run build` (`electron-builder --win` pediria
  wine) e o empacotamento. O E2E **sai**, com `xvfb-run` e um `google-chrome` no
  PATH.
- ~~`npm ci` não roda em lugar nenhum.~~ Resolvido no Windows em 2026-08-09;
  workflows e desenvolvimento usam o lock regenerado (`DEP-002`).
- Na sessão 2026-08-05 o `device_bash` da máquina do autor ficou indisponível
  ("Workspace unavailable"), então o agente leu os arquivos por staging e **não**
  conseguiu rodar `git status`. Estado do working tree inferido de mtimes e do
  reflog: isso mostra quando cada arquivo foi tocado, não que o índice esteja
  limpo. Conferir com `git status` antes de commitar.

**A execução no Windows do autor continua sendo a autoridade** para build, E2E,
empacotamento e para fechar qualquer tarefa.

### Known blockers and cautions

- Do not broaden the preload API while migrating it.
- Do not assign legacy unscoped cache to the next logged-in account.
- Do not update all major dependencies in the same commit as scraper behavior.
- Do not commit real SIGAA HTML until it has passed the fixture sanitization
  checklist in `docs/PORTAL_COMPATIBILITY.md`.
- Do not treat fixture tests as proof that the live portal is unchanged.
- Fixtures atuais são sintéticas: elas concordam com o parser por construção.
  Ver limites conhecidos do `QA-004`.

## Verification ledger

Append results here after meaningful milestones.

| Date | Commit | Commands | Result | Notes |
|---|---|---|---|---|
| 2026-07-10 | `5968a40` | `npx.cmd tsc --noEmit`; `npx.cmd vitest run` | Pass | 68 passed, 4 live tests skipped. |
| 2026-08-04 | working tree | `tsc --noEmit` (agente, pasta montada) | Pass | 0 erros. Eram 30 antes do ajuste dos consumidores de `window.api`. |
| 2026-08-04 | working tree | `eslint .` (agente, cópia do repo) | Pass | 0 erros, 125 avisos. Baseline: 34 erros, 149 avisos. Zona de fronteira limpa. |
| 2026-08-04 | working tree | `npm run quality` (**Bruno, Windows — autoridade**) | **Pass** | 9 arquivos, 68 passed, 4 skipped. Fecha o `PIPE-002`. |
| 2026-08-05 | working tree | `tsc --noEmit`; `eslint .`; `vitest run` (agente, cópia do repo num Linux) | Pass | 3,1s / 2,8s / 5,8s. 0 erros, 125 warnings, 68 passed, 4 skipped. Prova que a suíte não depende mais do ambiente (`QA-002`). |
| 2026-08-05 | working tree | `xvfb-run npx playwright test visual.spec.ts` (agente, Linux) | Pass | Todas as rotas renderizam em tema claro e escuro, sem erro de console. PNGs em `_agent_tmp/shots/`. |
| 2026-08-05 | working tree | `npm ci` | **Fail** | Lock fora de sincronia com o `package.json` (`vitest@4.1.4` pede `vite@^6\|\|^7\|\|^8`, lock tem `5.4.21`). Ver `DEP-002`. |
| 2026-08-05 | working tree | `tsc --noEmit`; `eslint .`; `vitest run` (agente, container, **depois** do `ARCH-003`/`QA-005`) | Pass | tsc limpo, 0 erros / 123 avisos, 64 passed / 4 skipped. A queda de 76 → 64 é a remoção do parser espelhado. |
| 2026-08-05 | working tree | Mutação: remover a ponte `getSettings` do preload | **Falha esperada** | `TS2741: Property 'getSettings' is missing ... but required in type 'RendererApi'`. É a prova do `ARCH-003`. |
| 2026-08-05 | working tree | Mutação: canal `get-app-settingz` no preload | **Falha esperada** | `preload-contract.test.ts` lista o canal órfão. Prova a metade que o tipo não cobre. |
| 2026-08-05 | working tree | `yaml.safe_load` nos dois workflows + `grep` por `--publish always` | Pass | YAML válido; a flag só existe no `release.yml`, no passo condicional. **Nenhum workflow foi executado** — isso só acontece no GitHub, depois do commit. |
| 2026-08-05 | working tree | `npm run quality` (Windows) | **Não rodado** | Lote de 2026-08-05 ainda sem execução autoritativa. É o próximo passo. |
| 2026-08-09 | working tree | `npx.cmd vitest run`; `rg -n "mkdirSync\|writeFileSync" tests`; `rg -n "rmSync" tests/e2e` (Codex, Windows) | Pass | `QA-006`: 10 arquivos, 64 passed / 4 skipped; `mkdirSync`/`writeFileSync` só aparecem em mocks de unidade/integração. Três `rmSync` de E2E apagam `.test-user-data` de propósito. Resultado igual ao Linux. |
| 2026-08-09 | [`142c48e`](https://github.com/Laginho/SIGAA-ME/actions/runs/31322548186) (branch descartável) | Mutação: erro deliberado no helper E2E com `continue-on-error` removido | **Falha esperada** | `PIPE-005`: workflow `failure`; gate `success`; E2E `failure`. Prova de que o E2E agora bloqueia. Branch removido após a verificação. |
| 2026-08-09 | [`4a149b6`](https://github.com/Laginho/SIGAA-ME/actions/runs/31322967979) (branch descartável) | Primeira execução do Gitleaks com `fetch-depth: 0` | Pass | Scanner executou sem licença e não achou o segredo histórico: a action usou `--log-opts=-1`. Resultado contrário à previsão, registrado no `SEC-000`/`PIPE-006`. |
| 2026-08-09 | [`4860c95`](https://github.com/Laginho/SIGAA-ME/actions/runs/31323088727) (branch descartável) | Mutação: token falso em arquivo temporário | **Falha esperada** | Gate e E2E verdes; scanner vermelho com `generic-api-key` e `github-pat`; workflow `failure`. Branch removido após a verificação. |
| 2026-08-09 | working tree | `npm run quality` (Windows) | **Falha de ambiente** | `tsc --noEmit` passou; o lint não iniciou porque `eslint` não existe no `node_modules` local. A cadeia parou antes dos testes. Não foi feito `npm install`; ver `DEP-002`. |
| 2026-08-09 | working tree | `npx.cmd tsc --noEmit`; `npx.cmd vitest run`; parse YAML com `js-yaml` (Windows) | Pass | Typecheck limpo; 10 arquivos, 64 passed / 4 skipped; jobs `gate`, `e2e` e `secrets` presentes em YAML válido. |
| 2026-08-09 | working tree | `npm ci`; `npm ls`; `npm run quality`; `npm run build` (Windows) | Pass | `DEP-002`: Vite 6.4.3, árvore reproduzível; 0 erros/123 avisos, 64 passed/4 skipped; instalador NSIS e portátil gerados. |
| 2026-08-09 | working tree | `npm audit --omit=dev`; `npm audit` | **Fail — dívida registrada** | Produção: 5 high/0 critical. Árvore completa: 1 low/15 high/2 critical. Correções pertencem ao `DEP-001`, não ao `DEP-002`. |

## Task change log

Record status or scope changes that affect other agents.

| Date | Task | Change | Author/task |
|---|---|---|---|
| 2026-07-10 | Tracker | Initial repository-owned hardening tracker created. | Codex |
| 2026-08-02 | Tracker | Ordem de execução revisada: fase de pipeline (`PIPE-001`..`004`) passa a vir antes de `ARCH-001`. Justificativa: sem suíte executável, refatorar 9 arquivos de fronteira não é verificável. Ordem de *dependência* mantida. | Claude |
| 2026-08-02 | `DOC-001` | Criada e concluída. `CODE_REVIEW.md` corrigido: erro factual da chave não fechada (já resolvida em `5968a40`), escala do `innerHTML` precisada (9 sinks, não 47), `notification-store.ts` e `settings.ts` removidos da lista, `toast.ts` adicionado. | Claude |
| 2026-08-02 | `DOC-002` | Criada — escrever `CLAUDE.md`. | Claude |
| 2026-08-02 | `PIPE-001`..`004` | Criadas — pausar publicação automática, scripts npm, CI de PR, gate no release. Cobrem os achados de suíte inexecutável e ausência de CI de PR. | Claude |
| 2026-08-02 | `BUG-001` | Criada e **promovida de P2 para P0** — download apaga arquivos válidos. É perda de dados no caminho principal, não um detalhe de validação. | Claude |
| 2026-08-02 | `BUG-002` | Criada — remover `pauseSync()` morto. Decisão do autor: remover em vez de implementar. | Claude |
| 2026-08-02 | `BUG-003` | Criada e **promovida de P2 para P1** — a guarda `!app.isPackaged` protege a ponta IPC, mas o item do tray não usa IPC e fica exposto e funcional em produção. | Claude |
| 2026-08-02 | `DOC-003` | Criada — documentar que `download.service.ts` é carregado por import dinâmico. Achado de "código morto" **refutado**. | Claude |
| 2026-08-02 | `REL-001` | Escopo alterado: sem certificado de assinatura (decisão do autor). Substituído por checksums SHA-256, build público auditável e README honesto. | Claude |
| 2026-08-02 | `QA-001` | Escopo reduzido na prática: `PIPE-002` implementa 4 dos 9 scripts exigidos (`test`, `typecheck`, `lint`, `quality`). Os outros 5 entram quando houver necessidade concreta. | Claude |
| 2026-08-02 | Tracker | Registrados `DÉBITO-01` (Electron 30), `DÉBITO-02` (assinatura) e `DÉBITO-03` (concorrência), cada um com gatilho de reavaliação. | Claude |
| 2026-08-04 | `DOC-002` | `NOT STARTED` → `DONE`. O arquivo já existia na raiz; o status é que não tinha sido atualizado. | Claude |
| 2026-08-04 | `PIPE-002` | `IN REVIEW` → `DONE`. Escopo decidido por Bruno: corrigir o contrato declarado e validar `unknown` no call site, **sem antecipar o `ARCH-001`**. Adicionados `AccountSummary`, `DownloadResultItem` e `NewsDetail` ao `shared/ipc.ts` — todos lidos do código, nenhum especulativo. | Claude |
| 2026-08-04 | `BUG-006` | Criada e concluída — `result.error` num retorno que só tem `message`. Encontrado pelo typecheck. **Sem teste** — ver `QA-003`. | Claude |
| 2026-08-04 | `QA-002` | Criada, `P1`, **bloqueia o `PIPE-003`** — 3 testes dependem do locale e de um caminho `C:\` literal. Descoberto ao rodar a suíte fora do Windows. | Claude |
| 2026-08-04 | `QA-003` | Criada, `P2` — o que a suíte de 68 testes **não** cobre. Registrado para que "quality verde" não seja lido como "comportamento verificado". | Claude |
| 2026-08-05 | `QA-002` | `NOT STARTED` → `DONE`. Locale explícito `pt-BR` no `ui-helpers` (bug de UI real, não só de teste) e `fs` mockado em memória no teste de persistência. Deixa de bloquear o `PIPE-003`. | Claude |
| 2026-08-05 | `BUG-007` | Criada e concluída, `P1` — regex de id de notícia com escape duplo (`\\d`) nunca casava; zero notícia em silêncio. Encontrado ao escrever teste contra o parser real. | Claude |
| 2026-08-05 | `BUG-008` | Criada e concluída, `P1` — `getSettings` sem ponte no preload; 5 call sites quebrados em runtime com `tsc` verde. Encontrado pelo teste de contrato. | Claude |
| 2026-08-05 | `QA-004` | Criada e concluída, `P1` — tiers de teste: parser real contra fixture, contrato do `window.api`, E2E de Electron, loop visual. Resposta direta ao `BUG-007`/`BUG-008`. | Claude |
| 2026-08-05 | `DEP-002` | Criada, `P1`, **passa a ser o bloqueio do `PIPE-003`** no lugar do `QA-002` — `npm ci` não roda: lock fora de sincronia com o `package.json`. Quebra em qualquer máquina. Owner: Bruno (Windows). | Claude |
| 2026-08-05 | `BUG-003` | Escopo anotado: ao remover `simulateNewFile` da produção, o terceiro teste E2E do `QA-004` perde o gancho e precisa de substituto ou remoção. Sem mudança de status. | Claude |
| 2026-08-05 | Tracker | Seção "Restrição de ambiente" corrigida: `vitest` **não** é impossível fora do Windows (o bloqueio era o binding `win32` do `node_modules` montado, não o `rolldown`). Registrado também que o `device_bash` local ficou indisponível nesta sessão, então o estado do working tree foi inferido de mtimes + reflog, não de `git status`. | Claude |
| 2026-08-05 | `ARCH-003` | Criada e concluída, `P1` — correção de raiz da classe "duas pontas sem verificação": `RendererApi` em `shared/ipc.ts` usada pela ponte e pela declaração. Provada por mutação. | Claude |
| 2026-08-05 | `QA-005` | Criada e concluída, `P1` — `tests/unit/parser.test.ts` apagado; asserções úteis migradas para o parser real. Deleção como correção. | Claude |
| 2026-08-05 | `BUG-009` | Criada, `P2` — id de arquivo capturado com apóstrofo (`[^,]+` em vez de `[^,'"]+`). **Não corrigida de propósito**: o id é identidade no `cache.json`, então a correção precisa de migração e deve vir depois do `BUG-001`. | Claude |
| 2026-08-09 | `QA-006` | Criada e concluída, `P1` — `SigaaService` agora usa `fs` mockado no teste e deixa de criar diretórios reais ou falhar por permissão fora do Windows. | Codex |
| 2026-08-05 | `PIPE-001` | `NOT STARTED` → `DONE`. Gatilho de tag removido do `release.yml`; input `publish` desmarcado por padrão; `--publish never` no `package.json`. `RELEASE_GUIDE.md` atualizado no mesmo passo. | Claude |
| 2026-08-05 | `PIPE-004` | `NOT STARTED` → `DONE`. Gate como passos dentro do job de release (não `needs:` — o GitHub não permite depender de job de outro workflow). Checksums SHA-256 continuam no `REL-001`. | Claude |
| 2026-08-05 | `PIPE-003` | `NOT STARTED` → `DONE`. O `quality.yml` já existia desde a sessão anterior e não tinha sido registrado; o status estava errado, não a implementação. Nome ficou `quality.yml`, não `ci.yml`. | Claude |
| 2026-08-05 | `DEP-002` | Corrigida a caracterização: **não bloqueia** o `PIPE-003` (o CI existe e usa `npm install`), degrada a reprodutibilidade. O erro veio de eu não ter listado `.github/` ao levantar o estado. | Claude |
| 2026-08-05 | Tracker | Registrado que `.github/workflows/` é protegido contra escrita remota: YAML de workflow precisa ser salvo pelo autor. | Claude |
| 2026-08-05 | Tracker | Triagem do `.claude/skills/` encerrada: decisão de Bruno foi versionar (commit `38ff29b`), não mover para escopo de usuário. Item removido das pendências. | Claude |
| 2026-08-09 | `PIPE-005` | Criada e concluída, `P1` — E2E passou a bloquear o workflow e os dois jobs receberam teto de 15 minutos. Comportamento provado por mutação no GitHub Actions. | Codex |
| 2026-08-09 | `PIPE-006` | Criada e concluída, `P1` — job Gitleaks bloqueia novas credenciais. A premissa de que `fetch-depth: 0` reauditaria o histórico foi refutada pelo log (`--log-opts=-1`) e registrada sem ampliar a configuração. | Codex |
| 2026-08-09 | Lote agêntico | `QA-006`, `PIPE-005` e `PIPE-006` aprovadas pelo Claude; ordem de trabalho temporária encerrada. `DEP-002` permanece como próxima ação manual do Bruno. | Codex |
| 2026-08-09 | `DEP-002` | `NOT STARTED` → `DONE`. Vite 5.4.21 → 6.4.3, lock regenerado, workflows em `npm ci`; instalação limpa, quality e build Windows verificados. Auditorias pendentes encaminhadas ao `DEP-001`. | Bruno + Codex |

