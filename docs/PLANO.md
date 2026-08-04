# Plano de Profissionalização — SIGAA-ME

> **Status deste documento:** proposta para discussão. Nada aqui foi implementado.
> Depois de revisado e aprovado, ele vira o plano oficial e o
> `HARDENING_TRACKER.md` é atualizado para refletir a ordem definida aqui.

**Autor:** Claude, a pedir de Bruno
**Data:** 2026-08-02
**Baseado em:** auditoria do `CODE_REVIEW.md` original (Codex, 2026-07-10),
verificada contra o código em 2026-08-02.

---

## 1. Contexto e objetivo

### Onde o projeto está

O SIGAA-ME funciona. O núcleo difícil — scraping híbrido Playwright/HTTP contra
um portal JSF hostil — está resolvido e documentado. O app builda, roda, e é
usado diariamente pelo autor.

O que está frágil é o **entorno**: as fronteiras de confiança, o processo de
release, e a higiene do código. São problemas de projeto que cresceu rápido sem
pausa, não de projeto mal concebido.

Essa distinção define o tipo de trabalho: **arrumar, não reescrever.**

### Onde o projeto quer chegar

Produto público de verdade. Outros alunos instalando, instalador assinado,
releases confiáveis.

### Restrições declaradas

| Restrição | Valor | Consequência no plano |
|---|---|---|
| Usuários hoje | Apenas o autor | Pode-se pausar releases sem prejudicar ninguém |
| Tempo disponível | Variável, sem prazo | Toda tarefa cabe em uma sessão e termina estável |
| Divisão de trabalho | Claude implementa, Bruno revisa | Cada tarefa tem roteiro de revisão |
| Objetivo secundário | Aprender engenharia de software | Cada fase ensina uma prática, em contexto real |

### Princípio norteador

> Nunca reescreva a parte que custou conhecimento.
> Reescreva a parte que custou só digitação.

O conhecimento sobre como o SIGAA se comporta — seletores, o fato de a sessão
morrer em HTTP puro, o fluxo JSF — não existe documentado em nenhum outro lugar.
Ele é o ativo do projeto. O resto é substituível.

---

## 2. Correções à auditoria original

O `CODE_REVIEW.md` de 2026-07-10 é um bom documento, mas contém imprecisões que
precisam ser corrigidas antes de servir como base de trabalho.

### 2.1 Erro factual

**O teste quebrado já foi corrigido.** O review afirma que
`tests/unit/sigaa-service.test.ts` tem uma chave `}` não fechada e não faz parse.

Verificação em 2026-08-02: o arquivo tem 199 linhas, as chaves estão balanceadas
e ele faz parse normalmente. Resta apenas indentação incorreta na linha 198
(`});` na coluna 0), que é cosmética.

O `HARDENING_TRACKER.md` já registra a correção no commit `5968a40`. O
`CODE_REVIEW.md` é que não foi atualizado.

**Ação:** corrigir o `CODE_REVIEW.md`, marcando o item como resolvido.

### 2.2 Imprecisão de escala

**A contagem de `innerHTML` está inflada.** O review dá a entender que há
exposição massiva. Existem 47 ocorrências de `innerHTML` no projeto, mas a
maioria é HTML estático escrito pelo desenvolvedor — trocas de ícone de botão
como `btn.innerHTML = '🔄'`.

A exposição real são **9 sinks** que recebem dados vindos do SIGAA:

| Arquivo:linha | Dado | Gravidade |
|---|---|---|
| `src/pages/course-detail.ts:571` | `result.news.content` — HTML bruto do SIGAA | Crítico |
| `src/pages/course-detail.ts:529` | `cachedContent` — HTML bruto do cache | Crítico |
| `src/pages/course-detail.ts:520,562` | título e data da notícia | Alto |
| `src/pages/course-detail.ts:180` | `item.title`, `item.date` | Alto |
| `src/pages/course-detail.ts:248,258` | `file.name`, `file.url`, `file.script` em `data-*` | Alto |
| `src/pages/dashboard.ts:343-350` | `course.name`, `code`, `period`, `id` | Alto |
| `src/pages/dashboard.ts:262-265` | `n.itemTitle`, `n.courseName` | Alto |
| `src/pages/dashboard.ts:49-53` | `account.photoUrl` dentro de `src="..."` | Alto |
| `src/components/toast.ts:33` | `message` — recebe nomes de arquivo e erros | Médio |

