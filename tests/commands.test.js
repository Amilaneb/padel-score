'use strict';

// Reconnaissance des commandes dans le texte entendu par le micro.

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, detectCommand, initialState, applyPoint, announceEvent } = require('../app.js');

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
  assert.equal(detectCommand('rouge non bleu'), 'red');
  assert.equal(detectCommand('point bleu annule'), 'blue');
});

test('detectCommand : "Croix-Rouge", souvent entendu au lieu de "point rouge"', () => {
  assert.equal(detectCommand('Croix-Rouge'), 'red');
});

test('detectCommand : une phrase longue est une conversation, même si elle contient une commande', () => {
  // Phrase réelle du journal du 22/10, qui avait compté un point bleu par erreur
  const explanation = 'minutes de retard je vais la mettre proche du de la vitre au proche du joueur '
    + 'qui est là et en fait il faut annoncer par exemple. bleu tu vois. bleu point bleu';
  assert.equal(detectCommand(explanation), null);
});

test('detectCommand : jusqu\'à 3 mots, la commande est acceptée', () => {
  assert.equal(detectCommand('un point bleu'), 'blue');         // 3 mots
  assert.equal(detectCommand('allez un point bleu'), null);     // 4 mots
});

test('detectCommand : "bleu" ou "rouge" seul suffit', () => {
  assert.equal(detectCommand('bleu'), 'blue');
  assert.equal(detectCommand('Rouge'), 'red');
});

test('detectCommand : aucune annonce de l\'appli n\'est comprise comme une commande (écho)', () => {
  // Toutes les annonces d'un match complet : points, égalité, avantage, jeux, tie-break, sets, match
  const games = (team, n) => Array(4 * n).fill(team);
  const deuce = ['blue', 'blue', 'blue', 'red', 'red', 'red', 'blue', 'red', 'red', 'red'];
  const history = [
    ...deuce, ...games('blue', 5), ...games('red', 5), ...games('blue', 1),   // jeu rouge après égalité, puis 6-6
    ...Array(7).fill('red'),                                                // tie-break rouge
    ...games('blue', 6), ...games('red', 6),                                 // 1 set partout, puis rouge gagne
  ];
  let state = initialState();
  for (const team of history) {
    let event;
    ({ state, event } = applyPoint(state, team));
    const announce = announceEvent(event, state);
    assert.equal(detectCommand(announce), null, `annonce comprise comme une commande : "${announce}"`);
  }
  assert.equal(state.winner, 'red');
});
