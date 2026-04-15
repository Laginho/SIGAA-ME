import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Look for tests in the tests/ directory
        include: ['tests/**/*.test.ts'],
        // Don't import Electron — mock it
        environment: 'node',
        // Load .env for integration tests
        env: {
            NODE_ENV: 'test'
        },
        // Give longer timeout for live scraping tests
        testTimeout: 30000,
        globals: true,
    },
});
