'use strict';

// Service worker : garde une copie de l'appli pour qu'elle se lance sans réseau.
// Stratégie « réseau d'abord » : en ligne, on prend toujours la dernière version publiée
// (pas de problème de mise à jour) ; sans réseau ou réseau trop lent, on sert la copie gardée.

const CACHE = 'padel-score';
const FILES = ['./', 'index.html', 'app.js', 'style.css', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];
const NETWORK_TIMEOUT_MS = 3000;   // au-delà, on n'attend plus le réseau (4G faible au club)

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fromNetwork = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  fromNetwork.catch(() => {});   // l'échec du réseau est géré plus bas
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const response = await Promise.race([fromNetwork, timeout]);
    if (response) return response;
  } catch (e) {
    // Pas de réseau : on passe à la copie gardée.
  }
  const cached = await cache.match(request, { ignoreSearch: true })
    || (request.mode === 'navigate' ? await cache.match('./') : undefined);
  return cached || fromNetwork;   // rien en cache : on attend quand même le réseau
}
