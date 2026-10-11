'use strict';

// Tests d'intégration : la vraie page dans un vrai navigateur, pilotée comme un utilisateur.

const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'padel-score-v1';
const TAP_DELAY_MS = 400;   // > TAP_DEBOUNCE_MS (350) : sinon le 2e toucher est ignoré

/** Toute erreur JavaScript dans la page fait échouer le test. */
test.beforeEach(async ({ page }, testInfo) => {
  testInfo.pageErrors = [];
  page.on('pageerror', (err) => testInfo.pageErrors.push(err.message));
});
test.afterEach(async ({}, testInfo) => {
  expect(testInfo.pageErrors, 'erreurs JavaScript dans la page').toEqual([]);
});

async function startMatch(page, blue = '', red = '') {
  await page.goto('/');
  await page.fill('#name-blue', blue);
  await page.fill('#name-red', red);
  await page.click('#setup-form button[type=submit]');
  await expect(page.locator('#screen-game')).toBeVisible();
}

async function tap(page, team) {
  await page.click('#zone-' + team);
  await page.waitForTimeout(TAP_DELAY_MS);
}

/** Écrit une sauvegarde dans le localStorage puis recharge la page (comme après une fermeture). */
async function loadSave(page, save) {
  await page.goto('/');
  await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [STORAGE_KEY, save]);
  await page.reload();
}

test('écran d\'accueil : formulaire visible, bouton d\'envoi caché sans archive', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-setup')).toBeVisible();
  await expect(page.locator('#screen-game')).toBeHidden();
  await expect(page.locator('#btn-share-logs')).toBeHidden();
});

test('points au toucher : 15, 30, 40, puis jeu', async ({ page }) => {
  await startMatch(page);
  const points = page.locator('#points-blue');

  await tap(page, 'blue');
  await expect(points).toHaveText('15');
  await tap(page, 'blue');
  await expect(points).toHaveText('30');
  await tap(page, 'blue');
  await expect(points).toHaveText('40');
  await tap(page, 'blue');
  await expect(points).toHaveText('0');
  await expect(page.locator('#games-blue')).toHaveText('1');
  await expect(page.locator('#points-red')).toHaveText('0');
});

test('le bouton Annule retire le dernier point', async ({ page }) => {
  await startMatch(page);
  await tap(page, 'blue');
  await tap(page, 'red');
  await expect(page.locator('#points-red')).toHaveText('15');

  await page.click('#btn-undo');
  await expect(page.locator('#points-red')).toHaveText('0');
  await expect(page.locator('#points-blue')).toHaveText('15');
});

test('après un rechargement, le match en cours reprend au même score', async ({ page }) => {
  await startMatch(page, 'Papa', 'Marc');
  await tap(page, 'blue');
  await tap(page, 'blue');

  await page.reload();
  const overlay = page.locator('#resume-overlay');
  await expect(overlay).toBeVisible();
  await overlay.click();
  await expect(overlay).toBeHidden();

  await expect(page.locator('#points-blue')).toHaveText('30');
  await expect(page.locator('#label-blue')).toHaveText('Papa');
});

test('balle de match : l\'écran de fin affiche le vainqueur et le score', async ({ page }) => {
  // 47 points bleus = 6-0, 5-0, 40-0 : le prochain point bleu gagne le match.
  await loadSave(page, {
    screen: 'game',
    names: { blue: 'Papa', red: 'Marc' },
    history: Array.from({ length: 47 }, () => ({ team: 'blue', source: 'touch', type: 'point' })),
    counters: { voice: 0, touch: 47, voiceUndo: 0, touchUndo: 0 },
    log: [],
    archives: [],
  });
  await page.click('#resume-overlay');
  await tap(page, 'blue');

  await expect(page.locator('#screen-end')).toBeVisible();
  await expect(page.locator('#winner-name')).toHaveText('Papa');
  await expect(page.locator('#end-score')).toHaveText('6-0, 6-0');

  // Annuler depuis l'écran de fin ramène au jeu
  await page.click('#btn-end-undo');
  await expect(page.locator('#screen-game')).toBeVisible();
  await expect(page.locator('#points-blue')).toHaveText('40');
});

test('Quitter archive le match ; le bouton d\'envoi copie le journal (sans partage possible)', async ({ page }) => {
  await startMatch(page, 'Papa', 'Marc');
  await tap(page, 'blue');
  await tap(page, 'red');

  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-quit');
  await expect(page.locator('#screen-setup')).toBeVisible();

  const button = page.locator('#btn-share-logs');
  await expect(button).toBeVisible();

  // Navigateur sans partage de fichier : on passe par le presse-papiers
  await page.evaluate(() => { navigator.canShare = undefined; });
  await button.click();
  await expect(button).toHaveText('Copié ✓');
  await expect(button).toHaveText('Envoyer les Logs');   // le texte revient tout seul

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Journal App - 1 match\(s\)/);
  expect(copied).toContain('### Papa vs Marc - ');
  expect(copied).toContain('2 entrées ###');
  expect(copied).toContain('\ttouch\tblue\t');
  expect(copied).toContain('\ttouch\tred\t');

  // Les archives survivent au rechargement
  await page.reload();
  await expect(button).toBeVisible();
});

test('partage de fichier : nom daté et contenu du journal', async ({ page }) => {
  await startMatch(page);
  await tap(page, 'blue');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-quit');

  // Simule un téléphone qui sait partager des fichiers
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => {
      window.sharedName = data.files[0].name;
      window.sharedText = await data.files[0].text();
    };
  });
  const button = page.locator('#btn-share-logs');
  await button.click();

  await expect.poll(() => page.evaluate(() => window.sharedName))
    .toMatch(/^journal-score_\d\d-\d\d-\d{4}_\d\dh\d\d\.txt$/);
  const text = await page.evaluate(() => window.sharedText);
  expect(text).toContain('### Bleu vs Rouge - ');
  // Lu une seule fois (toHaveText réessaierait jusqu'au retour du texte d'origine)
  expect(await button.textContent()).toBe('Envoyer les Logs');   // pas de « Copié ✓ »
});

test('partage annulé par l\'utilisateur : aucun message d\'erreur', async ({ page }) => {
  await startMatch(page);
  await tap(page, 'blue');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-quit');

  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async () => { throw new DOMException('Share canceled', 'AbortError'); };
  });
  const button = page.locator('#btn-share-logs');
  await button.click();
  await page.waitForTimeout(300);
  // Lu une seule fois (toHaveText réessaierait jusqu'au retour du texte d'origine)
  expect(await button.textContent()).toBe('Envoyer les Logs');
});

test('échec du partage : message « Envoi impossible »', async ({ page }) => {
  await startMatch(page);
  await tap(page, 'blue');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-quit');

  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async () => { throw new DOMException('Not allowed', 'NotAllowedError'); };
  });
  const button = page.locator('#btn-share-logs');
  await button.click();
  await expect(button).toHaveText('Envoi impossible');
});

test('deux matchs de suite : chaque archive garde son propre journal', async ({ page }) => {
  await startMatch(page, 'Match1', 'A');
  await tap(page, 'blue');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-quit');

  await page.click('#setup-form button[type=submit]');
  await tap(page, 'red');
  await tap(page, 'red');
  await tap(page, 'red');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-quit');

  const archives = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).archives, STORAGE_KEY);
  expect(archives).toHaveLength(2);
  expect(archives[0].log.map((e) => e.result)).toEqual(['blue']);
  expect(archives[1].log.map((e) => e.result)).toEqual(['red', 'red', 'red']);
});
