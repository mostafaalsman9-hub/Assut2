/* عامل الخدمة: تشغيل واجهة المنصة بدون إنترنت (البيانات تُخزّن للطالب فقط داخل التطبيق) */
const V = 'assut-shell-v13';
const SHELL = ['./', './index.html', './app.js?v=11', './owner-controls.js?v=6', './student-import.js?v=5', './responsive.js?v=2', './autosave.js?v=1',
  './fs-adapter.js?v=10', './styles.css?v=2', './theme.css?v=4', './modern.css?v=3', './favicon.svg', './app-icon.jpg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    // الأحدث من الشبكة أولاً، وعند انقطاع الإنترنت من المخزن
    e.respondWith(fetch(r, r.mode === 'navigate' || /\.html?$|\/$/.test(u.pathname) ? { cache: 'no-cache' } : undefined).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: false }).then(m => m || caches.match(r, { ignoreSearch: true })).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
  } else if (CDN.test(r.url)) {
    e.respondWith(caches.match(r).then(m => {
      const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; }).catch(() => m);
      return m || net;
    }));
  }
});