Dois erros pontuais do review:

- `src/utils/notification-store.ts` é listado como afetado, mas **não contém
  nenhum `innerHTML`**. É persistência pura. Ele propaga dados que o
  `dashboard.ts` depois renderiza, mas o sink não está nele.
- `src/pages/settings.ts` tem um `innerHTML` que interpola apenas configuração
  local (`theme`, `lastDownloadPath`, `__APP_VERSION__`), não dados do SIGAA.

**Isso não reduz a gravidade** — os sinks críticos são reais e não há
sanitização nem CSP em lugar nenhum. Mas muda o tamanho do trabalho: são 9
lugares a corrigir, não 47.

### 2.3 Achados que a auditoria original não registrou

Cinco itens encontrados na verificação de 2026-08-02 que não constam do
`CODE_REVIEW.md`:

**A. A suíte de testes é inexecutável de forma não-interativa.**
O review nota que falta o script `test`. O achado maior: os únicos scripts de
teste existentes são `test:ui` e `test:watch`, **ambos em modo watch, que nunca
terminam**. Não há forma de rodar a suíte em CI. Dos 9 scripts que o
`HARDENING_TRACKER` exige, **0 existem**. Não há ESLint no projeto.

**B. O item `[Dev] Simular Arquivo Novo` funciona em produção.**
O review classifica como P2 e sugere guardar com `!app.isPackaged`. A situação
real é pior e mais sutil — as três pontas divergem:

| Ponta | Guardado? | Local |
|---|---|---|
| Handler IPC | Sim | `electron/main.ts:230` |
| Item do menu tray | **Não** | `electron/main.ts:344-361` |
| Preload `simulateNewFile` | **Não** | `electron/preload.ts:50-51` |

E o item do tray **não usa IPC** — a lógica está inline no callback `click`,
manipulando `cacheService['cache']` diretamente. A guarda protege exatamente a
ponta que o usuário não alcança e deixa livre a que ele vê e clica. Em produção,
o usuário final tem um botão funcional que corrompe o próprio cache.

Nota adicional: as linhas 345-351 acessam membros privados por bracket notation
(`cacheService['cache']`, `cacheService['saveCache']()`) para contornar o
TypeScript.

**C. `pauseSync()` é uma no-op silenciosa.**
O review acerta que a função não existe no preload nem no main. O que ele não
explica é por que ninguém percebeu:

- As chamadas usam `(window as any).api.pauseSync()`
  (`src/pages/course-detail.ts:58,124`) — o cast `as any` desliga o TypeScript.
- Ambas estão dentro de `try/catch` que só fazem `console.error`.

Resultado: o app não quebra, mas a pausa **nunca acontece**. A proteção contra
concorrência que foi projetada está 100% ausente, e o código *parece* que está
lá. Este é o bug mais instrutivo do projeto — ver seção 6.

**D. Não existe CI para pull requests.**
O único workflow (`.github/workflows/release.yml`) tem triggers
`workflow_dispatch` e push de tag `v*.*.*`. Nenhum PR é verificado.

**E. ~~`download.service.ts` parece ser código morto.~~ REFUTADO.**

Registrado aqui como lição de método, não como achado.

A exploração inicial concluiu que as 492 linhas de
`electron/services/download.service.ts` eram código morto, por não haver nenhum
`import ... from './download.service'` no projeto.

**Está errado.** O arquivo é carregado por **import dinâmico** dentro de
`electron/services/playwright-login.service.ts`:

- linha 763: `const { DownloadService } = await import('./download.service')`
- linha 767: `new DownloadService(localBrowser)`
- linha 835: `downloadService.downloadFile(...)`
- linha 883 e 952: mesmo padrão para `downloadCourseFiles`

É o **fallback Playwright** do download, acionado quando o caminho HTTP puro não
funciona. Ou seja: é o caminho que salva o download quando o principal falha.

A busca por `import ... from` não encontra `await import()`. Uma ferramenta
respondeu com confiança a partir de uma busca incompleta, e o autor do projeto
detectou o erro por conhecer o comportamento real do app.

**Lição:** relatório de agente é hipótese, não fato. Quando o relatório
contradiz o que você sabe sobre o comportamento do sistema, o relatório é o
suspeito. Verificar custa menos que apagar o caminho de fallback do download.

