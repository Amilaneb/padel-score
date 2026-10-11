'use strict';

// Reconnaissance des commandes dans le texte entendu par le micro.

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, detectCommand } = require('../app.js');

test('normalize : minuscules, sans accents ni ponctuation, espaces simples', () => {
  assert.equal(normalize('  Point   BLEU ! '), 'point bleu');
  assert.equal(normalize('Égalité, ça'), 'egalite ca');
});

test('detectCommand : les commandes de base', () => {
  assert.equal(detectCommand('point bleu'), 'blue');
  assert.equal(detectCommand('Point Rouge'), 'red');
  assert.equal(detectCommand('annule'), 'undo');
  assert.equal(detectCommand('annuler'), 'undo');
});

test('detectCommand : variantes fréquentes de la reconnaissance vocale', () => {
  assert.equal(detectCommand('poing bleu'), 'blue');
  assert.equal(detectCommand('points rouges'), 'red');
  assert.equal(detectCommand('allez point bleu'), 'blue');
});

test('detectCommand : rien de reconnu', () => {
  assert.equal(detectCommand('bonjour'), null);
  assert.equal(detectCommand(''), null);
});

test('detectCommand : ignore l\'écho de l\'annonce "point annulé, retour à…"', () => {
  assert.equal(detectCommand('point annulé, retour à trente quinze'), null);
});

test('detectCommand : la première commande prononcée l\'emporte', () => {
  assert.equal(detectCommand('point rouge non point bleu'), 'red');
  assert.equal(detectCommand('point bleu annule'), 'blue');
});
