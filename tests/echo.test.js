'use strict';

// Anti-écho : quand le micro doit ignorer ce qu'il entend (horloge passée en paramètre).

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEchoGuard, ECHO_GUARD_MS, SPEECH_MAX_MS } = require('../app.js');

test('au départ, le micro écoute', () => {
  assert.equal(createEchoGuard().muted(0), false);
});

test('commande acceptée : sourd tout de suite, avant même l\'annonce', () => {
  const echo = createEchoGuard();
  echo.hold(1000);
  assert.equal(echo.muted(1001), true);
});

test('fin d\'annonce : le micro rouvre après la marge anti-écho', () => {
  const echo = createEchoGuard();
  echo.hold(0);
  const token = echo.speechStarted(180);
  echo.speechEnded(token, 2000);
  assert.equal(echo.muted(2000 + ECHO_GUARD_MS - 1), true);
  assert.equal(echo.muted(2000 + ECHO_GUARD_MS), false);
});

test('annonce remplacée par une autre : la fin de la 1re ne rouvre pas le micro', () => {
  const echo = createEchoGuard();
  const first = echo.speechStarted(0);
  echo.speechStarted(500);           // 2e annonce (point suivant)
  echo.speechEnded(first, 600);      // la 1re est coupée
  assert.equal(echo.muted(600 + ECHO_GUARD_MS + 1), true);
});

test('fin d\'annonce jamais signalée : le micro rouvre quand même après la durée max', () => {
  const echo = createEchoGuard();
  echo.speechStarted(0);
  assert.equal(echo.muted(SPEECH_MAX_MS - 1), true);
  assert.equal(echo.muted(SPEECH_MAX_MS), false);
});
