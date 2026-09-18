# BUG-023: Resposta tardia de Configurações não substitui a rota seguinte
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/settings.ts` (`renderSettingsPage` `:5-8`; re-render após limpar a pasta padrão `:161-170`)
  - `tests/unit/` — teste novo de navegação com `getSettings` pendente (etapa 2 escolhe o nome)

Achado 2 (Broken) da auditoria `docs/audits/2026-09-18-c4d51bf.md`,
reproduzido pelo auditor em jsdom: montagem de Configurações com Promise
controlada, montagem de Login no mesmo container, resolução das
configurações — o heading de Login desapareceu. Decisões 10 a 13 de
`../spec.md`.

#### What to build

`renderSettingsPage` é a única página que aguarda um IPC
(`window.api.getSettings`) antes da primeira escrita no container, e escreve
`container.innerHTML` inteiro sem conferir se Configurações ainda é a rota
ativa. O roteador (`src/main.ts`) não aguarda nem invalida a montagem. O
re-render após "limpar pasta padrão" chama a mesma função e tem o mesmo
buraco.

Correção mínima: capturar `window.location.hash` antes do `await` e comparar
depois; se mudou, retornar sem tocar no container. O re-render herda a guarda
por passar pela mesma função.

Por que a rota e não um contador como no `BUG-022`: navegar de Configurações
para Login não remonta Configurações, então um contador da própria página não
mudaria e o `innerHTML` do container compartilhado aconteceria do mesmo jeito.
No `course-detail` o contador bastou porque as escritas são em elementos por
id que deixam de existir depois da troca; aqui a escrita é no container
inteiro, que continua existindo. O hash é a identidade de rota que o app já
usa; nenhum estado novo, nenhuma mudança no roteador.

Mesma rota com montagem repetida (dois `getSettings` pendentes para
`#/settings`) desenha o mesmo conteúdo duas vezes; a última vence. Não se
guarda.

#### Acceptance criteria

1. `renderSettingsPage` captura a rota antes de aguardar `getSettings` e, se a
   rota mudou quando a resposta chega, retorna sem escrever no container nem
   registrar handlers.
2. O re-render após limpar a pasta padrão passa pela mesma guarda sem código
   adicional.
3. Mesma rota: comportamento atual. Os testes existentes de settings
   (`settings-result.test.ts`, `settings-a11y.test.ts`) passam sem edição.
4. Teste de regressão vermelho sem a correção: `getSettings` pendente, hash
   muda para `#/login`, a página de login real é montada no mesmo container,
   `getSettings` resolve → o heading de login continua e não existe
   `.settings-page` no container.
5. Segundo cenário vermelho sem a correção: Configurações montada, clique em
   limpar pasta padrão com o segundo `getSettings` pendente, hash muda e outra
   página é montada, `getSettings` resolve → a outra página continua.
6. `src/main.ts` não é tocado.
7. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/<teste novo> tests/unit/settings-result.test.ts tests/unit/settings-a11y.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Teste novo em `tests/unit/`, `// @vitest-environment jsdom`, importando
  `src/pages/settings.ts` e `src/pages/login.ts` reais e stubando só
  `window.api` (`getSettings` com Promise controlada, `updateSetting`
  resolvendo `ok()`), com os dois cenários dos critérios 4 e 5. O teste muda
  `window.location.hash` antes de montar a outra página, porque é assim que o
  app navega; montar a outra página sem mudar o hash não modela o fluxo real.
  Modelos: `settings-result.test.ts` (costura e stubs) e
  `course-detail-stale-response.test.ts` (Promise controlada e `flushAll`).

#### Resolution (2026-09-18)

Verdict: Needs your call: os sete critérios passam e a guarda segue as decisões
10–13, mas a janela do `await updateSetting` antes do re-render — nomeada na
correção proposta da auditoria — continua aberta e a decisão 12 veda a linha
que a fecharia; follow-up ou aceitar (ver `## Comments`).

Decisão: mesclada na branch de sessão `sweatshop/2026-09-18-1857` em `b9ef5a5`
(`--no-ff`). Rebase dispensado: a ponta da sessão (`8a8ee07`, igual à remota) é
a base da branch; a árvore do merge é idêntica à de `8b920b2`.

