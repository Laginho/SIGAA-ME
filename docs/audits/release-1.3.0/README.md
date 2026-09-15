# Auditorias do release público 1.3.0

Pasta única das auditorias de repositório inteiro feitas para a **1.3.0**, a
primeira versão pensada para distribuição pública ampla. Existe para que vários
modelos auditem o mesmo commit e os relatórios fiquem lado a lado, comparáveis.

Auditoria de release anterior a esta: `docs/audits/2026-09-09-40a0d01.md`
(escopo do repositório) e `docs/audits/2026-09-10-a11y-001-simetria.md` (escopo
de branch). Não são deste ciclo; servem de linha de base.

## Nome do arquivo

```
<YYYY-MM-DD>-<sha curto>-<modelo>.md
```

O `sha` é o commit auditado (`git rev-parse --short HEAD` na hora da rodada). O
modelo entra no nome porque a comparação é entre modelos — sem ele, dois
relatórios do mesmo dia se sobrescrevem. Um arquivo por rodada, nunca
sobrescrever.

## Formato

Todos seguem a skill `audit`: `Verdict:` na primeira linha, assinatura, resumo,
escopo e cobertura, método, Top 3, todos os achados, processo, auditoria
anterior, ordem recomendada.

Vocabulário de veredicto (fixo, em inglês): `Approved`,
`Approved with cleanup`, `Not approved`.

## Rodadas

| Data | Commit | Modelo | Veredicto | Broken | Fragile | Slop |
|---|---|---|---|---|---|---|
| 2026-09-15 | `d5bb393` | Claude Opus 5 | Not approved | 2 | 4 | 15 |
| 2026-09-15 | `d5bb393` | GPT-6 (Astra) | Not approved (covered set only) | 8 | 2 | 6 |
| 2026-09-15 | `d5bb393` | GPT-5.6 Sol | Not approved | 6 | 2 | 1 (agrupado) |
| 2026-09-15 | `d5bb393` | Claude Fable 5.1 | Not approved | 2 | 16 | 12 |

Ao acrescentar uma rodada, some a linha aqui. Divergência entre relatórios é o
produto desta pasta — não tente reconciliar os relatórios entre si; reconcilie
cada achado contra o código.

## Comparação da rodada d5bb393 (4 modelos)

Cegueira: Opus e Astra leram as auditorias de setembro (Astra via `git show`
depois de a pasta ser apagada, e declarou isso). Sol e Fable não leram nada.
Nenhum viu o relatório dos outros.

### Concordância por achado (Broken/Fragile)

| Achado | Opus | Astra | Sol | Fable |
|---|---|---|---|---|
| `isExpectedCoursePage` aceita turma por prefixo (`playwright-login.service.ts:45`) | — | — | Broken (Top 1) | Broken (Top 2) |
| `enterCourseAndGetHTML` ignora falha de `getCourses`, deref `context` nulo, perde `SESSION_EXPIRED` (`:435`) | — | — | Broken | Fragile |
| `settings.ts` ignora `AppResult.success` nos 6 controles | Broken (Top 1) | Broken B4 | — | — |
| Índice de downloads lido antes do `await` (`course-detail.ts:377`) | Broken (Top 2) | Broken B5 | — | — |
| Identidade de arquivo por nome no sino/leitura, por id no diff (`background-sync.service.ts:210`) | Fragile | — | — | Fragile (Top 3) |
| JSON gravado sem temporário + `rename` (`persistence:192`, `cache:109`) | Fragile | Fragile F1 | — | — (Fable testou e considerou ok) |
| Docs contradizem o código (README `npm test`, SQLite, `npm install`) | Slop | Fragile F2 | Slop | Fragile |
| Auto-download em background manda `type: 'link'` ao fallback; Chrome visível navega para URL externa (`background-sync:236`) | — | — | — | Broken (Top 1) |
| Sync parcial com `replaceSet: true` apaga cache das turmas que falharam (`dashboard.ts:80`) | — | Broken B1 (Top 1) | — | — |
| Fallback Playwright escolhe arquivo por nome, não por id (`download.service.ts:75,120`) | — | Broken B2 | — | — |
| Erro de rotação escapa do Promise do logger (`logger.service.ts:271`) | — | Broken B3 | — | — |
| Arquivo de tamanho zero aceito (`file-validation.service.ts:213`) | — | Broken B6 | — | — |
| `loadAllNews` falha engolida, "Finalizado!" (`sync-selection.ts:267`) | — | Broken B7 | — | — |
| Portal autenticado com zero turmas vira `SELECTOR_DRIFT` (`playwright-login:383`, `background-sync:296`) | — | — | Broken (Top 2) | — |
| URL de material externo descartada em `toCourseFile` (`sigaa.service.ts:38`) | — | — | Broken (Top 3) | — |
| Lote todo `skipped` ainda exige portal, erro offline (`sigaa.service.ts:407`) | — | — | Broken | — |
| "Sair" no tray pula `logout()` e `flush()` (`main.ts:288`) | — | — | Broken | — |
| Manutenção/acesso negado caem em `UNKNOWN`/drift e alimentam kill-switch (`portal-state-classifier.ts:49`) | — | — | Fragile | — |
| Storage do renderer aceita JSON com forma errada (`account-storage.ts:121`, `notification-store.ts:94`) | — | — | Fragile | — |
| `syncInterval` em disco sem piso; `0.001` vira `setInterval` de 60 ms (`persistence.service.ts:45`) | — | — | — | Fragile |
| `HTML_RE` do logger apaga tudo após `<` + letra (`logger.service.ts:35`) | — | — | — | Fragile |
| Listener de clique no dashboard acumulado a cada render (`dashboard.ts:206`) | — | — | — | Fragile |
| Cookie domain por `endsWith` sem âncora (`http-scraper:90`) | Slop | — | — | Fragile |
| E2E passa sem asserção quando pré-condição falha (`app.spec.ts:192`); visual só checa `innerHTML.length` | Fragile ×2 | — | — | Processo |

