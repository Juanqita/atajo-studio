/* Service worker del probador: modo sin conexión (útil para el tótem de vitrina).
   - Archivos pesados (modelo de visión, motor wasm, librería, de esta web o de las CDN): primero la caché.
   - Páginas, estilos y código de la app: primero la red (siempre la última versión) y, sin internet, la caché.
   No guarda fotos ni video: la cámara se procesa en el equipo y nunca pasa por aquí. */
const VERSION = "probador-v1";
const HEAVY = "probador-pesados-v1";
const SHELL = ["./", "index.html", "css/app.css", "favicon.svg", "widget.js", "vendor/qrcode.js",
  "js/app.js", "js/db.js", "js/engine.js", "js/garment.js", "js/filters.js", "js/ambient.js", "js/capture.js", "js/tryon.js",
  "lib/vision_bundle.mjs"];
const isHeavy = url => /\/(wasm|models|lib)\/|\.wasm$|\.task$|cdn\.jsdelivr\.net\/npm\/@mediapipe|storage\.googleapis\.com\/mediapipe-models/.test(url);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== HEAVY).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;
  const same = new URL(url).origin === self.location.origin;
  if (isHeavy(url)) {
    e.respondWith(caches.open(HEAVY).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (!same) return; // fuentes y otros sitios: el navegador decide
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
