# PIPE-002 — Criar os scripts npm que faltam
Status: resolved
Priority: P0
Tracker status at migration: `DONE` — `npm run quality` verde no Windows em 2026-08-04 (68 passed, 4 skipped). Ver o `QA-003` para o que isso **não** prova.

- Owner: Claude (sessão 2026-08-02) / revisão de Bruno
- Dependencies: none
- Primary files: `package.json`, `eslint.config.js`, `shared/ipc.ts`,
  `electron/preload.ts`, `electron/main.ts`, `src/vite-env.d.ts`,
  `electron/services/persistence.service.ts`, `tsconfig.json`

#### Estado da implementação (2026-08-02)

| Item | Status |
|---|---|
| Scripts `test`, `typecheck`, `lint`, `quality` | Feito |
| `eslint.config.js` com zonas | Feito |
| Remoção de `verify-scraper.ts` + `tsconfig.verify.json` | Feito |
| Regra contra credencial com fallback | Feito |
| Tipagem da fronteira (`preload.ts`, `main.ts`) | Feito |
| `shared/ipc.ts` criado e incluído no tsconfig | Feito |
| Consumidores de `window.api` ajustados | Feito (sessão 2026-08-04) |
| `prefer-const` (13 sítios) | Feito |
| `tsc --noEmit` | **0 erros** (verificado 2026-08-04) |
| `eslint .` | **0 erros**, 125 avisos (verificado 2026-08-04) |
| `npm run quality` no Windows | **Verde** — 68 passed, 4 skipped (2026-08-04) |

Primeira execução (antes da tipagem): typecheck limpo, testes 68 passed /
4 skipped, lint com 34 erros e 149 avisos. Os 34 eram: 18 `any` na fronteira,
14 `prefer-const`, 2 `catch {}` vazios e 1 falso positivo da regra de credencial
(corrigido — a regra pegava qualquer `process.env.X || fallback`, inclusive
`VITE_PUBLIC || path.join(...)`).

#### Fechamento da tipagem (sessão 2026-08-04)

O suspeito nº 3 se confirmou: 30 erros de `tsc`, todos nos consumidores de
`window.api`. Os suspeitos 1 e 2 não deram problema.

Decisão do autor sobre o escopo: **corrigir o contrato declarado, validar o
`unknown` no call site — sem antecipar o `ARCH-001`.**

Os 30 erros eram de três naturezas diferentes, e a distinção é o que evitou
transformar o `PIPE-002` numa tarefa de Fase 3:

**a) Contrato declarado incompleto (22 erros).** O `vite-env.d.ts` foi escrito
por leitura parcial do main. Faltavam campos que o main devolve de fato:
`account` (`sigaa.service.ts:38`), `photoUrl` (`:70`), `skipped` e `results`
(`:282`), e o formato real de `news` (`playwright-login.service.ts:1183`).
Aqui o call site estava certo e a **declaração** estava errada. Modelados em
`shared/ipc.ts`: `AccountSummary`, `DownloadResultItem`, `NewsDetail` — todos
lidos do código, nenhum inventado.

**b) União discriminada faltando (4 erros).** `selectDownloadFolder` declarava
`{ success: boolean; folderPath?: string }`, então `if (!res.success) return`
não estreitava nada e `folderPath` seguia `string | undefined` para sempre.
Trocado por `{ success: true; folderPath: string } | { success: false }`, que é
o que o main realmente devolve (`main.ts:149-159`). **Os 4 erros de
`string | null` no DOM desapareceram sem tocar em nenhum call site** — eram
sintoma, não causa. Padrão a reconhecer: erro de `null`/`undefined` espalhado
por call sites geralmente é uma união discriminada ausente na origem.

**c) O `unknown` fazendo o trabalho dele (4 erros).** `courses?: unknown[]` em
`sync-selection.ts`. Em vez de criar `CourseSummary` (que é `ARCH-001`), foi
adicionado o type guard `isCourseLike` validando a forma mínima que a página
precisa. Efeito colateral útil: se o SIGAA mudar de formato, isso passa a falhar
alto com mensagem de deriva de seletor em vez de gravar `undefined` no cache.

#### Problem

Dos 9 scripts exigidos por `QA-001`, **zero existem**. Os únicos scripts de teste
(`test:ui`, `test:watch`) estão ambos em modo watch e nunca terminam — não há
forma de rodar a suíte em CI. Não há ESLint no projeto.

#### Escopo mínimo (ver nota de simplificação abaixo)

- `test` — `vitest run` (não watch)
- `typecheck` — `tsc --noEmit`
- `lint` — ESLint
- `quality` — os três em sequência

#### Nota de simplificação

`QA-001` exige 9 scripts. Os 4 acima cobrem o gate; os outros 5
(`test:unit`, `test:integration`, `test:live`, `coverage`, `audit:prod`) entram
quando houver necessidade concreta. Criar script que ninguém roda é cerimônia.

#### Decisão sobre ESLint (Bruno, 2026-08-02): estrito

Estrito **por zona**, para não quebrar o build em 113 pontos antes de existir
teste:

- **Erro** em `electron/preload.ts`, handlers IPC de `electron/main.ts`,
  `shared/**` (quando existir), e todo arquivo novo.
- **Aviso** no resto do código existente.
- **Erro em qualquer lugar:** `as any` em chamada de IPC — foi o mecanismo exato
  que escondeu o `BUG-002`.
- Catraca como disciplina, não como ferramenta: o número de avisos só pode cair.

#### Acceptance criteria

- `npm test` roda a suíte e **termina sozinho**.
- `npm run quality` roda typecheck + lint + testes em sequência.
- O build não quebra por causa dos `any` existentes.
