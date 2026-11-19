/* Sprynt – konta i sesja (lokalnie, w tej przeglądarce).
 * Hasła nie są zapisywane: przechowujemy sól i skrót PBKDF2-SHA256 (150 000 iteracji).
 * To NIE jest bezpieczeństwo serwerowe – konto i dane żyją tylko w tej przeglądarce,
 * dopóki nie podłączymy backendu. */
(function () {
  "use strict";
  var ACC = "sprynt:accounts", SES = "sprynt:session";
  var store = {
    get: function (k, s) { try { return JSON.parse((s || localStorage).getItem(k)); } catch (e) { return null; } },
    set: function (k, v, s) { try { (s || localStorage).setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k, s) { try { (s || localStorage).removeItem(k); } catch (e) {} },
  };
  // Dane demo z poprzedniej wersji (jeden wspólny zestaw) – już niepotrzebne.
  store.del("sprynt:db");

  function accounts() { return store.get(ACC) || []; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function unhex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function hash(password, saltHex) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error("Ta przeglądarka nie pozwala bezpiecznie zapisać hasła. Otwórz Sprynt w aktualnym Chrome, Safari, Edge lub Firefoksie."));
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]).then(function (key) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", salt: unhex(saltHex), iterations: 150000, hash: "SHA-256" }, key, 256);
    }).then(hex);
  }
  function same(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function startSession(acc, remember) {
    var s = { userId: acc.id, at: Date.now() };
    store.del(SES); store.del(SES, sessionStorage);
    store.set(SES, s, remember ? localStorage : sessionStorage);
  }
  var fails = 0, lockedUntil = 0;

  window.SPAuth = {
    /** Zalogowany użytkownik {id, name, email, firstProject} albo null. */
    current: function () {
      var s = store.get(SES) || store.get(SES, sessionStorage);
      if (!s) return null;
      var a = accounts().find(function (x) { return x.id === s.userId; });
      return a ? { id: a.id, name: a.name, email: a.email, firstProject: a.firstProject } : null;
    },
    register: function (o) {
      var name = String(o.name || "").trim(), email = normEmail(o.email), project = String(o.project || "").trim() || "Mój projekt";
      if (!name) return Promise.reject(Object.assign(new Error("Podaj swoje imię."), { field: "name" }));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.reject(Object.assign(new Error("Podaj poprawny adres e-mail."), { field: "email" }));
      if (String(o.password || "").length < 8) return Promise.reject(Object.assign(new Error("Hasło musi mieć co najmniej 8 znaków."), { field: "password" }));
      if (accounts().some(function (a) { return a.email === email; })) return Promise.reject(Object.assign(new Error("Konto z tym adresem już istnieje. Zaloguj się."), { field: "email" }));
      var salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      return hash(o.password, salt).then(function (h) {
        var acc = { id: "u" + hex(crypto.getRandomValues(new Uint8Array(6))), name: name, email: email, salt: salt, hash: h, firstProject: project, createdAt: new Date().toISOString() };
        var list = accounts(); list.push(acc);
        if (!store.set(ACC, list)) throw new Error("Nie udało się zapisać konta – przeglądarka blokuje zapis danych.");
        startSession(acc, o.remember !== false);
        return SPAuth.current();
      });
    },
    login: function (o) {
      if (Date.now() < lockedUntil) return Promise.reject(new Error("Za dużo nieudanych prób. Spróbuj ponownie za " + Math.ceil((lockedUntil - Date.now()) / 1000) + " s."));
      var email = normEmail(o.email);
      if (!email || !o.password) return Promise.reject(Object.assign(new Error("Podaj e-mail i hasło."), { field: !email ? "email" : "password" }));
      var acc = accounts().find(function (a) { return a.email === email; });
      // Haszujemy nawet przy nieznanym e-mailu, żeby czas odpowiedzi nie zdradzał, czy konto istnieje.
      return hash(o.password, acc ? acc.salt : "00000000000000000000000000000000").then(function (h) {
        if (!acc || !same(h, acc.hash)) {
          if (++fails >= 5) { lockedUntil = Date.now() + 30000; fails = 0; }
          throw Object.assign(new Error("Nieprawidłowy e-mail lub hasło."), { field: "password" });
        }
        fails = 0;
        startSession(acc, o.remember !== false);
        return SPAuth.current();
      });
    },
    logout: function () { store.del(SES); store.del(SES, sessionStorage); },
    /** Zmiana imienia i/lub e-maila zalogowanego konta. */
    updateProfile: function (o) {
      var me = SPAuth.current(); if (!me) return Promise.reject(new Error("Nie jesteś zalogowany."));
      var name = String(o.name || "").trim(), email = normEmail(o.email);
      if (!name) return Promise.reject(Object.assign(new Error("Podaj imię."), { field: "name" }));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.reject(Object.assign(new Error("Podaj poprawny adres e-mail."), { field: "email" }));
      var list = accounts();
      if (list.some(function (a) { return a.email === email && a.id !== me.id; })) return Promise.reject(Object.assign(new Error("Ten e-mail jest już używany przez inne konto."), { field: "email" }));
      list.forEach(function (a) { if (a.id === me.id) { a.name = name; a.email = email; } });
      store.set(ACC, list);
      return Promise.resolve(SPAuth.current());
    },
    /** Weryfikuje hasło zalogowanego konta (do zmiany hasła i usunięcia konta). */
    verify: function (password) {
      var me = SPAuth.current(), acc = me && accounts().find(function (a) { return a.id === me.id; });
      if (!acc) return Promise.reject(new Error("Nie jesteś zalogowany."));
      return hash(String(password || ""), acc.salt).then(function (h) { if (!same(h, acc.hash)) throw Object.assign(new Error("Nieprawidłowe obecne hasło."), { field: "current" }); return acc; });
    },
    changePassword: function (current, next) {
      if (String(next || "").length < 8) return Promise.reject(Object.assign(new Error("Nowe hasło musi mieć co najmniej 8 znaków."), { field: "next" }));
      return SPAuth.verify(current).then(function (acc) {
        var salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        return hash(next, salt).then(function (h) {
          var list = accounts();
          list.forEach(function (a) { if (a.id === acc.id) { a.salt = salt; a.hash = h; } });
          store.set(ACC, list);
        });
      });
    },
    /** Usuwa konto (po potwierdzeniu hasłem). Dane konta usuwa wywołujący (SP.db.wipe + pliki). */
    deleteAccount: function (password) {
      return SPAuth.verify(password).then(function (acc) {
        store.set(ACC, accounts().filter(function (a) { return a.id !== acc.id; }));
        SPAuth.logout();
        return acc.id;
      });
    },
  };
})();
