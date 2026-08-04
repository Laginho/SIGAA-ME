# Auditoria de complexidade — 2026-08-02

Varredura do repositório inteiro procurando **apenas** over-engineering: código
morto, stdlib reinventada, abstração com um caso, duplicação.

**Fora de escopo por definição:** bugs de correção, falhas de segurança,
performance. Esses estão no `CODE_REVIEW.md` e no `HARDENING_TRACKER.md`.

**Total teórico:** −2465 linhas, −2 dependências.
**Seguro de executar hoje:** ~700 linhas. O resto depende de decisão ou de ter
suíte de testes rodando. Ver a classificação por risco.

> **Aviso importante:** esta auditoria lista achados, não os aplica. E ela **não
> é uma verificação de segurança da mudança** — ela encontra o que dá para
> cortar, não prova que cortar é seguro. Hoje o projeto **não tem suíte de testes
> executável** (`PIPE-002`), então nenhuma remoção em massa é verificável. Essa é
> a razão de a Fase 1 vir antes de tudo.

---

## Classificação por risco

### NÍVEL 1 — Seguro hoje (~700 linhas)

Provável por busca direta: nada no repositório referencia estes itens. Remoção
verificável com `npx tsc --noEmit` + `npx vitest run`.

| O quê | Linhas | Prova |
|---|---|---|
| `src/styles/sync-selection.dark.css` | −203 | Zero referências a `dark.css` no repo. Substituído por `[data-theme="dark"]` em `main.css:18` |
| `verify-scraper.ts` + `tsconfig.verify.json` | −219 | Única referência é o próprio `include` do tsconfig (autorreferência). ⚠️ **CONTÉM CREDENCIAIS REAIS EM REPOSITÓRIO PÚBLICO** — ver `SEC-000` no tracker. Remover o arquivo **não** resolve; a senha precisa ser trocada |
| `electron/services/sigaa-login-ufc.ts` | −111 | `SigaaLoginUFC` só aparece na declaração. Depende de `sigaa-api`, que nem está no `package.json` |
| `HttpScraperService.enterCourseHTTP` | −102 | Zero chamadores. Entrada em disciplina é sempre `playwrightLogin.enterCourseAndGetHTML` |
| `PlaywrightLoginService.enterCourseDirect` | −89 | Zero chamadores. "Headless API Entry" abandonada |
| CSS órfão (`.toast-notification`, `.btn-download-all`, `.loading-spinner`, `.progress-*`, `.spinning-slow`, `.btn-secondary`, toggle de live sync) | −160 | Nenhum TS usa essas classes |
| `PlaywrightLoginService.forceReset` | −12 | Zero chamadores |
| `src/counter.ts` | −9 | Resíduo do template Vite. Só auto-referências |
| `clearAllNotifications` | −3 | Exportado sem consumidor |
| `AppSettings.autoSync` | −2 | Declarado e defaultado, nunca lido. O controle real é `runInBackground` |
| Flags fantasma de loading | −3 | `window.currentLoadingInterval` escrito e nunca lido; `window.stopLoadingInterval` testado 2× e nunca definido — o `setInterval` de 3s nunca é cancelado |
| Assets não referenciados | −3 arq. | `src/typescript.svg`, `public/electron-vite.svg`, `public/electron-vite.animate.svg` |
| dep `sqlite@^5.1.1` | −1 dep | Zero imports. Também contradiz o README, que afirma usar SQLite |
| dep `@vitest/browser@^4.1.4` | −1 dep | Sem bloco `browser` no `vitest.config.ts`, sem script que use browser mode |
| `BackgroundSyncService.restart()` | −3 | Só chama `start()`, que já chama `stop()` na primeira linha |
| Params `fileUrl`/`downloadedFiles` | −10 | Atravessam localStorage → renderer → preload → IPC e chegam como `_fileUrl`/`_downloadedFiles` sem uso |

### NÍVEL 2 — Exige decisão sua, não é só deletar

**`BUG-004` — cadeia de download Playwright: NÃO REMOVER. Decidido 2026-08-02.**

