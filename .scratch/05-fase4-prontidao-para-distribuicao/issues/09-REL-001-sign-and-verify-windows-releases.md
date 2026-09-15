# REL-001: Verificar releases Windows sem assinatura de código
Status: open
Stage: to-implement
Blocked by: nenhum
Review: human
Priority: P1

- Primary files:
  - `.github/workflows/release.yml` (job `build`: steps depois do `Publish`, `permissions`, path do `upload-artifact`)
  - `README.md` (seção `## 📥 Instalação` e nova seção `## 🔐 Verificando o download`)
  - `RELEASE_GUIDE.md` (seção `## 🛠️ How it works` e nova seção `## ✅ Depois de publicar`)
  - `tests/unit/audit-release-gate.test.ts` (novo `describe`, só a etapa 2 escreve)

> **Histórico.** Aberto como "Sign and verify Windows releases": workflow de
> cinco jobs, assinatura Authenticode verificada no CI, rotação de secret
> documentada. Em 2026-08-02 Bruno decidiu **não comprar certificado**
> (`docs/PLANO.md` §5.2). Os critérios de assinatura saíram deste ticket e
> vivem no `DÉBITO-02`, com o gatilho de reavaliação. O que ficou aqui é o
> escopo substituto, especificado por grilling em 2026-09-15.
>
> O problema que continua: sem assinatura o SmartScreen avisa, e o
> `README.md:28` manda clicar "Mais informações → Executar assim mesmo" sem
> contexto. Para um app que pede credencial do SIGAA, isso treina o usuário a
> ignorar o aviso do sistema, o mesmo passo que um malware pediria.

#### What to build

Quem baixa uma release consegue provar, antes de executar, que o `.exe` é o
que saiu do GitHub Actions a partir do commit da tag: um `SHA256SUMS.txt`
publicado junto dos instaladores e um atestado de proveniência do GitHub sobre
cada `.exe`. O README explica por que o aviso do SmartScreen aparece e ensina a
conferir o arquivo **antes** de dar os cliques, em vez de mandar clicar sem
contexto. O mantenedor tem no `RELEASE_GUIDE.md` os três checks que faz depois
de publicar.

Fatos do pipeline que a implementação precisa respeitar:

- O step `Publish` (`electron-builder --win --publish always`) **empacota de
  novo** e sobrescreve os `.exe` de `release/`. NSIS não é reprodutível byte a
  byte. Hash e atestado só valem se tirados **depois** do `Publish`; assim
  cobrem os dois casos (`publish=false`: arquivos do `Build`; `publish=true`:
  arquivos que subiram).
- O `electron-builder` só sobe os artefatos dele. O `SHA256SUMS.txt` sobe por
  `gh release upload` na draft, cuja tag é `v<versão do package.json>`
  (`vPrefixedTagName` padrão; as releases existentes confirmam: `v1.2.0`).
- `gh` já existe no `windows-latest` e `GH_TOKEN` já está no job.
- O `electron-updater` confere sha512 via `latest.yml` no update automático; o
  checksum manual cobre o **primeiro** download, que é o caso do SmartScreen.

Fora do escopo, decidido: eliminar a recompilação do `Publish` (`PIPE-004`
aceitou de propósito); trocar o publish por `softprops/action-gh-release`;
certificado; qualquer mudança no `electron-updater`; tag ou release descartável
para testar.

#### Acceptance criteria

1. Em `release.yml`, depois do step `Publish` e sem condição, um step gera
   `release/SHA256SUMS.txt` com uma linha `<sha256 em minúsculo>  <nome do
   arquivo>` (dois espaços) para cada `.exe` em `release/`, formato que
   `sha256sum -c` e `Get-FileHash` conferem. Só os `.exe`; não `latest.yml` nem
   `.blockmap`.
2. Depois do step `Publish` e sem condição, `actions/attest-build-provenance`
   roda com `subject-path` cobrindo `release/*.exe`. O job declara
   `id-token: write` e `attestations: write` e mantém `contents: write`.
3. Um step com `if: ${{ inputs.publish }}` sobe `release/SHA256SUMS.txt` na
   draft release da tag `v<versão do package.json>` com
   `gh release upload ... --clobber`, depois dos steps 1 e 2.
