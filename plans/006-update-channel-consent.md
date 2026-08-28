# Plan 006: Put a human back in the update loop, and make the release docs tell the truth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 700de9a..HEAD -- electron/main.ts RELEASE_GUIDE.md README.md electron-builder.json5`
> On any change, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (worst case: users update manually for one cycle)
- **Depends on**: none
- **Category**: security + docs
- **Planned at**: commit `700de9a`, 2026-08-28

## Why this matters

The binaries are unsigned (a recorded decision — tracker `REL-001` chose
SHA-256 checksums over a paid certificate). But the auto-update channel is
**fully automatic**: `checkForUpdatesAndNotify()` runs on every launch with
`electron-updater`'s default `autoDownload = true`, then offers one-click
install. The only integrity control is a checksum published by the same GitHub
account that publishes the binary — so anyone with write access to the
repository's Releases (leaked token, compromised account) silently ships code
to every installed copy. `REL-001`'s decision covers a user consciously
downloading version 1; it does not cover an unattended channel replacing the
app afterwards. The smallest honest mitigation is consent: never download or
install an update without the user explicitly saying yes, and tell them what
version they are accepting.

Second, related doc bug: electron-builder creates releases as **drafts**
(`releaseType: "draft"`), `electron-updater` only sees *published* releases,
and neither `RELEASE_GUIDE.md` nor `README.md` mentions the manual
publish-the-draft step — so the documented flow produces updates that no
installed client will ever receive, with no error anywhere. The draft default
is a good safety feature; the docs are what must change.

## Current state

Relevant files:

- `electron/main.ts` — updater wiring (all of it), lines ~376-404.
- `electron-builder.json5` — `publish` block (do NOT change it):

```json5
"publish": {
  "provider": "github",
  "owner": "Laginho",
  "repo": "SIGAA-ME",
  "releaseType": "draft"
}
```

- `RELEASE_GUIDE.md` — documents the workflow_dispatch release flow; claims
  that ticking the `publish` input means the release reaches auto-update.
- `README.md` — line ~31 states the app updates itself automatically in the
  background when a new version is released.

The updater code today (`electron/main.ts:376-404`, inside the `whenReady`
callback; `autoUpdater` imported from `electron-updater` at `:6`):

```ts
// Update Management
autoUpdater.on('update-available', () => {
  console.log('[Updater] Update available!');
});
autoUpdater.on('update-not-available', () => {
  console.log('[Updater] App is up to date.');
});
autoUpdater.on('error', (err) => {
  console.error('[Updater] Update error:', err);
});
autoUpdater.on('update-downloaded', () => {
  console.log('[Updater] Update downloaded. Preparing to install...');
  dialog.showMessageBox({
    type: 'info',
    title: 'Atualização Disponível',
    message: 'Uma nova versão do SIGAA-ME foi baixada. O aplicativo será reiniciado para instalar a atualização.',
    buttons: ['Reiniciar e Instalar', 'Mais Tarde']
  }).then(result => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.checkForUpdatesAndNotify().catch(err => {
  console.error('Failed to check for updates:', err);
});
```

Note: with `electron-updater` defaults, `checkForUpdatesAndNotify()` both
checks AND downloads (`autoUpdater.autoDownload` defaults to `true`) — the
user's first involvement is after the binary is already on disk.

Also relevant: the settings field `autoDownloadUpdates`
(`shared/ipc.ts:116`) governs **course-file** downloads in background sync,
NOT app updates, despite the name. Do not wire it to the updater in this plan
(renaming/ repurposing a persisted setting is a migration, out of scope) —
but the doc step mentions the distinction.

Repo conventions (`CLAUDE.md`): documents that lie are treated as worse than
missing documents (see `PIPE-001` notes in `docs/HARDENING_TRACKER.md` — the
`RELEASE_GUIDE` was already rewritten once for exactly this reason). Match the
existing PT-BR wording style of user-facing dialog strings.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npx vitest run`   | all pass            |
| Full gate | `npm run quality`  | passes, lint ≤115 warnings |

## Scope

**In scope**:

- `electron/main.ts` (only the updater block quoted above)
- `RELEASE_GUIDE.md`
- `README.md` (only the auto-update claim)

**Out of scope**:

- `electron-builder.json5` — the `draft` default stays; it is the safety
  feature the docs must describe.
- `.github/workflows/release.yml` — protected directory (see tracker
  `PIPE-001` notes: agents cannot write workflows here); no change needed
  anyway.
- Signed update manifests (minisign/cosign over `latest.yml`) or GitHub
  artifact attestations — the durable fix, deliberately deferred to an
  author decision; recorded in Maintenance notes.
- The `autoDownloadUpdates` setting and any new settings UI.
- `shell.openExternal` — do not introduce it; the codebase deliberately has
  zero uses and no navigation policy yet (tracker `SEC-003`).

## Git workflow

- Branch: `advisor/006-update-channel-consent`
- Suggested commits (two):
  `fix: require explicit consent before downloading an update` and
  `docs: document the draft-then-publish release step`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Disable automatic download

In `electron/main.ts`, immediately before the `// Update Management` block:

