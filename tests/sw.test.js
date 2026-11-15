'use strict';

// Service worker : la liste des fichiers gardés pour le hors-ligne doit suivre la page.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** Fichiers listés dans FILES (sw.js). */
function cachedFiles() {
  const match = read('sw.js').match(/const FILES = \[([^\]]*)\]/);
  assert.ok(match, 'FILES introuvable dans sw.js');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('chaque fichier chargé par index.html et le manifest est gardé pour le hors-ligne', () => {
  const html = read('index.html');
  const fromHtml = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
  const fromManifest = JSON.parse(read('manifest.json')).icons.map((icon) => icon.src);
  const cached = cachedFiles();
  for (const file of new Set([...fromHtml, ...fromManifest])) {
    assert.ok(cached.includes(file), `${file} manque dans FILES (sw.js)`);
  }
});

test('chaque fichier de FILES existe', () => {
  for (const file of cachedFiles()) {
    if (file === './') continue;
    assert.ok(fs.existsSync(path.join(root, file)), `${file} n'existe pas`);
  }
});
