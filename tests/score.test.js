'use strict';

// Règles du padel : points, jeux, sets, tie-break, match, annulation.

const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState, applyPoint, replay } = require('../app.js');

/** n points de suite pour `team`. */
const points = (team, n) => Array(n).fill(team);
/** n jeux blancs de suite pour `team` (4 points chacun). */
const games = (team, n) => points(team, 4 * n);
/** Un set 6-0 pour `team`. */
const set60 = (team) => games(team, 6);

test('état initial : tout à zéro, pas de vainqueur', () => {
  const s = initialState();
  assert.deepEqual(s.points, { blue: 0, red: 0 });
  assert.deepEqual(s.games, { blue: 0, red: 0 });
  assert.deepEqual(s.sets, { blue: 0, red: 0 });
  assert.equal(s.tiebreak, false);
  assert.deepEqual(s.completedSets, []);
  assert.equal(s.winner, null);
});

test('applyPoint ne modifie pas l\'état reçu', () => {
  const before = initialState();
  const { state } = applyPoint(before, 'blue');
  assert.equal(before.points.blue, 0);
  assert.equal(state.points.blue, 1);
});

test('un point simple donne un événement "point"', () => {
  const { state, event } = applyPoint(initialState(), 'red');
  assert.deepEqual(state.points, { blue: 0, red: 1 });
  assert.deepEqual(event, { type: 'point', team: 'red' });
});

test('4 points de suite gagnent le jeu et remettent les points à zéro', () => {
  const { state, event } = replay(points('blue', 4));
  assert.equal(event.type, 'game');
  assert.deepEqual(state.games, { blue: 1, red: 0 });
  assert.deepEqual(state.points, { blue: 0, red: 0 });
});

test('égalité à 40-40, puis avantage, puis retour à égalité', () => {
  const deuce = [...points('blue', 3), ...points('red', 3)];
  assert.equal(replay(deuce).event.type, 'deuce');
  assert.equal(replay([...deuce, 'blue']).event.type, 'advantage');
  assert.equal(replay([...deuce, 'blue', 'red']).event.type, 'deuce');
});

test('après égalité, il faut 2 points d\'écart pour gagner le jeu', () => {
  const deuce = [...points('blue', 3), ...points('red', 3)];
  const { state, event } = replay([...deuce, 'red', 'red']);
  assert.equal(event.type, 'game');
  assert.deepEqual(state.games, { blue: 0, red: 1 });
});

test('set gagné à 6-4', () => {
  const { state, event } = replay([...games('blue', 5), ...games('red', 4), ...games('blue', 1)]);
  assert.deepEqual(event, { type: 'set', team: 'blue' });
  assert.deepEqual(state.completedSets, [{ blue: 6, red: 4, tiebreak: null }]);
  assert.deepEqual(state.sets, { blue: 1, red: 0 });
  assert.deepEqual(state.games, { blue: 0, red: 0 });
});

test('6-5 ne termine pas le set, 7-5 oui', () => {
  const at65 = [...games('blue', 5), ...games('red', 5), ...games('blue', 1)];
  const s65 = replay(at65);
  assert.equal(s65.event.type, 'game');
  assert.deepEqual(s65.state.games, { blue: 6, red: 5 });

  const s75 = replay([...at65, ...games('blue', 1)]);
  assert.equal(s75.event.type, 'set');
  assert.deepEqual(s75.state.completedSets, [{ blue: 7, red: 5, tiebreak: null }]);
});

test('6-6 lance le tie-break', () => {
  const { state, event } = replay([...games('blue', 5), ...games('red', 6), ...games('blue', 1)]);
  assert.equal(event.type, 'tiebreak-start');
  assert.equal(state.tiebreak, true);
  assert.deepEqual(state.games, { blue: 6, red: 6 });
});

test('tie-break : 7 points avec 2 d\'écart, le set est noté 7-6 avec le score du tie-break', () => {
  const at66 = [...games('blue', 5), ...games('red', 6), ...games('blue', 1)];

  // 6-6 dans le tie-break, puis 7-6 : pas encore fini
  const tb66 = [...at66, ...points('blue', 6), ...points('red', 6)];
  const s76 = replay([...tb66, 'blue']);
  assert.equal(s76.event.type, 'tiebreak-point');
  assert.equal(s76.state.tiebreak, true);

  // 8-6 : set gagné
  const s86 = replay([...tb66, 'blue', 'blue']);
  assert.equal(s86.event.type, 'set');
  assert.equal(s86.state.tiebreak, false);
  assert.deepEqual(s86.state.completedSets, [{ blue: 7, red: 6, tiebreak: { blue: 8, red: 6 } }]);
});

test('2 sets gagnés terminent le match', () => {
  const { state, event } = replay([...set60('red'), ...set60('red')]);
  assert.deepEqual(event, { type: 'match', team: 'red' });
  assert.equal(state.winner, 'red');
  assert.deepEqual(state.sets, { blue: 0, red: 2 });
});

test('le match peut aller en 3 sets', () => {
  const { state } = replay([...set60('blue'), ...set60('red'), ...set60('blue')]);
  assert.equal(state.winner, 'blue');
  assert.equal(state.completedSets.length, 3);
});

test('un point après la fin du match est ignoré', () => {
  const finished = replay([...set60('blue'), ...set60('blue')]).state;
  const { state, event } = applyPoint(finished, 'red');
  assert.equal(event.type, 'ignored');
  assert.deepEqual(state, finished);
});

test('replay accepte des équipes ou des objets { team }', () => {
  const asStrings = replay(['blue', 'red', 'blue']).state;
  const asObjects = replay([{ team: 'blue' }, { team: 'red' }, { team: 'blue' }]).state;
  assert.deepEqual(asObjects, asStrings);
});

test('annuler = rejouer l\'historique sans le dernier point, même à travers une fin de set', () => {
  const history = [...games('blue', 5), ...points('blue', 3)];
  const before = replay(history).state;                  // 5-0, 40-0
  const afterSet = replay([...history, 'blue']).state;   // set gagné
  assert.equal(afterSet.completedSets.length, 1);
  assert.deepEqual(replay([...history, 'blue'].slice(0, -1)).state, before);
});
