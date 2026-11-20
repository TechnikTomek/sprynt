/* Sprynt – rejestracja service workera i instalacja aplikacji (PWA). Działa tylko przez https. */
(function () {
  "use strict";
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  // Chrome/Edge/Android: przeglądarka pozwala pokazać własny przycisk „Zainstaluj”.
  addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); window.__installEvt = e; document.documentElement.classList.add("can-install"); });
  addEventListener("appinstalled", function () { window.__installEvt = null; document.documentElement.classList.remove("can-install"); });
  window.SPInstall = {
    available: function () { return !!window.__installEvt; },
    standalone: function () { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; },
    prompt: function () {
      var e = window.__installEvt; if (!e) return Promise.resolve(false);
      e.prompt(); return e.userChoice.then(function (c) { window.__installEvt = null; return c.outcome === "accepted"; });
    },
    /** Instrukcja dla przeglądarek bez przycisku instalacji (Safari, Firefox). */
    howTo: function () {
      var ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/.test(ua)) return "Na iPhonie: otwórz Sprynt w Safari, stuknij „Udostępnij” i wybierz „Do ekranu początkowego”.";
      if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return "W Safari na Macu: menu Plik → „Dodaj do Docka”.";
      if (/Firefox/.test(ua)) return "Firefox na komputerze nie instaluje aplikacji internetowych – otwórz Sprynt w Chrome lub Edge i kliknij ikonę instalacji w pasku adresu. Na Androidzie: menu ⋮ → „Zainstaluj”.";
      return "Kliknij ikonę instalacji w pasku adresu przeglądarki albo menu ⋮ → „Zainstaluj Sprynt”.";
    },
  };
})();
