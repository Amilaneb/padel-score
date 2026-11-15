'use strict';

// Match en cours : points, annulation, journal, archives, sauvegarde et reprise.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatchSession, LOG_MAX, ARCHIVES_MAX } = require('../app.js');

const entry = (t, result = 'blue') => ({ t, src: 'touch', text: '', result });

/** Match démarré avec quelques points au toucher. */
function playedSession(points = ['blue', 'red', 'blue']) {
  const session = createMatchSession();
  session.start({ blue: 'Papa', red: 'Marc' });
  points.forEach((team, i) => {
    session.addLog(entry(i, team));
    session.point(team, 'touch');
  });
  return session;
}

test('point : le score avance, l\'historique et les compteurs aussi', () => {
  const session = playedSession(['blue', 'blue']);
  assert.deepEqual(session.state.points, { blue: 2, red: 0 });
  assert.equal(session.history.length, 2);
  assert.equal(session.counters.touch, 2);
});

test('point après la fin du match : refusé', () => {
  const session = playedSession(Array(48).fill('blue'));
  assert.equal(session.state.winner, 'blue');
  assert.equal(session.point('red', 'touch'), null);
  assert.equal(session.history.length, 48);
});

test('annuler : retire le dernier point ; rien à annuler → null', () => {
  const session = playedSession(['blue', 'red']);
  assert.deepEqual(session.undo('voice'), { team: 'red', source: 'touch', type: 'point' });
  assert.deepEqual(session.state.points, { blue: 1, red: 0 });
  session.undo('touch');
  assert.equal(session.undo('touch'), null);
  assert.deepEqual(session.counters, { voice: 0, touch: 2, voiceUndo: 1, touchUndo: 2 });
});

test('journal limité à LOG_MAX entrées (les plus anciennes partent)', () => {
  const session = createMatchSession();
  for (let i = 0; i < LOG_MAX + 5; i++) session.addLog(entry(i));
  assert.equal(session.log.length, LOG_MAX);
  assert.equal(session.log[0].t, 5);
});

test('quitter : archivé si au moins un point a été marqué, même annulé', () => {
  const session = playedSession(['blue']);
  session.undo('touch');
  session.quit();
  assert.equal(session.archives.length, 1);
  assert.deepEqual(session.archives[0].names, { blue: 'Papa', red: 'Marc' });
  assert.deepEqual(session.history, []);
  assert.deepEqual(session.log, []);
});

test('quitter sans aucun point (faux départ) : pas archivé', () => {
  const session = createMatchSession();
  session.start({ blue: '', red: '' });
  session.addLog(entry(0, 'undo'));
  session.undo('touch');
  session.quit();
  assert.deepEqual(session.archives, []);
});

test('l\'archive ne bouge plus quand le match suivant commence', () => {
  const session = playedSession(['blue']);
  session.quit();
  session.start({ blue: 'Autre', red: 'Équipe' });
  session.addLog(entry(10, 'red'));
  session.point('red', 'touch');
  assert.equal(session.archives[0].log.length, 1);
  assert.equal(session.archives[0].names.blue, 'Papa');
});

test(`archives limitées à ${ARCHIVES_MAX} matchs`, () => {
  const session = createMatchSession();
  for (let i = 0; i < ARCHIVES_MAX + 2; i++) {
    session.start({ blue: 'M' + i, red: '' });
    session.addLog(entry(i));
    session.point('blue', 'touch');
    session.quit();
  }
  assert.equal(session.archives.length, ARCHIVES_MAX);
  assert.equal(session.archives[0].names.blue, 'M2');
});

test('sauvegarde puis reprise : même match, même score', () => {
  const saved = JSON.parse(JSON.stringify(playedSession(['blue', 'blue', 'red']).toSave('game')));
  const restored = createMatchSession();
  assert.equal(restored.load(saved), true);
  assert.deepEqual(restored.state.points, { blue: 2, red: 1 });
  assert.deepEqual(restored.names, { blue: 'Papa', red: 'Marc' });
  assert.equal(restored.log.length, 3);
});

test('reprise depuis l\'accueil : archives relues, pas de match à reprendre', () => {
  const session = playedSession(['blue']);
  session.quit();
  const restored = createMatchSession();
  assert.equal(restored.load(session.toSave('setup')), false);
  assert.equal(restored.archives.length, 1);
});

test('sauvegarde abîmée ou absente : rien ne casse', () => {
  const session = createMatchSession();
  assert.equal(session.load(null), false);
  assert.equal(session.load({ screen: 'game', history: 'oops', archives: [{}, null] }), false);
  assert.deepEqual(session.archives, []);
  assert.equal(session.load({ screen: 'game', history: [{ team: 'vert' }, { team: 'blue' }] }), true);
  assert.equal(session.history.length, 1);
});

test('command : point → effet avec annonce et bip, ligne de journal notée', () => {
  const session = createMatchSession();
  session.start({ blue: '', red: '' });
  const effect = session.command('blue', 'voice', 'allez bleu', 1000);
  assert.deepEqual(effect, { kind: 'point', team: 'blue', say: 'quinze zéro', beep: 'point' });
  assert.deepEqual(session.log, [{ t: 1000, src: 'voice', text: 'allez bleu', result: 'blue' }]);
  assert.equal(session.counters.voice, 1);
});

test('command : annuler, puis rien à annuler', () => {
  const session = createMatchSession();
  session.start({ blue: '', red: '' });
  session.command('red', 'touch', '', 0);
  assert.deepEqual(session.command('undo', 'touch', '', 1),
    { kind: 'undo', say: 'point annulé, retour au début du match', beep: 'undo' });
  assert.deepEqual(session.command('undo', 'voice', 'annule', 2),
    { kind: 'nothing-to-undo', say: 'rien à annuler', beep: 'undo' });
  assert.deepEqual(session.counters, { voice: 0, touch: 1, voiceUndo: 1, touchUndo: 1 });
});

test('command : point après la fin du match → refusé, et noté comme tel au journal', () => {
  const session = playedSession(Array(48).fill('blue'));
  assert.deepEqual(session.command('red', 'voice', 'rouge', 99), { kind: 'refused' });
  assert.equal(session.log.at(-1).result, 'refused');
  assert.equal(session.command('undo', 'touch', '', 100).kind, 'undo');   // « annule » reste possible
});
