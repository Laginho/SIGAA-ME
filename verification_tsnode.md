file:///C:/Users/Bruno%20Lage/Desktop/Pastinha/Programas/Projects/SIGAA-ME/verify-scraper.ts:2
input: process.stdin,
    output: process.stdout,
          ^
    });

SyntaxError: Expected ';', '}' or <eof>
    at parseTypeScript (node:internal/modules/typescript:67:36)
    at processTypeScriptCode (node:internal/modules/typescript:133:42)
    at stripTypeScriptModuleTypes (node:internal/modules/typescript:163:10)
    at ModuleLoader.<anonymous> (node:internal/modules/esm/translators:605:16)
    at ModuleLoader.#translate (node:internal/modules/esm/loader:546:20)
    at afterLoad (node:internal/modules/esm/loader:596:29)
    at ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:601:12)
    at ModuleLoader.#createModuleJob (node:internal/modules/esm/loader:624:36)
    at ModuleLoader.#getJobFromResolveResult (node:internal/modules/esm/loader:343:34)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:311:41) {
  code: 'ERR_INVALID_TYPESCRIPT_SYNTAX'
}
