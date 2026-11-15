'use strict';

// Reconnaissance vocale : on remplace le micro par une fausse reconnaissance vocale,
// pilotée par le test, pour envoyer des résultats provisoires et définitifs comme Chrome.

const { test, expect } = require('@playwright/test');

const {
  GUARD_MS, NEW_PHRASE_MS, failOnPageErrors, installFakeSpeech, startMatch, hear, readSave,
} = require('./helpers');

failOnPageErrors();

/** Démarre un match avec la fausse reconnaissance, puis attend la fin de l'annonce « début du match ». */
async function startVoiceMatch(page, options) {
  await installFakeSpeech(page, options);
  await startMatch(page);
  await page.waitForTimeout(GUARD_MS);
}

const voiceLog = async (page) => (await readSave(page)).log.filter((e) => e.src === 'voice');

test.describe('reconnaissance en ligne', () => {
  test.beforeEach(async ({ page }) => startVoiceMatch(page));

  test('résultat provisoire : le point est marqué sans attendre la fin de la phrase', async ({ page }) => {
    await hear(page, 0, ['bleu'], false);
    await expect(page.locator('#points-blue')).toHaveText('15');

    const log = await voiceLog(page);
    expect(log).toEqual([expect.objectContaining({ text: 'bleu [provisoire]', result: 'blue' })]);
  });

  test('la version définitive de la même phrase ne compte pas le point une 2e fois', async ({ page }) => {
    await hear(page, 0, ['bleu'], false);
    await expect(page.locator('#points-blue')).toHaveText('15');
    await page.waitForTimeout(GUARD_MS);

    await hear(page, 0, ['bleu c\'est bon'], true);
    await page.waitForTimeout(200);
    expect(await page.locator('#points-blue').textContent()).toBe('15');
    expect(await voiceLog(page)).toHaveLength(1);
  });

  test('sans résultat provisoire, le résultat définitif marque toujours le point', async ({ page }) => {
    await hear(page, 0, ['rouge'], true);
    await expect(page.locator('#points-red')).toHaveText('15');
  });

  test('provisoire sans commande : rien ne se passe, mais l\'appli montre qu\'elle entend', async ({ page }) => {
    await hear(page, 0, ['bon'], false);
    await expect(page.locator('#heard')).toContainText('bon');
    await hear(page, 0, ['bonjour'], true);
    await page.waitForTimeout(200);
    expect(await page.locator('#points-blue').textContent()).toBe('0');
    expect(await page.locator('#points-red').textContent()).toBe('0');
    // Le journal est sauvegardé par paquets : on attend qu'il le soit
    await expect.poll(async () => (await voiceLog(page)).map((e) => e.result)).toEqual(['unknown']);
  });

  test('deux phrases successives : deux points', async ({ page }) => {
    await hear(page, 0, ['bleu'], false);
    await expect(page.locator('#points-blue')).toHaveText('15');
    await page.waitForTimeout(GUARD_MS);
    await hear(page, 1, ['rouge'], false);
    await expect(page.locator('#points-red')).toHaveText('15');
  });

  test('provisoire pendant l\'annonce : ignoré (anti-écho)', async ({ page }) => {
    await hear(page, 0, ['bleu'], false);
    await expect(page.locator('#points-blue')).toHaveText('15');
    await hear(page, 1, ['rouge'], false);   // tout de suite après : l'annonce n'est pas finie
    await page.waitForTimeout(200);
    expect(await page.locator('#points-red').textContent()).toBe('0');
  });

  test('commande au milieu d\'une phrase : comptée dès qu\'elle est entendue', async ({ page }) => {
    await hear(page, 0, ['ok bon'], false);
    await hear(page, 0, ['ok bon allez bleu'], false);
    await expect(page.locator('#points-blue')).toHaveText('15');
  });

  test('après le point, la suite de la même phrase ne recompte pas « bleu »', async ({ page }) => {
    await hear(page, 0, ['allez bleu'], false);
    await expect(page.locator('#points-blue')).toHaveText('15');
    await page.waitForTimeout(GUARD_MS);
    await hear(page, 0, ['allez bleu super point'], false);
    await page.waitForTimeout(200);
    expect(await page.locator('#points-blue').textContent()).toBe('15');
  });

  test('la même équipe marque deux fois de suite à la voix : deux points', async ({ page }) => {
    await hear(page, 0, ['bleu'], true);
    await expect(page.locator('#points-blue')).toHaveText('15');
    await page.waitForTimeout(NEW_PHRASE_MS);   // fin de l'annonce, et phrase précédente terminée
    await hear(page, 1, ['bleu'], true);
    await expect(page.locator('#points-blue')).toHaveText('30');
  });

  test('Android : la phrase qui grandit arrive en résultats successifs, le point est compté une fois', async ({ page }) => {
    // Comme dans le journal du 02/11 : chaque version de la phrase arrive comme un nouveau résultat définitif
    await hear(page, 0, ['et'], true);
    await hear(page, 1, ['et c\'est du'], true);
    await hear(page, 2, ['et c\'est du rouge'], true);
    await expect(page.locator('#points-red')).toHaveText('15');
    await page.waitForTimeout(GUARD_MS);
    await hear(page, 3, ['et c\'est du rouge comme ça'], true);
    await page.waitForTimeout(200);
    expect(await page.locator('#points-red').textContent()).toBe('15');
  });

  test('phrase de 10 mots sans silence : l\'écoute repart de zéro immédiatement', async ({ page }) => {
    const startsBefore = await page.evaluate(() => window.recStarts);
    await hear(page, 0, ['on parle on parle on parle encore et encore toujours'], false);   // 10 mots
    await expect.poll(() => page.evaluate(() => window.recStarts)).toBe(startsBefore + 1);
    const micLog = async () => (await readSave(page)).log.filter((e) => e.src === 'mic').map((e) => e.result);
    await expect.poll(micLog).toContain('reset');
    expect(await micLog()).not.toContain('end');   // relance volontaire, pas une coupure

    // Après la relance, une nouvelle phrase (numérotée à partir de 0) est bien écoutée
    await hear(page, 0, ['rouge'], false);
    await expect(page.locator('#points-red')).toHaveText('15');
  });
});

test.describe('reconnaissance sur le téléphone', () => {
  // La fausse reconnaissance sait aussi fonctionner « sur l'appareil », français installé
  test.beforeEach(async ({ page }) => startVoiceMatch(page, { local: true }));

  test('le français installé : tout se fait sur le téléphone', async ({ page }) => {
    await expect(page.locator('#mic-mode')).toHaveText('sur le téléphone');
    expect(await page.evaluate(() => window.fakeRec.processLocally)).toBe(true);
  });

  test('échec sur le téléphone : on ne repasse jamais par Google, le match continue au toucher', async ({ page }) => {
    await page.evaluate(() => window.fakeRec.onerror({ error: 'language-not-supported' }));
    await expect(page.locator('#voice-warning')).toContainText('sur le téléphone a échoué');
    expect(await page.evaluate(() => window.fakeRec.processLocally)).toBe(true);   // pas de retour au mode en ligne
    await page.click('#zone-blue');
    await expect(page.locator('#points-blue')).toHaveText('15');
  });
});
