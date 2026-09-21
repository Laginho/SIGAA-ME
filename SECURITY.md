# Política de segurança

## Reportar uma vulnerabilidade

Não abra issue pública. Use
[Security advisories](https://github.com/Laginho/SIGAA-ME/security/advisories/new)
do próprio repositório.

Inclua o passo a passo para reproduzir, a versão do app e o que você conseguiu
acessar. Resposta em até 7 dias.

## Escopo

Este app faz login no portal da sua universidade com as suas credenciais e
guarda dados acadêmicos no seu disco. Interessa em especial:

- vazamento de credencial ou de cookie de sessão (log, dump de diagnóstico,
  arquivo em `userData`, canal IPC);
- execução de conteúdo do SIGAA no renderer (o portal é entrada não confiável:
  nome de disciplina, nome de arquivo, corpo de notícia);
- ampliação da superfície IPC que permita ao renderer chamar canal arbitrário.

Fora de escopo: vulnerabilidades do próprio `si3.ufc.br`. Reporte à UFC.

## O que nunca deve entrar num commit

Credencial, cookie, ViewState, dump de página real do portal ou arquivo baixado
do portal. O `.gitignore` cobre os caminhos conhecidos (`debug_*`,
`verification_*`, `.env`, `.test-user-data*`), mas ele não protege senha escrita
dentro de um `.ts`.

Credencial vem de `process.env` **sem valor padrão**. Um `||` com fallback
transforma erro de configuração em credencial permanente — foi exatamente assim
que um par usuário/senha real ficou no histórico público deste repositório até
2026-09-21, quando o histórico foi reescrito. Detalhes em
[CONTRIBUTING.md](CONTRIBUTING.md).
