# REL-001 — Sign and verify Windows releases
Status: open
Priority: P1
Blocked by: QA-001
Tracker status at migration: `NOT STARTED` — **ESCOPO ALTERADO 2026-08-02**

- Owner: —
- Dependencies: `DEP-001`, `QA-001`

> **Decisão (Bruno, 2026-08-02): não comprar certificado de assinatura.**
> Projeto open source sem receita; certificado de code signing para Windows custa
> centenas de dólares por ano.
>
> **Mas o problema que esta tarefa resolvia não desaparece.** Sem assinatura, o
> SmartScreen alerta, e hoje o `README.md` instrui o usuário a clicar em "Mais
> informações" → "Executar assim mesmo". Para um app que pede as credenciais do
> SIGAA, isso treina o usuário a ignorar avisos de segurança do sistema
> operacional — o mesmo passo que um malware pediria.
>
> **Escopo substituto:**
> - Checksums SHA-256 publicados em cada release.
> - Build público e auditável via GitHub Actions, com log mostrando de qual
>   commit o binário saiu. É uma forma de confiança que assinatura paga não dá:
>   qualquer um pode verificar a origem.
> - README honesto: explicar por que o aviso aparece, o que pode ser verificado
>   antes de aceitar, e que o código é auditável. Em vez de mandar clicar em
>   "executar assim mesmo" sem contexto.
> - Reavaliar se aparecerem usuários externos: existem programas de certificado
>   gratuito ou subsidiado para open source.
>
> Os critérios de aceitação abaixo que mencionam assinatura ficam suspensos até
> essa reavaliação.
- Primary files:
  - `.github/workflows/release.yml`
  - `electron-builder.json5`
  - `package.json`
  - `README.md`
  - `RELEASE_GUIDE.md`

#### Required workflow

1. Quality job.
2. Package job.
3. Sign-and-verify job.
4. Checksum generation.
5. Publish job dependent on all previous jobs.

#### Acceptance criteria

- CI uses `npm ci`.
- Published installer and portable executable have a verified expected
  publisher signature.
- CI fails on unsigned or unexpectedly signed artifacts.
- Release includes SHA-256 checksums.
- README no longer tells users to bypass SmartScreen.
- Signing secret setup, rotation, and revocation are documented.

#### Verification

```text
npm run quality
npm run package:win
Get-AuthenticodeSignature <artifact>
```

#### Implementation notes

- Commit: —
- Signing provider/publisher: —
