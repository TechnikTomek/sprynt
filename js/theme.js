/* Motyw (jasny / ciemny / systemowy) – wspólny dla strony startowej i aplikacji.
 * Ładowany w <head> przed CSS, żeby nie było mignięcia jasnego motywu.
 * Wyjątek od zasady „tylko data.js dotyka localStorage”: to preferencja wyglądu, nie dane. */
(function () {
  "use strict";
  var KEY = "sprynt:theme";
  var root = document.documentElement;
  var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false, addEventListener: function () {} };
  function pref() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
  function apply() {
    var p = pref();
    root.setAttribute("data-theme", p === "system" ? (mq.matches ? "dark" : "light") : p);
    root.setAttribute("data-theme-pref", p);
  }
  apply();
  mq.addEventListener("change", apply);
  addEventListener("storage", function (e) { if (e.key === KEY) { apply(); dispatchEvent(new Event("themechange")); } });
  window.SPTheme = {
    pref: pref,
    current: function () { return root.getAttribute("data-theme"); },
    set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} apply(); dispatchEvent(new Event("themechange")); },
    toggle: function () { this.set(this.current() === "dark" ? "light" : "dark"); },
  };
})();
