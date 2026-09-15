# DATA-005: Storage do renderer valida forma, não só JSON
Status: open
Stage: to-implement
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

## Comments

- O cache `courses` também é lido por `JSON.parse` solto em vários pontos;
  `CLEAN-007` centraliza essas leituras num helper. Validar a forma de
  `courses` entra nesse helper, não aqui, para não fazer duas vezes.