Arquivos: `src/pages/settings.ts` (+4: `:6-8` captura do hash com comentário,
`:10` guarda antes do `innerHTML`), `tests/unit/settings-stale-response.test.ts`
(novo, 2 testes), este ticket.

Commits: `6e777c4` (testes dos critérios 4 e 5, `Stage: implementing`),
`8b920b2` (guarda, `Stage: to-review`). `git show --stat` por commit: o de
código toca só `settings.ts` e este ticket, nunca o arquivo de teste.

Prova vermelho-verde, refeita pela revisão em 2026-09-18 com
`npx vitest run tests/unit/settings-stale-response.test.ts`:

- `settings.ts` da base (`git checkout 8a8ee07 -- src/pages/settings.ts`):
  `Tests 2 failed (2)`, ambos em `expected undefined to be 'SIGAA-ME'` (`:60`,
  `:91`) — o `innerHTML` tardio apagou o heading de login;
- `settings.ts` restaurado (`git checkout HEAD -- src/pages/settings.ts`), com
  `settings-result.test.ts` e `settings-a11y.test.ts`: `Test Files 3 passed (3)`,
  `Tests 13 passed (13)`. Árvore limpa depois.

Gate `npm run quality` (2026-09-18, em `8b920b2`, mesma árvore do merge):
typecheck limpo; ESLint 0 erros, 40 warnings (`no-explicit-any` legado, nenhum
nos arquivos do diff); vitest `Test Files 73 passed (73)`,
`Tests 808 passed | 5 skipped (813)`.

Critérios: 1 ✅ (`:8` captura, `:10` retorna antes do `innerHTML` e de todo
`addEventListener`), 2 ✅ (`:173` chama a mesma função, nenhum código novo),
3 ✅ (os dois testes existentes sem edição, verdes acima), 4 ✅ (teste 1,
vermelho pelo motivo certo), 5 ✅ (teste 2; `getSettings` chamado duas vezes
prova a reentrada), 6 ✅ (`src/main.ts` fora do diff), 7 ✅.

Standards (Fable, cego): nenhuma violação do `CLAUDE.md`; `(window as any).api`
no teste é a convenção de 11 arquivos de teste e não é `any` de fronteira IPC.
Smells da baseline (Primitive Obsession no hash como rota; Duplicated Code em
`BASE_SETTINGS`, `flushAll` e no laço de flush) descartados: o ticket e a
decisão 11 pedem exatamente isso, e extrair helper de teste é `CLEAN-*`, fora
dos Primary files.

Spec (Fable, cego): um achado, confirmado pela revisão com teste descartável
(não commitado) — ver `## Comments`. Ordem de eventos no app real conferida: o
hash muda de forma síncrona na atribuição e o `hashchange` é tarefa posterior,
então uma resposta que chegue entre os dois já é descartada; ida e volta a
`#/settings` com IPC pendente desenha duas vezes o mesmo conteúdo (decisão 13).

## Comments

Janela residual (revisão 2026-09-18): no handler de "Limpar Padrão"
(`settings.ts:166-174`), o `await window.api.updateSetting(...)` acontece antes
de `renderSettingsPage(container)`. Se o usuário navegar durante esse `await`, a
função é reentrada com o hash já trocado: `routeAtMount` captura a rota nova,
`getSettings` resolve, a guarda passa e Configurações sobrescreve a página
atual. Reproduzido em jsdom pela revisão: montar Configurações, clicar em limpar
com `updateSetting` em Promise controlada, trocar o hash para `#/login` e montar
login, resolver `updateSetting` → `getSettings` chamado 2 vezes e `.login-title`
desaparece. A auditoria nomeou essa janela na correção proposta ("enquanto a
limpeza da preferência está concluindo"); o critério 5 e a decisão 12 cobrem só
o segundo `getSettings` pendente. Fecha com uma linha antes do re-render —
`if (window.location.hash !== routeAtMount) return;` — mais um teste, o que
exige critério novo (etapa 1): ticket de follow-up ou aceitar a janela, que dura
só o IPC de escrita.
