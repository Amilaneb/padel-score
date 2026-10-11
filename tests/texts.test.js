'use strict';

// Textes affichés et annoncés à voix haute.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  replay, numberFr, gamePointsPhrase, tiebreakPhrase, gamesPhrase, setsPhrase,
  announceEvent, undoPhrase, displayPoints, formatSet,
} = require('../app.js');

const pair = (blue, red) => ({ blue, red });
const points = (team, n) => Array(n).fill(team);

test('numberFr : nombres en toutes lettres', () => {
  const cases = {
    0: 'zéro', 1: 'un', 16: 'seize', 17: 'dix-sept', 20: 'vingt', 21: 'vingt et un',
    22: 'vingt-deux', 70: 'soixante-dix', 71: 'soixante et onze', 80: 'quatre-vingts',
    91: 'quatre-vingt-onze',
  };
  for (const [n, words] of Object.entries(cases)) {
    assert.equal(numberFr(Number(n)), words, `numberFr(${n})`);
  }
});

test('gamePointsPhrase : score d\'un jeu, bleu en premier', () => {
  assert.equal(gamePointsPhrase(pair(1, 0)), 'quinze zéro');
  assert.equal(gamePointsPhrase(pair(1, 3)), 'quinze quarante');
  assert.equal(gamePointsPhrase(pair(2, 2)), 'trente partout');
  assert.equal(gamePointsPhrase(pair(3, 3)), 'égalité');
  assert.equal(gamePointsPhrase(pair(5, 5)), 'égalité');
  assert.equal(gamePointsPhrase(pair(4, 3)), 'avantage bleu');
  assert.equal(gamePointsPhrase(pair(3, 4)), 'avantage rouge');
});

test('tiebreakPhrase', () => {
  assert.equal(tiebreakPhrase(pair(3, 3)), 'trois partout');
  assert.equal(tiebreakPhrase(pair(4, 3)), 'quatre à trois');
});

test('gamesPhrase et setsPhrase : singulier, pluriel, partout', () => {
  assert.equal(gamesPhrase(pair(4, 3)), 'quatre jeux à trois');
  assert.equal(gamesPhrase(pair(1, 0)), 'un jeu à zéro');
  assert.equal(gamesPhrase(pair(1, 1)), 'un jeu partout');
  assert.equal(setsPhrase(pair(1, 1)), 'un set partout');
  assert.equal(setsPhrase(pair(2, 0)), 'deux sets à zéro');
});

test('announceEvent : annonces après un point', () => {
  const say = (history) => {
    const { state, event } = replay(history);
    return announceEvent(event, state);
  };
  assert.equal(say(['blue']), 'quinze zéro');
  assert.equal(say(points('red', 4)), 'jeu rouge, zéro jeu à un');
  assert.equal(say([...points('blue', 3), ...points('red', 3)]), 'égalité');
  assert.equal(say([...points('blue', 3), ...points('red', 4)]), 'avantage rouge');
  assert.equal(say(points('blue', 24)), 'set bleu, un set à zéro');
  assert.equal(say(points('blue', 48)), 'match gagné, équipe bleue');
});

test('undoPhrase : retour au début du match', () => {
  assert.equal(undoPhrase('point', replay([]).state, 0), 'point annulé, retour au début du match');
});

test('undoPhrase : annonce les jeux quand l\'annulation traverse un jeu', () => {
  const state = replay(points('blue', 3)).state;   // 40-0, 0 jeu partout
  assert.equal(undoPhrase('game', state, 3), 'point annulé, retour à quarante zéro, zéro jeu partout');
  assert.equal(undoPhrase('point', state, 3), 'point annulé, retour à quarante zéro');
});

test('displayPoints : chiffres, égalité, avantage, tie-break, fin de match', () => {
  assert.deepEqual(displayPoints(replay(['blue', 'blue', 'red']).state), { blue: '30', red: '15', banner: '' });
  assert.deepEqual(
    displayPoints(replay([...points('blue', 3), ...points('red', 3)]).state),
    { blue: '40', red: '40', banner: 'ÉGALITÉ' },
  );
  assert.deepEqual(
    displayPoints(replay([...points('blue', 3), ...points('red', 3), 'blue']).state),
    { blue: 'AV', red: '40', banner: 'AVANTAGE BLEU' },
  );
  const tiebreak = [...points('blue', 20), ...points('red', 24), ...points('blue', 4), 'red'];
  assert.deepEqual(displayPoints(replay(tiebreak).state), { blue: '0', red: '1', banner: 'JEU DÉCISIF' });
  assert.deepEqual(displayPoints(replay(points('blue', 48)).state), { blue: '–', red: '–', banner: '' });
});

test('formatSet : du point de vue de l\'équipe demandée, avec le tie-break', () => {
  assert.equal(formatSet({ blue: 6, red: 4, tiebreak: null }, 'blue'), '6-4');
  assert.equal(formatSet({ blue: 6, red: 4, tiebreak: null }, 'red'), '4-6');
  assert.equal(formatSet({ blue: 7, red: 6, tiebreak: { blue: 7, red: 5 } }, 'blue'), '7-6 (7-5)');
});
