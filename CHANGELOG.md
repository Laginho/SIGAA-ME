# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.3.0](https://github.com/Laginho/SIGAA-ME/compare/v1.2.0...v1.3.0) (2026-09-20)


### Features

* add coverage and audit:prod gates for QA-001 ([14f9e92](https://github.com/Laginho/SIGAA-ME/commit/14f9e929d921973266457335709ef4555cfbed18))
* add PortalCompatibilityService (PORTAL-005) ([19d07c6](https://github.com/Laginho/SIGAA-ME/commit/19d07c6cd4e6ffbe7f4ea0a6e064be92372807cb))
* add writeJsonAtomicSync (DATA-004) ([3518036](https://github.com/Laginho/SIGAA-ME/commit/35180367e4763fbacac2e95c38e84e4675811824))
* background sync registers its own downloads in the renderer index (DL-006) ([f966468](https://github.com/Laginho/SIGAA-ME/commit/f9664684dea9f47434fe8aa4db9015906550ade1))
* bind every persisted store to a one-way account id (DATA-001) ([bc96141](https://github.com/Laginho/SIGAA-ME/commit/bc961413f503c124cfef584d0ee82ac752ec533e))
* classify manutenção e acesso negado como estados próprios (PORTAL-008) ([1ba66cc](https://github.com/Laginho/SIGAA-ME/commit/1ba66cc87879b85e337f50c228de3f8eda11aee4))
* **diagnostics:** add privacy-safe structural diagnostics (PORTAL-003) ([4e1c5e7](https://github.com/Laginho/SIGAA-ME/commit/4e1c5e717ccc078576c9899df7ccc70c1cadb2b9))
* **download:** validação de conteúdo compartilhada e teto de tamanho (DL-002) ([70fcb4b](https://github.com/Laginho/SIGAA-ME/commit/70fcb4bfc81f6cfd83395031fab3ec46b62dd15b))
* expose compatibility status through preload and wire it in main (PORTAL-005) ([76c823c](https://github.com/Laginho/SIGAA-ME/commit/76c823cbeb948f0f1bd8c70632aae2e40e69cfb8))
* gate BackgroundSyncService on the compatibility kill-switch (PORTAL-005) ([160aa91](https://github.com/Laginho/SIGAA-ME/commit/160aa913f401b9c3150f7091fa9ddb7f46b55bc9))
* gate raw HTML dumps behind DiagnosticsService, clean legacy logs (OBS-003) ([24e0048](https://github.com/Laginho/SIGAA-ME/commit/24e0048d52d879ac287108a6546f9fa5b21b3776))
* **ipc:** shared domain models and AppResult contracts (ARCH-001) ([485bf75](https://github.com/Laginho/SIGAA-ME/commit/485bf757aa37ec1f141793a308dfbe8f0f6dab7a))
* **logger:** narrow ScopedLogger to meta?: LogMeta, drop the vararg contract (OBS-005) ([eaa5ef0](https://github.com/Laginho/SIGAA-ME/commit/eaa5ef0e5b59015f4ba32e722266dd480fed1c07))
* **logger:** redacting, rotating, single logger; remove console monkeypatch (OBS-001) ([e08dd3d](https://github.com/Laginho/SIGAA-ME/commit/e08dd3dd23c12c67763203348172ad709e4f4dbf))
* make logout and clear-all real transactions (DATA-002) ([fe0594d](https://github.com/Laginho/SIGAA-ME/commit/fe0594d111a22aa7f470844ba55c3d8974d4ac84))
* publish checksums and provenance for Windows releases (REL-001) ([c645a68](https://github.com/Laginho/SIGAA-ME/commit/c645a68744a7b26a8ada28bf2ca2619969ec7edb))
* route external links through shell.openExternal and pin the window to the app (SEC-003) ([3c7a17b](https://github.com/Laginho/SIGAA-ME/commit/3c7a17b7eb6dbfcdb2348a4f9db39eb2dfa50b0e))
* **services:** migrate the scraping pipeline to the logger (OBS-004) ([44fae3a](https://github.com/Laginho/SIGAA-ME/commit/44fae3abe86196d07b3d38d81487852952d30af9))
* **session:** serialize Playwright work behind a single-slot coordinator (CONC-001) ([9dfeaff](https://github.com/Laginho/SIGAA-ME/commit/9dfeaff0fa3b452d9c4b8f01e4b31be4bd06b5ba))
* show compatibility notice in dashboard and sync-selection (PORTAL-006) ([a8549a0](https://github.com/Laginho/SIGAA-ME/commit/a8549a06ca2b8e6263066b5258add592aa1d6f33))
* **sigaa:** centralizar o adapter de compatibilidade do SIGAA (PORTAL-001) ([#10](https://github.com/Laginho/SIGAA-ME/issues/10)) ([82b0ccf](https://github.com/Laginho/SIGAA-ME/commit/82b0ccf258bc8c96a75ee37300af9946681f6a07))
* stamp operation ids on log lines (OBS-002) ([8a468be](https://github.com/Laginho/SIGAA-ME/commit/8a468bee9975aeb402ed2a4cabe2170552669413))
* **ui:** marcar item como visto ao passar o mouse sobre a bolinha ([49a7c6b](https://github.com/Laginho/SIGAA-ME/commit/49a7c6bc609636398cd5c735229c5fafd918b754))
* upgrade electron out of the vulnerable range (DEP-005) ([a3e3c74](https://github.com/Laginho/SIGAA-ME/commit/a3e3c7490b063422f694c3f9ed975c95e227cbce))
* upgrade electron-builder and electron-updater together (DEP-006) ([c08d948](https://github.com/Laginho/SIGAA-ME/commit/c08d948e46c596d5ca832fe8d5d8a7781a6072c3))
* wire compatibility state into IPC handlers (PORTAL-005) ([93348fc](https://github.com/Laginho/SIGAA-ME/commit/93348fc1f6e12989cfaa23f2c402adf2bd4b6696))


### Bug Fixes

* **a11y:** close the A11Y-001 rework list — dark contrast, modal a11y, flaky test (A11Y-001) ([442f1de](https://github.com/Laginho/SIGAA-ME/commit/442f1defcbc618204c3b4c8165b2466223f9ecd3)), closes [#6b7280](https://github.com/Laginho/SIGAA-ME/issues/6b7280) [#4b5563](https://github.com/Laginho/SIGAA-ME/issues/4b5563)
* **a11y:** fix color-contrast violations and stabilize the axe scan (A11Y-001) ([9a83c26](https://github.com/Laginho/SIGAA-ME/commit/9a83c26ef558fc0e0699bd84739a9c6525c5d9dd))
* **a11y:** label controls, use semantic elements, native dialog (A11Y-001) ([1730807](https://github.com/Laginho/SIGAA-ME/commit/1730807b31a2c89e169d0a4293571392b744536b))
* **a11y:** stop the close-button listener leak on non-button close (A11Y-001) ([173a634](https://github.com/Laginho/SIGAA-ME/commit/173a63484fa0f5aac1209a28f59af5a49c52ec7e))
* **a11y:** theme .progress-text and .back-link:hover for dark contrast (A11Y-003) ([bbee8fd](https://github.com/Laginho/SIGAA-ME/commit/bbee8fd0484e084c2349917ffea8388eaef2a38f)), closes [#444](https://github.com/Laginho/SIGAA-ME/issues/444) [#333](https://github.com/Laginho/SIGAA-ME/issues/333) [#666](https://github.com/Laginho/SIGAA-ME/issues/666)
* address ARCH-001 review corrections ([2b9d459](https://github.com/Laginho/SIGAA-ME/commit/2b9d45929b4f25292e02ec2cac9b6c04f167ae9d))
* always unroute download interceptor after a fallback attempt ([759b726](https://github.com/Laginho/SIGAA-ME/commit/759b7260ebb899678f4fe81297e9bae933f2ab8c))
* anchor cookie domain match to a label boundary (CLEAN-008) ([13e9853](https://github.com/Laginho/SIGAA-ME/commit/13e9853131489db19445be4dd86efe61863ab5cc))
* atomic writes and disk-side syncInterval validation (DATA-004) ([77e7013](https://github.com/Laginho/SIGAA-ME/commit/77e701347325a89edd63a7b4ed45e317940fb0f1))
* attach handler to download-wait promise before awaiting reload (DL-011) ([49b3490](https://github.com/Laginho/SIGAA-ME/commit/49b3490dc620cfc7a0ed4df5bf7675030018f6eb))
* authenticated zero-course portal fails instead of succeeding empty (PORTAL-010) ([b0e170d](https://github.com/Laginho/SIGAA-ME/commit/b0e170d907fc9f8739d23e3917aca6cb40ff4ea3))
* avoid settings reentry after navigation (BUG-024) ([7fdf712](https://github.com/Laginho/SIGAA-ME/commit/7fdf712d7a7a500e3d85ea73df3635f0c6f43d33))
* **background-sync:** persist lastBackgroundSync after delivery (DATA-003) ([1c921e1](https://github.com/Laginho/SIGAA-ME/commit/1c921e146f68accc33ced72e59d3b13d63c0e134))
* batch dedup skips by registered identity, not by path guessing (DL-006) ([37f91d7](https://github.com/Laginho/SIGAA-ME/commit/37f91d7753e56fb661a6864d2989c2d2c18ba0a1))
* bound the download test's own timeout, not just the toast wait (QA-009) ([3c948e9](https://github.com/Laginho/SIGAA-ME/commit/3c948e996195a7f19335f2b19bc1d49fd162296e))
* **cache:** forgetLastFile writes before mutating memory (DATA-003) ([34c6941](https://github.com/Laginho/SIGAA-ME/commit/34c694160947d51da56179304ad98d7b47406742))
* cancel post-sync navigation when route changes (BUG-013) ([781d036](https://github.com/Laginho/SIGAA-ME/commit/781d0369433c0e63ea41fe08969440d9737a697c))
* cap consecutive Playwright fallback failures in downloadAllFiles (DL-008) ([bd3da6e](https://github.com/Laginho/SIGAA-ME/commit/bd3da6ef62bac040a5cc1067e66dae81b2c6b272))
* carry the parsed link url into CourseFile (BUG-014) ([02283c7](https://github.com/Laginho/SIGAA-ME/commit/02283c7237a6e1939fb72c3f8e54fcd4f64ed5ec))
* catch simulateNewFile failure instead of rejecting invoke (BUG-012) ([dfdf4d8](https://github.com/Laginho/SIGAA-ME/commit/dfdf4d8e994d2a76eaa2e8523fa2dc2b9c987d55))
* center news modal dialog with explicit margin: auto (BUG-020) ([c335c5c](https://github.com/Laginho/SIGAA-ME/commit/c335c5c996565bad694592a52cb6b967d7480d55))
* checksum and attest the installers where electron-builder writes them (REL-001) ([7981b6e](https://github.com/Laginho/SIGAA-ME/commit/7981b6ecfc03a02a7fde74d747aad936677dc328))
* classify http: as unconfirmed external, never trusted (BUG-019) ([175a5b2](https://github.com/Laginho/SIGAA-ME/commit/175a5b245243087fa9fb3d67286ca18b06fdf447))
* clean up finalizeDownload placeholder when rename fails (DL-004) ([62669f0](https://github.com/Laginho/SIGAA-ME/commit/62669f0c1796784f30be6a447e9a2af565c45fd3))
* **clear-all:** wipe the log after the scheduler restart so app.log stays gone ([5a073ef](https://github.com/Laginho/SIGAA-ME/commit/5a073ef8fd43401daad1bbb1fa76015b6462df01))
* close A11Y-001 rework-4 (criteria 4, 5, 8) ([375dcf6](https://github.com/Laginho/SIGAA-ME/commit/375dcf67947b4214896a6e63fc6d87384f9e5873))
* compare course header by equality and propagate getCourses failures (PORTAL-007) ([f6651f5](https://github.com/Laginho/SIGAA-ME/commit/f6651f5ce024bbdc4440b95d94d7b2107f6710f4))
* complete the 'Sempre perguntar' label in settings ([28774e6](https://github.com/Laginho/SIGAA-ME/commit/28774e655efb2ac9b3045d2e6ace1e2a10f5dffe))
* containment proof rejected names starting with ".." (DL-001) ([a0c04b6](https://github.com/Laginho/SIGAA-ME/commit/a0c04b64b0f4ee53e00dc92c5fefcef9a28977c7))
* correct stub arg mapping in plano B download logging test (QA-011) ([b4bc854](https://github.com/Laginho/SIGAA-ME/commit/b4bc854c7060b860c8480566267c055552cf009c))
* count drift after re-login retry, dedupe onChange, guard destroyed window (PORTAL-005) ([54dae06](https://github.com/Laginho/SIGAA-ME/commit/54dae0645e60ff33d1df27df980c12e753e8a387))
* dark-theme modal-meta contrast (A11Y-002) ([7f5f1b9](https://github.com/Laginho/SIGAA-ME/commit/7f5f1b96fdeca4f4c081725e4dc7ba4dcaf9139b)), closes [#666](https://github.com/Laginho/SIGAA-ME/issues/666) [#1e293](https://github.com/Laginho/SIGAA-ME/issues/1e293)
* darken .news-notification light-theme text for AA contrast (A11Y-002) ([e31fa3b](https://github.com/Laginho/SIGAA-ME/commit/e31fa3b902d9110f10a86f312f251451e55b2a8e)), closes [#28a745](https://github.com/Laginho/SIGAA-ME/issues/28a745) [#e6f9e9](https://github.com/Laginho/SIGAA-ME/issues/e6f9e9) [#145c33](https://github.com/Laginho/SIGAA-ME/issues/145c33)
* delete the dead href branch and its SEC-004 guard (BUG-019) ([5143761](https://github.com/Laginho/SIGAA-ME/commit/5143761871fea6adc52e6ea1c8be3508bc760632))
* **deps:** upgrade axios to 1.20.0, out of the vulnerable range (DEP-003) ([b29fc46](https://github.com/Laginho/SIGAA-ME/commit/b29fc4637ff3ae95bf86cf567a37221e716ddfd0))
* **diagnostics:** close the four blocking review findings (PORTAL-003) ([2d7cd98](https://github.com/Laginho/SIGAA-ME/commit/2d7cd989b6278a981532994ecb46a557d31b1a23))
* **diagnostics:** redact title, strip session from pathname, cover login drift (PORTAL-003) ([a18346f](https://github.com/Laginho/SIGAA-ME/commit/a18346f8463100b5074a02a6500dfb74098ea5c9))
* don't let popup.reload() rejection short-circuit a real download (DL-010) ([1f5fc1b](https://github.com/Laginho/SIGAA-ME/commit/1f5fc1bb870c8a3c483740e6b5b6612eea382d29))
* **download:** force a fresh download when the cached file cannot be inspected (DL-005) ([1ca9b12](https://github.com/Laginho/SIGAA-ME/commit/1ca9b129293da6bc8a9e104010a21bd3c05eb5e0))
* **download:** nomear pelo conteúdo exige a assinatura inteira (DL-002) ([78f69f1](https://github.com/Laginho/SIGAA-ME/commit/78f69f11a5b5fd89ce795dd03b59f51413c7712c))
* **download:** resolve writer errors per file instead of rejecting the batch (DL-003) ([ca946ac](https://github.com/Laginho/SIGAA-ME/commit/ca946ac88bd1a05cfdc7cdf0c4ee2cc143ac8f80)), closes [#1](https://github.com/Laginho/SIGAA-ME/issues/1)
* drop extension-based ignore rules that hid the QA-011 leak (QA-011) ([3f68462](https://github.com/Laginho/SIGAA-ME/commit/3f684620eed2828dd066b790c256e524a5480728))
* drop the dead fileUrl param from DownloadService.downloadFile (CLEAN-010) ([33420b1](https://github.com/Laginho/SIGAA-ME/commit/33420b1895c7fd20066aaf606fff6b8a01d21338))
* drop the last `as any` api access left over from pauseSync (BUG-002) ([ff1d794](https://github.com/Laginho/SIGAA-ME/commit/ff1d7946827eaea11e8e6f9a4ab4d0f7704b47f3))
* emit checksums in the two-space format the criterion asks for (REL-001) ([906682d](https://github.com/Laginho/SIGAA-ME/commit/906682dd1f12657516232adf044c7e4c0531c4af))
* enforce download root and path containment (DL-001) ([d759d16](https://github.com/Laginho/SIGAA-ME/commit/d759d16dea791a91936064d97ad17aff1ae2d153))
* extract JSF file ids without the trailing quote and heal old cache ids (BUG-009) ([07b6226](https://github.com/Laginho/SIGAA-ME/commit/07b6226cb460ef32602841b8791fa5564827720a))
* extract the course list from HTML and never accept a partial list (PORTAL-013) ([fdac083](https://github.com/Laginho/SIGAA-ME/commit/fdac08325de9467f767cf610f2f74a8ad4ef7885))
* finalize downloads with exclusive-create + rename instead of link (DL-004) ([5e91d2b](https://github.com/Laginho/SIGAA-ME/commit/5e91d2b78deb87ab1961af571e5974b259cab462))
* fixed overlay covers viewport regardless of page scroll (BUG-021) ([fde58e8](https://github.com/Laginho/SIGAA-ME/commit/fde58e843e8e25686487db61ceb7a3234a5cf56e))
* gate new-file simulation to development (BUG-003) ([0bef979](https://github.com/Laginho/SIGAA-ME/commit/0bef979a521f70772f0c308d8f8bac7cd2d0c6c0))
* getCourses não confunde zero turmas com drift (PORTAL-008) ([56e684b](https://github.com/Laginho/SIGAA-ME/commit/56e684bf19cba9e0cbe80104957c410584784602))
* guard cleanupProgress against stale fetchCourseFiles continuation (BUG-022) ([35f2bfb](https://github.com/Laginho/SIGAA-ME/commit/35f2bfb9c4e838a16fc8bc06ff470ff2935e5602))
* guard stale async writes in course-detail with mount/open generation (BUG-022) ([c06977a](https://github.com/Laginho/SIGAA-ME/commit/c06977a7563950a69c96d6124bad4fa3b2b592f7))
* handle abandoned fallback waits (DL-009) ([994bcf0](https://github.com/Laginho/SIGAA-ME/commit/994bcf0ac51ada448ab18101f3896b1c69d9b1be))
* handle download route failures without unhandled rejections ([02f6be5](https://github.com/Laginho/SIGAA-ME/commit/02f6be555697eae9e76c70e4a7b5f51f9f4a586d))
* harden renderer content boundary (SEC-001) ([f6ee46b](https://github.com/Laginho/SIGAA-ME/commit/f6ee46b16a2fe9013f11ac4c1c77b7d7d6551dac))
* identify bell files and read state by id, not name (BUG-015) ([44c6fa5](https://github.com/Laginho/SIGAA-ME/commit/44c6fa5095b9d6c1b428d1bb16a2e0328861d3eb))
* **ipc:** select-download-folder surfaces a failed setting write (DATA-003) ([8c615c1](https://github.com/Laginho/SIGAA-ME/commit/8c615c152a45ccf99c316095e122d511c74f0d73))
* keep cacheTimestamp when caching a news body (SEC-001) ([c8f0e8f](https://github.com/Laginho/SIGAA-ME/commit/c8f0e8f978fb9693183eb427ade715afbf31865f))
* keep external link materials out of the download pipeline (SEC-004) ([fa68ae6](https://github.com/Laginho/SIGAA-ME/commit/fa68ae64d71c381efe13fafab1c9bff7c2cdf6f9))
* keep the file list rendered when the existence check is rejected (SEC-002) ([8577e76](https://github.com/Laginho/SIGAA-ME/commit/8577e7664271d51dbd9a9369c7a325b1c9968452))
* keep the reload rejection in the failure log (DL-010) ([c2e05c9](https://github.com/Laginho/SIGAA-ME/commit/c2e05c95d71ded43c67bd705711c869600e6b1aa))
* let before-quit handle the shutdown when tray "Sair" quits (BUG-018) ([e00931b](https://github.com/Laginho/SIGAA-ME/commit/e00931ba2e18d326a28cabdc1ee10a48d01dc055))
* literal message and explicit errorCode for course-verification failure (PORTAL-012) ([e0d4437](https://github.com/Laginho/SIGAA-ME/commit/e0d4437139d48dc85738b677bea229e6dab1be58))
* **logger:** chain clear() into the write queue instead of only awaiting flush() (OBS-004) ([adb193c](https://github.com/Laginho/SIGAA-ME/commit/adb193cfb89cbebf27a3b625db0e56cc18e6c78d))
* **logger:** keep the newline on a truncated line and clear logs before first write (OBS-001) ([cd9a4a5](https://github.com/Laginho/SIGAA-ME/commit/cd9a4a55744e273aa2ea2bebe3df16d267bcd431))
* **main:** keep app log open when resetAppLog cannot remove logs/ (DATA-002) ([2a5c2ff](https://github.com/Laginho/SIGAA-ME/commit/2a5c2ffddc2bf00512a16ec2203575092683efcf))
* pair batch downloads by file id and never overwrite on name collision (DL-004) ([14ef21e](https://github.com/Laginho/SIGAA-ME/commit/14ef21e736b4339725a0cb9dadac86931f75195d))
* **persistence:** resolve userData paths on use, not at import (DEV-002) ([f28a00f](https://github.com/Laginho/SIGAA-ME/commit/f28a00fa13efb464e0a5a016f17f4c4e47467333))
* **persistence:** write before mutating and let failed writes surface (DATA-003) ([485e38d](https://github.com/Laginho/SIGAA-ME/commit/485e38d11bc9b4fdff098536cb57a7479d566b40))
* **playwright-login:** log scraped course header and page title under a redacted key (OBS-005) ([aa40ddc](https://github.com/Laginho/SIGAA-ME/commit/aa40ddce2ca5a17760cdd25957458cf8a0d73d7a))
* poda de downloads reconfere o path antes de apagar chave existente (CONC-003) ([2ae01c0](https://github.com/Laginho/SIGAA-ME/commit/2ae01c00b5b188bb2896bef3c9b7deedd356f4e8))
* point navigation-policy.test.ts's getPath away from the real os.tmpdir() (OBS-003) ([5922ddb](https://github.com/Laginho/SIGAA-ME/commit/5922ddb4682af7cc7a82a88d9c0e6eee99f439a0))
* preserve cached data for courses that failed a background sync cycle (BUG-016) ([b0ebaa7](https://github.com/Laginho/SIGAA-ME/commit/b0ebaa719abef29de0d6b1cb9941fe5c85919127))
* quota on the downloads write no longer kills the sync cycle (DL-006) ([34a7346](https://github.com/Laginho/SIGAA-ME/commit/34a734617af1dd0265f899dec8125181a4001790))
* ratchet lint warnings, scope CI token, pin gitleaks by SHA (PIPE-007) ([d1ea22e](https://github.com/Laginho/SIGAA-ME/commit/d1ea22ef9e5c2b3d54f622a1d00e86710b87978f))
* reafirma default de existsSync no beforeEach ([82b8af2](https://github.com/Laginho/SIGAA-ME/commit/82b8af2e51cb385a07d70c4a1a0941a0d3e0878d))
* reattach recordDownloads' doc block, moved off by the new guard (DATA-005) ([83d2e10](https://github.com/Laginho/SIGAA-ME/commit/83d2e10f148a334df6cefe47612e19efdace4590))
* reject empty file signatures and match Playwright fallback by material id (DL-007) ([c0ac3fd](https://github.com/Laginho/SIGAA-ME/commit/c0ac3fd507b46467f3b2461a7052ba61e6a97da6))
* relogin on SESSION_EXPIRED errorCode across all course-entry call sites ([546da7c](https://github.com/Laginho/SIGAA-ME/commit/546da7cdc7aab92237664de83587c4a9955cd520))
* render course link materials as openable controls (BUG-014) ([465083f](https://github.com/Laginho/SIGAA-ME/commit/465083f94b8d1824a29e5233bdfe24915068c010))
* render files from downloads re-read after existence check (CLEAN-011) ([648e1a6](https://github.com/Laginho/SIGAA-ME/commit/648e1a67056f09017dcda48737ca753a7002811c))
* renderer stops announcing success over a discarded failure (BUG-017) ([d161c30](https://github.com/Laginho/SIGAA-ME/commit/d161c300ad365f604bdc6f41aa32eca04c2bb5ca))
* report a missing course panel as selector drift (PORTAL-013) ([be91c91](https://github.com/Laginho/SIGAA-ME/commit/be91c9114e60c960ef265b8f07302c00665d0a11))
* report incomplete news batches (BUG-025) ([b03ef03](https://github.com/Laginho/SIGAA-ME/commit/b03ef0344ee9d052c91e576f1968ca727d88d949))
* require both title and a recognized body for news success (BUG-026) ([e09ee9d](https://github.com/Laginho/SIGAA-ME/commit/e09ee9d80872ba714bd0e05238cf4863151207b0))
* reread downloads index after await to close cross-download races (CONC-002) ([b3844e6](https://github.com/Laginho/SIGAA-ME/commit/b3844e6828e7cd18040838c070d651f5a7bcd403))
* reserve exclusive download temporary files (DL-012) ([7f30d05](https://github.com/Laginho/SIGAA-ME/commit/7f30d0575da511f9b515e2e14662796113e2824e))
* restrict and validate renderer IPC (SEC-002) ([960898a](https://github.com/Laginho/SIGAA-ME/commit/960898ab10df41f2daef089444be99711f6bee54))
* rotate() survives unlink/rename failure, HTML redaction is tag-scoped (OBS-006) ([573979e](https://github.com/Laginho/SIGAA-ME/commit/573979ea55fdec60228035e63c10b072fac8b9c7))
* run removeLegacyLogs inside whenReady, not on module import (OBS-003) ([a80d289](https://github.com/Laginho/SIGAA-ME/commit/a80d289e494a2ee0a8d85c957fd81a13023fb0d9))
* scope semester courses and preserve schedule lines (PORTAL-013) ([be9ccfa](https://github.com/Laginho/SIGAA-ME/commit/be9ccfae81f688b68d6524116487163a693657a6))
* **scraper:** escopar verificação de curso ao cabeçalho #nomeTurma ([a7915f8](https://github.com/Laginho/SIGAA-ME/commit/a7915f8cb1c5f941cb345109931953377af8ab2f))
* send the borrowed Playwright User-Agent on real HTTP requests (BUG-010) ([ddee28a](https://github.com/Laginho/SIGAA-ME/commit/ddee28a1d1e4b3d18685526296fc8c2af3d798f4))
* **settings:** drop late getSettings response when the route changed (BUG-023) ([8b920b2](https://github.com/Laginho/SIGAA-ME/commit/8b920b2e38bf47f7e98ff5366e59196e996e313e))
* stop listing SIGAA tasks as downloadable files (BUG-011) ([7723e89](https://github.com/Laginho/SIGAA-ME/commit/7723e89e704e8505e48502f743162ff9a18f0bbe))
* **sync-selection.test.ts:** stop the leaked-timer race with a microtask flush (QA-008) ([44e6136](https://github.com/Laginho/SIGAA-ME/commit/44e6136d428bedee162a766d919e31fd7d605059))
* **sync:** tornar conteudo atras do overlay de sync inerte (A11Y-004) ([9d823b5](https://github.com/Laginho/SIGAA-ME/commit/9d823b50c321eed93688d65fd07b7aa351cceb24))
* tag URL-based login redirect as SESSION_EXPIRED (PORTAL-011) ([56db56a](https://github.com/Laginho/SIGAA-ME/commit/56db56ae6b028868da9c1b00ebe990b085e0a0e8))
* **test:** check the IPC deps mock against IpcDeps instead of casting it away (QA-012) ([26d9cdd](https://github.com/Laginho/SIGAA-ME/commit/26d9cddda0207d611214645aab500742b0e88d5f))
* **test:** correct false claim about boundingBox in centering test (BUG-020) ([f48e9d9](https://github.com/Laginho/SIGAA-ME/commit/f48e9d9e81137b6361cc1353a21105edd9793fd5))
* toast on cache-full when caching news content (CLEAN-011) ([0b5f38f](https://github.com/Laginho/SIGAA-ME/commit/0b5f38f92209397c2d4b39386c2835f894a86756))
* tooltip da bandeja mostra so "SIGAA-ME" (CLEAN-013) ([c4d2f06](https://github.com/Laginho/SIGAA-ME/commit/c4d2f061b92849bf17914bcb47dfb0e792e98658))
* type the 78 test-file errors tsconfig now surfaces (QA-012) ([9c155fa](https://github.com/Laginho/SIGAA-ME/commit/9c155fae365d70037f2a46dbe84a32608c3936ff))
* **ui:** dark mode com cores corretas no course-detail e no header do dashboard ([0abf0d4](https://github.com/Laginho/SIGAA-ME/commit/0abf0d4473b0091c528e6fc8ea2f747d0be827b6)), closes [#333](https://github.com/Laginho/SIGAA-ME/issues/333) [#f5f5f5](https://github.com/Laginho/SIGAA-ME/issues/f5f5f5)
* validate stored shape in notification and downloads readers (DATA-005) ([b6112e8](https://github.com/Laginho/SIGAA-ME/commit/b6112e8fd23627767aaa508ec4bea26ea81710d8))
* wire Playwright download fallback (BUG-004) ([88db917](https://github.com/Laginho/SIGAA-ME/commit/88db91728b718dc0c77040ed9ca41fb359044313))

## [1.2.0](https://github.com/Laginho/SIGAA-ME/compare/v1.1.0...v1.2.0) (2026-08-31)

## [1.1.0](https://github.com/Laginho/SIGAA-ME/compare/v1.1.0-beta.2...v1.1.0) (2026-08-31)


### Features

* add agentic documents ([bdc43d5](https://github.com/Laginho/SIGAA-ME/commit/bdc43d5161b60c63179ee30e31a1e21efbee3676))


### Bug Fixes

* address master review findings ([43c5fdf](https://github.com/Laginho/SIGAA-ME/commit/43c5fdfd355f5db4f03ce66d0032b3f15e498211))
* ask before downloading updates, and tell the truth about releases ([8267769](https://github.com/Laginho/SIGAA-ME/commit/82677696b51bec632db5899b4fef0e8d1715d87d))
* close the previous browser before every launch, bound quit teardown ([b3c1ab0](https://github.com/Laginho/SIGAA-ME/commit/b3c1ab0f1fff33ec3b27a85e5abbd506b3077388))
* gate debug dumps of authenticated pages, stop logging the username ([ec518d4](https://github.com/Laginho/SIGAA-ME/commit/ec518d4307a8d50ab9f7334a2109b692547e475c))
* manual sync merges into the cache instead of overwriting it ([8ca473c](https://github.com/Laginho/SIGAA-ME/commit/8ca473c2b7c0f844c743dd90fd1701476744f9ea))
* never mark a sync item seen before the user was told ([9d1a150](https://github.com/Laginho/SIGAA-ME/commit/9d1a150155f77df4b19a3bc71dbab5568f1faa58))
* show the real error message when a download fails ([58983c2](https://github.com/Laginho/SIGAA-ME/commit/58983c2e6a71f23ade1d02bbafa787e511c3fab0))
* stop deleting valid downloads, and cut two dead scraping paths ([700de9a](https://github.com/Laginho/SIGAA-ME/commit/700de9a0b75fe67a00f1f9df89cea7933d45197c))
* type the window.api contract and extract news ids correctly ([13a8e9d](https://github.com/Laginho/SIGAA-ME/commit/13a8e9d98ab425dc1055106c44d3ea3841d7a25e))

## [1.1.0-beta.2](https://github.com/Laginho/SIGAA-ME/compare/v1.1.0-beta.1...v1.1.0-beta.2) (2026-05-06)


### Bug Fixes

* bug fixes to auto-sync and news cache persistence ([5872638](https://github.com/Laginho/SIGAA-ME/commit/5872638222096cd6bafa396dafb95a3377988e76))

## [1.1.0-beta.1](https://github.com/Laginho/SIGAA-ME/compare/v1.1.0-beta.0...v1.1.0-beta.1) (2026-05-06)

## [1.1.0-beta.0](https://github.com/Laginho/SIGAA-ME/compare/v1.1.0-beta1...v1.1.0-beta.0) (2026-05-03)


### Features

* implement notifications and not-seen bool to news and files ([54c5592](https://github.com/Laginho/SIGAA-ME/commit/54c5592fa1fe277f7dd1deafccf18e6f80a54779))
* sync label on dashboard and open when windows starts ([95c72ae](https://github.com/Laginho/SIGAA-ME/commit/95c72aec8082bbe15bc5ead462f19b9d1b2c491f))


### Bug Fixes

* make background sync actually update the frontend ([ea9ba95](https://github.com/Laginho/SIGAA-ME/commit/ea9ba95a0caeb6a1056725d4950860c241d82588))
* make windows start the correct exe ([e8eb07f](https://github.com/Laginho/SIGAA-ME/commit/e8eb07ffbd8d0118156ba912742676d2b14ffb35))
* small typos ([3e80386](https://github.com/Laginho/SIGAA-ME/commit/3e8038692defd200df8ca7189d3f13fa3bd1ef35))

### [1.1.1](https://github.com/Laginho/SIGAA-ME/compare/v1.0.10...v1.1.1) (2026-04-19)

### [1.0.10](https://github.com/Laginho/SIGAA-ME/compare/v1.0.9...v1.0.10) (2026-04-19)


### Features

* add automated release workflow and versioning scripts with standard-version ([856dc7f](https://github.com/Laginho/SIGAA-ME/commit/856dc7f3e8eb2b565e76e77dcacea224c70eecdd))
