import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: 'tests', testMatch: '*.browser.test.ts', workers: 1,
  timeout: 30000, use: { browserName: 'chromium', viewport: { width: 1280, height: 1100 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm exec vite -- --host 127.0.0.1 --port 61011', url: 'http://127.0.0.1:61011', reuseExistingServer: false },
  reporter: [['list'], ['json', { outputFile: 'evidence/generated/browser-results.json' }]] });
