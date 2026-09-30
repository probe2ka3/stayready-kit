import { expect, test } from '@playwright/test';
import { join } from 'node:path';

const PASSWORD = 'test-admin-password-123';
const EXAMPLES = join(process.cwd(), 'data', 'imports', 'examples');

test('accès refusé sans session, puis connexion', async ({ page }) => {
  await page.goto('/admin/correspondances');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel('Utilisateur').fill('admin');
  await page.getByLabel('Mot de passe').fill('mauvais mot de passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Identifiants incorrects.')).toBeVisible();
  await expect(page.getByLabel('Utilisateur')).toHaveValue('admin');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  await expect(page.getByText('Données par enseigne')).toBeVisible();

  // Qualité des données : couverture, fraîcheur, sources et alertes (instantanés de collecte).
  await page.goto('/admin/qualite');
  await expect(page.getByRole('heading', { name: 'Qualité des données' })).toBeVisible();
  await expect(page.getByText('Comparables dans ≥ 2 enseignes')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Couverture par enseigne' })).toBeVisible();
  // Lidl : instantané versionné ; ceux d'Aldi et de Denner (usage privé) restent hors du dépôt.
  await expect(page.getByRole('cell', { name: 'Lidl Suisse (site officiel)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Collecte quotidienne' })).toBeVisible();
});

test('import (simulation puis réel), correspondances, anomalies, journal', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Utilisateur').fill('admin');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/admin');

  await page.goto('/admin/imports');
  await page.getByLabel('Enseigne (connecteur)').selectOption('denner');
  await page.getByLabel(/Fichiers/).setInputFiles([join(EXAMPLES, 'denner.prices.csv'), join(EXAMPLES, 'denner.promotions.csv')]);
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByRole('heading', { name: 'Résultat de la simulation' })).toBeVisible();
  await expect(page.getByText(/5 articles · 5 prix · 2 promotions/)).toBeVisible();

  // L'enseigne choisie reste sélectionnée après la simulation.
  await expect(page.getByLabel('Enseigne (connecteur)')).toHaveValue('denner');
  await page.getByLabel(/Simulation/).uncheck();
  await page.getByLabel(/Fichiers/).setInputFiles([join(EXAMPLES, 'denner.prices.csv'), join(EXAMPLES, 'denner.promotions.csv')]);
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByRole('heading', { name: 'Import effectué' })).toBeVisible();

  await page.goto('/admin/correspondances?status=suggested&chain=denner&demo=1');
  const row = page.getByRole('row').filter({ hasText: 'Papier toilette 3 plis 8 rouleaux' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Valider' }).click();
  // Attendre la fin de l'action serveur : la ligne validée quitte la liste « à valider ».
  await expect(page.getByRole('row').filter({ hasText: 'Papier toilette 3 plis 8 rouleaux' }).filter({ hasText: 'Papier toilette 3 plis (10 rouleaux)' })).toHaveCount(0);
  await page.goto('/admin/correspondances?status=validated&chain=denner&q=papier&demo=1');
  await expect(page.getByRole('row').filter({ hasText: 'Papier toilette 3 plis 8 rouleaux' }).first()).toContainText('admin');

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Lancer maintenant' }).click();
  await page.goto('/admin/anomalies');
  await expect(page.getByRole('heading', { name: 'Anomalies ouvertes' })).toBeVisible();

  // Le journal s'accumule d'une exécution à l'autre : au moins une entrée de chaque type.
  await page.goto('/admin/journal');
  await expect(page.getByRole('cell', { name: 'match.validated' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'import.file' }).first()).toBeVisible();
});
