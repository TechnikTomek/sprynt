/* Sprynt – miejsce w chmurze: zawartość plików w IndexedDB, metadane w SP.db.
 * Do czasu podłączenia serwera pliki zostają na tym urządzeniu (w tej przeglądarce). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico;
  var DB_NAME = "sprynt-files", STORE = "blobs";
  var uid = function () { return "f" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); };
  var key = function (id) { return SP.user.id + ":" + id; };
  // Tryb chmury: pliki trafiają też do prywatnego magazynu Supabase „files” (<user_id>/<file_id>),
  // a IndexedDB służy jako lokalna pamięć podręczna.
  var cloudFiles = window.SPAuth && SPAuth.cloud && SPAuth.client ? SPAuth.client.storage.from("files") : null;
  var cpath = function (id) { return SP.user.id + "/" + id; };

  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("Ta przeglądarka nie pozwala zapisywać plików (brak IndexedDB).")); return; }
      var r = indexedDB.open(DB_NAME, 1);
      // Baza może być zablokowana (np. trwa jej usuwanie w innej karcie) – nie czekamy w nieskończoność.
      var t = setTimeout(function () { dbp = null; reject(new Error("Magazyn plików w przeglądarce nie odpowiada.")); }, 4000);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { clearTimeout(t); var d = r.result; d.onversionchange = function () { d.close(); dbp = null; }; resolve(d); };
      r.onerror = function () { clearTimeout(t); dbp = null; reject(r.error || new Error("Nie udało się otworzyć magazynu plików.")); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return idb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode), st = t.objectStore(STORE), out;
        var req = fn(st);
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = t.onabort = function () { reject(t.error || new Error("Błąd zapisu pliku.")); };
      });
    });
  }

  /* ---- Typy plików ---- */
  var KINDS = {
    image: { label: "Obrazy", color: "#a855f7", icon: "file-image" },
    video: { label: "Wideo", color: "#e84393", icon: "film" },
    doc: { label: "Dokumenty", color: "#3b82f6", icon: "file-text" },
    sheet: { label: "Arkusze", color: "#1aae6f", icon: "file" },
    code: { label: "Kod", color: "#06b6d4", icon: "file-code" },
    archive: { label: "Archiwa", color: "#64748b", icon: "archive-zip" },
    other: { label: "Inne", color: "#9aa0ab", icon: "file" },
  };
  function kindOf(f) {
    var n = (f.name || "").toLowerCase(), t = f.type || "", ext = (n.match(/\.([a-z0-9]+)$/) || [])[1] || "";
    if (/^image\//.test(t)) return "image";
    if (/^video\//.test(t)) return "video";
    if (/^(xlsx?|csv|ods|numbers)$/.test(ext)) return "sheet";
    if (/^(pdf|docx?|odt|rtf|txt|md|pptx?|key|pages)$/.test(ext)) return "doc";
    if (/^(js|ts|tsx|jsx|json|html|css|py|go|rs|java|sql|sh|ya?ml|prisma|swift|kt|c|cpp|h)$/.test(ext)) return "code";
    if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return "archive";
    return "other";
  }
  SP.fileKinds = KINDS;
  SP.fileKind = kindOf;
  SP.fileExt = function (f) { var m = (f.name || "").match(/\.([a-z0-9]+)$/i); return m ? m[1].slice(0, 4).toUpperCase() : "PLIK"; };
  SP.fmtSize = function (b) {
    if (b < 1024) return b + " B";
    var u = ["KB", "MB", "GB", "TB"], i = -1;
    do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
    return b.toLocaleString("pl-PL", { maximumFractionDigits: b < 10 ? 1 : 0 }) + " " + u[i];
  };
  SP.fileTile = function (f, size) {
    var k = KINDS[kindOf(f)], b = SP.logoSlugFor && SP.logoSlugFor(f.name);
    if (b) return '<span class="ftile ftile-brand' + (size ? " ftile-" + size : "") + '" style="--c:' + k.color + '">' + SP.logo(b, size === "lg" ? 24 : 18, { alt: "" }) + "</span>";
    return '<span class="ftile' + (size ? " ftile-" + size : "") + '" style="--c:' + k.color + '">' + ico(k.icon, size === "lg" ? 22 : 16) + "</span>";
  };

  /* ---- Wgrywanie / pobieranie / usuwanie ---- */
  /** Wgrywa pliki (File[]) do chmury; opcjonalnie podpina je pod zadanie. Zwraca liczbę wgranych. */
  SP.uploadFiles = function (list, opts) {
    opts = opts || {};
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return Promise.resolve(0);
    var tooBig = files.filter(function (f) { return f.size > db.MAX_FILE; });
    if (tooBig.length) { SP.toast("„" + tooBig[0].name + "” jest za duży – limit to " + SP.fmtSize(db.MAX_FILE) + " na plik."); files = files.filter(function (f) { return f.size <= db.MAX_FILE; }); }
    var total = files.reduce(function (s, f) { return s + f.size; }, 0);
    if (db.storageUsed() + total > db.QUOTA) {
      SP.toast("Brak miejsca w chmurze: zostało " + SP.fmtSize(Math.max(0, db.QUOTA - db.storageUsed())) + " z " + SP.fmtSize(db.QUOTA) + ".");
      return Promise.resolve(0);
    }
    var done = 0;
    return files.reduce(function (p, f) {
      return p.then(function () {
        var id = uid();
        return (cloudFiles ? cloudFiles.upload(cpath(id), f, { upsert: true, contentType: f.type || "application/octet-stream" }).then(function (r) { if (r.error) throw new Error("Nie udało się wysłać „" + f.name + "” do chmury: " + r.error.message); }) : Promise.resolve())
          .then(function () { return tx("readwrite", function (st) { return st.put(f, key(id)); }).catch(function (e) { if (!cloudFiles) throw e; }); }).then(function () {
          db.addFile({ id: id, name: f.name, size: f.size, type: f.type || "", uploadedAt: new Date().toISOString(), taskId: opts.taskId || null, by: "me" });
          if (opts.ids) opts.ids.push(id);
          if (opts.taskId) db.updateTask(opts.taskId, {}, "dodał(a) załącznik „" + f.name + "”");
          done++;
        });
      });
    }, Promise.resolve()).then(function () {
      if (done) SP.toast(done === 1 ? "Wgrano „" + files[0].name + "”" : "Wgrano plików: " + done);
      return done;
    }).catch(function (e) {
      SP.toast(/quota/i.test(String(e && e.name)) ? "Przeglądarka nie ma już miejsca na pliki." : (e.message || "Nie udało się wgrać pliku."));
      return done;
    });
  };
  function blobOf(id) {
    return tx("readonly", function (st) { return st.get(key(id)); }).catch(function () { return null; }).then(function (b) {
      if (b || !cloudFiles) return b;
      // nie ma w pamięci podręcznej (inne urządzenie) → pobierz z chmury i zapamiętaj
      return cloudFiles.download(cpath(id)).then(function (r) {
        if (r.error || !r.data) return null;
        var meta = db.file(id), blob = r.data;
        return tx("readwrite", function (st) { return st.put(new File([blob], meta ? meta.name : id, { type: blob.type }), key(id)); }).catch(function () {}).then(function () { return blob; });
      });
    });
  }
  /** Zawartość pliku z chmury (Blob) albo null. */
  SP.fileBlob = blobOf;
  SP.downloadFile = function (id) {
    var f = db.file(id); if (!f) return;
    blobOf(id).then(function (b) {
      if (!b) { SP.toast("Nie znaleziono zawartości pliku na tym urządzeniu."); return; }
      var url = URL.createObjectURL(b), a = document.createElement("a");
      a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    });
  };
  SP.deleteFile = function (id) {
    var f = db.file(id); if (!f) return Promise.resolve(false);
    return SP.confirm("Usunąć plik?", "„" + f.name + "” zniknie z chmury" + (f.taskId ? " i z zadania" : "") + ".").then(function (ok) {
      if (!ok) return false;
      return Promise.all([tx("readwrite", function (st) { return st.delete(key(id)); }).catch(function () {}), cloudFiles ? cloudFiles.remove([cpath(id)]).catch(function () {}) : null]).then(function () {
        db.removeFile(id); SP.toast("Usunięto „" + f.name + "”"); return true;
      });
    });
  };
  /** Podgląd obrazu/wideo w oknie; inne typy – pobieranie. */
  SP.previewFile = function (id) {
    var f = db.file(id); if (!f) return;
    var k = kindOf(f);
    if (k !== "image" && k !== "video") { SP.downloadFile(id); return; }
    blobOf(id).then(function (b) {
      if (!b) { SP.toast("Nie znaleziono zawartości pliku na tym urządzeniu."); return; }
      var url = URL.createObjectURL(b);
      var bg = SP.el('<div class="pv-bg"><div class="pv"><div class="pv-top"><b></b><span class="muted"></span><button class="ibtn" data-dl title="Pobierz">' + ico("download", 17) +
        '</button><button class="ibtn" data-x title="Zamknij (Esc)">' + ico("x", 18) + '</button></div><div class="pv-body"></div></div></div>');
      bg.querySelector("b").textContent = f.name;
      bg.querySelector(".muted").textContent = SP.fmtSize(f.size);
      var media = k === "image" ? document.createElement("img") : document.createElement("video");
      media.src = url; if (k === "video") media.controls = true; else media.alt = f.name;
      bg.querySelector(".pv-body").appendChild(media);
      function close() { URL.revokeObjectURL(url); bg.remove(); document.removeEventListener("keydown", onKey, true); }
      function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
      document.addEventListener("keydown", onKey, true);
      bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
      bg.querySelector("[data-x]").onclick = close;
      bg.querySelector("[data-dl]").onclick = function () { SP.downloadFile(id); };
      document.body.appendChild(bg);
    });
  };
  /** Usuwa zawartość wszystkich plików zalogowanego konta (przy usuwaniu konta). */
  SP.wipeFiles = function () {
    var ids = db.raw.files.map(function (f) { return f.id; });
    var local = tx("readwrite", function (st) { ids.forEach(function (id) { st.delete(key(id)); }); return null; }).catch(function () {});
    var remote = cloudFiles && ids.length ? cloudFiles.remove(ids.map(cpath)).catch(function () {}) : null;
    return Promise.all([local, remote]);
  };
  /** Otwiera systemowy wybór plików. */
  SP.pickFiles = function (opts) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.multiple = true; inp.style.display = "none";
    inp.onchange = function () { SP.uploadFiles(inp.files, opts); inp.remove(); };
    document.body.appendChild(inp); inp.click();
  };
})();
