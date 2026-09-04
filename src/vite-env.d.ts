/// <reference types="vite/client" />

import type { RendererApi } from '../shared/ipc';

// `import` no topo transforma este arquivo em módulo, então `declare global` é
// obrigatório — sem ele, `interface Window` declararia um tipo local e o
// `window.api` voltaria a ser implicitamente `any` em todo o renderer.
declare global {
    const __APP_VERSION__: string;

    interface Window {
        /**
         * Contrato público do preload. A forma vive em `shared/ipc.ts`, e é a
         * mesma que `electron/preload.ts` implementa: uma declaração, dois usos.
         *
         * Descrever a forma aqui de novo foi exatamente o que permitiu o
         * `BUG-008` — este arquivo declarava `getSettings`, a ponte não a tinha,
         * e o `tsc` não tinha como saber. Se precisar de um método novo, ele
         * entra no `RendererApi` e o compilador cobra a ponte.
         */
        api: RendererApi;
        /**
         * Ponte de teste, exposta só com `--sigaa-dev` (SEC-002).
         * Produção não tem `testApi`.
         */
        testApi?: {
            simulateNewFile: () => Promise<boolean>;
        };
    }
}
