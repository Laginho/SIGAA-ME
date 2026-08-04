# SIGAA-ME Code Review

> **Review original:** Codex, 2026-07-10.
> **Auditado e corrigido:** 2026-08-02. Este documento foi verificado contra o
> código; as correções estão marcadas inline com `[CORRIGIDO 2026-08-02]`.
> O plano de trabalho derivado dele vive em `docs/PLANO.md`, e o status de
> implementação em `docs/HARDENING_TRACKER.md`.

## Outcome

The project is not ready for semi-professional distribution yet. The architecture is promising and the production build succeeds, but security, privacy, dependency, and release-gate issues remain blockers.

## Priority findings

### P0 — Untrusted content can execute renderer JavaScript

SIGAA-provided news content, course names, filenames, and notification titles are interpolated directly into `innerHTML` without sanitization. Event-handler attributes such as `onerror` remain executable.

Relevant files:

- `src/pages/course-detail.ts`
- `src/pages/dashboard.ts`
- `src/components/toast.ts`

Fix by rendering plain-text fields with `textContent` and sanitizing permitted rich text with a strict allowlist.

> **[CORRIGIDO 2026-08-02] — escala precisada.** A vulnerabilidade é real e a
> gravidade se mantém, mas o escopo do trabalho é menor do que a leitura
> original sugere.
>
> Existem 47 ocorrências de `innerHTML` no projeto. A maioria é HTML estático
> escrito pelo desenvolvedor (troca de ícone de botão, ex.:
> `btn.innerHTML = '🔄'`). **Os sinks que recebem dado do SIGAA são 9:**
>
> | Local | Dado | Gravidade |
> |---|---|---|
> | `course-detail.ts:571` | `result.news.content` (HTML bruto do SIGAA) | Crítico |
> | `course-detail.ts:529` | `cachedContent` (HTML bruto do cache) | Crítico |
> | `course-detail.ts:520,562` | título e data da notícia | Alto |
> | `course-detail.ts:180` | `item.title`, `item.date` | Alto |
> | `course-detail.ts:248,258` | `file.name`, `file.url`, `file.script` em `data-*` | Alto |
> | `dashboard.ts:343-350` | `course.name`, `code`, `period`, `id` | Alto |
> | `dashboard.ts:262-265` | `n.itemTitle`, `n.courseName` | Alto |
> | `dashboard.ts:49-53` | `account.photoUrl` dentro de `src="..."` | Alto |
> | `toast.ts:33` | `message` (recebe nome de arquivo e erro do SIGAA) | Médio |
>
> Dois arquivos foram listados por engano no review original:
> - `src/utils/notification-store.ts` — **não contém nenhum `innerHTML`.** É
>   persistência em localStorage. Propaga dado que o `dashboard.ts` renderiza,
>   mas o sink não está nele.
> - `src/pages/settings.ts` — seu único `innerHTML` interpola apenas
>   configuração local (`theme`, `lastDownloadPath`, `__APP_VERSION__`), não
>   dado do SIGAA.
>
> `src/components/toast.ts` estava **ausente** da lista e foi adicionado acima.
>
> Agravantes confirmados: não existe nenhuma sanitização no repositório (zero
> ocorrências de `sanitize`/`DOMPurify`/`escapeHtml`) e **não existe CSP** no
> `index.html`. Há atributos inline com dado interpolado em
> `dashboard.ts:49` (`onerror=` numa `<img>` cujo `src` não é escapado) e
> `dashboard.ts:343` (`onclick=` com `course.id` dentro de contexto de execução
> JavaScript).

### P0 — Unrestricted IPC and navigation trust boundary

The preload exposes generic `send`, `on`, and `invoke` methods. Main-process handlers accept unvalidated paths, setting keys, and payloads. The window also has no `will-navigate` or `setWindowOpenHandler` policy, so an external page could inherit the preload API.

Relevant files:

