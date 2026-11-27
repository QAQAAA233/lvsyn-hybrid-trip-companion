const CACHE_NAME = 'lvsyn-hybrid-shell-req211-v2-283ac9d9-608e2f71-source-proof-1126-native-boundary-attempt-v1-durable-ui-same-trip-subpath-v1';
const SUPERSEDED_CONTEST_CACHES = new Set([
  'lvsyn-hybrid-shell-v1',
  'lvsyn-hybrid-shell-req211-v2',
  'lvsyn-hybrid-shell-req211-v2-283ac9d9-608e2f71',
  'lvsyn-hybrid-shell-req211-v2-283ac9d9-608e2f71-source-proof-1126',
  'lvsyn-hybrid-shell-req211-v2-283ac9d9-608e2f71-source-proof-1126-native-boundary',
  'lvsyn-hybrid-shell-req211-v2-283ac9d9-608e2f71-source-proof-1126-native-boundary-attempt-v1',
  'lvsyn-hybrid-shell-req211-v2-283ac9d9-608e2f71-source-proof-1126-native-boundary-attempt-v1-durable-ui',
  'lvsyn-hybrid-shell-req211-v2-283ac9d9-608e2f71-source-proof-1126-native-boundary-attempt-v1-durable-ui-same-trip',
]);

const SCOPE_URL = new URL('./', self.registration.scope);
const scopedUrl = (rel) => new URL(rel, SCOPE_URL).href;

const CORE_ASSETS = [
  'manifest.webmanifest',
  'icon.svg',
  'samples/kyoto-teahouse-sign.png',
  'samples/alpine-cablecar-notice.png',
].map(scopedUrl);

async function stageOfflineShell() {
  const request = (url) => new Request(url, {
    cache: 'reload',
    redirect: 'error',
  });
  const indexUrl = scopedUrl('index.html');
  const rootUrl = SCOPE_URL.href;
  const entry = request(indexUrl);
  const index = await fetch(entry);
  if (!index.ok || !/^text\/html(?:;|$)/i.test(index.headers.get('content-type') || '')) {
    throw new Error('OFFLINE_SHELL_INDEX_UNVERIFIED');
  }
  const html = await index.clone().text();
  // Resolve Vite entry assets against the service worker registration scope so both "/" and subpaths (e.g. GitHub Pages) work.
  const assets = [...new Set([...html.matchAll(
    /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']*assets\/[A-Za-z0-9._-]+\.(?:js|css))["']/gi
  )].map((m) => scopedUrl(m[1])))];
  if (!assets.some((assetUrl) => assetUrl.endsWith('.js')) || !assets.some((assetUrl) => assetUrl.endsWith('.css'))) {
    throw new Error('OFFLINE_SHELL_ENTRY_ASSETS_MISSING');
  }
  const responses = await Promise.all(assets.map(async (assetUrl) => {
    const req = request(assetUrl);
    const res = await fetch(req);
    const mime = res.headers.get('content-type') || '';
    const expected = assetUrl.endsWith('.css') ? /^text\/css(?:;|$)/i :
      /^(?:text|application)\/(?:x-)?javascript(?:;|$)/i;
    if (!res.ok || !expected.test(mime)) throw new Error('OFFLINE_SHELL_ENTRY_ASSET_UNVERIFIED');
    return [req, res];
  }));
  // Never activate over a working previous release until all entry bytes exist.
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_ASSETS.map(request));
  await Promise.all(responses.map(([req, res]) => cache.put(req, res)));
  await cache.put(request(rootUrl), index.clone());
  await cache.put(entry, index);
}

self.addEventListener('install', (event) => {
  event.waitUntil(stageOfflineShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => SUPERSEDED_CONTEST_CACHES.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE_URL.href)) return;
  const relPath = url.pathname.slice(SCOPE_URL.pathname.length);

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(req)).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (response && response.ok && (relPath.startsWith('assets/') || relPath.startsWith('samples/') || relPath === '')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      }).catch(() => {
        if (req.mode === 'navigate') {
          return caches.open(CACHE_NAME).then((cache) => cache.match(scopedUrl('index.html')));
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