```ts
// Unsigned binaries + automatic install = anyone with write access to the
// GitHub Releases page ships code to every install. Consent first.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Ask before downloading

Replace the `update-available` handler with a consent dialog. The event
carries an `UpdateInfo` — show the version:

```ts
autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Atualização Disponível',
    message: `Uma nova versão do SIGAA-ME está disponível (${info.version}). Deseja baixá-la agora?`,
    detail: 'O download vem do GitHub Releases do projeto. Nada será instalado sem a sua confirmação.',
    buttons: ['Baixar', 'Agora não'],
    cancelId: 1
  }).then(result => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate().catch(err => {
        console.error('[Updater] Download failed:', err);
      });
    }
  });
});
```

Type the `info` parameter properly — import the type if needed
(`import type { UpdateInfo } from 'electron-updater'`); do NOT use `any`
(this file is in the strict lint zone).

Keep the existing `update-downloaded` handler unchanged — it is already a
consent dialog for the install step.

**Verify**: `npx tsc --noEmit` → exit 0; `npx eslint electron/main.ts` →
0 errors, no new warnings.

### Step 3: Check without downloading

Replace the final call:

```ts
autoUpdater.checkForUpdatesAndNotify().catch(err => { ... });
```

with

```ts
autoUpdater.checkForUpdates().catch(err => {
  console.error('Failed to check for updates:', err);
});
```

(`checkForUpdatesAndNotify` shows its own OS notification and, with
autoDownload off, would half-duplicate the new dialog flow;
`checkForUpdates` + the Step 2 handler is the single path.)

**Verify**: `grep -n "checkForUpdatesAndNotify" electron/` → 0 hits.

### Step 4: Fix the release docs

In `RELEASE_GUIDE.md`, in the section describing the `publish` workflow input,
add the missing final step (match the guide's existing tone and PT-BR):

- State explicitly: marking `publish` makes electron-builder create a
  **rascunho (draft)** no GitHub Releases — `releaseType: "draft"` em
  `electron-builder.json5`. O auto-update lê apenas releases **publicadas**;
  um rascunho é invisível para quem já tem o app.
- Add the step: GitHub → Releases → abrir o rascunho → conferir os artefatos
  e o `latest.yml` → **Publish release**. Só a partir daí o updater dos
  usuários enxerga a versão.
- Note the new client behavior from Steps 1–3: o app pergunta antes de baixar
  e antes de instalar; ninguém recebe update silencioso.

In `README.md`, soften the automatic-update claim (~line 31) to match
reality: the app **checks** for updates on launch and asks before downloading
and installing.

**Verify**: `grep -n "draft\|rascunho" RELEASE_GUIDE.md` → at least 1 hit;
`grep -ni "automaticamente em segundo plano" README.md` → 0 hits.

### Step 5: Full gate

**Verify**: `npm run quality` → exit 0, lint 0 errors / ≤115 warnings.

## Test plan

No automated test: `main.ts` is not importable under vitest (it executes
Electron bootstrapping at module load), and the updater flow needs a packaged
build against a real release feed. Compensating verifications:

- The grep-based done criteria below (no `checkForUpdatesAndNotify`,
  `autoDownload = false` present).
- Manual verification note for the owner (put it in your report): run a
  packaged build with an older version number against the published releases
  and confirm the consent dialog appears BEFORE any download traffic.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0
- [ ] `grep -n "autoDownload = false" electron/main.ts` → 1 hit
- [ ] `grep -rn "checkForUpdatesAndNotify" electron/` → 0 hits
- [ ] `grep -n "downloadUpdate" electron/main.ts` → 1 hit, inside the
      consent dialog's then-handler
- [ ] No `any` added (`npx eslint electron/main.ts` → no new warnings)
- [ ] `RELEASE_GUIDE.md` documents the draft→publish step
- [ ] No modified files outside the in-scope list (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The updater block in `main.ts` doesn't match the excerpt (drift).
- The installed `electron-updater` version's `UpdateInfo`/`downloadUpdate`
  API differs from what Step 2 assumes (check
  `node_modules/electron-updater/out/*.d.ts` if the typecheck fails).
- You are tempted to change `electron-builder.json5` or anything under
  `.github/workflows/` — both are explicitly out of scope.

## Maintenance notes

- **Deferred author decision (the durable fix)**: authenticity, not just
  consent — options are (a) a detached minisign/cosign signature over
  `latest.yml`, generated in the release workflow and verified in the
  `update-downloaded` handler before enabling "Instalar", or (b) GitHub
  artifact attestations. Both need key/trust management; neither is worth
  doing before the first external users (`REL-001`'s trigger). A consent
  dialog does NOT protect a user who clicks yes on a malicious release.
- One of the five known high-severity production advisories (`DEP-001`) is in
  `builder-util-runtime` via `electron-updater` — the same update path; when
  `DEP-001` runs, that package rides along.
- Reviewer: confirm the quit path — `quitAndInstall()` goes through the
  `before-quit` handler, which plan 001 gives a 5s teardown timeout; without
  plan 001, a wedged browser can still block an install.
- The misleadingly-named `autoDownloadUpdates` setting (course files, not app
  updates) is untouched; renaming it is a persisted-settings migration for
  whoever takes tracker `ARCH-001`/`DATA-001`.