### 2.4 Estado das dependências

Verificado no `package-lock.json`:

| Pacote | Declarado | Instalado | Observação |
|---|---|---|---|
| axios | `^1.13.2` | 1.15.0 | |
| electron | `^30.0.1` | 30.5.1 | **Fora de suporte** — Electron mantém as 3 últimas majors; patches de Chromium não chegam mais |
| vite | `^5.1.6` | 5.4.21 | Duas árvores coexistem: vitest usa vite 8.0.8 internamente |
| vitest | `^4.1.4` | 4.1.4 | Peer range declara vite `^6 \|\| ^7 \|\| ^8` |
| electron-builder | `^24.13.3` | 24.13.3 | |
| playwright | `^1.56.1` | 1.59.1 | |

O `electron` 30 fora de suporte é dívida de segurança relevante para um produto
público: vulnerabilidades de Chromium não recebem mais patch nessa linha.

Os números de vulnerabilidade do review (4 pacotes em produção, 3 high) são de
2026-07-10 e **precisam ser refeitos** — auditorias envelhecem.

### 2.5 Métricas de manutenibilidade

**Ocorrências de `: any`:** 113 no total (78 em `electron/`, 35 em `src/`).
Subestima o real, pois não captura casts `(window as any)`.

Piores: `playwright-login.service.ts` (18), `sigaa.service.ts` (15),
`course-detail.ts` (19), `http-scraper.service.ts` (11), `preload.ts` (8).

O `preload.ts` é o mais crítico dos oito — é a fronteira de confiança, e é
exatamente onde tipagem daria segurança real.

**Dez maiores arquivos:**

| Arquivo | Linhas |
|---|---|
| `electron/services/playwright-login.service.ts` | 1235 |
| `electron/services/http-scraper.service.ts` | 989 |
| `electron/services/sigaa.service.ts` | 623 |
| `src/pages/course-detail.ts` | 588 |
| `electron/services/download.service.ts` | 492 (vivo — fallback Playwright via import dinâmico) |
| `electron/main.ts` | 402 |
| `src/pages/dashboard.ts` | 355 |
| `electron/services/background-sync.service.ts` | 241 |
| `src/pages/settings.ts` | 200 |
| `src/pages/sync-selection.ts` | 190 |

---

## 3. Divergência de priorização em relação ao tracker

O `HARDENING_TRACKER.md` define a ordem: `ARCH-001` → `SEC-001` → `SEC-002` →
`SEC-003` → `DATA-001` → ...

Essa ordem está **correta em termos de dependência técnica**, e será respeitada
dentro da fase de segurança. A divergência proposta é outra: **o que vem antes
de tudo.**

### Argumento para inverter

Começar por `ARCH-001` significa refatorar 9 arquivos que tocam a fronteira
main↔renderer **sem nenhum teste executável para provar que nada quebrou**.
Hoje não existe forma de rodar a suíte em modo não-interativo (achado 2.3.A).

Fazer o pipeline primeiro não adia a segurança — constrói a rede antes de andar
na corda. Além disso:

1. **É o único item que impede a regressão.** Os outros 19 são limpeza pontual.
   Este instala o mecanismo que evita a casa desarrumar de novo.
2. **É pequeno e autocontido.** Não toca código de produção.
3. **Ninguém depende do release hoje.** O custo de pausar a publicação é zero.
4. **É a fase mais didática.** Ver o pipeline recusar um commit ruim ensina mais
   sobre gates do que qualquer explicação.

### Contra-argumento (registrado honestamente)

O tracker adverte: *"tarefas de fases posteriores podem ser pesquisadas antes,
mas sua implementação não deve contornar trabalho incompleto de fronteira de
confiança"*. A Fase 1 aqui proposta não toca a fronteira de confiança, então não
viola a regra. Mas a Fase 2 (bugs) mexe em `http-scraper` e `main.ts` antes do
`ARCH-001`, o que é uma flexibilização consciente.

Justificativa: os bugs da Fase 2 são correções localizadas que **reduzem**
superfície (removem código morto, removem ação dev de produção), não adicionam
canais IPC novos nem ampliam a API do preload. A restrição do tracker existe
para impedir crescimento da superfície, não manutenção corretiva.

---

## 4. O plano

Quatro fases. Cada tarefa é dimensionada para caber em uma sessão e terminar com
o repositório em estado estável e commitável.

