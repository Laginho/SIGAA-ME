# PORTAL-003 — Add privacy-safe structural diagnostics
Status: resolved
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `PARTIAL`

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

- Commits: `5766cd3` (testes vermelhos), `4e1c5e7` (implementação)
- Branch: `PORTAL-003`
- Seam confirmado com o usuário antes do primeiro teste: a interface pública
  de `electron/services/diagnostics.service.ts` (funções puras
  `buildStructuralDiagnostic`/`domFingerprint`/`shouldCaptureRawArtifact` +
  `DiagnosticsService.record()/.clear()`), sem canal IPC novo e sem UI de
  consentimento nesta rodada.
- Decisões:
  - **Redação por construção, não por filtro.** A saída só carrega enum de
    estado (`classify()` do PORTAL-001), `urlFamily` (pathname, sem query/
    fragmento), `title`, contagens fornecidas pelo chamador, versão do adapter
    e um hash sha256 do esqueleto de nomes de tag. Nenhum desses campos copia
    texto livre do HTML — não existe canal para nome de aluno, ViewState,
    cookie ou nota vazar, mesmo sem lista de bloqueio.
  - **`selectorCounts` é responsabilidade do chamador.** O serviço não sabe
    quais seletores importam por tipo de página; só embute o que já foi
    contado no ponto de falha (mesmo padrão que já existia em
    `getCourses()` para `SELECTOR_DRIFT`).
  - **Consentimento sem UI nesta rodada.** `shouldCaptureRawArtifact(isPackaged,
    consent)` é pura e testada; o único call site convertido
    (`enterCourseAndGetHTML`, falha geral de navegação) passa `consent=false`
    fixo — comportamento observável idêntico ao `!app.isPackaged` de antes.
    Ligar consentimento de verdade (settings + UI) fica para outro ticket.
  - **Retenção: últimos 20, arquivo JSON por diagnóstico.** Nome de arquivo
    `${timestamp}-${uuid}.json`; a poda ordena pelo timestamp numérico
    embutido no nome, não pela string (`"10"` vem antes de `"2"` em ordem
    lexicográfica).
  - **`clear()` faz `existsSync` antes de `rmSync`.** Não é defesa contra
    corrida — é para não quebrar `tests/unit/sigaa-service.test.ts`, que
    mocka `fs` sem `rmSync`; com o guard, o mock de `existsSync` (sempre
    `false`) já evita a chamada.
  - **Único ponto de gravação: `getCourses()` no branch `SELECTOR_DRIFT`.**
    Esse branch já calculava `selectorDiagnostics` e antes não gravava
    diagnóstico nenhum. Outros pontos de falha (`enterCourseAndGetHTML`) só
    ganharam o gate de consentimento no dump de HTML cru existente — não
    ganharam gravação de diagnóstico estrutural nesta rodada, para manter o
    diff no tamanho do que o ticket pediu.
- Prova vermelho-verde: `git stash push -u` das três fontes tocadas →
  `tests/unit/diagnostics-redaction.test.ts` falha com "Cannot find module"
  (28 outros testes de `sigaa-service.test.ts` continuam verdes) → `git stash
  pop` → suíte completa verde.
- Gate: `tsc --noEmit` limpo; `eslint .` 0 erros, 67 warnings legado (nenhum
  introduzido pelos arquivos desta tarefa); `vitest run` 549 passed | 4
  skipped (553) — eram 538 passed | 4 skipped (542) antes desta tarefa (11
  testes novos).

## Revisão (Opus, 2026-09-08) — reaberta

**Quatro achados bloqueantes.** Volta à etapa 2. Nenhum código alterado nesta
revisão: as três correções precisam de teste vermelho antes, e a fiação inteira
está descoberta.

#### Gate, reproduzido aqui

`npm run quality` na branch: `tsc --noEmit` limpo; `eslint .` 0 erros, 67
warnings (`no-explicit-any` legado); `vitest run` 46 arquivos, 549 passed | 4
skipped (553). Bate com o relatado.

#### Achado A-1 — a fiação de produção não tem teste nenhum

