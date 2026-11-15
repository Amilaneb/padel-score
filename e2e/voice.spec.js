'use strict';

// Reconnaissance vocale : on remplace le micro par une fausse reconnaissance vocale,
// pilotée par le test, pour envoyer des résultats provisoires et définitifs comme Chrome.

const { test, expect } = require('@playwright/test');

const GUARD_MS = 1000;   // > ECHO_GUARD_MS (800) : fin de la protection anti-écho après une annonce

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      constructor() { window.fakeRec = this; window.recStarts = 0; }
      start() { window.recStarts += 1; setTimeout(() => this.onstart && this.onstart(), 0); }
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
});

async function startMatch(page) {
  await page.goto('/');
  await page.click('#setup-form button[type=submit]');
  await page.waitForTimeout(GUARD_MS);   // fin de l'annonce « début du match »
}

const hear = (page, index, texts, isFinal) =>
  page.evaluate(([i, t, f]) => window.hear(i, t, f), [index, texts, isFinal]);
const voiceLog = (page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('padel-score-v1')).log.filter((e) => e.src === 'voice'));

test.describe('reconnaissance en ligne', () => {
  test.beforeEach(async ({ page }) => startMatch(page));

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
    const mic = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('padel-score-v1')).log.filter((e) => e.src === 'mic').map((e) => e.result));
    expect(mic).toContain('reset');
    expect(mic).not.toContain('end');   // relance volontaire, pas une coupure

    // Après la relance, une nouvelle phrase (numérotée à partir de 0) est bien écoutée
    await hear(page, 0, ['rouge'], false);
    await expect(page.locator('#points-red')).toHaveText('15');
  });
});

test.describe('reconnaissance sur le téléphone', () => {
  test.beforeEach(async ({ page }) => {
    // La fausse reconnaissance sait aussi fonctionner « sur l'appareil », français installé
    await page.addInitScript(() => {
      const Base = window.SpeechRecognition;
      class LocalRecognition extends Base {
        constructor() { super(); this.processLocally = false; }
      }
      LocalRecognition.available = async () => 'available';
      LocalRecognition.install = async () => true;
      window.SpeechRecognition = LocalRecognition;
      window.webkitSpeechRecognition = LocalRecognition;
    });
    await startMatch(page);
  });

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