---

### FASE 0 — Fundação de processo

*Objetivo: criar os artefatos que fazem o projeto se defender sozinho.*

#### 0.1 — Corrigir os documentos de auditoria

- Atualizar `CODE_REVIEW.md`: marcar o item do teste como resolvido, corrigir a
  contagem de `innerHTML`, remover `notification-store.ts` da lista de afetados.
- Adicionar os 5 achados novos (2.3) ao `HARDENING_TRACKER.md` como tarefas.
- Registrar a mudança de ordem no `Task change log` do tracker.

**Pronto quando:** os dois documentos refletem o estado real de 2026-08-02.

#### 0.2 — Escrever o `CLAUDE.md`

Arquivo na raiz que todo agente lê automaticamente. Deve conter: comandos do
projeto, arquitetura em uma frase, regras invioláveis (nunca `innerHTML` com
dado do SIGAA; nunca `as any` para atravessar IPC; todo canal novo precisa de
tipo e validação), e o que fazer antes de commitar.

**Por que primeiro:** este é o artefato que teria evitado boa parte da bagunça.
Ele codifica seu julgamento num lugar que os agentes herdam.

**Pronto quando:** existe e um agente novo consegue trabalhar no repo sem
repetir os erros conhecidos.

---

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

### FASE 2 — Consertar o que está quebrado

*Prática ensinada: TDD (ciclo vermelho-verde), com bugs reais.*

Ordem interna por impacto no uso diário.

#### 2.1 — Download que apaga arquivos válidos

**O bug:** `http-scraper.service.ts:918-922` assume `.pdf` para conteúdo
desconhecido → linha 926 anexa a extensão → linha 958 valida magic bytes `%PDF`
→ falha → **linha 965 dá `unlink`**. Qualquer `.txt`, `.csv`, `.py` ou `.odt`
servido como `octet-stream` é baixado e imediatamente deletado.

**Correção:** remover o fallback para `.pdf`. Resolver tipo por ordem:
extensão existente segura → `Content-Disposition` → MIME conhecido → magic
bytes. Usar `.bin` quando genuinamente desconhecido. Rejeitar sempre páginas
HTML de login/erro.

**TDD aqui:** escrever primeiro um teste que baixa um `.txt` servido como
`octet-stream` e afirma que o arquivo sobrevive. Ele **deve falhar** antes da
correção. Esse é o ciclo vermelho-verde na sua forma mais clara.

#### 2.2 — Path containment nos downloads

Não existe verificação estrutural de que o arquivo fica dentro do diretório
escolhido. A única defesa é uma lista negra de caracteres
(`http-scraper.service.ts:933`), que na prática bloqueia traversal simples mas
é frágil e incidental.

**Correção:** validar com `path.resolve` + `path.relative`. Escrever em `.part`
e renomear atomicamente.

#### 2.3 — Remover o `[Dev] Simular Arquivo Novo` de produção

Guardar as três pontas (tray, preload, handler). Remover o acesso a membros
privados por bracket notation.

#### 2.4 — Remover o `pauseSync()` morto

**Decisão tomada (Bruno, 2026-08-02): remover.**

Razão declarada: a função nunca foi usada de fato e a ausência nunca foi
sentida. Implementar de verdade é o `CONC-001` (coordenador de operações
Playwright), que é trabalho grande e pertence à Fase 3.

Escopo: remover as chamadas em `src/pages/course-detail.ts:58,124` e os
`try/catch` que as envolvem. Registrar no `CONC-001` que a proteção contra
concorrência está ausente e é conhecida.

Princípio: código que mente sobre o que faz é pior que código ausente. Remover
torna o débito visível.

**Nota de risco:** a condição de corrida que o `pauseSync` deveria evitar
continua existindo — sync em background e ação do usuário podem navegar a mesma
página Playwright ao mesmo tempo. A remoção não piora nada (a proteção já não
funcionava), mas o `CONC-001` deixa de ser opcional para um produto público.

#### 2.5 — ~~Remover `download.service.ts`~~ CANCELADA

O arquivo não é código morto — ver seção 2.3.E. É o fallback Playwright do
download, carregado por import dinâmico. **Não remover.**

Ação substituta, pequena: adicionar um comentário no topo de
`download.service.ts` explicando quem o carrega e quando, para que a próxima
busca estática não chegue à mesma conclusão errada.