Removidos os dois únicos call sites novos (`playwright-login.service.ts:359-364`
e `diagnosticsService.clear()` em `sigaa.service.ts:124`), `vitest run` devolve
**549 passed | 4 skipped — a suíte inteira, intacta**. Os 11 testes novos
exercitam funções puras e `new DiagnosticsService()` direto; nada exercita o
serviço no caminho de falha real nem o clear-all.

A prova vermelho-verde registrada ("Cannot find module" depois do `git stash`)
prova que o módulo passou a existir, não que ele está ligado. É o item 5 do
"antes de commitar" e o `QA-003` outra vez: se a correção fosse revertida,
nenhum teste falharia.

#### Achado A-2 — `app.getPath` em tempo de import: regressão do DEV-002

```ts
constructor() {
    this.dir = path.join(app.getPath('userData'), 'diagnostics');
}
// ...
export const diagnosticsService = new DiagnosticsService();
```

`main.ts:5` importa `sigaa.service`, que importa `diagnostics.service`. Imports
são içados, então o construtor roda **antes** do `app.setPath('userData',
'<name>-dev')` de `main.ts:20-25`. Em desenvolvimento o diagnóstico grava em
`%APPDATA%\sigaa-me\diagnostics` (produção), e o `clearDiagnostics()` de dev
apaga a pasta de produção — exatamente os dois consequentes que o `DEV-002`
descreve e fechou. A revisão do DEV-002 afirmou que `logger.service.ts:10` era
o último `app.getPath` em tempo de import do repositório; este ticket criou o
segundo.

Correção: campo vira getter, como em `cache.service.ts:59` e
`persistence.service.ts:52`. Teste: `tests/unit/userdata-late-binding.test.ts`
já tem o padrão (`getPath` mutável, asserta que não foi chamado no import).

#### Achado A-3 — falha ao gravar diagnóstico apaga o `SELECTOR_DRIFT`

`await page.content()` (sem o `.catch(() => '')` que a linha 593 do mesmo
arquivo usa) e `mkdirSync`/`writeFileSync`/`unlinkSync` sem guarda, dentro do
`try` de `getCourses`. Qualquer EPERM, disco cheio ou arquivo em uso cai no
`catch` genérico da linha 407, que devolve `{ success: false, error:
error.message }` **sem `errorCode`** — e `classifyMessage` passa a ler a falha
como outra coisa. O diagnóstico destrói o sinal que ele existe para preservar.

O `try/catch` aqui não é o anti-padrão da regra 3 do `CLAUDE.md`: o erro é
tratado (loga e devolve o `SELECTOR_DRIFT` correto), não engolido. A guarda
precisa envolver a expressão inteira, não só o `record()` — `page.content()` e
`cheerio.load` também lançam.

#### Achado A-4 — AC1 cobre 1 dos 3 pontos de falha estrutural

Existem três `return` com `errorCode: 'SELECTOR_DRIFT'` no caminho do
Playwright:

| Local | Grava diagnóstico? |
|---|---|
| `playwright-login.service.ts:359` (drift na lista de disciplinas) | sim |
| `playwright-login.service.ts:121` (`classifyLoginEnd` → `unrecognized`) | **não** |
| `playwright-login.service.ts:473` (`validateCourseListDocument`) | **não** |

A nota "para manter o diff no tamanho do que o ticket pediu" não se sustenta: o
ticket lista esse arquivo como primary file e pede diagnóstico de falha, não de
uma falha. Instrumentar dois `return` a mais é diff menor que a discussão.
Nenhum sibling (`PORTAL-004`/`PORTAL-005`) reivindica esses pontos.

#### Critérios de aceitação

- ❌ **AC1** — 1 de 3 pontos de falha estrutural instrumentado (A-4), e o
  ponto instrumentado não tem teste (A-1).
