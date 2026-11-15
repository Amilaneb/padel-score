'use strict';

// Aides partagées par les tests Playwright. Les délais viennent de app.js : ils restent justes
// si on les change dans l'appli.

const { test, expect } = require('@playwright/test');
const { STORAGE_KEY, TAP_DEBOUNCE_MS, ECHO_GUARD_MS, PHRASE_CONTINUATION_MS } = require('../app.js');

const TAP_DELAY_MS = TAP_DEBOUNCE_MS + 50;   // sinon le 2e toucher est pris pour un double-tap
const GUARD_MS = ECHO_GUARD_MS + 200;        // fin de la protection anti-écho après une annonce
const NEW_PHRASE_MS = Math.max(GUARD_MS, PHRASE_CONTINUATION_MS) + 100;   // phrase précédente terminée

/** Toute erreur JavaScript dans la page fait échouer le test. */
function failOnPageErrors() {
  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.pageErrors = [];
    page.on('pageerror', (err) => testInfo.pageErrors.push(err.message));
  });
  test.afterEach(async ({}, testInfo) => {
    expect(testInfo.pageErrors, 'erreurs JavaScript dans la page').toEqual([]);
  });
}

/**
 * Remplace le micro et la voix par des faux pilotés par le test : la page reste déterministe.
 * `window.hear(index, textes, définitif)` envoie un résultat comme Chrome.
 * @param {{ local?: boolean }} [options]  local : la fausse reconnaissance sait fonctionner sur l'appareil
 */
async function installFakeSpeech(page, { local = false } = {}) {
  await page.addInitScript((onDevice) => {
    class FakeRecognition {
      constructor() {
        window.fakeRec = this;
        window.recStarts = 0;
        if (onDevice) this.processLocally = false;
      }
      start() { window.recStarts += 1; setTimeout(() => this.onstart && this.onstart(), 0); }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      abort() { setTimeout(() => this.onend && this.onend(), 0); }
    }
    if (onDevice) {
      FakeRecognition.available = async () => 'available';
      FakeRecognition.install = async () => true;
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
    // Annonces instantanées : la fin d'annonce arrive tout de suite
    speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 0);
    speechSynthesis.cancel = () => {};

    window.hear = (index, texts, isFinal) => {
      const results = [];
      results[index] = Object.assign(texts.map((t) => ({ transcript: t })), { isFinal });
      window.fakeRec.onresult({ resultIndex: index, results });
    };
  }, local);
}

/** Ouvre l'appli et démarre un match (noms facultatifs). */
async function startMatch(page, blue = '', red = '') {
  await page.goto('/');
  await page.fill('#name-blue', blue);
  await page.fill('#name-red', red);
  await page.click('#setup-form button[type=submit]');
  await expect(page.locator('#screen-game')).toBeVisible();
}

/** Touche une zone, puis attend assez pour que le toucher suivant soit accepté. */
async function tap(page, team) {
  await page.click('#zone-' + team);
  await page.waitForTimeout(TAP_DELAY_MS);
}

/** Quitte le match en cours (en acceptant la confirmation). */
async function quit(page) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#btn-quit');
  await expect(page.locator('#screen-setup')).toBeVisible();
}

/** Envoie un résultat de la fausse reconnaissance vocale. */
const hear = (page, index, texts, isFinal) =>
  page.evaluate(([i, t, f]) => window.hear(i, t, f), [index, texts, isFinal]);

/** Sauvegarde actuelle de l'appli. */
const readSave = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);

/** Écrit une sauvegarde puis recharge la page (comme après une fermeture). */
async function loadSave(page, save) {
  await page.goto('/');
  await page.evaluate(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [STORAGE_KEY, save]);
  await page.reload();
}

module.exports = {
  GUARD_MS, NEW_PHRASE_MS,
  failOnPageErrors, installFakeSpeech, startMatch, tap, quit, hear, readSave, loadSave,
};