Slop em que todos os quatro coincidem: `sqlite` sem uso, `playwright-login.service.ts` com 1.119 linhas, README errado. Três em quatro: `autoSync` morto, `cleanupProgress` em `window as any`, `waitForSelector` duplicado.

### Leitura

- **Nenhum Broken foi achado por mais de dois modelos.** Consenso não é critério de triagem aqui; cada Broken precisa de verificação individual contra o código.
- **Dois pares independentes se confirmam:** Opus+Astra (settings.ts, índice de downloads) e Sol+Fable (isExpectedCoursePage, getCourses ignorado). Cada par chegou por caminho diferente, o que vale mais que um relatório só.
- **Achados únicos com maior impacto declarado**, a verificar primeiro: Fable Top 1 (Chrome visível navegando para URL externa), Astra B1 (perda de cache offline em sync parcial), Sol Top 2 (conta sem turmas falha e alimenta kill-switch), Sol Top 3 (link externo inacessível). Fable Top 1 e Sol Top 3 são o mesmo dado (`type: 'link'`) visto de dois lados: um ticket.
- **Divergência a resolver:** Opus e Astra marcam escrita não atômica de JSON como Fragile; Fable afirma ter verificado a ordem grava-depois-troca e considerou ok. Checar `persistence.service.ts:192` antes de abrir ticket.
- Astra B8 (`timelapse.py`) é tooling de skill, fora do app: descartar.

## Cobertura por modelo (gabarito verificado contra o código)

Os 23 achados Broken/Fragile únicos foram verificados um a um no commit
(subagente Sonnet, 2026-09-15). Nenhum refutado por inteiro; classificação
abaixo é a da verificação, não a do relatório de origem.

| # | Achado | Classe real | Opus | Astra | Sol | Fable |
|---|---|---|---|---|---|---|
| 1 | `isExpectedCoursePage` por prefixo | Broken | | | ✓ | ✓ |
| 2 | `getCourses` ignorado, `context` nulo | Broken | | | ✓ | ✓ |
| 3 | `settings.ts` ignora `success` | Broken | ✓ | ✓ | | |
| 4 | índice de downloads read-modify-write | Broken | ✓ | ✓ | | |
| 5 | identidade de arquivo por nome no sino | Broken | ✓ | | | ✓ |
| 8 | sync parcial + `replaceSet` apaga cache | Broken | | ✓ | | |
| 11 | arquivo de 0 bytes aceito | Broken | | ✓ | | |
| 12 | `loadAllNews` falha engolida | Broken | | ✓ | | |
| 14 | URL de link externo descartada | Broken | | | ✓ | |
| 16 | "Sair" pula `logout`/`flush` | Broken | | | ✓ | |
| 18 | `notification-store` sem validação de forma | Broken (metade) | | | ✓ | |
| 6 | JSON sem temp+rename | Fragile | ✓ | ✓ | | ✗ (negou) |
| 7 | link no auto-download abre Chrome visível | Fragile (rebaixado) | | | | ✓ |
| 9 | fallback seleciona arquivo por nome | Fragile | | ✓ | | |
| 10 | erro de rotação escapa do Promise | Fragile | | ✓ | | |
| 13 | zero turmas vira drift em `getCourses` | Fragile (metade) | | | ✓ | |
| 15 | lote todo `skipped` exige portal | Fragile | | | ✓ | |
| 17 | manutenção cai em `UNKNOWN` | Fragile | | | ✓ | |
| 19 | `syncInterval` sem piso em disco | Fragile | | | | ✓ |
| 20 | `HTML_RE` trunca mensagem | Fragile | | | | ✓ |
| 21 | listener acumulado no dashboard | Fragile | | | | ✓ |
| 22 | cookie domain por `endsWith` | Fragile | ✓ | | | ✓ |
| 23 | E2E sem asserção / visual só `innerHTML.length` | Fragile | ✓ | | | |

