import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * Tests de bout en bout (navigateur) en mode « mémoire » : aucune base requise.
 * Lancer : pnpm test:e2e (démarre le serveur de développement si nécessaire).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-CH',
    timezoneId: 'Europe/Zurich',
    trace: 'retain-on-failure',
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
    // Données de démonstration : parcours déterministe, indépendant des collectes réelles.
    env: { DATA_BACKEND: 'memory', PRICE_DATA: 'demo' },
  },
});
