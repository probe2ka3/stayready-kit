import { expect, test } from '@playwright/test';

const SHOTS = process.env.E2E_SCREENSHOTS;

/** Prochain mardi (heure d'ouverture assurée à 10 h) : rend les tests indépendants de l'heure. */
function nextTuesday(): string {
  const d = new Date();
  for (let i = 1; i <= 7; i++) {
    const c = new Date(d.getTime() + i * 86400000);
    if (c.getUTCDay() === 2) return c.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

async function shot(page: import('@playwright/test').Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });
}

test('parcours complet : localisation → magasins → panier → comparaison → liste', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/fr');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('meilleur prix');
  await expect(page.getByRole('note')).toContainText('fictifs');
  await shot(page, '1-home');

  await page.getByRole('combobox').fill('1630');
  await page.getByRole('option').first().click();
  await page.waitForURL('**/fr/magasins');
  await expect(page.getByRole('heading', { name: 'Enseignes présentes' })).toBeVisible();
  await expect(page.getByText('Migros').first()).toBeVisible();
  await shot(page, '2-stores');

  await page.goto('/fr/panier');
  const search = page.getByPlaceholder('lait, farine, lessive…');
  await search.fill('lait entier');
  await page.getByRole('button', { name: 'Ajouter Lait entier UHT', exact: true }).click();
  await search.fill('farine blanche');
  await page.getByRole('button', { name: 'Ajouter Farine blanche', exact: true }).click();
  await search.fill('');
  await page.getByRole('button', { name: /Entretien/ }).click();
  await page.getByRole('button', { name: /Ajouter Liquide vaisselle/ }).click();
  await page.getByRole('button', { name: /Papier et mouchoirs/ }).click();
  await page.getByRole('button', { name: /Ajouter Papier toilette 3 plis \(10/ }).click();
  await page.getByRole('button', { name: /Pâtes, riz/ }).click();
  await page.getByRole('button', { name: 'Ajouter Spaghetti', exact: true }).click();
  await page.getByRole('button', { name: /Pâtes, riz/ }).click();
  await expect(page.getByRole('heading', { name: /Mon panier · 5 article/ })).toBeVisible();
  await shot(page, '3-basket');

  await page.getByRole('link', { name: /Comparer mon panier/ }).click();
  await page.waitForURL('**/fr/comparer');
  // Courses planifiées un mardi à 10 h (résultat indépendant de l'heure d'exécution du test).
  await page.getByRole('radio', { name: 'Planifier' }).click();
  await page.getByLabel('Date').fill(nextTuesday());
  await page.getByLabel('Heure de départ (facultatif)').fill('10:00');
  await page.getByRole('button', { name: 'Comparer', exact: true }).click();
  await expect(page.getByRole('tab').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('tab', { name: /Coût global optimisé/ })).toBeVisible();
  await expect(page.getByText('Résultat calculé sur des prix fictifs de démonstration.')).toBeVisible();
  await shot(page, '4-compare');

  await page.getByRole('button', { name: 'Utiliser cette liste' }).click();
  await page.waitForURL('**/fr/liste');
  const first = page.locator('ul li label').first();
  await first.click();
  await expect(page.getByText(/1 sur \d+ articles/)).toBeVisible();
  await shot(page, '5-list');

  // L'état est conservé localement après rechargement (aucun compte).
  await page.reload();
  await expect(page.getByText(/1 sur \d+ articles/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('planifier ses courses : comparaison aujourd’hui / date choisie', async ({ page }) => {
  await page.goto('/fr/panier');
  await page.evaluate((date) => {
    localStorage.setItem(
      'cabas-v1',
      JSON.stringify({
        state: {
          location: { label: '1003 Lausanne (VD)', lat: 46.5205, lon: 6.6318, zip: '1003', precise: false },
          radiusKm: 10,
          basket: [
            { id: 'a', productId: 'spaghetti-500g', qty: 2 },
            { id: 'b', productId: 'lait-entier-uht-1l', qty: 3 },
            { id: 'c', productId: 'papier-toilette-10', qty: 1 },
            { id: 'd', productId: 'cafe-grains-1kg', qty: 1 },
          ],
          when: { mode: 'plan', date, time: '10:00' },
        },
        version: 1,
      }),
    );
  }, nextTuesday());
  await page.goto('/fr/comparer');
  await expect(page.getByRole('heading', { name: /Aujourd’hui ou le/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Les promotions pas encore annoncées ne sont pas connues/)).toBeVisible();
  await shot(page, '6-plan');
});