| Modelo | Broken (de 11) | Fragile (de 12) | Total (de 23) | Só ele achou | Ruído |
|---|---|---|---|---|---|
| Opus 5 | 3 | 3 | 6 | 23 | nenhum |
| GPT-6 Astra | 5 | 3 | 8 | 8, 9, 10, 11 | B8 (tooling fora do app) |
| GPT-5.6 Sol | 5 | 3 | 8 | 13, 14, 15, 16, 17, 18 | metade de 13 e de 18 refutadas |
| Fable 5.1 | 3 | 5 | 8 | 7, 19, 20, 21 | negou 6 (errado); 7 superestimado |

Conjunto gerador:

- Nenhum modelo sozinho cobre nem metade dos Broken. Nenhum par cobre os 11.
- Astra e Sol são disjuntos em Broken (5 + 5 = 10 de 11); falta só o 5, que Opus e Fable têm. **Menor cobertura dos 11 Broken: Astra + Sol + (Opus ou Fable).**
- Cobertura dos 23: Astra + Sol + Fable deixa de fora só o 23 (qualidade dos testes E2E, exclusivo do Opus). Cobrir tudo exige os quatro.
- Opus é o menor conjunto e o único sem ruído, mas está quase contido em Astra ∪ Fable (só o 23 é exclusivo).

## Segunda verificação (Opus, cego ao Sonnet)

Os 23 itens foram reverificados por um subagente Opus 5 sem acesso à
classificação do Sonnet nem a `docs/audits/`.

- **Existência:** os dois confirmam os 23 defeitos; nenhum refutado por
  inteiro. Sub-afirmações refutadas pelo Opus além do Sonnet: fluxo de
  notícias do item 2 (`getNewsDetail` checa `page`), `dashboard.ts:70` do item 4
  (`recordDownloads` é síncrono), linha 192 do item 23 (tem asserção).
- **Item 7 invertido:** Sonnet rebaixou para Fragile por não confirmar o
  `page.goto` externo; Opus traçou a cadeia inteira e confirmou o `goto` no
  `href` do DOM fresco (`download.service.ts:110-140`). Broken.
- **Severidade:** Opus é bem mais estrito. Broken só 5, 7, 8, 9. Sonnet tinha
  dado Broken a 1, 2, 3, 4, 11, 12, 14, 16, 18, que Opus considera Fragile por
  exigirem pré-condição (clique JSF já falho, erro de disco, concorrência,
  arquivo vazio, `settings.json` editado à mão).

| Item | Sonnet | Opus | Concordam |
|---|---|---|---|
| 5 sino por nome | Broken | Broken | sim |
| 8 `replaceSet` apaga cache | Broken | Broken | sim |
| 7 link no auto-download | Fragile | Broken | não |
| 9 fallback por nome | Fragile | Broken | não |
| 1, 2, 3, 4, 11, 12, 14, 16, 18 | Broken | Fragile | não |
| 6, 10, 13, 15, 17, 19, 20, 21, 22, 23 | Fragile | Fragile | sim |

Cobertura dos Broken pelo gabarito do Opus ({5, 7, 8, 9}): Opus 1, Astra 2,
Sol 0, Fable 2. Menor cobertura: **Astra + Fable**. Pelo gabarito do Sonnet era
Astra + Sol + (Opus ou Fable). A ordem dos modelos depende de quem classifica a
severidade; só a cobertura por existência (23 itens, exige os quatro) é estável.
