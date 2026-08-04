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
- Production dependency audit on 2026-07-10: 4 vulnerable packages,
  including 3 high-severity findings.
- Installed Vite/Vitest mismatch: Vite `5.4.21`; Vitest `4.1.4` declares
  Vite `^6 || ^7 || ^8` as its peer range.
- `CODE_REVIEW.md` is the originating review; this tracker supersedes it for
  implementation status.

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
| Scanner de segredo no CI | Pendente (`PIPE-003`) |

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
5. Prevenção no CI (`PIPE-002`).

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

# 3. o filter-repo remove o remote por segurança; recolocar e forçar
git remote add origin https://github.com/Laginho/SIGAA-ME.git
git push --force --all
git push --force --tags
```

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

#### Prevenção (entra no `PIPE-002`)

- Regra de lint proibindo string literal em variável chamada `password`,
  `senha`, `secret`, `token`.
- Alternativa mais robusta: scanner de segredo no CI (`gitleaks` ou
  `trufflehog`) rodando em todo PR. Barato e pega o caso genérico.
- Regra no `CLAUDE.md`: credencial só via `process.env`, **sem valor de
  fallback**. Se a variável não existir, o programa deve falhar, não usar um
  padrão.

#### Acceptance criteria

- Senha do SIGAA trocada (confirmado pelo autor).
- Nenhuma credencial literal em código-fonte.
- Decisão sobre reescrita de histórico registrada, com justificativa.
- CI tem verificação que impede reincidência.

#### Implementation notes

- Commit: —
- Data da troca de senha: —
- Decisão sobre histórico: —

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

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
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

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `PIPE-002`
- Primary files: New: `.github/workflows/ci.yml`

#### Problem

Não existe CI para PR. O único workflow tem triggers `workflow_dispatch` e push
de tag. Nenhum PR jamais foi verificado.

#### Acceptance criteria

- Abrir PR dispara `npm run quality`.
- Não requer credenciais do SIGAA — só testes determinísticos.
- Um PR com teste quebrado mostra falha visível.

### PIPE-004 — Gate no release

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `PIPE-002`, `PIPE-003`
- Primary files: `.github/workflows/release.yml`

#### Acceptance criteria

- Jobs encadeados por `needs`: `quality` → `build` → `publish`.
- É impossível publicar com teste falhando.
- Checksums SHA-256 gerados no release (ver `REL-001` revisado).

**Marco da Fase 1:** a partir daqui, nada piora sem alguém perceber.

---

## FASE 2 — Bugs de uso diário

### BUG-001 — Download apaga arquivos válidos

- Status: `NOT STARTED`
- Priority: `P0` (**promovido** de P2 no review original)
- Owner: —
- Dependencies: `PIPE-002`
- Primary files: `electron/services/http-scraper.service.ts`

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

### BUG-002 — Remover o `pauseSync()` morto

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
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

### BUG-003 — `[Dev] Simular Arquivo Novo` funciona em produção

- Status: `NOT STARTED`
- Priority: `P1` (**promovido** de P2)
- Owner: —
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

### BUG-004 — O fallback Playwright de download não está ligado

- Status: `NOT STARTED` — **decisão do autor necessária**
- Priority: `P1`
- Owner: —
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

### BUG-005 — Encanamento morto no payload de download

- Status: `NOT STARTED`
- Priority: `P3`
- Owner: —
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

- Status: `NOT STARTED`
- Priority: `P1` — **bloqueia o `PIPE-003`**
- Owner: —
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

---

### QA-003 — O que a suíte verde **não** prova

- Status: `NOT STARTED`
- Priority: `P2`
- Owner: —
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
- Remove nonexistent renderer calls to `pauseSync()` and `resumeSync()`.
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

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
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

- Commit: —
- Platform cases covered: —

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

**Commitar o working tree.** O `PIPE-002` está fechado: `npm run quality` verde
no Windows em 2026-08-04 (0 erros de tipo, 0 erros de lint, 125 avisos,
68 passed / 4 skipped).

O working tree acumula `PIPE-002` + `DOC-002` + `BUG-006` + a criação de
`shared/` e `eslint.config.js`. Sugestão de mensagem:

```
chore: add quality gate and type the renderer<->main boundary
```

Depois do commit, o `PIPE-001` é o próximo (é pequeno, e é o que tira o dedo do
gatilho da publicação automática).

**Limpeza:** existe um `_agent_tmp/repo.tar.gz` na raiz, resíduo de agente
(usado para rodar lint/testes fora do Windows). Apagar — não está no
`.gitignore`.

### Depois disso, em ordem

1. `PIPE-001` — tirar `--publish always` do fluxo automático.
2. `QA-002` — tornar a suíte portável (locale + caminho `C:\`).
   **Antes do `PIPE-003`**, senão o CI nasce vermelho por motivo alheio ao PR.
3. `PIPE-003` / `PIPE-004` — CI de PR e gate no release. Inclui o scanner de
   segredo (gitleaks) que fecha a prevenção do `SEC-000`.
4. **Nível 1 da `docs/AUDITORIA_COMPLEXIDADE.md`** — ~700 linhas de remoção com
   prova por busca, num único commit, com `quality` antes e depois.
5. `BUG-001` — download apagando arquivos válidos. **É o exercício de TDD**:
   escrever primeiro o teste que baixa um `.txt` servido como `octet-stream` e
   afirma que o arquivo sobrevive; ele deve falhar antes da correção.
6. `BUG-004` — ligar o fallback Playwright, depois de medir a taxa de falha
   remanescente.

### Pendente fora do código (Bruno)

- `git filter-repo` para limpar a credencial do histórico. Procedimento completo
  no `SEC-000`. **Fazer backup da pasta antes.** A senha já foi trocada, então
  isso é higiene, não urgência.

### Recently completed

- `PIPE-002` — **`DONE`** (sessão 2026-08-04). `npm run quality` verde no
  Windows. Contrato do `window.api`
  corrigido contra o que o main devolve de fato, união discriminada em
  `selectDownloadFolder`, type guard `isCourseLike` no `sync-selection`,
  13 `prefer-const`. `tsc` 0 erros, `eslint` 0 erros / 125 avisos
  (era 34 / 149). Falta só `vitest run` no Windows.
- `BUG-006` — falha de download mostrava sempre "Erro desconhecido"
  (`result.error` num objeto que devolve `message`). Encontrado **pelo
  typecheck**, no minuto em que o retorno deixou de ser `any`.
- `PIPE-002` — implementado (sessão 2026-08-02). Scripts de
  qualidade, ESLint por zona, fronteira `preload`/`main` tipada, `shared/ipc.ts`
  criado, `verify-scraper.ts` removido.
- `SEC-000` — senha trocada e repositório fechado. Limpeza de histórico pendente.
- `DOC-001` — documentos de auditoria corrigidos.
- `DOC-002` — `CLAUDE.md` escrito.
- Unit-suite unmatched closure fixed in commit `5968a40`.
- Live SIGAA smoke tests made opt-in in commit `5968a40`.
- Selector-drift and persistence recovery tests added in commit `5968a40`.

### Três erros de análise cometidos nesta sessão, para não repetir

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

O `npm install` **deve ser rodado pelo autor, no Windows**. O app depende de
binários nativos por plataforma (Electron, Playwright). Instalar de um ambiente
Linux para dentro da pasta do projeto baixaria binários de Linux e quebraria o
setup local.

**O que um agente consegue rodar** (medido na sessão 2026-08-04, de um Linux com
a pasta do projeto montada):

| Comando | Funciona? | Detalhe |
|---|---|---|
| `tsc --noEmit` | **Sim** | JS puro. ~20s. É o loop de feedback útil |
| `eslint .` | Sim, mas inútil | ~40s **por arquivo**: ligado por I/O na montagem, não por CPU. `user 1.5s`, `real 40s` |
| `vitest run` | **Não** | `rolldown` exige binário nativo win32: `MODULE_NOT_FOUND` |
| `npm install` | Não fazer | Baixaria binários de Linux |

Para lint e testes, o caminho que funcionou foi copiar o repositório (sem
`node_modules`) para o ambiente do agente e instalar as dev-deps lá. Duas
ressalvas: as versões instaladas assim podem divergir do `package-lock.json`
(o `tsc` de lá acusou erros de tipo do `axios` que **não existem** no repo real),
e o resultado só vale como sinal — **a execução no Windows do autor é a
autoridade**.

### Known blockers and cautions

- Do not broaden the preload API while migrating it.
- Do not assign legacy unscoped cache to the next logged-in account.
- Do not update all major dependencies in the same commit as scraper behavior.
- Do not commit real SIGAA HTML until it has passed the fixture sanitization
  checklist in `docs/PORTAL_COMPATIBILITY.md`.
- Do not treat fixture tests as proof that the live portal is unchanged.

## Verification ledger

Append results here after meaningful milestones.

| Date | Commit | Commands | Result | Notes |
|---|---|---|---|---|
| 2026-07-10 | `5968a40` | `npx.cmd tsc --noEmit`; `npx.cmd vitest run` | Pass | 68 passed, 4 live tests skipped. |
| 2026-08-04 | working tree | `tsc --noEmit` (agente, pasta montada) | Pass | 0 erros. Eram 30 antes do ajuste dos consumidores de `window.api`. |
| 2026-08-04 | working tree | `eslint .` (agente, cópia do repo) | Pass | 0 erros, 125 avisos. Baseline: 34 erros, 149 avisos. Zona de fronteira limpa. |
| 2026-08-04 | working tree | `npm run quality` (**Bruno, Windows — autoridade**) | **Pass** | 9 arquivos, 68 passed, 4 skipped. Fecha o `PIPE-002`. |

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

