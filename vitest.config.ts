import { defineConfig } from 'vitest/config';
import packageJson from './package.json';

export default defineConfig({
    // Espelha `vite.config.ts`: `renderSettingsPage` lê `__APP_VERSION__`,
    // e sem isso qualquer teste que chame essa função quebra com `ReferenceError`.
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    test: {
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
        globals: true,
        testTimeout: 30000,
        env: {
            NODE_ENV: 'test'
        },
        // QA-001: thresholds só nos módulos onde uma queda de cobertura é um
        // bug de segurança/dado, não em todo o repo — ver CLAUDE.md regra 1/4/6.
        coverage: {
            provider: 'v8',
            include: [
                'src/security/html-sanitizer.ts',
                'electron/ipc/validation.ts',
                'electron/services/persistence.service.ts',
                'electron/services/session-operation-coordinator.service.ts',
                'electron/services/download-path.ts',
            ],
            // Piso é a cobertura real de hoje, com folga pequena contra
            // variação de execução — não um número redondo arbitrário. Quem
            // baixar a cobertura destes 5 módulos quebra o `npm run coverage`.
            thresholds: {
                lines: 94,
                statements: 89,
                functions: 100,
                branches: 84,
            },
        },
        // Per-file environment override using the @vitest-environment docblock.
        // Default is node (for electron/service tests).
        // Renderer tests use: // @vitest-environment jsdom
        environment: 'node',
        environmentOptions: {
            jsdom: {
                url: 'http://localhost',
            }
        },
        // Treat CSS imports as no-ops so renderer modules can be imported in tests
        css: false,
    },
});