- `electron/preload.ts`
- `electron/main.ts`

Expose only explicitly named, typed operations, validate every payload in the main process, reject unexpected origins, and open approved external links through `shell.openExternal`.

### P1 — Logout and clear-all-data do not isolate accounts

Logout deliberately preserves cached course/news content. A second account can initially see the previous account’s data. The clear-data handler removes credentials but leaves main-process cache, settings, and logs behind.

Relevant files:

- `src/pages/dashboard.ts`
- `electron/main.ts`
- `electron/services/cache.service.ts`

Bind caches to an account identifier and clear all documented stores when the user requests complete deletion.

### P1 — Background synchronization can race user actions

Course detail calls `pauseSync()` and `resumeSync()`, but neither function exists in the preload or main process. The `busyCount` only logs state and does not serialize operations. User actions and background sync can therefore share and navigate the same Playwright page concurrently.

Relevant files:

- `src/pages/course-detail.ts`
- `electron/preload.ts`
- `electron/services/sigaa.service.ts`

Implement real serialization/cancellation around the shared Playwright session.

> **[CORRIGIDO 2026-08-02] — confirmado, com a explicação que faltava.** As
> chamadas estão em `src/pages/course-detail.ts:58` e `:124`, e usam
> `(window as any).api.pauseSync()`. Três defesas falharam em sequência, e é por
> isso que ninguém percebeu:
>
> 1. O cast `as any` desligou o TypeScript — o compilador sabia que o método não
>    existe e foi mandado calar a boca.
> 2. Ambas as chamadas estão dentro de `try/catch` que só faz `console.error`.
>    O `TypeError` acontece, é engolido, vira linha de console que ninguém lê.
> 3. Nenhum teste exercitava o caminho.
>
> Resultado: o app não quebra, mas a pausa **nunca acontece**. É código que
> *parece* implementar uma proteção e não implementa nada.
>
> `busyCount` confirmado como log puro: `sigaa.service.ts:14-34` apenas
> incrementa/decrementa e chama `logger.info`. Sem mutex, fila ou `await` —
> nenhum caller é bloqueado.
>
> **Decisão (2026-08-02):** remover as chamadas mortas agora; a serialização real
> fica no `CONC-001`, registrada como débito conhecido em `docs/PLANO.md`.

### P1 — Broken unit suite is not release-gated

~~`tests/unit/sigaa-service.test.ts` has an unmatched closing brace and cannot be parsed.~~ The release workflow runs only the build and publish commands; it does not run unit tests, integration smoke tests, linting, or audit checks.

Relevant files:

- ~~`tests/unit/sigaa-service.test.ts`~~
- `.github/workflows/release.yml`
- `package.json`

~~Add the missing closure,~~ define a real `test` script, and make publishing conditional on deterministic quality checks.

> **[CORRIGIDO 2026-08-02] — a chave não fechada JÁ ESTAVA RESOLVIDA.**
> `tests/unit/sigaa-service.test.ts` tem 199 linhas, as chaves estão balanceadas
> e o arquivo faz parse normalmente. Corrigido no commit `5968a40`, já
> registrado no `HARDENING_TRACKER.md`. Resta apenas indentação incorreta na
> linha 198 (`});` na coluna 0) — cosmética, e provável origem da confusão.
>
> **Porém o achado maior passou batido:** a suíte é **inexecutável de forma não
> interativa**. Os únicos scripts de teste no `package.json` são `test:ui` e
> `test:watch`, **ambos em modo watch, que nunca terminam**. Não existe forma de
> rodar a suíte em CI. Dos 9 scripts que o `HARDENING_TRACKER` exige
> (`test`, `test:unit`, `test:integration`, `test:live`, `typecheck`, `lint`,
> `coverage`, `audit:prod`, `quality`), **zero existem**. Não há ESLint no
> projeto.
>
> Ou seja: o item original era academicamente correto e praticamente
> irrelevante — os testes existiam, faziam parse, e ninguém tinha como rodá-los.
>
> **Também não registrado:** não existe CI para pull request. O único workflow
> (`.github/workflows/release.yml`) tem triggers `workflow_dispatch` e push de
> tag `v*.*.*`. Nenhum PR é verificado. E `npm run release` termina em
> `electron-builder --win --publish always` — a flag publica
> **incondicionalmente**, sem gate algum.

