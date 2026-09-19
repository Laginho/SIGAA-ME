# Auditoria `e3d29e6` — spec

Fonte: `docs/audits/2026-09-19-e3d29e6.md` (GPT-6, Not approved: 2 Broken,
1 Slop). Os dois achados funcionais foram reconferidos contra o código em
2026-09-19: no popup do fallback de download, `await popup.reload()` rejeita
com `net::ERR_ABORTED` quando o próprio reload vira download, e o `catch`
fecha o popup antes de consumir a espera de `download` que já resolveu. Em
`getNewsDetail`, a estratégia 4 aceita qualquer bloco de mais de 20
caracteres dentro de `#conteudo` como corpo, e a guarda final só falha quando
título **e** corpo estão vazios: página de manutenção vira notícia com
`success: true`, e título sem corpo também.

Corte em 2 tickets, independentes.

| NN | ID | Achado | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | BUG-026 | Broken: extrator aceita página de manutenção ou título sem corpo como notícia | P1 | — | agent |
| 02 | DL-010 | Broken: reload do popup que vira download é tratado como falha e descarta o arquivo | P2 | — | agent |

Fora do corte, e por quê:

- `playwright-login.service.ts` com 1.103 linhas: mesma decisão das quatro
  auditorias anteriores; o próprio auditor diz que não bloquearia aprovação.
- `CONTRIBUTING.md`, piso de cobertura, assinatura, teto de warnings: decisões
  em `08-audit-dae3672/spec.md`.
- Regressão do download com servidor local e Chrome real, como o auditor pede:
  fica fora. O teste unitário com Page falsa reproduz a sequência exata
  (`reload` rejeita, evento de download resolve) e é o padrão dos quatro
  testes de download já existentes.

## Problem Statement

1. Depois do clique na notícia, o extrator não confere se o documento é uma
   notícia. Manutenção, sessão expirada ou deriva de layout viram
   `success: true` com o texto do aviso como corpo, e `course-detail` grava
   isso no cache offline. O BUG-025 só corrigiu o lote para detalhes que
   **declaram** falha; esse não declara.
2. A estratégia de popup do fallback instala rota que força attachment e
   recarrega. Quando o reload dispara o download, a navegação rejeita; o
   `catch` fecha o popup e devolve "Could not force download from popup" sem
   chamar `saveAs`. É exatamente o caminho de recuperação que o fallback
   promete, e ele nunca salva.

## Solution

1. `getNewsDetail` só devolve `success: true` quando título **e** corpo vêm de
   uma estrutura reconhecida (estratégias 1 a 3). A estratégia 4 ("maior bloco
   de texto") deixa de ser prova de notícia: se só ela achou algo, o método
   salva o diagnóstico e devolve `success: false`. Título sem corpo também é
   falha. O lote (`BUG-025`) e o botão já tratam `success: false`; nenhum
   consumidor muda.
2. O reload e a espera de download são aguardados juntos. Rejeição do reload
   é ignorada quando a espera de download resolve; se a espera falhar (timeout
   ou fechamento), o erro real é o que sai. `saveAs` e `finalizeDownload`
   rodam antes de `popup.close()`, como hoje no caminho que nunca era
   alcançado.

## User Stories

1. Como aluno, quero que uma notícia cujo texto o portal não entregou apareça
   como erro, e não como uma notícia cujo corpo é "Sistema temporariamente
   indisponível".
2. Como aluno, quero que o corpo salvo de antes sobreviva a um sync em que o
   portal devolveu página de manutenção.
3. Como aluno, quero que um arquivo que o SIGAA só entrega depois do
   recarregamento do popup chegue na minha pasta em vez de falhar.
4. Como autor, quero que os dois consertos não mudem o caminho feliz:
   notícia com tabela título/texto e download direto continuam iguais.

## Implementation Decisions

### BUG-026 — notícia

1. **Não reconhecer "a estrutura do detalhe" por inteiro.** O auditor pede
   validação explícita da página; a fixture real mostra que o layout deriva
   e endurecer demais troca cache errado por sync que falha. O suficiente:
   corpo só conta se veio de seletor reconhecido, e título é obrigatório.
2. **Estratégia 4 vira diagnóstico, não sucesso.** O `evaluate` devolve de
   onde o corpo veio (`source`); se for o fallback de maior bloco, o serviço
   grava o HTML em `diagnosticsService.saveRaw` e devolve falha com mensagem
   própria. Alternativa descartada: remover a estratégia 4, porque o HTML
   salvo é o que vai mostrar a próxima deriva de layout.
3. **Mensagem de erro distinta** para "página não é notícia" e "notícia sem
   corpo", para o log e para o `N de M notícias sem conteúdo` do BUG-025
   apontarem o caso certo. Código de erro continua o que `failFromResult`
   já classifica; nenhum tipo novo em `shared/`.
4. **Teste chama o callback do `evaluate` sob jsdom** com quatro documentos:
   tabela título/texto (ok), manutenção (falha), só título (falha), sessão
   expirada (falha). O `evaluate` da Page falsa executa a função recebida
   contra o `document` do jsdom; o `SigaaService` não entra.

### DL-010 — popup

5. **`Promise.all` com o reload tolerante**, não reordenação. A espera de
   download continua criada antes do `reload()`. O reload ganha `.catch` que
   engole só o caso em que a espera de download resolveu; se a espera também
   rejeitar, o erro dela é o que sobe. Alternativa descartada: `page.on`
   manual, porque `waitForEvent` já tem timeout.
6. **`popup.close()` sempre depois de `saveAs`.** O `finally` que hoje fecha
   no `catch` continua, mas o retorno de sucesso só sai com arquivo
   finalizado.
7. **Teste com Page falsa** no molde de `download-fallback-early-exit`:
   `reload()` rejeita com `Error('page.reload: net::ERR_ABORTED')`,
   `waitForEvent('download')` resolve com um Download falso cujo `saveAs`
   escreve um PDF mínimo. Segundo caso: `reload()` rejeita e a espera dá
   timeout, retorno `success: false` sem rejeição global.