**Marco:** o app não tem mais bugs conhecidos que afetam o uso diário.

---

### FASE 3 — Fronteiras de confiança

*Prática ensinada: trust boundaries, design de contratos, defesa em camadas.*

Aqui a ordem do tracker é respeitada integralmente, porque as dependências são
reais.

#### 3.1 — `ARCH-001` — contratos compartilhados
#### 3.2 — `SEC-001` — sanitização + CSP
#### 3.3 — `SEC-002` — preload tipado e validado
#### 3.4 — `SEC-003` — política de navegação
#### 3.5 — `DATA-001` — identidade de conta
#### 3.6 — `DATA-002` — logout e clear-all
#### 3.7 — `CONC-001` — coordenador Playwright

Detalhamento de cada uma já existe no `HARDENING_TRACKER.md`. Serão expandidas
individualmente quando chegarmos nelas — detalhar agora seria planejamento
especulativo, já que as decisões da Fase 3 dependem do que aprendermos nas
fases anteriores.

**Marco:** o app deixa de ser inseguro por construção.

---

### FASE 4 — Prontidão para distribuição

*Só faz sentido depois da Fase 3.*

- `DEP-001` — atualizar dependências (ver débito registrado abaixo)
- `OBS-001` — logging com redação e rotação
- `A11Y-001` — acessibilidade (`lang="pt-BR"`, semântica, foco)
- `PORTAL-001..005` — adaptador de compatibilidade e canário
- `REL-001` — assinatura de código (**custa dinheiro** — certificado de code
  signing para Windows)

**Marco:** produto público de verdade.

### Débitos técnicos aceitos conscientemente

Registrados no formato da seção 6: o quê, por quê, e o que faz voltar.

#### DÉBITO-01 — Electron 30 fora de suporte

- **O quê:** o projeto roda Electron 30.5.1. O Electron mantém apenas as três
  majors mais recentes; vulnerabilidades de Chromium não recebem mais patch
  nesta linha.
- **Por quê adiado:** atualizar Electron muda a versão do Chromium embutido, e o
  scraper depende de comportamento de navegador (Playwright, cookies, sessão
  JSF). Risco real de quebrar o núcleo funcionante sem testes que provem o
  contrário.
- **Gatilho de reavaliação:** assim que a Fase 1 estiver completa e existir
  suíte executável em CI. Com testes rodando, a atualização passa a ser
  verificável em vez de apostada. **Obrigatório antes de qualquer distribuição
  pública ampla** — não é aceitável entregar Chromium sem patch a terceiros.
- **Mitigação nesse meio-tempo:** o app tem superfície de ataque reduzida
  enquanto é uso pessoal e navega apenas para `si3.ufc.br`. Depois do `SEC-003`
  (política de navegação), a superfície cai mais.

#### DÉBITO-02 — Sem assinatura de código

- **O quê:** binários Windows não assinados; SmartScreen alerta na instalação.
- **Por quê adiado:** certificado custa centenas de dólares/ano e o projeto é
  open source sem receita.
- **Gatilho de reavaliação:** se aparecerem usuários externos em número que
  justifique, checar programas de certificado gratuito/subsidiado para open
  source.
- **Mitigação:** checksums SHA-256, build público e auditável via Actions, e
  README honesto em vez de instruir o usuário a ignorar o aviso. Ver 5.2.

#### DÉBITO-03 — Sem proteção contra concorrência no Playwright

- **O quê:** sync em background e ação do usuário podem navegar a mesma página
  Playwright simultaneamente. O `pauseSync` que deveria evitar isso nunca
  existiu de fato e será removido na tarefa 2.4.
- **Por quê adiado:** a solução correta é o `CONC-001` (coordenador de operações
  com `AbortSignal`), que é trabalho de Fase 3.
- **Gatilho de reavaliação:** obrigatório na Fase 3. Sobe de prioridade
  imediatamente se aparecer qualquer bug de sincronização corrompendo dados.
- **Mitigação:** nenhuma. O risco existe hoje e é conhecido.

---

## 5. Decisões tomadas

Registradas em 2026-08-02, por Bruno.