- ⚠️ **AC2** — os campos derivados são seguros por construção, com uma
  exceção: `title: $('title').first().text().trim()` **é** texto livre do
  HTML, sem truncagem nem allowlist. O ticket pede o campo `title`, então
  incluir não é o erro; a afirmação da nota ("nenhum desses campos copia texto
  livre do HTML") é que é falsa, e o fixture tem título genérico, então o teste
  passa por sorte da amostra. Truncar (~120 chars) fecha o pior caso.
- ⚠️ **AC3** — o gate de consentimento cobre 1 de ~11 dumps de HTML cru; os
  outros seguem com `!app.isPackaged` inline
  (`playwright-login.service.ts:137,304,378,518,1054,1071,1188`;
  `http-scraper.service.ts:240,287,357,768`). Como o único call site passa
  `consent=false` fixo, o comportamento observável é idêntico ao de antes:
  `shouldCaptureRawArtifact` é hoje abstração para zero casos reais (regra 7 do
  `CLAUDE.md`). Ou converte os 11, ou não vale existir até o ticket de
  consentimento.
- ⚠️ **AC4** — retenção limitada só para os JSON de diagnóstico; os
  `debug_*.html` continuam sem limite. `clear()` chega mesmo aos diagnósticos
  (`sigaa.service.ts:123` → `register-handlers.ts:307`, handler
  `clear-all-data`) — essa metade está cumprida, mas descoberta por teste
  (A-1).

#### Menores, não bloqueiam

- `prune()`: `Number(name.split('-')[0])` dá `NaN` para qualquer `.json`
  estranho no diretório, e `NaN` na comparação deixa a ordem arbitrária — pode
  apagar o arquivo errado. Uma linha: `.filter(e => Number.isFinite(e.timestamp))`.
- `buildStructuralDiagnostic` faz `cheerio.load` duas vezes e `classify()`
  carrega de novo: 3+ parses do portal inteiro por diagnóstico. Passe o `$`.
- `if (el.type === 'tag')` dentro de `$('*')` é sempre verdadeiro.
- `existsSync` em `clear()` é redundante com `rmSync({ force: true })`; a
  própria nota admite que ele existe para não quebrar o mock de `fs` de
  `sigaa-service.test.ts`. Código de produção moldado por mock — o conserto é
  `rmSync: vi.fn()` no mock.
- `urlFamily` não revela que devolve o pathname; o JSDoc existe porque o nome
  não conta.

#### Veredito

Reaberta. Etapa 2 com: teste vermelho para os dois call sites (drift grava
diagnóstico; clear-all apaga), teste de late-binding do `userData`, teste da
degradação do `errorCode` quando a gravação falha, e decisão explícita sobre
AC3 (converter os 11 sítios ou remover `shouldCaptureRawArtifact` desta rodada).

## Segunda rodada (2026-09-08) — os quatro bloqueantes

Testes vermelhos em `d733df0`, implementação no commit seguinte. Ordem
mantida: os testes entraram sozinhos, vermelhos, antes de qualquer código.

#### A-1 — cobertura da fiação

Nove testes novos. Todos falham contra o `master`:

| Teste | Arquivo | Cobre |
|---|---|---|
| drift da lista de turmas grava diagnóstico | `portal-selector-resilience` | A-1 |
| gravação que falha preserva o `SELECTOR_DRIFT` | idem | A-3 |
| HTML ilegível preserva o `SELECTOR_DRIFT` | idem | A-3 |
| pouso pós-login não reconhecido grava | idem | A-4 |
| portal rejeitado antes da turma grava | idem | A-4 |
| rejeição por sessão expirada **não** grava | idem | A-4 (limite) |
| `clearDiagnostics` apaga os diagnósticos | `sigaa-service` | A-1 |
| `app.getPath` não é chamado no import | `userdata-late-binding` | A-2 |
| diagnóstico cai no `userData` vigente | idem | A-2 |

Os testes espionam `diagnosticsService.record` em vez de olhar o disco: a
asserção passa a ser o payload, e a suíte não escreve no `userData`. O serviço
em si continua coberto pelo `diagnostics-redaction`.

#### A-2 — `dir` virou getter

Mesma forma do `cache.service.ts` e do `persistence.service.ts`: campo com
`app.getPath` no construtor virou `private get dir()`. O construtor
desapareceu, então o singleton de módulo não toca em `app.getPath` no import.

#### A-3 — a guarda mora com os chamadores

`PlaywrightLoginService.recordDiagnostic()` envolve `buildStructuralDiagnostic`
e `record` num `try` que loga e segue. Não é o anti-padrão da regra 3: o erro é
tratado — o `SELECTOR_DRIFT` volta intacto — não engolido. O `page.content()`
do ponto de drift ganhou o `.catch` que a linha 607 do mesmo arquivo já usava.

A primeira tentativa pôs a guarda em `diagnostics.service.ts`, e o teste de
late-binding acusou: importar `logger.service` de lá arrastava para o teste o
`app.getPath` em tempo de import que o `logger` ainda tem (defeito do
`OBS-001`, não deste ticket). Método privado no serviço que já importa o
`logger` resolve sem acoplar módulo novo — e os três chamadores estão todos
nesse arquivo.

#### A-4 — os três pontos de falha estrutural

| Local | Payload |
|---|---|
| `login()`, `endState === 'unrecognized'` | `endHtml`, `currentUrl`, `{}` |
| `getCourses()`, drift da lista | HTML da página, `page.url()`, contagens |
| `enterCourseAndGetHTML()`, portal rejeitado | `portalHtml`, `page.url()`, `{}` |

No terceiro, só `SELECTOR_DRIFT` grava: `SESSION_EXPIRED` no mesmo ramo é
sessão vencida, não mudança de layout, e diagnóstico estrutural ali seria
ruído. Um teste fixa esse limite. O `{}` nos dois pontos sem contagem é
honesto — nenhum seletor foi contado ali, e a nota da primeira rodada sobre
contagens serem responsabilidade do chamador continua valendo.

#### Prova vermelho-verde

- `git stash` dos dois serviços (volta à primeira rodada): 6 falhas — as de
  A-2, A-3 e A-4.
- `git checkout master --` sobre `playwright-login.service.ts` e
  `sigaa.service.ts`: 6 falhas — agora com as de A-1 (drift grava,
  `clearDiagnostics` apaga).
- Com a implementação: os quatro arquivos, 69 passed.

#### Gate

`tsc --noEmit` limpo; `eslint .` 0 erros, 67 warnings legado (mesma contagem de
antes); `vitest run` 46 arquivos, **557 passed | 4 skipped (561)** — eram 549
passed | 4 skipped (553).

#### Não tocado

Os cinco itens menores da revisão e as ressalvas de AC2/AC3/AC4 seguem abertos:
o `NaN` no `prune()`, os parses repetidos de cheerio, o `title` sem truncagem,
os ~11 dumps crus ainda com `!app.isPackaged` inline, e a decisão sobre
`shouldCaptureRawArtifact`. Eram não bloqueantes; ampliar o diff para eles
misturaria escopo com os quatro achados.

## Revisão das correções (Codex, 2026-09-08) — reaberta

Revisão individual, sem subagentes, a pedido do Bruno. Base fixada em
`master` (`7890968`), HEAD revisado `2d7cd98`. Nenhum código de produção ou
teste permanente alterado. Ainda não está pronto para push e PR.

### Correções confirmadas

- A-1: os testes agora detectam a remoção da gravação e da limpeza.
- A-2: o singleton não resolve `userData` no import; a gravação usa o caminho
  vigente, confirmada pelo teste de late-binding.
- A-3: falha em `record()` ou na leitura adicional de HTML preserva
  `SELECTOR_DRIFT` no caminho da lista de turmas.
- A-4: os dois pontos pedidos na revisão anterior foram instrumentados, mas
  a contagem anterior de três pontos era incompleta. Há retornos indiretos
  via `startCheck.code` e `classifyLoginException()` no próprio `login()`.

### Standards

- **P1 — título sem redação.** `diagnostics.service.ts:62` copia texto livre
  de uma fonte externa para o diagnóstico persistido. Contraria
  `docs/PORTAL_COMPATIBILITY.md:211`, que pede categoria de título e exclui
  título específico do aluno. O comentário de privacidade por construção
  no topo do serviço também não corresponde ao comportamento.

### Spec

- ❌ **AC2 / P1 — dados pessoais e acadêmicos no título.** Passar
  `<title>Aluno Teste Privado - Calculo I - Media 9.4</title>` a
  `buildStructuralDiagnostic()` preserva esse conteúdo integralmente no JSON,
  inclusive em produção, onde a gravação estrutural não exige consentimento.
  O teste atual só coloca dados sensíveis no corpo. Usar categoria/allowlist
  com fallback seguro e teste de título sensível. Truncar em 120 caracteres,
  como sugerido na primeira revisão, **não** remove nome ou nota.
- ❌ **AC2 / P1 — sessão no pathname.** `urlFamily()` em
  `diagnostics.service.ts:30` conserva
  `/sigaa/paginaInicial.do;jsessionid=TEST_SESSION_SECRET` quando recebe
  `https://si3.ufc.br/sigaa/paginaInicial.do;jsessionid=TEST_SESSION_SECRET?foo=1`.
  Remover query e fragmento não basta para esse formato de URL. Normalizar a
  família de rota sem parâmetros de sessão e testar esse caso. A reprodução
  usa dado sintético; não afirma que uma captura atual do SIGAA contém esse
  formato.
- ❌ **AC1 / P2 — falhas de login ainda sem diagnóstico.** HTML inicial
  `<main>Layout novo sem formulario</main>` faz `validateLoginStart()`
  devolver `SELECTOR_DRIFT`, mas `login()` retorna em
  `playwright-login.service.ts:106` sem gravar. Um erro de `page.fill()` com
  mensagem `Timeout waiting for input[name="user.login"]` também retorna
  `SELECTOR_DRIFT` via `classifyLoginException()` no catch, com zero chamadas
  a `record()`. Cobrir ambos os caminhos com diagnóstico best-effort, antes
  de fechar a página, preservando a classificação mesmo se a captura falhar.

### Verificação reproduzida

- `npm run quality`: typecheck limpo; ESLint **0 erros, 67 warnings**;
  Vitest **46 arquivos, 557 passed | 4 skipped (561)**.
- Quatro arquivos da tarefa contra as fontes da primeira rodada (`360180e`):
  **6 failed | 63 passed (69)**, por A-2/A-3/A-4, sem falha de import.
- Mesmos testes, com `playwright-login.service.ts` e `sigaa.service.ts` de
  `master` e o serviço de diagnóstico atual: **6 failed | 63 passed (69)**,
  incluindo ausência de gravação e de limpeza (A-1).
- Fontes atuais restauradas: **69 passed (69)** nos quatro arquivos.
- Quatro provas adicionais, temporárias, chamando o código de produção:
  título sensível, sessão no pathname, login inicial sem formulário e timeout
  de campo de login. **4 failed | 25 skipped (29)**; os 25 são os testes do
  harness existente excluídos pelo filtro. As duas provas de login confirmam
  primeiro `errorCode === 'SELECTOR_DRIFT'` e falham depois na expectativa de
  uma chamada a `record()`. As duas provas de redação falham porque os
  marcadores sensíveis sintéticos continuam em `JSON.stringify(diagnostic)`.
- As fontes foram restauradas byte a byte em `finally`; o teste temporário
  foi removido. Nenhum login real, credencial, build ou E2E executado.
- A execução do script de prova no sandbox encontrou bloqueio de leitura do
  esbuild antes da coleta. Reexecutada fora do sandbox, com os resultados
  acima. Essa falha de infraestrutura não foi contada como prova vermelha.

### Decisão

Volta à etapa 2 para os três bloqueios acima, com testes vermelhos antes do
código. Os três achados de Spec incluem o achado de título de Standards;
não são quatro defeitos distintos. AC3 continua com gate de desenvolvimento
nos dumps existentes; a abstração de consentimento e a retenção dos HTMLs
seguem como ressalvas já registradas, sem correção nesta revisão. O
`clear-all-data` existente já remove `debug_*` na raiz do `userData`.
Sem linha no ledger, pois a issue continua aberta. Sem push ou PR.

## Terceira rodada (2026-09-08) — os três bloqueantes

Testes vermelhos em `63e6ebc`, implementação em `a18346f`. Ordem mantida: os
testes entraram sozinhos, vermelhos, antes de qualquer código de produção.

#### B-1 — título sem redação

Decisão: allowlist por regex, não por texto exato. Os sete títulos reais do
SIGAA (`grep -rhoi "<title>[^<]*</title>" tests/fixtures/`) viram sete
categorias estáveis:

| Título real | Categoria |
|---|---|
| `AVA - SIGAA - Sistema Integrado de Gestão de Atividades Acadêmicas` | `ava` |
| `SIGAA - Acesso Negado` | `access-denied` |
| `SIGAA - Login` | `login` |
| `SIGAA - Manutenção` | `maintenance` |
| `SIGAA - Portal do Discente` | `student-portal` |
| `SIGAA - Portal` | `portal` |
| `SIGAA - Turma` | `course-class` |

`categorizeTitle()` casa contra padrões (`/acesso\s*negado/i`, `/manuten/i`,
`/login/i`, `/portal\s+do\s+discente/i`, `/turma/i`, `/^ava\b/i`, `/portal/i`,
nessa ordem) e devolve `'other'` para qualquer título fora da allowlist —
nunca o texto de origem. Truncar (a sugestão da primeira revisão) não
resolvia: `Aluno Teste Privado - Calculo I - Media 9.4` truncado em 120
caracteres ainda é `Aluno Teste Privado - Calculo I - Media 9.4`. Com a
allowlist, esse título vira `other` e nome/nota nunca aparecem no JSON. O
comentário de privacidade no topo de `diagnostics.service.ts` foi corrigido
para citar título como categoria, não texto livre.

#### B-2 — sessão no pathname

`urlFamily()` cortava só query string e fragmento; `;jsessionid=...` é
parâmetro de caminho (RFC 3986), mora no próprio segmento de path, não na
query. Correção: cada segmento do pathname é truncado no primeiro `;` antes
do join. `/sigaa/paginaInicial.do;jsessionid=TEST_SESSION_SECRET?foo=1` agora
vira `/sigaa/paginaInicial.do`.

#### B-3 — dois caminhos de falha de login sem diagnóstico

`page` saiu de `const` dentro do `try` para `let page: Page | null = null`
antes dele, para o `catch` alcançar a página. Dois pontos passaram a gravar:

| Local | Guarda |
|---|---|
| `validateLoginStart(startHtml)` retornando `SELECTOR_DRIFT` (~linha 106) | grava antes de `close()`, só quando `startCheck.code === 'SELECTOR_DRIFT'` |
| `catch` de `login()`, `classifyLoginException(error)` (~linha 191) | grava antes de `close()`, só quando `classified.errorCode === 'SELECTOR_DRIFT'`, com a própria captura (`page.content()`/`page.url()`) dentro de um `try/catch` que não deixa uma falha de captura escapar do `login()` nem apagar o `errorCode` já classificado |

`SESSION_EXPIRED` (ainda na tela de login) e `PORTAL_UNAVAILABLE` (timeout
genérico sem seletor específico) não gravam — não são mudança de layout. Um
teste por código fixa esse limite.

#### Prova vermelho-verde

- `git checkout 63e6ebc -- electron/services/diagnostics.service.ts
  electron/services/playwright-login.service.ts` (volta à segunda rodada):
  `npx vitest run tests/unit/diagnostics-redaction.test.ts
  tests/integration/portal-selector-resilience.test.ts` → **14 failed | 38
  passed (52)**, as 14 falhas exatamente as dos três bloqueantes (allowlist
  de título, sessão no pathname, os dois pontos de login).
- `git checkout a18346f -- <mesmos arquivos>` (implementação atual): mesmos
  dois arquivos de teste → **52 passed (52)**.

#### Gate

`tsc --noEmit` limpo; `eslint .` 0 erros, 67 warnings legado (mesma contagem
de antes, nenhum novo); `vitest run` 46 arquivos, **573 passed | 4 skipped
(577)** — eram 557 passed | 4 skipped (561).

#### Não tocado

AC3 (os ~11 dumps crus com `!app.isPackaged` inline e a decisão sobre
`shouldCaptureRawArtifact`) e a ressalva de retenção dos HTMLs em AC4 seguem
como registrado na rodada anterior. `prune()` com `NaN` para nome de arquivo
estranho e os parses repetidos de cheerio em `buildStructuralDiagnostic`
seguem como itens menores, fora do escopo dos três bloqueantes desta rodada.

#### Lacuna de cobertura fechada (2026-09-08, `9b4dbf8`)

A revisão da etapa 3 achou o `try/catch` interno do `catch` de `login()`
(captura de `page.content()`/`page.url()` best-effort, B-3 acima) sem teste
próprio. Novo teste em `portal-selector-resilience.test.ts` faz `page.fill`
estourar por timeout de seletor **e** `page.content` rejeitar na chamada do
`catch`; prova vermelha removendo o `try` interno (`await page.content()` sem
guarda) — `login()` rejeitava com o erro cru em vez de resolver com
`SELECTOR_DRIFT`. Restaurado byte a byte (`git diff --stat` limpo contra
`5459962`), sem commit de código. Gate: `tsc --noEmit` limpo, `eslint .` 0
erros/67 warnings legado, `vitest run` 46 arquivos, **574 passed | 4 skipped
(578)**.

#### Resolution (2026-09-08)

Revisão de etapa 3 (Opus) dos commits `63e6ebc`, `a18346f`, `9b4dbf8`. Nenhum
código de produção ou teste alterado nesta revisão — merge direto.

**Os três bloqueantes do Codex, fechados.**

- **Título (AC2).** `categorizeTitle()` mapeia os sete títulos reais do SIGAA
  para categoria estável e devolve `'other'` para qualquer outro; o texto de
  origem não tem canal para a saída. Truncar em 120 chars, sugerido na primeira
  revisão, foi corretamente rejeitado: não remove nome nem nota. O comentário
  de privacidade no topo do serviço passou a descrever o comportamento real.
- **Sessão no pathname (AC2).** `urlFamily()` trunca cada segmento do pathname
  no primeiro `;`, tratando o `;jsessionid=` como o path parameter que ele é.
  `TEST_SESSION_SECRET` não sobrevive ao `JSON.stringify` do diagnóstico.
- **Login sem diagnóstico (AC1).** `validateLoginStart()` rejeitando o
  documento inicial e `classifyLoginException()` no `catch` agora gravam, antes
  do `close()`, só quando o código é `SELECTOR_DRIFT`. `page` saiu de `const`
  no `try` para `let` no método — mudança mínima para o `catch` alcançar a
  página. `PORTAL_UNAVAILABLE` no mesmo `catch` não grava, e um teste fixa esse
  limite.

**Achado da revisão, devolvido à etapa 2 e fechado em `9b4dbf8`:** o `try`
interno que guarda a captura de HTML no `catch` de `login()` não tinha teste —
apagá-lo deixava a suíte verde, a mesma classe do A-3 que reabriu este ticket.
Coberto agora; a prova vermelha faz `login()` rejeitar com o erro cru em vez de
resolver com `SELECTOR_DRIFT`.

**Arquivos:** `electron/services/diagnostics.service.ts`,
`electron/services/playwright-login.service.ts`,
`tests/unit/diagnostics-redaction.test.ts`,
`tests/integration/portal-selector-resilience.test.ts`.

**Prova vermelho-verde reproduzida na revisão.** `git checkout fa72252 --` sobre
os dois serviços → os dois arquivos de teste dão **15 failed | 38 passed (53)**;
fontes restauradas → **53 passed (53)**.

**Gate reproduzido na revisão.** `npm run quality`: `tsc --noEmit` limpo;
`eslint .` **0 erros, 67 warnings** legado (nenhum novo); `vitest run` 46
arquivos, **574 passed | 4 skipped (578)** — eram 557 passed | 4 skipped (561)
quando o ticket foi reaberto.

**Ressalvas herdadas, não corrigidas aqui e sem ticket próprio:** AC3 segue com
`!app.isPackaged` inline nos ~11 dumps de HTML cru e `shouldCaptureRawArtifact`
segue sem call site que passe `consent=true`; AC4 segue sem limite de retenção
para os `debug_*.html`. Menores em aberto: `NaN` no `prune()`, parses repetidos
de cheerio em `buildStructuralDiagnostic`, `el.type === 'tag'` sempre verdadeiro
dentro de `$('*')`, `existsSync` redundante em `clear()`. Nenhum é regressão
desta rodada.
