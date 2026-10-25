'use strict';

// Journal des matchs : score du titre, lignes du journal, fichier envoyé.

const test = require('node:test');
const assert = require('node:assert/strict');
const { replay, formatScore, formatLog, formatAllLogs, isWorthArchiving } = require('../app.js');

const games = (team, n) => Array(4 * n).fill(team);
const T0 = new Date(2026, 9, 10, 14, 2, 11).getTime();   // 10/10/2026 14:02:11, heure locale

const entry = (secondsAfterStart, src, result, text = '') =>
  ({ t: T0 + secondsAfterStart * 1000, src, text, result });

test('formatScore : match terminé', () => {
  const state = replay([...games('blue', 6), ...games('red', 6), ...games('blue', 6)]).state;
  assert.equal(formatScore(state), '6-0, 0-6, 6-0 (terminé)');
});

test('formatScore : match abandonné en plein set', () => {
  const state = replay([...games('blue', 5), ...games('red', 4), ...games('blue', 1), ...games('red', 1)]).state;
  assert.equal(formatScore(state), '6-4, 0-1 (abandonné)');
});

test('formatScore : abandonné juste après un set, ou avant le premier jeu', () => {
  assert.equal(formatScore(replay(games('blue', 6)).state), '6-0, 0-0 (abandonné)');
  assert.equal(formatScore(replay(['blue']).state), '0-0 (abandonné)');
});

test('formatScore : set gagné au tie-break', () => {
  const at66 = [...games('blue', 5), ...games('red', 6), ...games('blue', 1)];
  const state = replay([...at66, ...Array(7).fill('red')]).state;
  assert.equal(formatScore(state), '6-7 (0-7), 0-0 (abandonné)');
});

test('formatLog : une ligne par entrée, colonnes séparées par des tabulations', () => {
  const lines = formatLog([
    entry(0, 'voice', 'blue', 'point bleu / point bleue'),
    entry(34, 'touch', 'red'),
  ]).split('\n');

  assert.equal(lines.length, 2);
  const [time, gap, src, result, text] = lines[0].split('\t');
  assert.equal(time, '14:02:11');
  assert.equal(gap, '');                 // pas d'écart sur la première ligne
  assert.equal(src, 'voice');
  assert.equal(result, 'blue');
  assert.equal(text, 'point bleu / point bleue');

  assert.deepEqual(lines[1].split('\t'), ['14:02:45', '+34s', 'touch', 'red', '']);
});

test('formatAllLogs : sans archive, seulement l\'en-tête', () => {
  const text = formatAllLogs([]);
  assert.match(text, /^Journal App - 0 match\(s\) - envoyé le \d\d\/\d\d\/\d{4} \d\d:\d\d$/);
});

test('formatAllLogs : un titre par match, noms par défaut si vides', () => {
  const archives = [
    { names: { blue: 'Papa', red: 'Marc' }, state: replay(games('blue', 1)).state, log: [entry(0, 'touch', 'blue')] },
    { names: { blue: '', red: '' }, state: replay([]).state, log: [entry(0, 'voice', 'unknown', 'bonjour'), entry(5, 'voice', 'ignored', 'point')] },
  ];
  const blocks = formatAllLogs(archives).split('\n\n');

  assert.equal(blocks.length, 3);
  assert.match(blocks[0], /^Journal App - 2 match\(s\)/);
  assert.equal(blocks[1].split('\n')[0], '### Papa vs Marc - 10/10/2026 - 1-0 (abandonné) - 1 entrées ###');
  assert.equal(blocks[2].split('\n')[0], '### Bleu vs Rouge - 10/10/2026 - 0-0 (abandonné) - 2 entrées ###');
  assert.equal(blocks[2].split('\n').length, 3);   // titre + 2 lignes
});

test('formatAllLogs : aucune cellule ne commence par "=" (pris pour une formule par les tableurs)', () => {
  const archives = [
    { names: { blue: 'A', red: 'B' }, state: replay(games('red', 12)).state, log: [entry(0, 'touch', 'red'), entry(3, 'voice', 'undo', 'annule')] },
  ];
  for (const line of formatAllLogs(archives).split('\n')) {
    for (const cell of line.split('\t')) {
      assert.ok(!cell.startsWith('='), `cellule qui commence par "=" : ${cell}`);
    }
  }
});

test('isWorthArchiving : seulement si au moins un point a été marqué', () => {
  assert.equal(isWorthArchiving([]), false);
  assert.equal(isWorthArchiving([entry(0, 'touch', 'undo'), entry(2, 'voice', 'unknown', 'début du match')]), false);
  assert.equal(isWorthArchiving([entry(0, 'mic', 'error:network')]), false);
  assert.equal(isWorthArchiving([entry(0, 'voice', 'red', 'point rouge')]), true);
  assert.equal(isWorthArchiving([entry(0, 'touch', 'blue'), entry(1, 'touch', 'undo')]), true);
});
