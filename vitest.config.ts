import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
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
