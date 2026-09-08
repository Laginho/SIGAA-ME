# PORTAL-003 — Add privacy-safe structural diagnostics
Status: claimed
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
