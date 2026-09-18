# BUG-023: Resposta tardia de Configurações não substitui a rota seguinte
Status: open
Stage: to-implement
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
