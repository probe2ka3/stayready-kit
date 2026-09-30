import { expect, test } from '@playwright/test';

const SHOTS = process.env.E2E_SCREENSHOTS;

async function shot(page: import('@playwright/test').Page, name: string) {
  // JPEG compressé : captures versionnées dans docs/captures (taille raisonnable).
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.jpg`, fullPage: true, type: 'jpeg', quality: 55 });
}

for (const [index, id] of ['lausanne', 'bulle', 'geneve'].entries()) {
  test(`panier d’exemple ${id} : magasins, solutions, trajet, lignes`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/fr/exemples');
    await page.getByRole('button', { name: 'Charger et comparer' }).nth(index).click();
    await page.waitForURL('**/fr/comparer');
    await expect(page.getByRole('heading', { name: 'Comparaison des solutions' })).toBeVisible({ timeout: 60_000 });
    // Prix réels uniquement : jamais l'avertissement de démonstration.
    await expect(page.getByText('Résultat calculé sur des prix fictifs de démonstration.')).toHaveCount(0);
    await expect(page.locator('[data-testid="solution-chain:lidl"]')).toBeVisible();
    await expect(page.getByText(/pas un itinéraire routier/)).toBeVisible();
    await expect(page.getByText(/Dates des relevés utilisés/)).toBeVisible();
    await shot(page, `${id}-comparer`);
    await page.goto('/fr/magasins');
    await expect(page.getByText('Prix officiels').first()).toBeVisible();
    await shot(page, `${id}-magasins`);
    expect(errors).toEqual([]);
  });
}
