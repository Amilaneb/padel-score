'use strict';

// Lancement sans réseau grâce au service worker (sw.js).

const { test, expect } = require('@playwright/test');

test('après une première ouverture, l\'appli se relance sans réseau', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#screen-setup')).toBeVisible();
  await expect(page.locator('.app-title')).toHaveText('Score Padel');
  // Le script de l'appli est bien chargé aussi : un match peut démarrer
  await page.click('#setup-form button[type=submit]');
  await expect(page.locator('#screen-game')).toBeVisible();
});