Este era o maior corte da auditoria (−771 linhas). **Foi descartado**, e o motivo
vale mais que o achado.

O autor informou que **o download por HTTP falha com frequência e de forma
imprevisível** — o SIGAA é antigo, malfeito e hostil a automação. Logo, essas 771
linhas não são gordura: são a mitigação de uma falha real que hoje está
desconectada. Apagá-las removeria a solução em vez do problema.

Decisão: **ligar o fallback**, depois de corrigir o `BUG-001`. Detalhes na tarefa
`BUG-004` do `HARDENING_TRACKER.md`.

> **Lição para futuras auditorias deste tipo:** código inalcançável e código
> desnecessário são **indistinguíveis** numa busca estática. Os dois aparecem
> como "zero chamadores". A diferença estava num dado sobre o mundo real — a taxa
> de falha do SIGAA — que nenhuma ferramenta de análise tinha acesso.
>
> Auditoria de complexidade propõe cortes. Ela não decide, porque não sabe por
> que o código foi escrito.

**`busyCount` + `startBusy`/`stopBusy` (−26 linhas).**
Coerente com o `BUG-002`: remove proteção que não protege. Mas o `CONC-001`
precisará de serialização real depois. Remover agora é honesto; só não pode
virar "resolvido".

**`SigaaService.downloadFile` como wrapper (−16 linhas).**
Existe só para envolver `_downloadFileInternal` em `startBusy`/`finally`. Cai
junto com o `busyCount`.

**Retry em 4 camadas no `downloadAllFiles` (−60 linhas, suspeito).**
`sigaa.service.ts:449-539` tem retry que se sobrepõe ao retry de `downloadFile`.
Reduzir exige saber a taxa real de falha do SIGAA. **Não mexer sem dado.**

### NÍVEL 3 — Não tocar agora

Cada um destes conflita com trabalho já planejado, ou mexe em caminho crítico
sem rede.

| O quê | Por que esperar |
|---|---|
| Tabela de magic bytes (`http-scraper.service.ts:762-806`) | É o código do `BUG-001`. Mexer nos dois lugares ao mesmo tempo embaralha a causa. E é validação em fronteira — a correção do `BUG-001` precisa **manter** a rejeição de HTML disfarçado |
| Cookie jar artesanal → `context.request` (−78) | Muda o **transporte** do scraping, que é o núcleo funcionante e a origem do ganho de 10x. Exige canário ao vivo (`PORTAL-004`) antes |
| Consolidar os 3 sistemas de log (−84) | É o `OBS-001`, que exige redação de dados sensíveis e rotação. Consolidar agora sem isso desperdiça o trabalho |
| Remover detecção de Chrome (−25) | Hoje dá um `dialog.showErrorBox` claro. Trocar por erro cru do Playwright piora o diagnóstico para o usuário final |
| 8 scripts `release:*` → 1 (−6) | Fica para depois do `PIPE-001`/`PIPE-004`, que reescrevem o fluxo de release de qualquer forma |

### NÍVEL 4 — Refatorações de duplicação (fazer junto das tarefas que tocam o arquivo)

Não valem uma sessão própria; valem quando você já estiver no arquivo.

- `refreshCourseSession()` — o bloco "reentrar na disciplina → setCookies →
  getCourseFiles → montar mapa de scripts" está copiado **5 vezes**
  (`sigaa.service.ts:174-199, 238-257, 334-400, 454-470, 518-527`). −80 linhas.
- `dumpDebug(name, body)` — 9 dumps de HTML com o mesmo `if (!app.isPackaged)`
  + `try` + `writeFileSync`. −45 linhas.
- Fallback HTTP inalcançável em `getCourseFiles` — todos os 8 chamadores passam
  `preFetchedHtml`, então o ramo que busca o link "Conteúdo" com axios+cheerio
  nunca roda. −99 linhas.
- `HttpScraperService.getNewsDetail` — zero chamadores; `sigaa.service.ts:561`
  e `:604` usam a versão do Playwright. Já registrado no `ARCHITECTURE.md` como
  "existe mas não é usado". −138 linhas.
