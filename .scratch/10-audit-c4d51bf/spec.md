# Auditoria `c4d51bf` — spec

Fonte: `docs/audits/2026-09-18-c4d51bf.md` (GPT-6, Not approved: 1 Fragile,
1 Broken, 1 Slop). Os dois achados funcionais foram reconferidos contra o
código em 2026-09-18: o extrator de turmas em `playwright-login.service.ts`
só empurra a linha quando `split(' - ')` dá duas partes e a guarda de drift
olha apenas se os seletores existem no documento, não se as linhas viraram
turmas; `sync-selection.ts` só falha alto quando **todas** as entradas são
descartadas e faz `replaceSet: true` por cima das demais; `settings.ts` é a
única página que aguarda IPC antes da primeira escrita no container e não
tem identidade de montagem.

Corte em 2 tickets.

| NN | ID | Achados | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | PORTAL-013 | Fragile: linha reconhecida descartada em silêncio; parcial autoriza `replaceSet` | P1 | — | agent |
| 02 | BUG-023 | Broken: resposta tardia de Configurações substitui a rota seguinte | P2 | — | agent |

Fora do corte, e por quê:

- `playwright-login.service.ts` com 1.147 linhas: mesma decisão das duas
  auditorias anteriores. O PORTAL-013 tira ~40 linhas dali por necessidade
  real (o extrator precisa ser testável contra fixture), não por métrica.
- Hipótese do modal desmontado sem fechar: o próprio auditor a excluiu por
  não demonstrar efeito visível. Sem ticket.
- `CONTRIBUTING.md`, piso de cobertura, assinatura, teto de 40 warnings:
  decisões já registradas em `08-audit-dae3672/spec.md`.

## Problem Statement

O aluno confia no SIGAA-ME para ler disciplinas, arquivos e notícias offline.
Hoje duas coisas podem tirar isso dele sem aviso:

1. Se o portal mudar o texto do link da turma (por exemplo trocar ` - ` por
   ` – `), o app diz que a sincronização terminou com sucesso, mas a lista
   veio incompleta ou vazia. Uma sincronização manual completa então apaga do
   cache as turmas que ficaram de fora, com as notícias já baixadas. O aluno
   perde conteúdo offline e vê "Finalizado!".
2. Se o aluno abrir Configurações e sair antes da tela carregar, a resposta
   atrasada desenha Configurações por cima da tela para onde ele foi. A URL
   diz uma coisa e a tela mostra outra.

## Solution

1. Nenhuma linha de turma reconhecida é descartada em silêncio. Linha com id e
   nome vira turma mesmo sem o separador esperado; linha com id mas sem nome
   utilizável é deriva estrutural e a operação falha com o código que já
   significa "o portal mudou, o app precisa atualizar". O cache anterior fica
   intacto em qualquer um dos dois casos. No renderer, qualquer entrada
   descartada pela validação de forma interrompe a sincronização com erro
   visível, em vez de virar `console.warn` seguido de substituição do conjunto.
2. Configurações confere se ainda é a rota ativa quando a resposta chega, e
   não escreve no container se o aluno já foi embora. Mesmo padrão do
   `BUG-022`, mas com a identidade certa: a rota, não um contador da página.

## User Stories

1. Como aluno, quero que uma sincronização manual completa só substitua o conjunto de turmas do cache quando o app leu **todas** as linhas da matrícula, para nunca perder uma disciplina offline por causa de formatação do portal.
2. Como aluno, quero que uma turma cujo link perdeu o ` - ` continue aparecendo no app com o nome completo, para não ficar sem a disciplina por um detalhe cosmético.
3. Como aluno, quero ver um erro claro ("o portal mudou, atualize o app") quando o app não consegue interpretar linhas da lista, em vez de uma tela que diz sucesso com disciplinas faltando.
4. Como aluno, quero que a sincronização em segundo plano pare de rodar sozinha quando o portal mudou de forma que o app não lê a matrícula, para que ciclos automáticos não escrevam lixo por cima do cache.
5. Como aluno, quero que, quando a sincronização em segundo plano estiver pausada por incompatibilidade, o dashboard me diga isso e meus arquivos continuem acessíveis.
6. Como aluno, quero que as notícias já baixadas de uma disciplina sobrevivam a uma sincronização que não conseguiu ler essa disciplina.
7. Como aluno, quero que uma resposta atrasada da tela de Configurações não substitua a tela de login, dashboard ou disciplina para onde eu já naveguei.
8. Como aluno, quero que a URL e o conteúdo da tela sempre concordem, para poder confiar no botão Voltar e nos atalhos de teclado.
9. Como aluno, quero que limpar a pasta padrão de download e navegar para outra tela logo em seguida não faça Configurações reaparecer por cima da nova tela.
10. Como aluno, quero que, sem nenhuma mudança no portal, o fluxo de sincronizar, abrir disciplina e ler notícia continue exatamente igual.
11. Como autor, quero um diagnóstico estrutural gravado quando linhas da lista de turmas não puderem ser interpretadas, para saber o que mudou no portal sem depender do relato do aluno.
12. Como autor, quero um aviso no log quando linhas foram aceitas sem o separador, para perceber uma mudança de formato antes que ela vire falha.
13. Como autor, quero que a extração da lista de turmas rode contra fixture HTML nos testes, para que uma quebra no parser real falhe na suíte e não só no portal.
14. Como autor, quero que a fixture do portal populado tenha o formato real `CODE - NAME` no texto do link, para que ela prove algo sobre o parser e não só sobre landmarks.
15. Como autor, quero que o teste de regressão de Configurações modele a navegação real (mudança de hash e montagem de outra página no mesmo container), para que a guarda escolhida seja a que o app usa de fato.
16. Como revisor, quero que a segunda defesa do renderer falhe alto em qualquer descarte, para que uma quebra do contrato main → renderer nunca vire substituição silenciosa do cache.

