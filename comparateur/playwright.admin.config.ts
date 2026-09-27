import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout de l'administration (nécessitent PostgreSQL + PostGIS).
 * E2E_DATABASE_URL doit pointer vers une base initialisée (`pnpm job seed`).
 * Les identifiants sont ceux de test définis ci-dessous (jamais en production).
 */
const PORT = Number(process.env.E2E_ADMIN_PORT ?? 3200);
export const ADMIN_TEST_PASSWORD = 'test-admin-password-123';

export default defineConfig({
  testDir: './e2e-admin',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-CH',
    timezoneId: 'Europe/Zurich',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm --filter @cabas/web exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATA_BACKEND: 'postgres',
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? '',
      ADMIN_USERNAME: 'admin',
      // Hachage scrypt de ADMIN_TEST_PASSWORD (paramètres réduits pour les tests).
      ADMIN_PASSWORD_HASH: process.env.E2E_ADMIN_HASH ?? '',
      SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
    },
  },
});