- `jsfParams(script)` — loop que quebra `paramsStr` em pares repetido. −10.
- Headers do axios repetidos 3× com User-Agent hardcoded, apesar de
  `setUserAgent` existir → `axios.create()` + interceptor. −12.
- `sanitizeFolderName` — mesma regex em 2 lugares com substituto inconsistente
  (`''` vs `'_'`). Isso é inconsistência real, não só duplicação. −4.
- `clear-all-data` é cópia byte-a-byte de `logout` — mas isso é o `DATA-002`,
  que vai reescrever a semântica dos dois. Esperar.

### NÍVEL 5 — Trocas por stdlib (trivial, alto valor didático)

- `new Promise(r => setTimeout(r, ms))` → `import { setTimeout as sleep } from
  'node:timers/promises'`. `[background-sync.service.ts:93,168]`
- `getDate().padStart(2,'0')` + `getMonth()+1` →
  `toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })`.
  `[ui-helpers.ts:23-25]`
- `toTitleCase` com lista de preposições → `text-transform: capitalize` no CSS,
  ou uma regex. `[dashboard.ts:25-31]`

### Suspeitos não confirmados

- `@types/mime-types` — `mime-types@3` pode já enviar tipos próprios. Confirmar
  rodando `tsc` sem ele.
- `vite-plugin-electron-renderer` — nunca importado direto, mas provavelmente é
  o peer que implementa a opção `renderer: {}` do `vite.config.ts:32-35`.
  **Provavelmente legítimo.**
- `PlaywrightLoginService.getCookies` — único consumidor é uma asserção em
  `portal-selector-resilience.test.ts:97`. Confirmar se é API pretendida.

---

## Ordem recomendada de execução

0. **`SEC-000` antes de tudo** — trocar a senha do SIGAA. Não é tarefa de código
   e não pode ser delegada.
1. **`PIPE-002`** — sem `npm test` executável, nenhuma remoção é verificável.
   Esta auditoria é o melhor argumento possível para isso: 2465 linhas de corte
   potencial e zero forma de provar que o corte não quebrou nada.
2. **Nível 1 em um único commit**, com `tsc --noEmit` + `vitest run` antes e
   depois. ~700 linhas com prova por busca.
3. **`BUG-001`** — download apagando arquivos válidos.
4. **`BUG-004`** — ligar o fallback Playwright (decidido), depois de observar a
   taxa de falha remanescente pós-`BUG-001`.
5. Níveis 4 e 5 diluídos nas tarefas que já tocam cada arquivo.
6. Nível 3 nas suas tarefas próprias (`OBS-001`, `PORTAL-004`, `DATA-002`).

## Revisão do total

O número de abertura (−2465) precisa de asterisco depois das decisões tomadas:

| | Linhas |
|---|---|
| Total bruto da varredura | −2465 |
| `BUG-004` descartado (fallback será ligado, não removido) | +771 |
| Nível 3 postergado (conflita com tarefas planejadas) | +193 |
| **Corte real disponível** | **≈ −1500** |
| **Seguro de executar hoje (Nível 1)** | **≈ −700** |

O corte de −2465 nunca existiu de fato. Isso não é defeito da auditoria — é o
comportamento esperado de uma varredura que enxerga estrutura e não intenção.

## Observação sobre a natureza do projeto

O relatório inicial descreveu 6.282 linhas de TypeScript "para um app que lista
arquivos". Com −2465 possíveis, o núcleo real é da ordem de 3.800 linhas — e boa
parte do excedente é sedimento de tentativas abandonadas
(`enterCourseDirect`, `enterCourseHTTP`, `sigaa-login-ufc`, o fallback de
download, o fallback de `getCourseFiles`).

Isso é o padrão esperado de um projeto que lutou contra um sistema hostil: cada
abordagem que falhou deixou código. Não é desleixo — é arqueologia. Mas código
que não roda não é documentação da tentativa; para isso serve o `ARCHITECTURE.md`
e o histórico do git.