### P1 — Vulnerable and inconsistent dependency tree

As checked on July 10, 2026:

- Production-only `npm audit`: 4 vulnerable packages, including 3 high-severity advisories.
- Full audit: 16 vulnerable packages, including 1 critical and 12 high-severity advisories.
- Directly relevant packages include Axios, Electron, electron-builder, Vite, and `@vitest/browser`.
- `npm ls` reports an invalid Vite/Vitest peer dependency tree: Vitest 4 expects newer Vite versions while the project directly uses Vite 5.

Upgrade the runtime and tooling as a coordinated set, regenerate the lockfile, and retest packaging and scraping.

### P2 — Developer action ships in production

The tray menu always includes `[Dev] Simular Arquivo Novo`, which mutates the cache and creates artificial update behavior. Guard it with `!app.isPackaged` or remove it from production builds.

Relevant file: `electron/main.ts`.

> **[CORRIGIDO 2026-08-02] — mais grave do que descrito, e a guarda está no
> lugar errado.** As três pontas divergem:
>
> | Ponta | Guardado? | Local |
> |---|---|---|
> | Handler IPC `test-simulate-new-file` | **Sim** | `electron/main.ts:230` |
> | Item do menu do tray | **Não** | `electron/main.ts:344-361` |
> | Preload `simulateNewFile` | **Não** | `electron/preload.ts:50-51` |
>
> E o item do tray **não passa por IPC** — a lógica está inline no callback
> `click` (linhas 345-355), manipulando `cacheService['cache']` direto no
> processo main. Portanto a guarda existente protege exatamente a ponta que o
> usuário não alcança, e deixa livre a que ele **vê e clica**. Em build de
> produção, o usuário final tem um botão funcional que corrompe o próprio cache.
>
> Nota: as linhas 345-351 acessam membros privados por bracket notation
> (`cacheService['cache']`, `cacheService['saveCache']()`) para contornar o
> TypeScript.

### P2 — Download fallback can reject valid files

Unknown content is assumed to be PDF and then subjected to PDF magic-byte validation. Legitimate non-PDF files served as `application/octet-stream` can therefore be deleted after download. Resolved download paths should also be verified to remain below the selected base directory.

Relevant file: `electron/services/http-scraper.service.ts`.

> **[CORRIGIDO 2026-08-02] — confirmado, e a prioridade está baixa demais.**
> A cadeia completa em `electron/services/http-scraper.service.ts`:
>
> 1. linha 918-922: sem extensão detectada → `detectedExtension = '.pdf'`
> 2. linha 926-927: a extensão é anexada ao nome do arquivo
> 3. linha 956-958: valida magic bytes conforme a extensão → procura `%PDF`
>    (assinatura `25504446`, linha 773)
> 4. linha 960-965: falha na validação → **`fs.promises.unlink(filePath)`**
>
> Qualquer `.txt`, `.csv`, `.py` ou `.odt` servido como `octet-stream` é baixado
> e imediatamente **apagado**, com mensagem de erro para o usuário. O fallback
> inventa uma mentira sobre o tipo e a validação seguinte pune o arquivo por ela.
>
> Isso não é P2. É **perda de dados no caminho principal do app**, e foi
> promovido a primeira tarefa da fase de correção de bugs em `docs/PLANO.md`.
>
> Path containment: confirmado ausente. Zero ocorrências de `path.relative` ou
> `path.resolve` no arquivo; a construção é `path.join(basePath, finalFileName)`
> (linha 936). A única defesa é lista negra de caracteres (linha 933), que
> bloqueia traversal simples mas é incidental, não estrutural.

