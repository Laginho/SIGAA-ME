# QA-003 — O que a suíte verde **não** prova
Status: resolved
Priority: P2
Tracker status at migration: `DONE` — os dois testes existem e cada um falha com a proteção correspondente revertida (sessão 2026-09-01)

- Owner: Claude (sessão 2026-09-01, direto — tarefa só de teste, sem fase MAKE)
- Dependencies: `PIPE-002`
- Primary files: `tests/unit/course-detail.test.ts` (novo),
  `tests/unit/sync-selection.test.ts`

#### Por que esta tarefa existe

Em 2026-08-04 o `npm run quality` ficou verde e o `PIPE-002` fechou. O risco
imediato a partir daí é ler "68 passed" como "o comportamento está verificado".
Não está, e a diferença precisa estar escrita em algum lugar que não seja a
memória de quem participou da sessão.

Uma suíte verde prova exatamente uma coisa: **as 68 coisas que ela cobre
continuam funcionando.** Ela não diz nada sobre o que não cobre — e o silêncio
tem exatamente a mesma aparência nos dois casos.

#### Cobertura real das mudanças da sessão 2026-08-04

| Mudança | Coberta? | Por quê |
|---|---|---|
| `isCourseLike` no `sync-selection` | **Parcial** | `sync-selection.test.ts` exercita o caminho feliz (mocks devolvem `id`/`name` string). **Nenhum teste manda curso malformado**, então o `throw` de deriva de seletor nunca roda |
| `BUG-006` (`result.error` → `result.message`) | **Não** | Zero testes tocam o fluxo de erro de download. A correção está certa por leitura do código, não por prova |
| Contrato do `window.api` | Não, e **não pode ser** | Tipo é apagado em runtime. O teste dele é o `tsc` — que passou |
| União discriminada do `selectDownloadFolder` | Idem | Mesma coisa: verificado por `tsc`, não por vitest |
| 13 `prefer-const` | Não precisa | ESLint provou ausência de reatribuição. Inerte em runtime |

Conclusão honesta: dos 5 itens, **1 tem prova de comportamento, 2 têm prova de
tipo, 1 tem prova de lint, e 1 não tem prova nenhuma** (o `BUG-006`).

#### Acceptance criteria

- Teste que manda `getCourses` devolver `[{ id: 42 }]` e afirma que o
  `startSync` falha com a mensagem de deriva de seletor — hoje esse `throw`
  é código não exercitado.
- Teste que afirma que uma falha de download exibe a `message` vinda do main, e
  **não** `"Erro desconhecido"`. Deve falhar se alguém reverter o `BUG-006`.

#### Rationale

Regra 5 do `CLAUDE.md`: "se corrigiu um bug, existe um teste que falharia sem a
correção." O `BUG-006` foi corrigido sem esse teste. Esta tarefa é a dívida
correspondente, registrada em vez de esquecida.

Vale notar o que **realmente** pegou o `BUG-006`: não foi teste, foi o
verificador de tipos, no minuto em que o retorno deixou de ser `any`. Tipo e
teste provam coisas diferentes — tipo prova que o campo existe, teste prova que
o valor certo chega na tela. Os dois são necessários porque nenhum cobre o
outro.

---

#### Resolution (2026-09-01)

Feito direto, sem PTMR: são dois testes de caracterização sobre comportamento
que já existe, então não há fase vermelha natural nem trabalho para MAKE. A prova
de que cada teste morde foi feita por **mutação**, não por stash:

- `tests/unit/sync-selection.test.ts`, describe `Sync: selector drift (QA-003)`:
  `getCourses` devolve `[{ id: 42 }]`; o overlay mostra "1 disciplina(s) em
  formato desconhecido", `getCourseFiles` não é chamado e nada vai para o
  `localStorage`. Com a guarda trocada por `if (false)` o teste falha.
- `tests/unit/course-detail.test.ts` (novo): renderiza a página com uma turma
  em `coursesWithFiles`, clica em `.btn-download-file`, `downloadFile` devolve
  `{ success: false, message: 'Sessão expirada no SIGAA' }` e o teste afirma
  `toast.error('Erro no download: Sessão expirada no SIGAA')`. Com a leitura
  revertida para `(result as any).error` o teste falha com "Erro desconhecido".
- Duas armadilhas do render que o teste documenta: a lista de arquivos aparece
  depois de `await`s em `fetchCourseFiles` (é preciso drenar a fila), e a página
  assina `window.api.onDownloadProgress` no render — sem esse mock ela cai no
  `error-message` e não há botão nenhum.
