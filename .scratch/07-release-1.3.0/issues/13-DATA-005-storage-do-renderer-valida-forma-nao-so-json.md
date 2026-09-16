# DATA-005: Storage do renderer valida forma, não só JSON
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/utils/notification-store.ts` (`getNotifications` `:92-97`; leitura do `read-items`)
  - `src/data/account-storage.ts` (índice `downloads`, `:121`)
  - `tests/unit/notification-store.test.ts`
  - `tests/unit/account-storage.test.ts`

Item 18 do gabarito. Sol; a verificação manteve metade: o escritor é o próprio
app, então a consequência é `TypeError` em render com storage adulterado ou de
versão antiga, não corrupção silenciosa.

#### What to build

`toProfile` valida a forma do perfil; o resto do `localStorage` não.
`JSON.parse` de um valor que parseia mas tem a forma errada (`{}` onde se
espera array, string onde se espera objeto) passa direto e estoura no primeiro
`.map`/`.filter`, deixando o dashboard em branco sem caminho de recuperação.

#### Acceptance criteria

1. `getNotifications` devolve `[]` se o valor parseado não é array; itens que
   não são objeto com `id` string são descartados; os válidos ficam.
2. Conjunto de lidos: valor que não é array de strings vira conjunto vazio,
   sem lançar.
3. Índice `downloads`: valor que não é objeto vira `{}`; entrada por turma que
   não é objeto é descartada; `recordDownloads` e os leitores do
   `course-detail` funcionam em cima disso sem `TypeError`.
4. Nenhuma das leituras lança para storage com forma errada; o render segue
   com o valor vazio.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/notification-store.test.ts tests/unit/account-storage.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/notification-store.test.ts`: `notifications` = `'{}'` →
  `getNotifications()` é `[]`; `'[{"id":1},{"id":"ok","type":"file"}]'` →
  só o segundo; `read-items` = `'"x"'` → nada lido, sem lançar. Vermelho
  porque hoje devolve o que parseou.
- `tests/unit/account-storage.test.ts`: `downloads` = `'[]'` →
  `recordDownloads` grava um objeto válido; `'{"c1":"x"}'` → a turma inválida
  é descartada. Vermelho porque hoje `downloads[courseId][fileId] = …` lança.

#### Resolution (2026-09-15)

Verdict: Approve

Commits `89f46ee` (testes), `b6112e8` (correção), `83d2e10` (fix da revisão),
merge `bfd13bb`.

Decisão: cada leitura checa a forma do valor parseado e cai no vazio
(`[]` / `new Set()` / `{}`) em vez de confiar no `JSON.parse`. `getReadSet`
exige array de strings; `getNotifications` exige array e filtra item sem `id`
string; `recordDownloads` exige objeto no índice e no nó da turma antes de
gravar.

Arquivos: `src/utils/notification-store.ts` (`getReadSet`, `getNotifications`,
`isNotificationItem` novo), `src/data/account-storage.ts` (`recordDownloads`,
`isPlainObject` novo), mais os dois arquivos de teste. Nada fora dos Primary
files.

Critérios: 1 ✅, 2 ✅, 3 ✅, 4 ✅, 5 ✅.

Prova red-green — `src/` revertido para `89f46ee`, testes do ticket rodados:

    Test Files  2 failed (2)
    Tests  4 failed | 22 passed (26)

Os quatro falharam pelo motivo certo, e um deles corrige a premissa do ticket:
com `downloads = '[]'`, `downloads[courseId][fileId] = …` **não** lança —
array aceita propriedade de string, e o `JSON.stringify` depois descarta a
propriedade. A perda é silenciosa, não `TypeError`. O `TypeError` real é o
outro caso, `{"c1":"x"}`, atribuir propriedade a string em modo estrito.
`read-items = '"x"'` produzia `new Set('x')` → `['x']`, string espalhada em
caracteres. Com a correção, gate verde:

    69 test files passed | 765 passed | 5 skipped (770)
    eslint: 0 errors, 52 warnings (no-explicit-any, todos pré-existentes)

Fix da revisão (pequeno, dentro dos Primary files, sem teste novo): o
`isPlainObject` tinha caído entre o JSDoc do `recordDownloads` e a função, de
modo que o bloco que descreve o índice `downloads` passou a documentar o type
guard. Helper movido para cima do comentário.

Nota sobre o critério 3, verificada e não bloqueante: os leitores do
`course-detail` (`:243`, `:269`, `:458`) fazem `downloads[courseId] || {}`
sobre o valor parseado, então toleram sem lançar toda forma errada que o
ticket cita — `'[]'`, string, e entrada por turma que não é objeto
(`Object.values('x')` devolve `['x']`, `'x'[fileId]` é `undefined`). O único
valor que ainda lança lá é `'null'`, que nenhum escritor do app produz.
Fica como comentário no `CLEAN-007`, dono daquele arquivo.

`recordDownloads` repara o nó da turma que está gravando, não os das outras.
Descartar entrada de turma não envolvida seria apagar dado alheio à chamada, e
os leitores já toleram, conforme acima.

## Comments

- O cache `courses` também é lido por `JSON.parse` solto em vários pontos;
  `CLEAN-007` centraliza essas leituras num helper. Validar a forma de
  `courses` entra nesse helper, não aqui, para não fazer duas vezes.
