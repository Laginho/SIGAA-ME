### FASE 1 — Fechar o cano de release

*Prática ensinada: gates, CI, e por que verificação automática substitui
disciplina.*

#### 1.1 — Pausar a publicação automática

Trocar `--publish always` por publicação condicional/manual no
`.github/workflows/release.yml`.

**Pronto quando:** nenhum push de tag publica binário sem passo explícito.

#### 1.2 — Criar os scripts npm que faltam

Adicionar ao `package.json`: `test`, `test:unit`, `test:integration`,
`test:live`, `typecheck`, `lint`, `coverage`, `audit:prod`, `quality`.

Instalar e configurar ESLint (não existe hoje).

**Pronto quando:** `npm test` roda a suíte e termina sozinho. `npm run quality`
roda typecheck + lint + testes em sequência.

**Roteiro de revisão:** confira que `test` não é watch mode. Rode `npm test` e
veja terminar. Rode `npm run lint` e leia os erros — provavelmente serão muitos,
e a configuração precisa começar permissiva para não travar tudo.

#### 1.3 — CI de pull request

Criar `.github/workflows/ci.yml` que roda `npm run quality` em todo PR e push
para `master`. Sem credenciais do SIGAA — só testes determinísticos.

**Pronto quando:** abrir um PR dispara verificação, e um PR com teste quebrado
mostra falha.

#### 1.4 — Gate no release

Reestruturar o `release.yml` em jobs: `quality` → `build` → `publish`, com
`needs` encadeado.

**Pronto quando:** é impossível publicar sem os testes passarem.

**Marco:** a partir daqui, nada piora sem alguém perceber.

---
