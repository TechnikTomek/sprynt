/* Sprynt – service worker: aplikacja działa offline i da się ją zainstalować.
 * Własne pliki: najpierw sieć (zawsze najnowsza wersja), bez sieci – kopia z pamięci.
 * Biblioteki z CDN i fonty: kopia z pamięci, odświeżana w tle. Supabase i Anthropic – zawsze sieć. */
var CACHE = "sprynt-v7";
var SHELL = ["./", "index.html", "app.html", "manifest.webmanifest", "css/app.css", "css/auth.css", "css/landing.css", "img/logo.svg", "img/icon-192.png", "img/icon-512.png",
  "js/ai.js", "js/anim.js", "js/app.js", "js/auth.js", "js/cloud.js", "js/config.js", "js/data.js", "js/extract.js", "js/extras.js", "js/files.js", "js/icons.js", "js/insights.js", "js/invite.js", "js/landing.js", "js/login.js", "js/magic.js", "js/more.js", "js/onboard.js", "js/recap.js", "js/pwa.js", "js/task.js", "js/theme.js", "js/sprints.js", "js/ui.js", "js/views.js", "js/whiteboard.js"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
var CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // cache: "no-cache" – zawsze pytamy serwer o nowszą wersję (GitHub Pages pozwala przeglądarce trzymać pliki 10 min,
    // przez co po aktualizacji użytkownik dostawał stary kod). Nawigacja: redirect "manual" (wymóg dla odpowiedzi na nawigację).
    var fresh = new Request(req.url, { cache: "no-cache", credentials: "same-origin", redirect: req.mode === "navigate" ? "manual" : "follow" });
    e.respondWith(fetch(fresh).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (m) { return m || caches.match("app.html"); }); }));
    return;
  }
  if (CDN.test(req.url)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
  }
});
