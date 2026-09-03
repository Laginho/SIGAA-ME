# BUG-009 — Id de arquivo capturado com o apóstrofo do JSF
Status: claimed
Priority: P2
Tracker status at migration: `IN REVIEW` — código e testes prontos (sessão 2026-09-01); falta uma sincronização real com o `cache.json` antigo confirmando zero "arquivo novo", que é do Bruno

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
