import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);

/**
 * Démonstration sur les prix réels versionnés (data/prices/live) : parcours des paniers d'exemple
 * et captures d'écran (E2E_SCREENSHOTS=dossier). Lancer : pnpm test:e2e:demo
 * Hors intégration continue : les résultats dépendent des instantanés et de la date du jour.
 */
export default defineConfig({
  testDir: './e2e-demo',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-CH',
    timezoneId: 'Europe/Zurich',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `pnpm --filter @cabas/web exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { DATA_BACKEND: 'memory', PRICE_DATA: 'live' },
  },
});
