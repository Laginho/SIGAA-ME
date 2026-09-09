# OBS-001 — Redact, rotate, and scope the logger
Status: claimed
Priority: P2
Blocked by: DL-002 (fechada em 2026-09-07)
Tracker status at migration: `NOT STARTED`

**Escopo reduzido em 2026-09-09**, de "centralizar todo o logging" para "o seam
do `LoggerService`". O resto virou `CLEAN-003` (funil do `console.*`),
`CLEAN-004` (apagar o `scraper.log`) e ficou com o `PORTAL-003` (dumps
`debug_*`). Ver `## Comments`.

- Owner: —
- Dependencies: `ARCH-001`, `DATA-002`
- Primary files:
  - `electron/services/logger.service.ts`
  - `tests/unit/logger-redaction.test.ts`

#### Required behavior

- Redigir, em `LoggerService`, senha, cookie, header, username, caminho
  absoluto, HTML cru, script JSF, nome de disciplina e nome de arquivo.
- Rotacionar por tamanho, com retenção finita.
- Expor escopo por componente e operation ID.
- `clear()` remove o log atual e os rotacionados.
- Falha de escrita não recursa no próprio logger.

#### Acceptance criteria

- Uma linha escrita pelo `LoggerService` não contém segredo nem conteúdo
  acadêmico.
- `sigaa-me.log` não cresce sem limite.
- `clear()` remove as três gerações do arquivo.
- Falha persistente de escrita não recursa.

Fora daqui: "segredo não aparece em log de produção" **no app inteiro** depende
do `CLEAN-003` — hoje 200 das 201 chamadas de log do `electron/` não passam por
este arquivo.

#### Verification

```text
npm run test:unit -- logger-redaction
```

#### Implementation notes

- Commit: `cdbaec5` (testes), `ab8372e` (implementação).
- Rotation policy: 1 MiB por arquivo, 2 rotações (`sigaa-me.log.1`, `.2`),
  `clear()` remove as três.
- Redaction policy: chave sensível (password/senha/pass, cookie(s), token,
  authorization/auth/header(s), username/user/email/matricula, path/filepath/
  dirpath, courseName, fileName, script, viewState — normalizada e comparada
  sem distinguir maiúscula) vira `[REDACTED]` inteira em argumentos
  estruturados; string livre passa por regex para cookie/Authorization/Bearer,
  ViewState/`j_id`, caminho absoluto Windows/Unix e blob de HTML cru.
- "Buffer writes" saiu do escopo: `appendFileSync` por linha basta neste volume,
  e buffer sem flush no crash perde justamente a linha que interessa. Reabrir se
  alguém medir o custo.

## Comments

- 2026-09-09: ticket dividido na prática pela etapa 2 — só o `logger.service.ts`
  foi tocado, com a justificativa de que o resto era "migração mecânica de ~180
  call sites em 6+ arquivos, sem seam próprio para testar".

- 2026-09-09 (correção): a contagem está certa (201 chamadas `console.*` no
  `electron/`), a conclusão não. Existem dois seams, cada um em **um** arquivo:

  1. `main.ts:55-68` já monkeypatcha `console.log/error/warn`. Apontar os três
     wrappers para o `logger` redige e rotaciona as 201 chamadas de uma vez, sem
     tocar em nenhuma. → `CLEAN-003`.
  2. `http-scraper.service.ts:74-83` já chama `console.log` antes de escrever no
     `scraper.log`. Depois do (1), o `scraper.log` é duplicata pura: apagar o
     stream é remoção, não migração. → `CLEAN-004`.

  A migração call-site a call-site nunca precisou existir.

  Consequência para o status: os critérios "segredo não aparece em log de
  produção" e "crescimento limitado" **não estão cumpridos no app** — o destino
  redigido tem 1 chamador, e `logs/app_*.log` continua ilimitado e sem redação
  recebendo os outros 200. Foi por isso que o escopo deste ticket foi reescrito
  em vez de marcado como resolvido: o corte original ficava do lado errado do
  vazamento.

- 2026-09-09: `diagnostics.service.ts` saiu daqui. Os dumps `debug_*` do
  `playwright-login.service.ts` (8 pontos de `writeFileSync`) são o objeto do
  `PORTAL-003`, que já lista consentimento, retenção e clear-all para eles.