## Implementation Decisions

### PORTAL-013 — lista de turmas

1. **A extração sai do navegador e vira função pura do adapter de portal.**
   `getCourses` pede o HTML da página do portal uma vez e entrega ao adapter,
   que usa o mesmo parser de documento das outras regras do módulo (cheerio,
   já dependência de produção). O mesmo HTML alimenta a validação de estado
   da página, a extração e o dump de desenvolvimento. O tipo da turma
   extraída acompanha a função para o adapter; o serviço importa de lá.
   Motivo: é a única forma de o parser rodar contra fixture sem mockar o
   próprio parser (regra "teste não espelha implementação"), e é o módulo que
   já decide "documento serve ou falha com qual `AppErrorCode`".
2. **Linha candidata** é a linha de tabela que contém o input de id de turma.
   Toda candidata tem um de dois destinos: vira turma ou derruba a operação.
   Não existe terceiro destino "ignorar".
3. **Sem separador é degradação, não falha.** Candidata com link de turma
   virtual e texto não vazio vira turma. O texto é dividido no primeiro
   ` - `: antes vira `code`, depois vira `name`. Sem separador, `code` fica
   vazio e `name` recebe o texto inteiro. `code` não é exibido em nenhuma
   página do renderer hoje, então o custo para o aluno é zero. O serviço loga
   um aviso com a contagem de linhas degradadas. Nenhuma regex tolerante a
   variantes de travessão: o fallback já cobre o caso.
4. **Candidata sem nome utilizável é deriva estrutural.** Sem link de turma
   virtual, ou com texto vazio: `getCourses` falha com `SELECTOR_DRIFT`,
   mensagem dizendo quantas de quantas linhas não foram interpretadas,
   diagnóstico estrutural gravado como no ramo de drift existente, navegador
   fechado. Nunca sucesso com menos turmas que candidatas.
5. **`SELECTOR_DRIFT` é o código certo aqui, e isso não reabre o
   `PORTAL-010`.** O critério 2 do `PORTAL-010` proibiu `SELECTOR_DRIFT` para
   "página autenticada com zero linhas" porque ali a causa é desconhecida
   (acesso negado dentro do shell, sessão, conta sem turma). Aqui a causa é
   conhecida: os seletores existem e a estrutura que os relaciona mudou. É a
   definição documentada do código. A consequência no background (três ciclos
   consecutivos armam o kill-switch, o dashboard avisa, a sincronização
   automática pausa até o app atualizar) é o comportamento projetado para
   deriva, e é preferível a três ciclos escrevendo lista parcial por cima do
   cache. A sincronização manual falha com a mesma mensagem e o cache fica.
6. **Zero candidatas: nada muda.** O ramo atual (`validateCourseListDocument`
   decidindo entre `NOT_FOUND`, `SELECTOR_DRIFT`, `SESSION_EXPIRED` e
   `PORTAL_UNAVAILABLE`) continua como o `PORTAL-008` e o `PORTAL-010`
   deixaram.
7. **Renderer: qualquer descarte interrompe.** Em `startSync`, a condição
   "todas descartadas → erro" vira "alguma descartada → erro", com a mesma
   mensagem de formato desconhecido. Depois da decisão 4 o main garante que a
   lista está completa, então uma entrada sem `id`/`name` no renderer só pode
   ser contrato IPC quebrado; sincronizar as demais e substituir o conjunto
   seria exatamente a perda que a auditoria reproduziu. Não se enfia flag
   `partial` até o `replaceSet`: uma condição, sem estado novo.
8. **Background não muda.** `BackgroundSyncUpdate.incomplete` e
   `handleBackgroundSyncUpdate` ficam como o `BUG-016` deixou. A lista que
   chega ao background já vem completa ou não chega.
9. **Fixture populada passa a ser realista.** O texto do link vira
   `CODE - NAME` e a linha ganha célula de período. Cenários de degradação e
   de deriva entram como fixture nova ou HTML inline no teste, documentados no
   README das fixtures. O parágrafo de "valid empty course list" em
   `PORTAL_COMPATIBILITY.md` ganha a regra de lista parcial.