| # | Decisão | Escolha | Consequência |
|---|---|---|---|
| 1 | `pauseSync` | **Remover** | Nunca foi usado, ausência nunca sentida. `CONC-001` vira débito explícito na Fase 3 |
| 2 | `download.service.ts` | **Manter** | Não é código morto — é o fallback Playwright. Achado refutado (2.3.E) |
| 3 | ESLint | **Estrito** | "Se temos tipagem estrita, é pra usar." Ver 5.1 abaixo |
| 4 | Electron 30 | **Adiar para Fase 4** | Risco de quebrar o scraper. Registrado como débito de segurança |
| 5 | Assinatura de código | **Não comprar** | Projeto open source. `REL-001` muda de escopo — ver 5.2 |

### 5.1 — Consequência do ESLint estrito

A escolha é a certa pelo motivo certo: TypeScript com 113 `any` é JavaScript com
etapa extra de build. Mas ela tem um custo que precisa estar dito antes de
começar, para não virar surpresa no meio.

Ligar `@typescript-eslint/no-explicit-any` como erro em todo o projeto **quebra o
build imediatamente em 113 lugares**, mais os casts `(window as any)` que a
contagem nem captura. Corrigir todos de uma vez é uma refatoração enorme, sem
testes ainda existindo para provar que nada quebrou — exatamente o cenário que a
Fase 1 quer evitar.

**Proposta de execução — estrito por zona, não permissivo em geral:**

1. **Erro desde o início** em código de fronteira e código novo:
   `electron/preload.ts`, `electron/main.ts` (handlers IPC), `shared/**` (quando
   existir), e todo arquivo criado a partir de agora.
2. **Aviso** no resto do código existente — visível, contado, mas não bloqueia.
3. **Regra de catraca:** o número de avisos só pode cair. Cada tarefa futura que
   tocar um arquivo o deixa mais limpo do que encontrou.
4. **Proibição absoluta desde já**, como erro em qualquer lugar: `as any` em
   chamada de IPC. Foi o mecanismo exato que escondeu o bug do `pauseSync`
   (seção 6).

Isso é estrito onde importa e não trava o projeto. A alternativa — erro em tudo
— é honesta, mas transforma a Fase 1 numa refatoração de 113 pontos antes de
existir qualquer teste.

**A decidir junto:** aceita a execução em zonas, ou prefere erro em tudo desde o
primeiro dia?

### 5.2 — Assinatura de código e o que fazer no lugar

Decisão de não comprar certificado: aceita. Um certificado de code signing para
Windows custa na ordem de centenas de dólares por ano, e projeto open source
sem receita não justifica.

Mas isso não elimina o problema que o `REL-001` existia para resolver. Sem
assinatura, o Windows SmartScreen mostra "O Windows protegeu seu computador" e o
usuário precisa clicar em "Mais informações" → "Executar assim mesmo".

Hoje o `README.md` instrui exatamente isso. E aí está o problema real: **você
está treinando seus usuários a ignorar avisos de segurança do sistema
operacional.** Para um app que pede as credenciais do SIGAA deles, isso é um
péssimo hábito de instalar — é o mesmo passo que um malware pediria.

`REL-001` muda de escopo. Em vez de assinatura, passa a ser:

- **Checksums SHA-256** publicados em cada release, permitindo que o usuário
  verifique que o binário não foi adulterado.
- **Build reproduzível e público** — o instalador sai do GitHub Actions, com log
  público mostrando de qual commit veio. Isso é uma forma de confiança que
  assinatura paga não dá: qualquer um pode auditar a origem.
- **README honesto** — explicar *por que* o aviso aparece, o que o usuário pode
  verificar antes de aceitar, e que o código é auditável. Diferente de mandar
  clicar em "executar assim mesmo" sem contexto.
- **Reavaliar depois:** se o projeto ganhar usuários reais, existem programas de
  certificado gratuito ou subsidiado para open source. Vale checar quando/se
  chegar lá.

Isso é um resultado melhor que o original, não um consolo. Transparência
verificável vale mais que um selo comprado.

---

## 6. Nota de método — o que é um "ticket" e onde anotar débito

Pergunta que surgiu ao decidir adiar o Electron 30: *"isso que seria um ticket?
ou esses sistemas são só em grupo, não em projetos pessoais?"*

**Sim, é exatamente isso — e não, não é só para times.**

