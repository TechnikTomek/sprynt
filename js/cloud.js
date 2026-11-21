/* Sprynt – synchronizacja z chmurą (Supabase). Offline-first:
 *  • aplikacja startuje od razu z lokalnej kopii (localStorage), a w tle pobiera wersję z serwera,
 *  • każda zmiana (db.save) po 1,2 s trafia do bazy funkcją save_workspace z kontrolą wersji (rev),
 *  • gdy inne urządzenie zapisało wcześniej → łączymy obie wersje (po id, nowsze updatedAt wygrywa),
 *  • bez internetu zmiany czekają (flaga dirty) i wysyłają się po powrocie połączenia.
 * Działa tylko w trybie chmury (SPAuth.cloud). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db || !window.SPAuth || !SPAuth.cloud) return;
  var client = SPAuth.client, esc = SP.esc, ico = SP.ico;
  var meta = db.syncMeta(), timer = null, busy = false, again = false, state = "idle", lastSync = null, errorMsg = "";
  var pill = document.getElementById("syncPill");

  /* ---- znacznik stanu w górnym pasku ---- */
  var LABEL = { saved: ["cloud", "Zapisano w chmurze"], saving: ["cloud", "Zapisywanie…"], pending: ["cloud", "Zmiany czekają na zapis"], offline: ["cloud", "Offline – zapiszę po powrocie internetu"], error: ["x", "Błąd synchronizacji"], idle: ["cloud", "Chmura"] };
  function setState(s, msg) {
    state = s; if (msg != null) errorMsg = msg;
    if (!pill) return;
    var l = LABEL[s] || LABEL.idle;
    pill.hidden = false; pill.className = "sync-pill " + s;
    pill.innerHTML = ico(l[0], 15) + '<span class="sp-l">' + (s === "saved" ? "Zapisano" : s === "saving" ? "Zapisuję…" : s === "offline" ? "Offline" : s === "error" ? "Błąd" : s === "pending" ? "Czeka" : "") + "</span>";
    pill.title = l[1] + (s === "saved" && lastSync ? " · " + SP.ago(lastSync) : "") + (s === "error" && errorMsg ? ": " + errorMsg : "");
  }
  if (pill) pill.addEventListener("click", function () { if (state === "error" || state === "offline" || state === "pending") syncNow(); else SP.toast(pill.title); });

  /* ---- łączenie dwóch wersji (urządzenia pracowały równolegle) ---- */
  var ARR = ["spaces", "folders", "lists", "tasks", "docs", "goals", "automations", "whiteboards", "fields", "templates", "chat", "files", "people", "notifications", "trash", "tags", "sprints"];
  function stamp(o) { return Date.parse(o && (o.updatedAt || o.at || o.createdAt || o.uploadedAt) || 0) || 0; }
  function merge(local, server) {
    var out = JSON.parse(JSON.stringify(server));
    ARR.forEach(function (k) {
      var key = k === "tags" ? "name" : "id", byId = {}, list = (out[k] || []).slice();
      list.forEach(function (o, i) { byId[o[key]] = i; });
      (local[k] || []).forEach(function (o) {
        if (!(o[key] in byId)) list.push(o);
        else if (stamp(o) > stamp(list[byId[o[key]]])) list[byId[o[key]]] = o;
      });
      out[k] = list;
    });
    out.ui = local.ui || out.ui;
    return out;
  }

  /* ---- zapis do chmury ---- */
  function push() {
    if (busy) { again = true; return Promise.resolve(); }
    if (!navigator.onLine) { setState("offline"); return Promise.resolve(); }
    busy = true; again = false; setState("saving");
    var snapshot = db.raw;
    return client.rpc("save_workspace", { p_data: snapshot, p_base: meta.rev || 0 }).then(function (r) {
      if (r.error) throw r.error;
      var rev = r.data;
      if (rev > 0) {
        meta.rev = rev; meta.dirty = again; db.saveSyncMeta(meta); lastSync = new Date().toISOString();
        setState(again ? "pending" : "saved");
        return;
      }
      // konflikt: ktoś zapisał wersję -rev; pobierz, połącz, zapisz ponownie
      return pullRow().then(function (row) {
        if (!row) return;
        var merged = merge(db.raw, row.data || {});
        meta.rev = row.rev; db.replaceData(merged); again = true;
        SP.toast("Połączono zmiany z innego urządzenia");
      });
    }).catch(function (e) {
      meta.dirty = true; db.saveSyncMeta(meta);
      if (!navigator.onLine || /fetch|network/i.test(String(e && (e.message || e)))) setState("offline");
      else setState("error", e.message || String(e));
    }).then(function () {
      busy = false;
      if (again) { again = false; schedule(300); }
    });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(push, ms == null ? 1200 : ms); }
  SP.cloudDirty = function () { meta.dirty = true; db.saveSyncMeta(meta); if (state !== "offline") setState("pending"); schedule(); };

  /* ---- odczyt z chmury ---- */
  function pullRow() {
    return client.from("workspaces").select("data, rev, updated_at").eq("user_id", SP.user.id).maybeSingle().then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function pull(first) {
    if (!navigator.onLine) { setState(meta.dirty ? "offline" : "idle"); return Promise.resolve(); }
    return pullRow().then(function (row) {
      if (!row) {
        // Pierwsze logowanie w chmurze: może przenieść dane konta lokalnego z tej przeglądarki?
        var legacy = first && db.isEmpty() ? db.legacyLocalData() : null;
        if (legacy) {
          var n = legacy.tasks.length;
          return SP.confirm("Przenieść dane do chmury?", "Na tym urządzeniu jest konto lokalne z tym samym e-mailem (" + n + " zadań). Przenieść je na Twoje konto w chmurze? Będą wtedy dostępne na każdym urządzeniu.", "Przenieś").then(function (ok) {
            if (ok) { legacy.people = (legacy.people || []).map(function (p) { return p.id === "me" ? Object.assign({}, p, { name: SP.user.name, email: SP.user.email }) : p; }); db.replaceData(legacy); SP.toast("Przenoszę " + n + " zadań do chmury…"); }
            meta.rev = 0; return push();
          });
        }
        meta.rev = 0; return push();
      }
      if (row.rev === meta.rev && !meta.dirty) { lastSync = row.updated_at; setState("saved"); return; }
      if (row.rev !== meta.rev) {
        if (meta.dirty) { db.replaceData(merge(db.raw, row.data || {})); meta.rev = row.rev; return push(); }
        db.replaceData(row.data || {}); meta.rev = row.rev; meta.dirty = false; db.saveSyncMeta(meta); lastSync = row.updated_at; setState("saved");
        if (!first) SP.toast("Wczytano zmiany z innego urządzenia");
        return;
      }
      return push(); // ta sama wersja, ale mamy niewysłane zmiany
    }).catch(function (e) { if (!navigator.onLine) setState("offline"); else setState("error", e.message || String(e)); });
  }
  function syncNow() { return meta.dirty ? push() : pull(false); }

  SP.cloud = {
    syncNow: syncNow, pull: pull, push: push, merge: merge,
    status: function () { return { state: state, rev: meta.rev, dirty: meta.dirty, lastSync: lastSync, error: errorMsg }; },
  };

  addEventListener("online", function () { setState("pending"); syncNow(); });
  addEventListener("offline", function () { setState("offline"); });
  // Powrót do karty: sprawdź, czy inne urządzenie czegoś nie zmieniło.
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && !busy) pull(false); });
  // Ostrzegamy tylko, gdy zapis właśnie trwa – niewysłane zmiany i tak czekają w lokalnej kopii.
  addEventListener("beforeunload", function (e) { if (busy && !SP.cloudLeaving) { e.preventDefault(); e.returnValue = ""; } });
  // Sesja wygasła albo wylogowano na innej karcie → ekran logowania.
  SPAuth.onChange(function (ev) { if (ev === "SIGNED_OUT" && !SP.cloudLeaving) { history.replaceState(null, "", location.pathname + "#login"); location.reload(); } });

  setState(meta.dirty ? "pending" : "idle");
  setTimeout(function () { pull(true); }, 50);
})();
