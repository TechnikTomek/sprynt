/* Sprynt – konta i sesja.
 * Dwa tryby z tym samym interfejsem SPAuth:
 *  • CHMURA (Supabase) – gdy js/config.js ma url i anonKey: prawdziwe konta, potwierdzenie e-maila,
 *    reset hasła, logowanie z każdego urządzenia. Sesję trzyma supabase-js (klucz „sprynt-cloud-auth”).
 *  • LOKALNY – konta tylko w tej przeglądarce: sól + skrót PBKDF2-SHA256 (150 000 iteracji). */
(function () {
  "use strict";
  var ACC = "sprynt:accounts", SES = "sprynt:session";
  var store = {
    get: function (k, s) { try { return JSON.parse((s || localStorage).getItem(k)); } catch (e) { return null; } },
    set: function (k, v, s) { try { (s || localStorage).setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k, s) { try { (s || localStorage).removeItem(k); } catch (e) {} },
  };
  store.del("sprynt:db"); // dane demo z pierwszej wersji
  var err = function (msg, field, extra) { return Object.assign(new Error(msg), { field: field }, extra || {}); };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function validate(o) {
    var name = String(o.name || "").trim(), email = normEmail(o.email);
    if (!name) return err("Podaj swoje imię.", "name");
    if (!EMAIL.test(email)) return err("Podaj poprawny adres e-mail.", "email");
    if (String(o.password || "").length < 8) return err("Hasło musi mieć co najmniej 8 znaków.", "password");
    return null;
  }

  /* =========================== TRYB CHMURY (Supabase) =========================== */
  var CFG = window.SPRYNT_CLOUD || {};
  if (CFG.url && CFG.anonKey) {
    var KEY = "sprynt-cloud-auth", REM = "sprynt:cloud-remember";
    var PUBLIC_APP = "https://techniktomek.github.io/sprynt/app.html";
    var remember = function () { try { return localStorage.getItem(REM) !== "0"; } catch (e) { return true; } };
    // Sesja w localStorage („Zapamiętaj mnie”) albo sessionStorage (do zamknięcia karty).
    var storage = {
      getItem: function (k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
      setItem: function (k, v) { try { if (remember()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); } else { sessionStorage.setItem(k, v); localStorage.removeItem(k); } } catch (e) {} },
      removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} },
    };
    var appUrl = function () { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/[^/]*$/, "app.html") : PUBLIC_APP; };
    var client = window.supabase && window.supabase.createClient ? window.supabase.createClient(CFG.url, CFG.anonKey, {
      auth: { storageKey: KEY, storage: storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    }) : null;
    var need = function () { if (!client) throw err("Brak połączenia z chmurą – sprawdź internet i odśwież stronę."); return client; };
    var userOf = function (u) {
      if (!u) return null;
      var m = u.user_metadata || {};
      return { id: u.id, name: m.name || (u.email || "").split("@")[0], email: u.email, firstProject: m.project || "Mój projekt", cloud: true, confirmed: !!(u.email_confirmed_at || u.confirmed_at) };
    };
    // Komunikaty Supabase Auth → po polsku (po kodzie błędu, a nie po treści).
    var MSG = {
      invalid_credentials: ["Nieprawidłowy e-mail lub hasło.", "password"],
      email_not_confirmed: ["Najpierw potwierdź adres e-mail – kliknij link, który wysłaliśmy.", "email"],
      user_already_exists: ["Konto z tym adresem już istnieje. Zaloguj się.", "email"],
      email_exists: ["Konto z tym adresem już istnieje. Zaloguj się.", "email"],
      weak_password: ["Hasło jest za słabe – użyj dłuższego i mniej oczywistego.", "password"],
      same_password: ["Nowe hasło musi być inne niż obecne.", "next"],
      email_address_invalid: ["Ten adres e-mail jest nieprawidłowy albo zablokowany.", "email"],
      over_request_rate_limit: ["Za dużo prób – spróbuj ponownie za chwilę.", "password"],
      signup_disabled: ["Rejestracja jest teraz wyłączona.", "email"],
      email_address_not_authorized: ["Serwer poczty Sprynt nie może jeszcze wysyłać e-maili na ten adres (darmowa poczta Supabase działa tylko dla członków projektu). Administrator musi podłączyć własny serwer poczty albo wyłączyć potwierdzanie e-maila.", "email"],
      over_email_send_rate_limit: ["Wysłaliśmy już limit e-maili na tę godzinę – spróbuj ponownie później albo poproś administratora o podłączenie serwera poczty.", "email"],
    };
    var mapErr = function (e) {
      if (!e) return null;
      var m = MSG[e.code];
      if (m) return err(m[0], m[1], { code: e.code });
      if (e.status === 0 || /fetch|network/i.test(String(e.name) + " " + String(e.message))) return err("Brak połączenia z chmurą – sprawdź internet.", null, { code: "network" });
      return err(e.message || "Błąd logowania.", null, { code: e.code });
    };
    var ok = function (r) { if (r.error) throw mapErr(r.error); return r.data; };
    var hash = location.hash || "";

    window.SPAuth = {
      mode: "cloud",
      cloud: true,
      client: client,
      appUrl: appUrl,
      /** Link z e-maila (potwierdzenie, reset hasła) – supabase-js przetwarza go sam. */
      urlAuth: /access_token=|error_description=/.test(hash) ? (/type=recovery/.test(hash) ? "recovery" : /error_description=/.test(hash) ? "error" : "signup") : null,
      urlError: (/error_description=([^&]+)/.exec(hash) || [])[1] ? decodeURIComponent(/error_description=([^&]+)/.exec(hash)[1].replace(/\+/g, " ")) : null,
      current: function () {
        var s = null; try { s = JSON.parse(storage.getItem(KEY)); } catch (e) {}
        var u = s && (s.user || (s.currentSession && s.currentSession.user));
        return userOf(u);
      },
      onChange: function (fn) { if (client) client.auth.onAuthStateChange(function (ev, session) { setTimeout(function () { fn(ev, session); }, 0); }); },
      register: function (o) {
        var bad = validate(o); if (bad) return Promise.reject(bad);
        try { localStorage.setItem(REM, o.remember === false ? "0" : "1"); } catch (e) {}
        return Promise.resolve().then(function () {
          return need().auth.signUp({ email: normEmail(o.email), password: o.password, options: { data: { name: String(o.name).trim(), project: String(o.project || "").trim() || "Mój projekt" }, emailRedirectTo: appUrl() } });
        }).then(ok).then(function (d) {
          // Gdy adres już istnieje (przy włączonym potwierdzaniu), Supabase zwraca użytkownika bez tożsamości.
          if (d.user && Array.isArray(d.user.identities) && !d.user.identities.length) throw err("Konto z tym adresem już istnieje. Zaloguj się albo zresetuj hasło.", "email");
          if (d.session) return SPAuth.current() || userOf(d.user);
          // Bez weryfikacji e-maila: od razu logujemy. Gdy serwer nadal wymaga potwierdzenia
          // (Supabase → Authentication → Email → „Confirm email” włączone), zostaje ekran „sprawdź skrzynkę”.
          return need().auth.signInWithPassword({ email: normEmail(o.email), password: o.password }).then(function (r) {
            if (!r.error && r.data && r.data.session) return SPAuth.current() || userOf(r.data.user);
            return { pending: true, email: normEmail(o.email) };
          });
        });
      },
      login: function (o) {
        var email = normEmail(o.email);
        if (!email || !o.password) return Promise.reject(err("Podaj e-mail i hasło.", !email ? "email" : "password"));
        try { localStorage.setItem(REM, o.remember === false ? "0" : "1"); } catch (e) {}
        return Promise.resolve().then(function () { return need().auth.signInWithPassword({ email: email, password: o.password }); }).then(ok).then(function (d) { return SPAuth.current() || userOf(d.user); });
      },
      logout: function () { var p = client ? client.auth.signOut().catch(function () {}) : Promise.resolve(); return p.then(function () { storage.removeItem(KEY); }); },
      resend: function (email) { return Promise.resolve().then(function () { return need().auth.resend({ type: "signup", email: normEmail(email), options: { emailRedirectTo: appUrl() } }); }).then(ok); },
      resetPassword: function (email) {
        email = normEmail(email); if (!EMAIL.test(email)) return Promise.reject(err("Wpisz swój adres e-mail.", "email"));
        return Promise.resolve().then(function () { return need().auth.resetPasswordForEmail(email, { redirectTo: appUrl() }); }).then(ok);
      },
      setNewPassword: function (pw) {
        if (String(pw || "").length < 8) return Promise.reject(err("Hasło musi mieć co najmniej 8 znaków.", "password"));
        return Promise.resolve().then(function () { return need().auth.updateUser({ password: pw }); }).then(ok);
      },
      updateProfile: function (o) {
        var me = SPAuth.current(); if (!me) return Promise.reject(err("Nie jesteś zalogowany."));
        var name = String(o.name || "").trim(), email = normEmail(o.email);
        if (!name) return Promise.reject(err("Podaj imię.", "name"));
        if (!EMAIL.test(email)) return Promise.reject(err("Podaj poprawny adres e-mail.", "email"));
        var patch = { data: { name: name, project: me.firstProject } }; if (email !== me.email) patch.email = email;
        return Promise.resolve().then(function () { return need().auth.updateUser(patch, { emailRedirectTo: appUrl() }); }).then(ok).then(function () {
          var u = SPAuth.current() || me; u.name = name; if (patch.email) u.pendingEmail = email; return u;
        });
      },
      verify: function (password) {
        var me = SPAuth.current(); if (!me) return Promise.reject(err("Nie jesteś zalogowany."));
        return Promise.resolve().then(function () { return need().auth.signInWithPassword({ email: me.email, password: String(password || "") }); }).then(function (r) {
          if (r.error) throw r.error.code === "invalid_credentials" ? err("Nieprawidłowe obecne hasło.", "current") : mapErr(r.error);
          return me;
        });
      },
      changePassword: function (current, next) {
        if (String(next || "").length < 8) return Promise.reject(err("Nowe hasło musi mieć co najmniej 8 znaków.", "next"));
        return SPAuth.verify(current).then(function () { return need().auth.updateUser({ password: next }); }).then(ok);
      },
      /** Usuwa konto w chmurze. beforeDelete() (np. kasowanie plików) działa, póki jeszcze jesteśmy zalogowani. */
      deleteAccount: function (password, beforeDelete) {
        return SPAuth.verify(password).then(function (me) {
          return Promise.resolve(beforeDelete && beforeDelete()).then(function () { return need().rpc("delete_my_account"); }).then(function (r) {
            if (r.error) throw err("Nie udało się usunąć konta: " + r.error.message);
            return SPAuth.logout().then(function () { return me.id; });
          });
        });
      },
    };
    return;
  }

  /* =========================== TRYB LOKALNY =========================== */
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
  function startSession(acc, remember) {
    var s = { userId: acc.id, at: Date.now() };
    store.del(SES); store.del(SES, sessionStorage);
    store.set(SES, s, remember ? localStorage : sessionStorage);
  }
  var fails = 0, lockedUntil = 0;

  window.SPAuth = {
    mode: "local",
    cloud: false,
    current: function () {
      var s = store.get(SES) || store.get(SES, sessionStorage);
      if (!s) return null;
      var a = accounts().find(function (x) { return x.id === s.userId; });
      return a ? { id: a.id, name: a.name, email: a.email, firstProject: a.firstProject } : null;
    },
    onChange: function () {},
    register: function (o) {
      var bad = validate(o); if (bad) return Promise.reject(bad);
      var name = String(o.name).trim(), email = normEmail(o.email), project = String(o.project || "").trim() || "Mój projekt";
      if (accounts().some(function (a) { return a.email === email; })) return Promise.reject(err("Konto z tym adresem już istnieje. Zaloguj się.", "email"));
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
      if (!email || !o.password) return Promise.reject(err("Podaj e-mail i hasło.", !email ? "email" : "password"));
      var acc = accounts().find(function (a) { return a.email === email; });
      // Haszujemy nawet przy nieznanym e-mailu, żeby czas odpowiedzi nie zdradzał, czy konto istnieje.
      return hash(o.password, acc ? acc.salt : "00000000000000000000000000000000").then(function (h) {
        if (!acc || !same(h, acc.hash)) {
          if (++fails >= 5) { lockedUntil = Date.now() + 30000; fails = 0; }
          throw err("Nieprawidłowy e-mail lub hasło.", "password");
        }
        fails = 0;
        startSession(acc, o.remember !== false);
        return SPAuth.current();
      });
    },
    logout: function () { store.del(SES); store.del(SES, sessionStorage); return Promise.resolve(); },
    updateProfile: function (o) {
      var me = SPAuth.current(); if (!me) return Promise.reject(new Error("Nie jesteś zalogowany."));
      var name = String(o.name || "").trim(), email = normEmail(o.email);
      if (!name) return Promise.reject(err("Podaj imię.", "name"));
      if (!EMAIL.test(email)) return Promise.reject(err("Podaj poprawny adres e-mail.", "email"));
      var list = accounts();
      if (list.some(function (a) { return a.email === email && a.id !== me.id; })) return Promise.reject(err("Ten e-mail jest już używany przez inne konto.", "email"));
      list.forEach(function (a) { if (a.id === me.id) { a.name = name; a.email = email; } });
      store.set(ACC, list);
      return Promise.resolve(SPAuth.current());
    },
    verify: function (password) {
      var me = SPAuth.current(), acc = me && accounts().find(function (a) { return a.id === me.id; });
      if (!acc) return Promise.reject(new Error("Nie jesteś zalogowany."));
      return hash(String(password || ""), acc.salt).then(function (h) { if (!same(h, acc.hash)) throw err("Nieprawidłowe obecne hasło.", "current"); return acc; });
    },
    changePassword: function (current, next) {
      if (String(next || "").length < 8) return Promise.reject(err("Nowe hasło musi mieć co najmniej 8 znaków.", "next"));
      return SPAuth.verify(current).then(function (acc) {
        var salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        return hash(next, salt).then(function (h) {
          var list = accounts();
          list.forEach(function (a) { if (a.id === acc.id) { a.salt = salt; a.hash = h; } });
          store.set(ACC, list);
        });
      });
    },
    deleteAccount: function (password, beforeDelete) {
      return SPAuth.verify(password).then(function (acc) {
        return Promise.resolve(beforeDelete && beforeDelete()).then(function () {
          store.set(ACC, accounts().filter(function (a) { return a.id !== acc.id; }));
          SPAuth.logout();
          return acc.id;
        });
      });
    },
  };
})();
