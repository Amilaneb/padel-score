'use strict';

// Relance de l'écoute quand le navigateur la coupe.

const test = require('node:test');
const assert = require('node:assert/strict');
const { restartPlan, RESTART_DELAY_MS, BACKOFF_DELAY_MS } = require('../app.js');

test('session normale coupée : relance rapide, compteur d\'échecs remis à zéro', () => {
  assert.deepEqual(restartPlan(10000, 2), { delay: RESTART_DELAY_MS, quickFails: 0 });
});

test('quelques échecs rapides : on relance encore vite', () => {
  assert.deepEqual(restartPlan(200, 0), { delay: RESTART_DELAY_MS, quickFails: 1 });
  assert.deepEqual(restartPlan(200, 2), { delay: RESTART_DELAY_MS, quickFails: 3 });
});

test('le micro échoue en boucle : les relances sont espacées', () => {
  assert.deepEqual(restartPlan(200, 3), { delay: BACKOFF_DELAY_MS, quickFails: 4 });
});
