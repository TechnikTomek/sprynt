/* Sprynt – ustawienia konta, skróty klawiszowe, stoper w górnym pasku. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico;

  /* =================== Ustawienia =================== */
  SP.views.settings = {
    title: function () { return "Ustawienia"; },
    crumbs: function () { return [{ icon: "user-cog", label: "Ustawienia" }]; },
    render: function (el) {
      var u = SP.user, pref = SPTheme.pref();
      el.innerHTML = '<div class="page narrow settings"><div class="page-h"><h1>Ustawienia</h1></div>' +
        '<section class="card set-card"><div class="set-h"><h2>Profil</h2><p class="muted">Twoje imię widzą osoby w zespole.</p></div>' +
        '<form class="set-form" data-f="profile"><div class="set-av">' + SP.avatar("me") + "</div>" +
        '<div class="dlg-field"><label for="s-name">Imię</label><input class="input" id="s-name" name="name" value="' + esc(u.name) + '" maxlength="60" /></div>' +
        '<div class="dlg-field"><label for="s-email">E-mail</label><input class="input" id="s-email" name="email" type="email" value="' + esc(u.email) + '" /></div>' +
        '<div class="set-acts"><span class="set-msg" data-msg></span><button class="btn primary sm" type="submit">Zapisz profil</button></div></form></section>' +

        '<section class="card set-card"><div class="set-h"><h2>Hasło</h2><p class="muted">Co najmniej 8 znaków.</p></div>' +
        '<form class="set-form" data-f="password"><div class="dlg-field"><label for="s-cur">Obecne hasło</label><input class="input" id="s-cur" name="current" type="password" autocomplete="current-password" /></div>' +
        '<div class="dlg-field"><label for="s-next">Nowe hasło</label><input class="input" id="s-next" name="next" type="password" autocomplete="new-password" /></div>' +
        '<div class="set-acts"><span class="set-msg" data-msg></span><button class="btn sm" type="submit">Zmień hasło</button></div></form></section>' +

        '<section class="card set-card"><div class="set-h"><h2>Wygląd</h2><p class="muted">Motyw działa też na stronie startowej i logowania.</p></div>' +
        '<div class="seg big" role="group" aria-label="Motyw">' + [["light", "sun", "Jasny"], ["dark", "moon", "Ciemny"], ["system", "monitor", "Systemowy"]].map(function (x) {
          return '<button data-theme-set="' + x[0] + '" aria-pressed="' + (pref === x[0]) + '">' + ico(x[1], 15) + x[2] + "</button>";
        }).join("") + "</div></section>" +

        '<section class="card set-card"><div class="set-h"><h2>Kopia zapasowa</h2><p class="muted">Projekty, listy, zadania, komentarze, dokumenty i czas pracy w jednym pliku JSON. Zawartość plików z chmury nie wchodzi do kopii.</p></div>' +
        '<div class="set-row"><button class="btn sm" data-a="export">' + ico("download", 15) + 'Pobierz kopię</button><button class="btn sm" data-a="import">' + ico("upload", 15) + "Przywróć z kopii…</button></div></section>" +

        '<section class="card set-card danger-zone"><div class="set-h"><h2>Usuń konto</h2><p class="muted">Usuwa konto, wszystkie projekty i pliki z tej przeglądarki. Tego nie da się cofnąć.</p></div>' +
        '<button class="btn danger sm" data-a="delete">' + ico("trash", 15) + "Usuń konto</button></section></div>";

      function msg(form, text, bad) { var m = form.querySelector("[data-msg]"); m.textContent = text; m.className = "set-msg" + (bad ? " bad" : " ok"); }
      el.querySelector('[data-f="profile"]').addEventListener("submit", function (e) {
        e.preventDefault(); var f = e.target;
        SPAuth.updateProfile({ name: f.name.value, email: f.email.value }).then(function (nu) {
          SP.user = nu;
          db.raw.people[0].name = nu.name; db.raw.people[0].email = nu.email; db.changed("people");
          document.getElementById("meBtn").textContent = SP.initials(nu.name);
          SP.toast("Zapisano profil");
        }, function (err) { msg(f, err.message, true); });
      });
      el.querySelector('[data-f="password"]').addEventListener("submit", function (e) {
        e.preventDefault(); var f = e.target, btn = f.querySelector("button"); btn.disabled = true;
        SPAuth.changePassword(f.current.value, f.next.value).then(function () {
          f.reset(); msg(f, "Hasło zmienione.");
        }, function (err) { msg(f, err.message, true); }).then(function () { btn.disabled = false; });
      });
      el.querySelectorAll("[data-theme-set]").forEach(function (b) { b.onclick = function () { SPTheme.set(b.dataset.themeSet); SP.rerender(); }; });
      el.querySelector('[data-a="export"]').onclick = function () {
        var blob = new Blob([JSON.stringify(db.exportData(), null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = "sprynt-kopia-" + SP.date.today() + ".json"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        SP.toast("Pobrano kopię zapasową");
      };
      el.querySelector('[data-a="import"]').onclick = function () {
        var inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
        inp.onchange = function () {
          var file = inp.files[0]; if (!file) return;
          file.text().then(function (txt) {
            var obj; try { obj = JSON.parse(txt); } catch (e) { SP.toast("To nie jest poprawny plik JSON."); return; }
            SP.confirm("Przywrócić z kopii?", "Obecne projekty i zadania zostaną zastąpione zawartością pliku „" + file.name + "”.", "Przywróć").then(function (ok) {
              if (!ok) return;
              try { db.importData(obj); SP.toast("Przywrócono dane z kopii"); location.hash = "#/home"; } catch (e) { SP.toast(e.message); }
            });
          });
        };
        inp.click();
      };
      el.querySelector('[data-a="delete"]').onclick = function () {
        SP.form({ title: "Usuń konto", submit: "Usuń na zawsze", fields: [{ name: "password", label: "Wpisz hasło, żeby potwierdzić", required: true }] }).then(function (v) {
          if (!v) return;
          SPAuth.deleteAccount(v.password).then(function () {
            return SP.wipeFiles ? SP.wipeFiles() : null;
          }).then(function () { db.wipe(); location.replace("index.html"); }, function (err) { SP.toast(err.message); });
        });
        setTimeout(function () { var i = document.querySelector('.dlg-bg input[name="password"]'); if (i) i.type = "password"; }, 0);
      };
    },
  };

  /* =================== Skróty klawiszowe =================== */
  SP.showShortcuts = function () {
    if (document.querySelector(".kb-bg")) return;
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent), mod = mac ? "⌘" : "Ctrl";
    var groups = [
      ["Ogólne", [[[mod, "K"], "Szukaj i polecenia"], [["/"], "Szukaj"], [["T"], "Nowe zadanie"], [["?"], "Ta pomoc"], [["Esc"], "Zamknij okno / odznacz zadania"]]],
      ["Zadanie", [[["Enter"], "Zapisz nazwę"], [["Enter"], "Wyślij komentarz"], [["Shift", "Enter"], "Nowa linia w komentarzu"]]],
      ["Widoki", [[["G", "H"], "Strona główna"], [["G", "I"], "Skrzynka"], [["G", "M"], "Moje zadania"], [["G", "C"], "Chmura"], [["G", "S"], "Ustawienia"], [["G", "D"], "Dokumenty"], [["G", "P"], "Pulpit"], [["G", "O"], "Cele"], [["G", "A"], "Automatyzacje"], [["G", "W"], "Tablice online"], [["G", "K"], "Czat"], [["G", "B"], "Kosz"]]],
      ["Tablica online", [[["V"], "Zaznaczanie"], [["H"], "Przesuwanie (albo spacja)"], [["N"], "Karteczka"], [["T"], "Tekst"], [["R"], "Prostokąt"], [["O"], "Elipsa"], [["P"], "Rysik"], [[mod, "Z"], "Cofnij"], [[mod, "D"], "Duplikuj"], [["Delete"], "Usuń zaznaczone"], [[mod, "kółko"], "Przybliżanie"]]],
    ];
    var bg = SP.el('<div class="dlg-bg kb-bg"><div class="dlg kb" role="dialog" aria-modal="true" aria-label="Skróty klawiszowe"><div class="kb-h"><h2>' + ico("keyboard", 20) + 'Skróty klawiszowe</h2><button class="ibtn" data-x>' + ico("x", 17) + "</button></div>" +
      groups.map(function (g) {
        return '<div class="kb-g"><h3>' + g[0] + "</h3>" + g[1].map(function (r) { return '<div class="kb-r"><span>' + r[1] + '</span><span class="kb-keys">' + r[0].map(function (k) { return "<kbd>" + k + "</kbd>"; }).join("") + "</span></div>"; }).join("") + "</div>";
      }).join("") + "</div></div>");
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape" || e.key === "?") { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.querySelector("[data-x]").onclick = close;
    document.body.appendChild(bg);
  };

  /* =================== Stoper w górnym pasku + odświeżanie liczników =================== */
  var pill = document.getElementById("timerPill");
  function drawPill() {
    var r = db.running();
    if (!r) { pill.hidden = true; document.title = document.title.replace(/^⏱ [^·]*· /, ""); return; }
    pill.hidden = false;
    var ms = Date.now() - new Date(r.entry.start);
    pill.innerHTML = '<span class="tp-dot"></span><b>' + db.fmtDuration(ms, true) + '</b><span class="tp-t">' + esc(r.task.title) + '</span><span class="tp-stop" role="button" title="Zatrzymaj">' + ico("pause", 13) + "</span>";
    pill.title = "Stoper: " + r.task.title;
  }
  pill.addEventListener("click", function (e) {
    var r = db.running(); if (!r) return;
    if (e.target.closest(".tp-stop")) { db.stopTimer(); SP.toast("Zatrzymano stoper"); return; }
    SP.openTask(r.task.id);
  });
  function tick() {
    drawPill();
    var r = db.running(); if (!r) return;
    var total = db.timeTotal(r.task), ms = Date.now() - new Date(r.entry.start);
    document.querySelectorAll('[data-live-total="' + r.task.id + '"]').forEach(function (x) { x.textContent = db.fmtDuration(total); });
    document.querySelectorAll('[data-live-entry="' + r.entry.id + '"]').forEach(function (x) { x.textContent = db.fmtDuration(ms, true); });
  }
  setInterval(tick, 1000);
  db.onChange(function () { setTimeout(drawPill, 0); });
  drawPill();
})();
