# BUG-011 — Tarefa listada como arquivo dispara download e fallback Playwright
Status: resolved
Priority: P2
Tracker status at migration: `DONE` — Bruno sincronizou e fez "baixar todos" em SINAIS E SISTEMAS no build instalado (2026-09-01): nenhum Chrome abriu, toast verde

- Owner: Claude (sessão 2026-09-01)
- Dependencies: none
- Primary files: `electron/services/http-scraper.service.ts` (`getCourseFiles`,
  varredura de `<a>`), `tests/integration/parser-real.test.ts`,
  `tests/fixtures/course-page-real-with-tasks.html`

#### Problem

Descoberto no smoke do `DL-001`/`BUG-004` (2026-09-01): depois de um "baixar
todos" bem-sucedido, um Chrome abriu sozinho. O log do app mostra a sequência:
"Atividade 1" e "Atividade 2" (tarefas do SIGAA) estavam na lista de arquivos;
o download HTTP recebeu a página "Responder tarefa" (46 KB de HTML); a
verificação do `BUG-001` rejeitou 3 vezes e descartou o `.part`; o fallback do
`BUG-004` abriu o Playwright para cada uma, que não achou link de download e
morreu esperando o evento `download`. Nada foi gravado errado no disco.

Causa: a Strategy 1 do parser aceita qualquer `<a>` com `jsfcljs(...,id,...)`.
Tarefa usa exatamente esse padrão; só o componente muda:
`idEnviarMaterialTarefa` (sem `key`) contra `idInserirMaterialArquivo` (com
`key`).

#### Resolution (2026-09-01)

Direto, sem PTMR (uma linha e uma fixture).

- `http-scraper.service.ts`: antes das duas estratégias, `<a>` cujo `onclick`
  contém `idEnviarMaterialTarefa` é ignorado. Antes das duas porque uma tarefa
  chamada "Lista 5" cairia na Strategy 2 pelo texto. Marcado com
  `// ponytail:`: só tarefa é conhecida; questionário e fórum entram quando
  aparecerem numa fixture.
- `tests/fixtures/course-page-real-with-tasks.html`: **primeira fixture gravada
  do portal** (procedência e limpeza no README de lá). 7 arquivos, 2 tarefas.
- `parser-real.test.ts`: contra a fixture real, a lista tem 7 itens, inclui
  `Plano de Ensino`/`Aula 3`/`Aula4 - Parte 1` e o id `3998953`, não inclui
  `Atividade 1`/`Atividade 2`, e nenhum `script` contém `Tarefa`. Vermelho sem
  a correção (9 itens, com as tarefas), verde com ela.
- Efeito colateral bom: a fixture real exercita o resto do parser contra HTML
  de verdade pela primeira vez, e ele passou sem outra mudança.
- Gate no Windows: `tsc` limpo, 0 erros de lint, **154 passed, 4 skipped**.
- Atenção no smoke: a lista salva no `localStorage` do app ainda tem as duas
  tarefas até a próxima sincronização, e "baixar todos" manda essa lista ao
  main. Sincronizar primeiro, depois baixar.