Um *ticket* (ou *issue*) é uma unidade de trabalho registrada fora da sua
cabeça, com contexto suficiente para alguém retomá-la depois sem reconstruir o
raciocínio. O "alguém" pode ser você daqui a três meses, ou um agente numa
sessão nova. Em time, o ticket coordena pessoas. Sozinho, ele coordena **você
com o seu eu futuro** — que, para efeitos práticos, é outra pessoa: não lembra
por que a decisão foi tomada nem o que já foi descartado.

Para projeto pessoal com tempo variável, o ticket é *mais* importante, não
menos. Time tem reunião e conversa de corredor para recuperar contexto. Você
não tem. Se voltar daqui a dois meses sem registro, você relê o código tentando
adivinhar a própria intenção — que é justamente como o `pauseSync` sobreviveu.

### O que já existe aqui

Você já tem um sistema de tickets, mesmo sem chamar assim: o
`HARDENING_TRACKER.md` é um. Ele tem tudo que um bom ticket precisa —
identificador estável (`ARCH-001`), status, prioridade, dependências, arquivos
afetados, critérios de aceitação e comando de verificação. Isso é melhor que a
maioria dos tickets de Jira que se vê por aí.

A escolha, então, não é "usar tickets ou não", é **onde**:

| Opção | Vantagem | Custo |
|---|---|---|
| Markdown no repo (atual) | Versionado junto do código, agente lê direto, funciona offline | Sem notificação, sem filtro, ruim para muitos itens |
| GitHub Issues | Vinculável a PR e commit, filtrável, aberto a contribuidores | Sai do repo; agente precisa de ferramenta para ler |
| Ambos | Markdown para plano, Issues para itens acionáveis | Duplica esforço; risco de divergirem |

**Recomendação:** manter markdown enquanto for só você. Migrar para Issues no
dia em que aparecer o primeiro contribuidor externo — aí a vinculação com PR e
a visibilidade pública passam a valer o custo. Antes disso, Issues seriam
cerimônia sem benefício.

### Onde anotar débito conhecido

Débito técnico aceito conscientemente (como o Electron 30 adiado) precisa de
três coisas registradas, senão vira só esquecimento:

1. **O que** está pendente
2. **Por que** foi adiado — a razão importa mais que o item
3. **O que faria voltar** — o gatilho de reavaliação

Sem o item 3, débito nunca é pago; fica só acumulando. "Adiar até a Fase 4" é
gatilho. "Adiar até ter usuários externos" é gatilho. "Depois eu vejo" não é.

### Nomenclatura que vai aparecer

- **Issue / ticket** — unidade de trabalho registrada
- **Backlog** — a fila de tickets ainda não iniciados
- **Débito técnico** — atalho consciente que você se compromete a pagar depois.
  Débito *inconsciente* é só bug
- **Definition of done** — a frase que define "pronto". Seu tracker chama de
  `Acceptance criteria`
- **Triagem** — decidir prioridade e se o item entra no backlog

---

## 7. Anexo — o bug mais instrutivo do projeto

Vale estudar o `pauseSync()` com atenção, porque ele é um caso didático completo
de como um erro sobrevive.

```ts
// src/pages/course-detail.ts:124
try {
  (window as any).api.pauseSync()
} catch (e) {
  console.error(e)
}
```

Três mecanismos de defesa falharam em sequência:

1. **`as any` desligou o TypeScript.** O compilador sabia que `pauseSync` não
   existe em `window.api`, mas o cast mandou ele calar a boca.
2. **O `try/catch` engoliu o erro de runtime.** O `TypeError` acontece, é
   capturado, vira uma linha no console que ninguém lê.
3. **Não havia teste.** Nada exercitava esse caminho.

O resultado é a pior categoria de bug: **código que parece implementar uma
proteção e não implementa nada.** Um leitor do código — inclusive você, daqui a
seis meses — concluiria que a concorrência está tratada.

As lições generalizam:

- `as any` não é atalho de tipagem, é desligar o verificador. Toda vez que
  aparecer, ele está escondendo algo.
- `try/catch` que só loga é quase sempre um bug. Ou o erro importa (e precisa
  ser tratado ou propagado), ou não importa (e o `try` não deveria existir).
- Teste não serve só para provar que o código funciona. Serve para provar que
  ele **existe** e é chamado.

Esse é o padrão que a Fase 1 previne estruturalmente: com `lint` proibindo `any`
em código de fronteira e CI rodando testes, essa combinação não passa.
