import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
const puerto = new URL(baseURL).port || '4173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: `"${process.execPath}" scripts/servir-local-3.6.mjs`,
    env: { PORT: puerto },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30000
  },
  projects: [
    { name: 'chromium-wide-1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'chromium-mobile-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } }
    /* Firefox no puede iniciarse en este contenedor (faltan libs del sistema).
       Se conservó el intento en docs/RELEASE-1.2.0.md. */
  ]
});