---

## Nota de método — o caso `download.service.ts`, com três erros em sequência

Três conclusões sobre o mesmo arquivo, todas confiantes, as duas primeiras
erradas. Vale como registro de como um achado se degrada.

**Erro 1 — "é código morto, não há import dele."**
Uma busca automática por `import ... from './download.service'` não retornou
nada. Falso: o arquivo é carregado por **import dinâmico** em
`electron/services/playwright-login.service.ts:763` e `:883`
(`await import('./download.service')`). Busca estática por `import ... from` não
encontra `await import()`.

**Erro 2 — "está vivo, é o fallback Playwright do download."**
Também falso, e este foi meu. Provar que um arquivo é *importado* não prova que
ele é *alcançável*. Os dois métodos que fazem o import dinâmico —
`PlaywrightLoginService.downloadFile` (linha 748) e `downloadAllFiles`
(linha 864) — **não têm chamador nenhum**. Verificado em 2026-08-02:

```
main.ts:163  → sigaaService.downloadFile
             → _downloadFileInternal (sigaa.service.ts:149)
             → httpScraper.downloadFile (:221)
             → retry: httpScraper.downloadFile (:261)   ← o retry também é HTTP
```

Zero ocorrências de `playwrightLogin.downloadFile` ou `.downloadAllFiles` em
todo o repositório, incluindo testes.

**Erro 3 — o `ARCHITECTURE.md` descreve um fallback que não está ligado.**
O documento diz que o download cai de volta no Playwright quando o HTTP falha.
O código para isso existe (771 linhas somando os dois arquivos) e **nunca é
alcançado**. O download tem HTTP e retry em HTTP; não tem fallback.

Este é o **terceiro** caso do mesmo padrão neste repositório, junto com
`pauseSync()` (chamado, nunca implementado) e `busyCount` (implementado, não
serializa nada): código que parece cuidar de algo importante e não cuida.

**Lições:**

- Relatório de ferramenta é hipótese, não fato.
- Arquivo importado ≠ arquivo alcançável. É preciso subir a cadeia de chamadores
  até um ponto de entrada real (handler IPC, `main.ts`, teste).
- Documentação de arquitetura descreve intenção, não comportamento verificado.
  Quando o `ARCHITECTURE.md` afirma que existe um fallback, isso é uma hipótese
  a testar — não uma garantia.

**Decisão pendente:** apagar as 771 linhas (aceitando que o download não tem
fallback) ou ligar o fallback (restaurando o comportamento documentado). Ver
`BUG-004` no `HARDENING_TRACKER.md`.

## Additional criteria

- **Accessibility:** The document declares `lang="en"` despite Portuguese content; icon-only controls rely mainly on `title`; the news modal lacks dialog semantics, focus management, and Escape-key handling.
- **Maintainability:** Several services and pages are very large, use extensive `any` types, and contain duplicated download/navigation logic.
- **Observability:** Logging is synchronous, duplicated, unbounded, and may retain course names, filenames, paths, and other sensitive data.
- **Release security:** Windows artifacts are unsigned, and the README instructs users to bypass SmartScreen warnings.
- **Testing:** There is no lint command, coverage threshold, or CI test gate. E2E/integration tests depend on live SIGAA access and credentials.

