'use strict';

// Reconnaissance vocale : on remplace le micro par une fausse reconnaissance vocale,
// pilotée par le test, pour envoyer des résultats provisoires et définitifs comme Chrome.

const { test, expect } = require('@playwright/test');

const GUARD_MS = 1000;   // > ECHO_GUARD_MS (800) : fin de la protection anti-écho après une annonce

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      constructor() { window.fakeRec = this; }
      start() { setTimeout(() => this.onstart && this.onstart(), 0); }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      abort() { setTimeout(() => this.onend && this.onend(), 0); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
    // Annonces instantanées : la fin d'annonce arrive tout de suite
    speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 0);
    speechSynthesis.cancel = () => {};

    /** Envoie un résultat comme Chrome : numéro de phrase, interprétations, provisoire ou définitif. */
    window.hear = (index, texts, isFinal) => {
      const results = [];
      results[index] = Object.assign(texts.map((t) => ({ transcript: t })), { isFinal });
      window.fakeRec.onresult({ resultIndex: index, results });
    };
  });
  await page.goto('/');
  await page.click('#setup-form button[type=submit]');
  await page.waitForTimeout(GUARD_MS);   // fin de l'annonce « début du match »
});

const hear = (page, index, texts, isFinal) =>
  page.evaluate(([i, t, f]) => window.hear(i, t, f), [index, texts, isFinal]);
const voiceLog = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('padel-score-v1')).log.filter((e) => e.src === 'voice'));

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
  expect((await voiceLog(page)).map((e) => e.result)).toEqual(['unknown']);
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

test('provisoire d\'une phrase longue : ignoré (plus de 3 mots)', async ({ page }) => {
  await hear(page, 0, ['il faut dire bleu'], false);
  await page.waitForTimeout(200);
  expect(await page.locator('#points-blue').textContent()).toBe('0');
});
