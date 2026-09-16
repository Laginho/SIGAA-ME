# QA-010: O mock de `fs.existsSync` vaza para os testes seguintes
Status: open
Stage: implementing
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

## Comments

- Se a decisão for trocar `vi.clearAllMocks()` por `vi.resetAllMocks()`,
  confira o resto do arquivo antes: o `resetAllMocks` também apaga as
  implementações das fábricas de `vi.mock`, e vários `mockResolvedValue` são
  declarados fora do `beforeEach`. Reafirmar o default é menor e não tem esse
  risco.
