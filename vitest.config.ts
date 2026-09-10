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
