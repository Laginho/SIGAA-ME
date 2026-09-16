# QA-010: O mock de `fs.existsSync` vaza para os testes seguintes
Status: resolved
Stage: done
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `tests/unit/sigaa-service.test.ts` (`:24`, `:97-98`, `:453`)

Achado da revisão do `SEC-004` (2026-09-16), não tocado no PR daquele ticket.

#### What to build

O mock do `fs` declara `existsSync: vi.fn(() => false)` (`:24`), e o único
teardown do arquivo é `vi.clearAllMocks()` no `beforeEach` de `:97`. O
`clearAllMocks` limpa `mock.calls`, `mock.instances` e `mock.results` — **não**
limpa implementação nem valor de retorno. Então o
`vi.mocked(fs.existsSync).mockReturnValue(true)` de `:453` fica valendo para
todo teste que rode depois dele no arquivo.

Hoje passa: o teste de `:473` e os `describe` de `logout()` e `session
operations` não dependem do `existsSync`. O defeito é o default silencioso —
qualquer teste novo escrito depois de `:453` recebe `existsSync → true` achando
que recebe o `false` da fábrica, e um teste que deveria ficar vermelho fica
verde.

Conserto é uma linha. Este ticket existe porque o arquivo de teste é o limite
de outra pessoa: o implementador de um ticket qualquer não pode editá-lo
(`CLAUDE.md`, "implementador não edita arquivo de teste"), e o precedente do
`CLEAN-009` acabou de ser discutido. Com ticket próprio, o arquivo é Primary
file e o conserto é legítimo.

#### Acceptance criteria

1. Depois do teste de `:453`, `fs.existsSync` volta ao default `false` sem que
   nenhum teste precise limpar à mão. A forma fica a critério de quem
   implementa — reafirmar o default no `beforeEach` é a menor.
2. Nenhuma asserção existente muda, nenhum teste é removido, e o teste de
   `:453` (SEC-004 item 15) continua vendo `existsSync → true` enquanto roda.
3. `npx vitest run tests/unit/sigaa-service.test.ts` verde, e `npm run quality`
   verde.

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/sigaa-service.test.ts`: um teste colocado **depois** do de
  `:453` afirma `expect(fs.existsSync('/qualquer')).toBe(false)`. Vermelho hoje
  porque o `mockReturnValue(true)` sobreviveu ao `clearAllMocks`. Ele pode ser
  o teste de regressão permanente, ou sair depois de verde se a etapa 3 achar
  que polui — decida no review, não na implementação.

#### Resolution (2026-09-16)

Verdict: Approve

Decisão: o caminho menor do próprio ticket — reafirmar o default no
`beforeEach`, uma linha, sem trocar `clearAllMocks` por `resetAllMocks` (o
`## Comments` abaixo explica por que o reset seria pior). O teste de regressão
fica: ele é o que trava o defeito, custa 1 linha e roda em microssegundos.

Arquivos: só `tests/unit/sigaa-service.test.ts`, o único Primary file.

- `0a4481a` (test, vermelho): o teste de regressão, logo depois do de
  SEC-004 item 15.
- `82b8af2` (fix): `vi.mocked(fs.existsSync).mockReturnValue(false)` no
  `beforeEach` de `:97`, com o comentário dizendo o porquê.

Separação test/código confirmada por `diff --stat`: o commit de teste só
adiciona o `it(...)`, o de código só a linha do `beforeEach`. Que ambos caiam
no mesmo arquivo é inerente — aqui o arquivo de teste **é** o alvo do ticket.

Red-green:

- Sem a linha do `beforeEach`: `1 failed | 30 passed (31)`, e a falha é o
  teste novo, `expected true to be false` em `:476` — vermelho pelo motivo
  certo, o `mockReturnValue(true)` de `:456` sobrevivendo ao `clearAllMocks`.
- Com a linha: `31 passed (31)`.

Gate (`npm run quality`): typecheck limpo, ESLint `0 errors, 40 warnings`
(todos `no-explicit-any` preexistentes), vitest `72 passed (72)` arquivos,
`792 passed | 5 skipped (797)` testes.

Critérios: 1 ✅, 2 ✅ (nenhuma asserção mudou, nenhum teste saiu, e o de
SEC-004 item 15 continua declarando o `true` que precisa), 3 ✅.

Achado fora dos critérios, não consertado aqui: o mesmo vazamento existe em
`fs.readSync`. O teste de SEC-004 item 15 (`:457`) sobrescreve a
implementação para devolver `%PDF-1.4\n`, e isso também atravessa o
`clearAllMocks` — a fábrica declara `readSync: vi.fn(() => 0)`. Nenhum teste
de hoje depende disso, mas é a mesma armadilha de default silencioso que este
ticket existe para remover. Provar exige teste novo, então cai na regra
"reabrir, não consertar no review": vale um ticket `QA-*` próprio, decisão de
quem faz a triagem.

## Comments

- Se a decisão for trocar `vi.clearAllMocks()` por `vi.resetAllMocks()`,
  confira o resto do arquivo antes: o `resetAllMocks` também apaga as
  implementações das fábricas de `vi.mock`, e vários `mockResolvedValue` são
  declarados fora do `beforeEach`. Reafirmar o default é menor e não tem esse
  risco.