> **[ADENDO 2026-08-02] — métricas de manutenibilidade quantificadas.**
> O review fala em "extensive `any`" e "very large files" sem números. Medido:
>
> - **113 ocorrências de `: any`** — 78 em `electron/`, 35 em `src/`. Subestima o
>   real, pois não captura casts `(window as any)`. Piores:
>   `course-detail.ts` (19), `playwright-login.service.ts` (18),
>   `sigaa.service.ts` (15), `http-scraper.service.ts` (11), **`preload.ts` (8)**.
>   O `preload.ts` é o mais crítico dos oito: é a fronteira de confiança, e é
>   exatamente onde tipagem daria segurança real.
> - **Maiores arquivos:** `playwright-login.service.ts` (1235),
>   `http-scraper.service.ts` (989), `sigaa.service.ts` (623),
>   `course-detail.ts` (588), `download.service.ts` (492), `main.ts` (402).
> - **Dependências:** `electron` 30.5.1 está **fora de suporte** (o Electron
>   mantém as 3 últimas majors; patches de Chromium não chegam mais nesta linha).
>   Instalados: axios 1.15.0, vite 5.4.21, vitest 4.1.4, playwright 1.59.1.
>   Uma segunda árvore de vite (8.0.8) coexiste sob `node_modules/vitest/`.
> - **Configuração do BrowserWindow** (`electron/main.ts:80-86`): o objeto
>   `webPreferences` tem **uma única chave** (`preload`). `contextIsolation`,
>   `nodeIntegration`, `sandbox` e `webSecurity` não são setados — a postura de
>   segurança depende inteiramente de defaults implícitos do Electron 30.
>   `will-navigate`, `setWindowOpenHandler` e `shell.openExternal` não existem no
>   código (`shell` sequer é importado).
> - **`index.html`:** 13 linhas, `lang="en"`, sem tag de CSP.
>
> Os números de vulnerabilidade citados no item de dependências são de
> 2026-07-10 e **precisam ser refeitos** — auditorias envelhecem.

## Verification performed

- `npx tsc --noEmit`: passed.
- `npx vite build`: passed.
- `npx vitest run tests/unit`: 46 tests passed; one suite failed to parse.
  **[CORRIGIDO 2026-08-02]** — a suíte que falhava no parse já estava corrigida
  no commit `5968a40`; o `HARDENING_TRACKER` registra 68 passando + 4 live
  skipped nesse baseline.
- `npm test`: failed because the script is not defined.
  **[reconfirmado 2026-08-02]** — segue sem script `test`.
- Integration/E2E tests were not run because they require live SIGAA access and credentials.
- Working tree was clean and no source files were modified during the review.

## Recommendation

Treat the app as beta/personal-use software until the P0/P1 findings are fixed, dependencies are upgraded, test gates are enforced, and account/data deletion behavior is made explicit and verifiable.

> **[ADENDO 2026-08-02] — a recomendação segue válida, com ordem revisada.**
>
> Este review ordena por severidade de segurança, o que é o critério correto
> para um produto com usuários. Hoje o app tem **um único usuário (o autor)**, e
> o destino declarado é produto público. Nessa condição, a ordem de execução foi
> revisada em `docs/PLANO.md`:
>
> 1. **Fechar o cano de release primeiro** — scripts de teste, CI de PR, gate
>    antes de publicar. Não é adiar segurança: é construir a rede antes de andar
>    na corda. Hoje não existe forma de rodar a suíte, então qualquer refatoração
>    de fronteira seria feita sem prova de que nada quebrou. É também o único
>    item que **impede a regressão** — os outros são limpeza pontual.
> 2. **Bugs que causam perda de dados** — o download apagando arquivos válidos.
> 3. **Fronteiras de confiança** — `ARCH-001` → `SEC-001` → `SEC-002` →
>    `SEC-003` → `DATA-001`, na ordem definida pelo tracker, que está correta.
> 4. **Prontidão para distribuição** — dependências, observabilidade,
>    acessibilidade, compatibilidade de portal.
>
> Divergência explícita em relação ao `HARDENING_TRACKER`: ele manda começar por
> `ARCH-001`. A justificativa da inversão, com o contra-argumento registrado,
> está na seção 3 de `docs/PLANO.md`.
>
> Decisão paralela: **publicação automática pausada** até existir gate. O
> `--publish always` sai do fluxo automático. Como só o autor usa o app, o custo
> é zero.