### BUG-023 — Configurações

10. **A identidade é a rota, não um contador da página.** `renderSettingsPage`
    captura o hash antes de aguardar as configurações e compara depois; se
    mudou, retorna sem tocar no container. Um contador por página (como no
    `BUG-022`) não resolve este caso: navegar de Configurações para Login não
    remonta Configurações, então o contador não mudaria e o `innerHTML` do
    container compartilhado seguiria acontecendo. No `course-detail` o
    contador bastou porque as escritas são em elementos por id que deixam de
    existir; aqui a escrita é no container inteiro.
11. **Roteador não muda.** Só uma página tem o padrão "aguarda IPC antes da
    primeira escrita". Um token de montagem no roteador seria abstração para
    um caso.
12. **O re-render após limpar a pasta padrão herda a guarda** por passar pela
    mesma função. Nenhum código novo ali.
13. **Mesma rota, montagem repetida, é inofensivo.** Duas respostas para o
    mesmo hash desenham o mesmo conteúdo; a última vence. Não se guarda.

## Testing Decisions

Um teste bom aqui observa comportamento pela costura mais alta que existe e
controla só a fronteira externa (`window.api` no renderer, `page.content()` no
main). Ele não conhece contadores, flags nem funções internas.

**Costuras** (todas existentes, nenhuma nova):

- Main: `PlaywrightLoginService.getCourses()` com o harness de
  `portal-selector-resilience.test.ts`, que já mocka `page.content()`. Os
  casos que hoje fazem `page.evaluate.mockResolvedValue({courses, …})` passam
  a entregar HTML por `content()`; o mock de `evaluate` deixa de ser usado
  por `getCourses`. A asserção de contagem de chamadas a `content()` (nota do
  `OBS-003`) é atualizada, não preservada por contorção no código.
- Main, unitário: a função nova do adapter chamada direto contra a fixture,
  como `portal-adapter.test.ts` e `parser-real.test.ts` já fazem com as
  outras funções do módulo.
- Renderer: `startSync` via `renderSyncSelectionPage` real com `window.api`
  controlado, como `sync-selection.test.ts`; asserção no cache
  (`readCoursesCache`), não em `console.warn`.
- Renderer: `renderSettingsPage` real com `getSettings` devolvendo Promise
  controlada, como `settings-result.test.ts` e
  `course-detail-stale-response.test.ts`.

**O que fica vermelho sem a correção** (um por decisão que muda
comportamento):

- HTML com duas candidatas, uma sem separador → sucesso com duas turmas, a
  segunda com `code` vazio e `name` completo. Hoje: uma turma.
- HTML com candidata sem link → `SELECTOR_DRIFT`, diagnóstico gravado. Hoje:
  sucesso com lista menor.
- Fixture populada realista → as N turmas, com `code`, `name` e `period`
  preenchidos. Hoje: a fixture nem passa pelo parser.
- `startSync` recebendo duas entradas, uma sem `name`, com cache `c1` + `c2`
  → erro visível e cache intacto. Hoje: `c2` removida.
- Configurações pendente, hash muda para login, página de login montada no
  mesmo container, `getSettings` resolve → login continua. Hoje: Configurações
  por cima.
- Mesmo cenário a partir do re-render de "limpar pasta padrão".

Os testes atuais de settings, sync-selection e course-detail passam sem
edição.

## Out of Scope

- Dividir `playwright-login.service.ts` por tamanho.
- Regex tolerante a variantes de travessão no texto do link.
- Flag `partial` atravessando até `replaceSet`; token de montagem no roteador.
- Mudança em `BackgroundSyncUpdate`, `handleBackgroundSyncUpdate` ou no
  kill-switch (`portal-compatibility.service.ts`).
- Novo `AppErrorCode`.
- Captura real do portal para substituir as fixtures sintéticas (`DÉBITO-04`).
- Exibir `code` no renderer.
- Hipótese do modal desmontado sem fechar (excluída pelo auditor).
- `CONTRIBUTING.md`, cobertura, assinatura, warnings (decisões em
  `08-audit-dae3672/spec.md`).

## Further Notes

- `code` vazio é aceito pelo tipo (`period` já documenta "vazio quando a
  célula não existe"); nenhuma página do renderer lê `course.code`.
- O parágrafo de `PORTAL_COMPATIBILITY.md` que distingue "valid empty course
  list" de "selector disappeared" ganha uma terceira categoria: lista com
  linhas não interpretadas é deriva.
- A reprodução do auditor rodou o callback do `page.evaluate` em jsdom. Não
  copiar essa técnica para a suíte: jsdom não implementa `innerText`, e com o
  extrator no adapter ela deixa de ser necessária.
- Ordem: PORTAL-013 primeiro (risco de perda de conteúdo offline), BUG-023
  depois. Independentes; podem rodar em qualquer ordem no loop.