4. O artefato `windows-installer` do `upload-artifact` inclui o
   `SHA256SUMS.txt` além dos `.exe`.
5. `README.md`: o passo 4 da Instalação diz que o aviso "O Windows protegeu seu
   computador" aparece porque o app não tem certificado pago, não porque há
   algo errado; aponta para a seção `## 🔐 Verificando o download`; e só depois
   disso dá os cliques "Mais informações → Executar assim mesmo". Nenhuma
   instrução de clicar aparece antes da explicação e do link.
6. `README.md`: nova seção `## 🔐 Verificando o download` logo depois de
   `## 📥 Instalação`, com no máximo dez linhas de corpo: o instalador sai do
   GitHub Actions com log público apontando o commit; `Get-FileHash <arquivo>
   -Algorithm SHA256` comparado com a linha do `SHA256SUMS.txt` da release; e,
   opcional, `gh attestation verify <arquivo> --owner Laginho`. Sem texto além
   disso: a maioria não vai conferir nem o hash, e a seção não pode alongar a
   instalação.
7. `RELEASE_GUIDE.md`: `## 🛠️ How it works` cita que o workflow gera
   `SHA256SUMS.txt` e atestado de proveniência; nova seção
   `## ✅ Depois de publicar` com três checks, um por linha: o hash do `.exe`
   baixado da release bate com o `SHA256SUMS.txt`; `gh attestation verify`
   passa; o run do Actions que publicou aponta para o commit da tag.
8. Os testes da seção abaixo passam, e `npm run quality` verde.

#### Verification

    npm run quality

    # Run manual do workflow na branch, sem publicar:
    gh workflow run release.yml --ref rel-001 -f publish=false
    gh run watch
    gh run download <run-id> -n windows-installer -D _agent_tmp/rel-001

    # No diretório baixado (PowerShell):
    Get-Content .\SHA256SUMS.txt
    Get-FileHash .\SIGAA-ME-Windows-*-Setup.exe -Algorithm SHA256      # bate com a linha acima
    Get-FileHash .\SIGAA-ME-Windows-*-Portable.exe -Algorithm SHA256   # idem
    gh attestation verify .\SIGAA-ME-Windows-*-Setup.exe --owner Laginho
    gh attestation verify .\SIGAA-ME-Windows-*-Portable.exe --owner Laginho

O step do critério 3 (`gh release upload`) **não** roda nesse run, porque a
versão do `package.json` é `1.2.0` e essa tag já é release publicada; criar
uma versão descartável só para testar foi descartado. Ele é provado na
primeira release depois do merge, e a Resolution registra isso como pendente
até lá.

## Tests stage 2 writes (own commit, red)

- `tests/unit/audit-release-gate.test.ts`, novo `describe` "release workflow
  publishes checksums and provenance (REL-001)", no mesmo estilo do arquivo
  (lê o YAML como linhas, compara índices; sem parser YAML):
  - o step que gera `SHA256SUMS.txt` e o `uses: actions/attest-build-provenance@...`
    estão dentro do job `build` e **depois** da linha
    `run: npx electron-builder --win --publish always`; vermelho porque nenhum
    dos dois existe.
  - o bloco `permissions` do job contém `id-token: write` e
    `attestations: write`; vermelho porque hoje só há `contents: write`.
  - a linha com `gh release upload` vem depois de um `if: ${{ inputs.publish }}`
    (o `if` imediatamente anterior ao `run` desse step); vermelho porque o
    step não existe.
  - o `path` do `upload-artifact` inclui `SHA256SUMS.txt`; vermelho porque hoje
    é só `release/**/*.exe`.
- Os testes existentes do `QA-001` no mesmo arquivo continuam verdes: os steps
  novos vêm depois do `Publish`, logo depois de todo gate.

## Comments

- 2026-09-15: especificado por grilling (13 perguntas, todas na recomendação).
  Decisões que não estão no corpo: teste vitest lendo o YAML é o padrão que o
  `QA-001` fixou neste arquivo, por isso não é "teste espelho"; atestado roda
  sempre, e não só no publish, porque é do binário e é o que permite provar o
  step sem publicar; `Review: human` porque o diff muda o pipeline de release e
  o texto que o usuário lê antes de instalar.
