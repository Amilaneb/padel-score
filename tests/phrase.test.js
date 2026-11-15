'use strict';

// Écoute de phrase : chaque résultat du micro, rejoué comme Chrome l'envoie.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPhraseListener, PHRASE_CONTINUATION_MS, MAX_PHRASE_WORDS } = require('../app.js');

/** Rejoue une suite de résultats ; renvoie les décisions. */
function replayResults(results) {
  const listener = createPhraseListener();
  return results.map(({ texts, final = true, muted = false, at = 0 }) =>
    listener.hear({ transcripts: texts, isFinal: final, muted, now: at }));
}
const types = (decisions) => decisions.map((d) => (d.type === 'command' ? d.cmd : d.type));

test('un mot seul : commande', () => {
  assert.deepEqual(types(replayResults([{ texts: ['bleu'] }])), ['blue']);
});

test('commande au milieu d\'une phrase, provisoire puis définitive : comptée une fois', () => {
  assert.deepEqual(types(replayResults([
    { texts: ['ok bon'], final: false },
    { texts: ['ok bon allez bleu'], final: false },
    { texts: ['ok bon allez bleu c\'est parti'], final: true },
  ])), ['interim', 'blue', 'none']);
});

test('Android : la phrase qui grandit en résultats définitifs successifs (journal du 02/11)', () => {
  assert.deepEqual(types(replayResults([
    { texts: ['et'], at: 0 },
    { texts: ['et c\'est du'], at: 100 },
    { texts: ['et c\'est du rouge'], at: 200 },
    { texts: ['et c\'est du rouge comme ça'], at: 400 },
  ])), ['unknown', 'unknown', 'red', 'none']);   // chaque version sans commande est notée telle quelle
});

test('Android : résultat identique renvoyé juste après, pas de 2e point', () => {
  assert.deepEqual(types(replayResults([
    { texts: ['rouge'], at: 0 },
    { texts: ['rouge'], at: 300 },
  ])), ['red', 'none']);
});

test('même commande dite deux fois de suite (plus tard) : deux points', () => {
  // Bug de la 1re version : le 2e « bleu » était ignoré sans rien écrire au journal
  assert.deepEqual(types(replayResults([
    { texts: ['bleu'], at: 0 },
    { texts: ['bleu'], final: false, at: 5000 },
    { texts: ['bleu'], at: 5200 },
  ])), ['blue', 'blue', 'none']);
});

test('la suite d\'une phrase définitive n\'est plus continuée après le délai', () => {
  assert.deepEqual(types(replayResults([
    { texts: ['bleu'], at: 0 },
    { texts: ['bleu encore'], at: PHRASE_CONTINUATION_MS + 1 },
  ])), ['blue', 'blue']);
});

test('pendant une annonce : tout est consommé, la phrase définitive est marquée ignorée', () => {
  assert.deepEqual(types(replayResults([
    { texts: ['jeu'], final: false, muted: true, at: 0 },
    { texts: ['jeu bleu'], final: true, muted: true, at: 100 },
    { texts: ['jeu bleu un jeu'], final: true, muted: false, at: 500 },   // fin d'annonce : déjà consommé
  ])), ['none', 'ignored', 'none']);
});

test('commande trouvée dans une interprétation secondaire : la suite reste cohérente', () => {
  assert.deepEqual(types(replayResults([
    { texts: ['bonjour à tous les', 'bonjour à tous bleu'], final: false, at: 0 },
    { texts: ['bonjour à tous bleu rouge'], final: false, at: 100 },
  ])), ['blue', 'red']);
});

test('écho d\'annonce entendu hors annonce : pas de commande', () => {
  assert.deepEqual(types(replayResults([{ texts: ['avantage rouge'] }])), ['unknown']);
});

test(`phrase provisoire de ${MAX_PHRASE_WORDS} mots : relance demandée`, () => {
  const [short, long] = replayResults([
    { texts: ['on parle encore'], final: false },
    { texts: ['on parle on parle on parle encore et encore toujours'], final: false },
  ]);
  assert.equal(short.restart, false);
  assert.equal(long.restart, true);
});

test('reset : la phrase suivante repart de zéro', () => {
  const listener = createPhraseListener();
  listener.hear({ transcripts: ['bleu'], isFinal: false, muted: false, now: 0 });
  listener.reset();
  const d = listener.hear({ transcripts: ['bleu'], isFinal: false, muted: false, now: 10 });
  assert.equal(d.cmd, 'blue');
});
