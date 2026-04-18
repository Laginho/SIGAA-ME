import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60000,
    expect: {
        timeout: 10000
    },
    use: {
        // Trace on first retry
        trace: 'on-first-retry',
    },
    // We don't want tests running perfectly in parallel sharing the same local storage
    workers: 1,
    reporter: [['html', { open: 'never' }]],
});
