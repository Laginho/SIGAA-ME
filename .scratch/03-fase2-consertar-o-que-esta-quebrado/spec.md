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
