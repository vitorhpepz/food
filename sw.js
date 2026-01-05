self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('food-monitor-v7').then(cache =>
      cache.addAll([
        './',
        './index.html',
        './styles.css',
        './app.js',
        './manifest.webmanifest'
      ])
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== 'food-monitor-v7').map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
