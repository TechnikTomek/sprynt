/* Sprynt – powłoka: pasek boczny, routing, górny pasek, tworzenie, paleta Cmd/Ctrl+K. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, esc = SP.esc, ico = SP.ico;
  if (!db) return; // brak sesji – app.html już przekierowuje do logowania
  var $ = function (s) { return document.querySelector(s); };
  var view = $("#view");
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $("#kbdHint").textContent = isMac ? "⌘K" : "Ctrl K";
  SP.hydrateIcons();
  $("#meBtn").textContent = SP.initials(SP.user.name);
  $("#meBtn").title = SP.user.name;

  /* =================== Routing =================== */
  var route = { name: "home", params: {} };
  function parse() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    var name = parts[0] || "home";
    if (["space", "folder", "list"].indexOf(name) >= 0) return { name: name, params: { id: parts[1], view: ["list", "board", "table", "calendar", "timeline"].indexOf(parts[2]) >= 0 ? parts[2] : null } };
    if (name === "doc" || name === "wb" || name === "chat" || name === "sprint") return { name: name, params: { id: parts[1] } };
    if (!SP.views[name]) return { name: "home", params: {} };
    return { name: name, params: {} };
  }
  function render(enter) {
    var v = SP.views[route.name];
    var host = document.createElement("div");
    host.className = "view-host" + (enter ? " enter" : "");
    v.render(host, route.params);
    view.replaceChildren(host);
    SP.hydrateIcons(host);
    renderCrumbs(v);
    document.title = v.title(route.params) + " · Sprynt";
    renderSidebar();
  }
  // flipSnap/flipPlay (js/anim.js): zadania, które zmieniły miejsce, płynnie przelatują na nowe (FLIP).
  SP.rerender = function () { var snap = SP.flipSnap ? SP.flipSnap() : null; var top = view.scrollTop; render(); view.scrollTop = top; if (snap) SP.flipPlay(snap); };
  SP.refreshChrome = function () { renderSidebar(); renderCrumbs(SP.views[route.name]); };
  addEventListener("hashchange", function () { route = parse(); render(true); view.scrollTop = 0; closeMobileNav(); });
  route = parse();

  // Każda zmiana danych odświeża widok i pasek boczny (bez przewijania na górę).
  // setTimeout zamiast requestAnimationFrame – rAF nie odpala w kartach w tle.
  var pending = null;
  db.onChange(function () {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      var a = document.activeElement;
      // nie przerywaj pisania w dokumencie
      if (route.name === "doc" && a && a.isContentEditable && view.contains(a)) { renderSidebar(); return; }
      SP.rerender();
    }, 0);
  });

  function renderCrumbs(v) {
    var c = v.crumbs ? v.crumbs(route.params) : [];
    $("#crumbs").innerHTML = c.map(function (x, i) {
      var inner = (x.space ? SP.spaceIcon(x.space, "xs") : x.icon ? ico(x.icon, 15) : "") + "<span>" + esc(x.label) + "</span>";
      return "<li>" + (x.href && i < c.length - 1 ? '<a href="' + x.href + '">' + inner + "</a>" : inner) + "</li>";
    }).join("");
  }

  /* =================== Pasek boczny =================== */
  function countOpen(loc) { return db.tasksIn(loc).filter(function (t) { return !db.status(t.status).closed; }).length; }
  function isActive(type, id) { return route.name === type && route.params.id === id; }
  function renderSidebar() {
    document.querySelectorAll(".side-item[data-route]").forEach(function (a) {
      a.setAttribute("aria-current", a.dataset.route === route.name || (a.dataset.route === "docs" && route.name === "doc") || (a.dataset.route === "whiteboards" && route.name === "wb") || (a.dataset.route === "sprints" && route.name === "sprint") || (a.dataset.route === "trash" && route.name === "trash") ? "page" : "false");
    });
    var unread = db.raw.notifications.filter(function (n) { return n.state === "important"; }).length;
    var ic = $("#inboxCount"); ic.hidden = !unread; ic.textContent = unread;
    // Miejsce w chmurze (dół paska bocznego)
    var used = db.storageUsed(), pct = Math.min(100, used / db.QUOTA * 100);
    $("#storageLbl").innerHTML = "<b>" + SP.fmtSize(used) + "</b> z " + SP.fmtSize(db.QUOTA);
    $("#storageBar").style.width = Math.max(pct, used ? 1.5 : 0) + "%";
    $("#storageWidget").classList.toggle("full", pct > 90);
    $("#storageWidget").setAttribute("aria-current", route.name === "cloud" ? "page" : "false");
    $("#notifDot").hidden = !unread;

    // Ulubione
    var favs = db.raw.favorites.map(function (f) {
      var o = db[f.type] ? db[f.type](f.id) : null; if (!o) return "";
      var href = f.type === "doc" ? "#/doc/" + o.id : f.type === "whiteboard" ? "#/wb/" + o.id : "#/" + f.type + "/" + o.id;
      var icon = f.type === "space" ? SP.spaceIcon(o, "xs") : ico(f.type === "folder" ? "folder" : f.type === "doc" ? "file-text" : f.type === "whiteboard" ? "presentation" : "list", 15);
      return '<li><a class="tree-row" href="' + href + '" aria-current="' + (isActive(f.type, f.id) || (f.type === "whiteboard" && isActive("wb", f.id))) + '">' + icon + '<span class="tr-n">' + esc(o.name || o.title) + "</span></a></li>";
    }).join("");
    $("#favSection").hidden = !favs;
    $("#favList").innerHTML = favs;

    // Przestrzenie → foldery → listy
    var exp = db.raw.ui.expanded;
    var h = db.raw.spaces.map(function (s) {
      var open = !!exp[s.id];
      var folders = db.raw.folders.filter(function (f) { return f.spaceId === s.id; });
      var loose = db.raw.lists.filter(function (l) { return l.spaceId === s.id && !l.folderId; });
      var inner = open ? '<ul class="tree-sub">' + folders.map(function (f) {
        var fo = !!exp[f.id];
        var lists = db.raw.lists.filter(function (l) { return l.folderId === f.id; });
        return '<li><div class="tree-row folder" aria-current="' + isActive("folder", f.id) + '"><button class="tr-tog" data-tog="' + f.id + '" aria-label="Rozwiń">' + ico(fo ? "chevron-down" : "chevron-right", 12) + "</button>" +
          '<a class="tr-link" href="#/folder/' + f.id + '">' + ico("folder", 15) + '<span class="tr-n">' + esc(f.name) + "</span></a>" +
          '<span class="tr-acts"><button class="tr-act" data-more="folder:' + f.id + '" title="Więcej">' + ico("ellipsis", 14) + '</button><button class="tr-act" data-addlist="' + s.id + ":" + f.id + '" title="Nowa lista">' + ico("plus", 14) + "</button></span></div>" +
          (fo ? '<ul class="tree-sub">' + lists.map(listRow).join("") + "</ul>" : "") + "</li>";
      }).join("") + loose.map(listRow).join("") + "</ul>" : "";
      return '<li><div class="tree-row space" aria-current="' + isActive("space", s.id) + '"><button class="tr-tog" data-tog="' + s.id + '" aria-label="Rozwiń">' + ico(open ? "chevron-down" : "chevron-right", 12) + "</button>" +
        '<a class="tr-link" href="#/space/' + s.id + '">' + SP.spaceIcon(s, "xs") + '<span class="tr-n">' + esc(s.name) + "</span></a>" +
        '<span class="tr-acts"><button class="tr-act" data-more="space:' + s.id + '" title="Więcej">' + ico("ellipsis", 14) + '</button><button class="tr-act" data-addin="' + s.id + '" title="Utwórz w przestrzeni">' + ico("plus", 14) + "</button></span></div>" + inner + "</li>";
    }).join("");
    $("#spaceList").innerHTML = h + '<li><button class="tree-row add-space" data-new-space>' + ico("plus", 14) + "<span>Nowa przestrzeń</span></button></li>";
    SP.hydrateIcons($(".sidebar"));
  }
  function listRow(l) {
    var n = countOpen({ type: "list", id: l.id });
    return '<li><a class="tree-row list" href="#/list/' + l.id + '" aria-current="' + isActive("list", l.id) + '"><span class="tr-dot"></span><span class="tr-n">' + esc(l.name) + '</span>' +
      (n ? '<span class="tr-c">' + n + "</span>" : "") + '<span class="tr-acts"><button class="tr-act" data-more="list:' + l.id + '" title="Więcej">' + ico("ellipsis", 14) + "</button></span></a></li>";
  }

  $(".sidebar").addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-tog]"))) { e.preventDefault(); db.toggleExpanded(b.dataset.tog); return; }
    if ((b = e.target.closest("[data-more]"))) { e.preventDefault(); e.stopPropagation(); var p = b.dataset.more.split(":"); SP.nodeMenu(b, p[0], p[1]); return; }
    if ((b = e.target.closest("[data-addlist]"))) { e.preventDefault(); var q = b.dataset.addlist.split(":"); newList(q[0], q[1]); return; }
    if ((b = e.target.closest("[data-addin]"))) {
      e.preventDefault(); var sid = b.dataset.addin;
      SP.menu(b, [{ header: "Utwórz w przestrzeni" }, { label: "Lista", icon: "list", run: function () { newList(sid, null); } }, { label: "Folder", icon: "folder", run: function () { newFolder(sid); } }, { label: "Dokument", icon: "file-text", run: function () { SP.newDoc(sid); } }, { label: "Tablica online", icon: "presentation", run: function () { SP.newWhiteboard(sid); } }]);
      return;
    }
    if (e.target.closest("[data-new-space]")) { newSpace(); return; }
  });

  /* =================== Tworzenie =================== */
  function spaceOptions() { return db.raw.spaces.map(function (s) { return [s.id, s.name]; }); }
  function newSpace() {
    SP.form({ title: "Nowa przestrzeń", submit: "Utwórz", fields: [{ name: "name", label: "Nazwa", placeholder: "np. Sprzedaż", required: true }, { name: "color", label: "Kolor", type: "color", options: SP.SPACE_COLORS }] })
      .then(function (v) { if (!v || !v.name) return; var s = db.createSpace(v.name, v.color); var l = db.createList(s.id, null, "Lista"); location.hash = "#/list/" + l.id; SP.toast("Utworzono przestrzeń " + s.name); });
  }
  function newFolder(spaceId) {
    SP.form({ title: "Nowy folder", submit: "Utwórz", fields: [{ name: "name", label: "Nazwa folderu", placeholder: "np. Kampanie", required: true }, { name: "space", label: "Przestrzeń", type: "select", options: spaceOptions(), value: spaceId }] })
      .then(function (v) { if (!v || !v.name) return; var f = db.createFolder(v.space, v.name); location.hash = "#/folder/" + f.id; });
  }
  function newList(spaceId, folderId) {
    var opts = [];
    db.raw.spaces.forEach(function (s) {
      opts.push([s.id + ":", s.name]);
      db.raw.folders.filter(function (f) { return f.spaceId === s.id; }).forEach(function (f) { opts.push([s.id + ":" + f.id, s.name + " / " + f.name]); });
    });
    SP.form({ title: "Nowa lista", submit: "Utwórz", fields: [{ name: "name", label: "Nazwa listy", placeholder: "np. Sprint 16", required: true }, { name: "where", label: "Miejsce", type: "select", options: opts, value: (spaceId || db.raw.spaces[0].id) + ":" + (folderId || "") }] })
      .then(function (v) { if (!v || !v.name) return; var w = v.where.split(":"); var l = db.createList(w[0], w[1] || null, v.name); location.hash = "#/list/" + l.id; });
  }
  SP.newDoc = function (spaceId) {
    var d = db.createDoc(spaceId || (db.raw.spaces[0] || {}).id, "Bez tytułu");
    location.hash = "#/doc/" + d.id;
    setTimeout(function () { var t = document.querySelector(".doc-title"); if (t) { t.focus(); document.execCommand("selectAll", false, null); } }, 50);
  };
  SP.nodeMenu = function (anchor, type, id) {
    var o = db[type](id); if (!o) return;
    var label = { space: "przestrzeń", folder: "folder", list: "listę" }[type];
    var items = [];
    if (type === "space") items.push({ label: "Nowa lista", icon: "list", run: function () { newList(id, null); } }, { label: "Nowy folder", icon: "folder", run: function () { newFolder(id); } });
    if (type === "folder") items.push({ label: "Nowa lista w folderze", icon: "list", run: function () { newList(o.spaceId, id); } });
    if (type === "list") items.push({ label: "Nowe zadanie", icon: "plus", run: function () { SP.quickTask({ listId: id }); } });
    items.push({ label: db.isFavorite(type, id) ? "Usuń z ulubionych" : "Dodaj do ulubionych", icon: "star", run: function () { db.toggleFavorite(type, id); } });
    items.push({ label: "Zmień nazwę", icon: "file-text", run: function () {
      SP.form({ title: "Zmień nazwę", fields: [{ name: "name", label: "Nazwa", value: o.name, required: true }] }).then(function (v) { if (v && v.name) db.rename(type, id, v.name); });
    } });
    if (type === "list") items.push({ label: "Pola niestandardowe…", icon: "spreadsheet", run: function () { SP.manageFields(id); } });
    items.push({ label: "Eksportuj zadania (CSV)", icon: "download", run: function () { SP.exportCSV(type, id); } });
    items.push({ label: "Eksportuj do kalendarza (.ics)", icon: "calendar", run: function () { SP.exportICS(type, id); } });
    items.push({ html: '<span class="pm-logo">' + SP.logo("google-calendar", 16, { alt: "" }) + "</span><span>Jak dodać do Google, Outlooka, Apple…</span>", run: function () { SP.icsHelp(); } });
    if (type === "space") items.push({ label: "Sprinty przestrzeni", icon: "gauge", run: function () { SP.views.sprints.scope = id; location.hash = "#/sprints"; } });
    if (type === "space") items.push({ label: "Czat przestrzeni", icon: "message-square", run: function () { location.hash = "#/chat/" + id; } });
    items.push("-", { label: "Usuń " + label, icon: "trash", danger: true, run: function () {
      SP.confirm("Usunąć " + label + " „" + o.name + "”?", "Razem z zadaniami trafi do kosza – możesz to przywrócić przez 30 dni.").then(function (ok) {
        if (!ok) return;
        db.removeNode(type, id);
        if (["space", "folder", "list"].indexOf(route.name) >= 0 && !db[route.name](route.params.id)) location.hash = "#/home";
        SP.toast("Przeniesiono do kosza");
      });
    } });
    SP.menu(anchor, items);
  };

  /** Okno szybkiego tworzenia zadania (jak „Utwórz zadanie” w ClickUp). */
  SP.quickTask = function (pre) {
    pre = pre || {};
    var st = { listId: pre.listId || (db.raw.lists[0] || {}).id, status: pre.status || "todo", assignees: pre.assignees || [db.me], due: pre.due || null, priority: pre.priority || null, tpl: pre.tpl || null };
    if (!st.listId) { SP.toast("Najpierw utwórz listę"); return; }
    var bg = SP.el('<div class="dlg-bg"><form class="dlg qt" role="dialog" aria-modal="true" aria-label="Nowe zadanie">' +
      '<div class="qt-top"><button type="button" class="qt-loc" data-k="list"></button><button type="button" class="ibtn" data-x>' + ico("x", 17) + "</button></div>" +
      '<input class="qt-title" placeholder="Nazwa zadania – np. Wysłać ofertę jutro @Anna !pilne #klient" required maxlength="200" />' +
      '<div class="sm-chips qt-chips" hidden></div>' +
      '<div class="qt-desc" contenteditable="true" data-ph="Dodaj opis (opcjonalnie)"></div>' +
      '<div class="qt-props"></div>' +
      '<div class="dlg-acts"><span class="muted qt-hint">Enter tworzy zadanie</span><button type="submit" class="btn primary">Utwórz zadanie</button></div></form></div>');
    var parsed = null; // wynik SP.parseQuick z pola nazwy (termin, osoby, priorytet, tagi wpisane tekstem)
    function draw() {
      var l = db.list(st.listId), s = db.space(l.spaceId);
      bg.querySelector(".qt-loc").innerHTML = SP.spaceIcon(s, "xs") + esc(s.name) + " / " + esc(l.name) + ico("chevron-down", 12);
      var pp = parsed || { assignees: [], newPeople: [] }, due = pp.due || st.due, prio = pp.priority || st.priority, who = pp.assignees.length ? pp.assignees : st.assignees;
      var d = SP.fmtDue(due);
      bg.querySelector(".qt-props").innerHTML =
        '<button type="button" class="chip-btn" data-k="status">' + SP.statusDot(st.status) + esc(db.status(st.status).name) + "</button>" +
        '<button type="button" class="chip-btn' + (pp.assignees.length || pp.newPeople.length ? " magic" : "") + '" data-k="assignees">' + (who.length ? SP.avatars(who, "xs") : ico("user", 14) + "Przypisz") + (pp.newPeople.length ? "<span>+ " + esc(pp.newPeople.join(", ")) + "</span>" : "") + "</button>" +
        '<button type="button" class="chip-btn' + (pp.due ? " magic" : "") + '" data-k="due">' + ico("calendar", 14) + (due ? '<span class="due ' + d.cls + '">' + d.label + "</span>" : "Termin") + "</button>" +
        '<button type="button" class="chip-btn' + (pp.priority ? " magic" : "") + '" data-k="priority">' + (prio ? SP.flag(prio, true) : ico("flag", 14) + "Priorytet") + "</button>" +
        (db.raw.templates.length ? '<button type="button" class="chip-btn' + (st.tpl ? " on" : "") + '" data-k="tpl">' + ico("files", 14) + (st.tpl ? "Szablon: " + esc((db.raw.templates.find(function (x) { return x.id === st.tpl; }) || {}).name || "") : "Z szablonu") + "</button>" : "");
      SP.hydrateIcons(bg);
    }
    bg.addEventListener("click", function (e) {
      var b = e.target.closest("[data-k]"); if (!b) return;
      var k = b.dataset.k;
      if (k === "list") SP.pickList(b, st.listId, function (v) { st.listId = v; draw(); });
      if (k === "status") SP.pickStatus(b, st.status, function (v) { st.status = v; draw(); });
      if (k === "assignees") SP.pickAssignees(b, st.assignees, function (v) { st.assignees = v; draw(); });
      if (k === "due") SP.pickDate(b, st.due, function (v) { st.due = v; draw(); });
      if (k === "priority") SP.pickPriority(b, st.priority, function (v) { st.priority = v; draw(); });
      if (k === "tpl") SP.menu(b, [{ header: "Szablony zadań" }].concat(db.raw.templates.map(function (tp) {
        return { label: tp.name, icon: "files", active: st.tpl === tp.id, run: function () {
          st.tpl = tp.id; var ti = bg.querySelector(".qt-title"); if (!ti.value.trim()) ti.value = tp.task.title;
          if (!st.priority && tp.task.priority) st.priority = tp.task.priority; draw();
        } };
      })).concat(st.tpl ? ["-", { label: "Bez szablonu", icon: "x", run: function () { st.tpl = null; draw(); } }] : []));
    });
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); SP.quickTaskState = null; SP.closeQuickTask = null; }
    function onKey(e) { if (e.key === "Escape" && !document.querySelector(".popover")) { e.stopPropagation(); close(); } }
    // dla js/magic.js: wklejenie kilku linii w nazwę zamienia okno w „Wklejone zadania”
    SP.quickTaskState = function () { return { listId: st.listId, status: st.status, assignees: st.assignees, due: st.due, priority: st.priority }; };
    SP.closeQuickTask = close;
    document.addEventListener("keydown", onKey, true);
    bg.querySelector("[data-x]").onclick = close;
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = bg.querySelector(".qt-title"); if (!inp.value.trim()) return;
      var desc = bg.querySelector(".qt-desc");
      var f = SP.smartFields ? SP.smartFields(inp, { status: st.status, assignees: st.assignees, due: st.due, priority: st.priority }) : { title: inp.value.trim(), status: st.status, assignees: st.assignees, due: st.due, priority: st.priority };
      if (desc.innerText.trim()) f.desc = desc.innerHTML;
      var t = st.tpl ? db.fromTemplate(st.tpl, st.listId, f) : db.createTask(Object.assign({ listId: st.listId }, f));
      close();
      SP.toast("Utworzono " + db.taskKey(t) + " w liście " + db.list(st.listId).name);
    });
    document.body.appendChild(bg);
    draw();
    if (pre.title) bg.querySelector(".qt-title").value = pre.title;
    if (SP.smartInput) SP.smartInput(bg.querySelector(".qt-title"), {
      chips: bg.querySelector(".qt-chips"),
      target: function (k) { return bg.querySelector('.qt-props [data-k="' + ({ due: "due", priority: "priority", person: "assignees", newperson: "assignees" })[k] + '"]'); },
      onChange: function (p) { parsed = p; draw(); },
    });
    bg.querySelector(".qt-title").focus();
  };

  $("#newBtn").addEventListener("click", function (e) {
    var cur = route.name === "list" ? route.params.id : null;
    SP.menu(e.currentTarget, [
      { header: "Utwórz" },
      { label: "Zadanie", icon: "check", run: function () { SP.quickTask({ listId: cur || undefined }); } },
      { label: "Lista", icon: "list", run: function () { newList(); } },
      { label: "Folder", icon: "folder", run: function () { newFolder(db.raw.spaces[0] && db.raw.spaces[0].id); } },
      { label: "Przestrzeń", icon: "layout-dashboard", run: newSpace },
      { label: "Dokument", icon: "file-text", run: function () { SP.newDoc(); } },
      { label: "Tablica online", icon: "presentation", run: function () { SP.newWhiteboard(); } },
      { label: "Sprint", icon: "gauge", run: function () { SP.newSprint(cur ? (db.list(cur) || {}).spaceId : null); } },
      { label: "Zadania z pliku (Word, PDF, Excel)…", icon: "sparkles", run: function () { SP.extractTasks({ listId: cur || undefined }); } },
      { label: "Wiele zadań z listy (wklej)…", icon: "wand-sparkles", run: function () { pasteFromClipboard(cur); } },
      { label: "Zadanie z szablonu", icon: "files", run: function () { if (!db.raw.templates.length) { location.hash = "#/templates"; return; } SP.quickTask({ listId: cur || undefined, tpl: db.raw.templates[0].id }); } },
      "-",
      { label: "Cel", icon: "target", run: function () { location.hash = "#/goals"; setTimeout(function () { var b = document.querySelector("[data-new-goal]"); if (b) b.click(); }, 30); } },
      { label: "Automatyzacja", icon: "zap", run: function () { location.hash = "#/automations"; setTimeout(function () { var b = document.querySelector("[data-new-auto]"); if (b) b.click(); }, 30); } },
    ], { align: "right" });
  });
  /** Wiele zadań naraz: schowek (jeśli przeglądarka pozwala) albo pole do wklejenia. */
  function pasteFromClipboard(listId) {
    listId = listId || (route.name === "list" ? route.params.id : undefined);
    var ask = function () {
      SP.form({ title: "Wiele zadań naraz", submit: "Dalej", fields: [{ name: "text", label: "Wklej listę – każda linia to zadanie (terminy, @osoby, !priorytety i #tagi rozpoznam sam)", type: "textarea", placeholder: "- Wysłać ofertę jutro @Anna\n- Zamówić druk do piątku !pilne\n  - sprawdzić nakład", required: true }] })
        .then(function (v) { if (v && v.text && !SP.pasteTasks(v.text, { listId: listId })) SP.toast("Nie znalazłem zadań w tym tekście"); });
    };
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { if (t && t.split(/\n/).filter(function (l) { return l.trim(); }).length >= 2) SP.pasteTasks(t, { listId: listId }); else ask(); }, ask);
    else ask();
  }
  SP.pasteFromClipboard = pasteFromClipboard;
  $("#addSpaceBtn").addEventListener("click", newSpace);
  document.querySelector("[data-extract-open]").addEventListener("click", function () { SP.extractTasks(); });
  $("#notifBtn").addEventListener("click", function () { location.hash = "#/inbox"; });

  /* ---- Motyw ---- */
  function drawThemeBtn() {
    var dark = SPTheme.current() === "dark";
    var b = $("#themeBtn");
    b.innerHTML = ico(dark ? "sun" : "moon", 18);
    b.title = dark ? "Jasny motyw" : "Ciemny motyw";
  }
  $("#themeBtn").addEventListener("click", function () { SPTheme.toggle(); });
  addEventListener("themechange", drawThemeBtn);
  drawThemeBtn();
  $("#meBtn").addEventListener("click", function (e) {
    SP.menu(e.currentTarget, [
      { html: SP.avatar("me") + "<span><b>" + esc(SP.user.name) + '</b><br><small class="muted">' + esc(SP.user.email) + "</small></span>" },
      "-",
      { label: "Moje zadania", icon: "list-checks", run: function () { location.hash = "#/my-tasks"; } },
      { label: "Skrzynka", icon: "inbox", run: function () { location.hash = "#/inbox"; } },
      { label: "Ustawienia", icon: "user-cog", run: function () { location.hash = "#/settings"; } },
      { label: "Skróty klawiszowe", icon: "keyboard", run: function () { SP.showShortcuts(); } },
    ].concat(window.SPInstall && !SPInstall.standalone() ? [{ label: SPInstall.available() ? "Zainstaluj aplikację" : "Jak zainstalować aplikację?", icon: "download", run: function () {
      if (SPInstall.available()) SPInstall.prompt().then(function (ok) { if (ok) SP.toast("Sprynt zainstalowany – znajdziesz go wśród aplikacji"); });
      else SP.confirm("Zainstaluj Sprynt jako aplikację", SPInstall.howTo() + "\n\nPo instalacji Sprynt otwiera się w osobnym oknie i działa także bez internetu.", "Rozumiem");
    } }] : []).concat([
      "-",
      { header: "Motyw" },
      { label: "Jasny", icon: "sun", active: SPTheme.pref() === "light", run: function () { SPTheme.set("light"); } },
      { label: "Ciemny", icon: "moon", active: SPTheme.pref() === "dark", run: function () { SPTheme.set("dark"); } },
      { label: "Systemowy", icon: "monitor", active: SPTheme.pref() === "system", run: function () { SPTheme.set("system"); } },
      "-",
      { label: "Wyloguj się", icon: "log-out", run: function () {
        var flush = SP.cloud && SP.cloud.status().dirty ? SP.cloud.push() : Promise.resolve();
        flush.then(function () { SP.cloudLeaving = true; return SPAuth.logout(); }).then(function () { history.replaceState(null, "", location.pathname + "#login"); location.reload(); });
      } },
    ]), { align: "right" });
  });
  $("#wsBtn").addEventListener("click", function (e) {
    SP.menu(e.currentTarget, [
      { html: '<img class="ws-logo sm" src="img/logo.svg" alt="" /><span><b>Sprynt</b><br><small class="muted">' + db.raw.people.length + " członków · plan Free</small></span>" },
      "-",
      { label: "Nowa przestrzeń", icon: "plus", run: newSpace },
      { label: "Zaproś członków", icon: "users", run: invite },
    ]);
  });
  function invite() { SP.inviteDialog(); }
  $("#inviteBtn").addEventListener("click", invite);

  /* ---- Mobilny pasek boczny ---- */
  function closeMobileNav() { document.body.classList.remove("nav-open"); }
  $("#navBtn").addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
  $("#navScrim").addEventListener("click", closeMobileNav);

  /* =================== Paleta Cmd/Ctrl+K =================== */
  var pal = $("#palette"), pIn = $("#paletteInput"), pList = $("#paletteList"), pItems = [], pIdx = 0;
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l"); }
  function buildPalette() {
    var q = norm(pIn.value.trim());
    var m = function (s) { return !q || norm(s).indexOf(q) >= 0; };
    var groups = [];
    var tasks = db.raw.tasks.filter(function (t) { return q ? m(t.title) || m(db.taskKey(t)) : false; }).slice(0, 8);
    if (!q) tasks = db.raw.recents.filter(function (r) { return r.type === "task" && db.task(r.id); }).slice(0, 5).map(function (r) { return db.task(r.id); });
    if (tasks.length) groups.push([q ? "Zadania" : "Ostatnie zadania", tasks.map(function (t) {
      return { html: SP.statusDot(t.status) + "<span>" + esc(t.title) + '</span><small class="muted">' + db.taskKey(t) + " · " + esc(db.pathOf(t).list.name) + "</small>", run: function () { SP.openTask(t.id); } };
    })]);
    var places = [];
    db.raw.spaces.forEach(function (s) { if (m(s.name)) places.push({ html: SP.spaceIcon(s, "xs") + "<span>" + esc(s.name) + '</span><small class="muted">Przestrzeń</small>', run: function () { location.hash = "#/space/" + s.id; } }); });
    db.raw.folders.forEach(function (f) { if (m(f.name)) places.push({ html: ico("folder", 15) + "<span>" + esc(f.name) + '</span><small class="muted">Folder</small>', run: function () { location.hash = "#/folder/" + f.id; } }); });
    db.raw.lists.forEach(function (l) { if (m(l.name)) places.push({ html: ico("list", 15) + "<span>" + esc(l.name) + '</span><small class="muted">' + esc((db.space(l.spaceId) || {}).name) + "</small>", run: function () { location.hash = "#/list/" + l.id; } }); });
    if (places.length) groups.push(["Miejsca", places.slice(0, q ? 8 : 6)]);
    var files = q ? db.raw.files.filter(function (f) { return m(f.name); }).slice(0, 5) : [];
    if (files.length) groups.push(["Pliki", files.map(function (f) { return { html: SP.fileTile(f) + "<span>" + esc(f.name) + '</span><small class="muted">' + SP.fmtSize(f.size) + "</small>", run: function () { SP.previewFile(f.id); } }; })]);
    var docs = db.raw.docs.filter(function (d) { return m(d.title); }).slice(0, 5);
    if (docs.length) groups.push(["Dokumenty", docs.map(function (d) { return { html: ico("file-text", 15) + "<span>" + esc(d.title) + "</span>", run: function () { location.hash = "#/doc/" + d.id; } }; })]);
    var boards = db.raw.whiteboards.filter(function (w) { return q && m(w.title); }).slice(0, 5);
    if (boards.length) groups.push(["Tablice online", boards.map(function (w) { return { html: ico("presentation", 15) + "<span>" + esc(w.title) + "</span>", run: function () { location.hash = "#/wb/" + w.id; } }; })]);
    var goals = db.raw.goals.filter(function (g) { return q && m(g.name); }).slice(0, 4);
    if (goals.length) groups.push(["Cele", goals.map(function (g) { return { html: ico("target", 15) + "<span>" + esc(g.name) + '</span><small class="muted">' + Math.round(db.goalProgress(g) * 100) + "%</small>", run: function () { location.hash = "#/goals"; } }; })]);
    var sprs = db.raw.sprints.filter(function (x) { return q && m(x.name); }).slice(0, 4);
    if (sprs.length) groups.push(["Sprinty", sprs.map(function (x) { return { html: ico("gauge", 15) + "<span>" + esc(x.name) + '</span><small class="muted">' + esc((db.space(x.spaceId) || {}).name || "") + "</small>", run: function () { location.hash = "#/sprint/" + x.id; } }; })]);
    var acts = [
      ["Nowe zadanie", "plus", function () { SP.quickTask(); }], ["Nowa lista", "list", function () { newList(); }], ["Nowy dokument", "file-text", function () { SP.newDoc(); }],
      ["Wgraj pliki do chmury", "upload", function () { SP.pickFiles(); }], ["Chmura", "cloud", function () { location.hash = "#/cloud"; }],
      ["Ustawienia", "user-cog", function () { location.hash = "#/settings"; }], ["Skróty klawiszowe", "keyboard", function () { SP.showShortcuts(); }],
      ["Zatrzymaj stoper", "pause", function () { db.stopTimer(); }],
      ["Pulpit", "chart-column", function () { location.hash = "#/dashboard"; }], ["Cele", "target", function () { location.hash = "#/goals"; }],
      ["Automatyzacje", "zap", function () { location.hash = "#/automations"; }], ["Tablice online", "presentation", function () { location.hash = "#/whiteboards"; }],
      ["Nowa tablica online", "presentation", function () { SP.newWhiteboard(); }],
      ["Sprinty", "gauge", function () { location.hash = "#/sprints"; }], ["Nowy sprint", "gauge", function () { SP.newSprint(); }],
      ["Arkusz czasu", "countdown", function () { location.hash = "#/timesheet"; }],
      ["Czat", "message-square", function () { location.hash = "#/chat"; }], ["Szablony zadań", "files", function () { location.hash = "#/templates"; }],
      ["Kosz", "trash", function () { location.hash = "#/trash"; }],
      ["Zaproś znajomych", "users", function () { SP.inviteDialog(); }], ["Zespół", "users", function () { location.hash = "#/team"; }],
      ["Ustawienia AI", "sparkles", function () { location.hash = "#/settings"; setTimeout(function () { var a = document.getElementById("ai-sec"); if (a) a.scrollIntoView({ behavior: "smooth" }); }, 120); }],
      ["Zadania z pliku (Word, PDF, Excel)", "sparkles", function () { SP.extractTasks(); }],
      ["Wklej listę zadań (wiele naraz)", "wand-sparkles", function () { pasteFromClipboard(); }],
      ["Podsumowanie tygodnia", "trophy", function () { if (SP.weekRecap) SP.weekRecap(); }],
      ["Strona główna", "house", function () { location.hash = "#/home"; }], ["Skrzynka", "inbox", function () { location.hash = "#/inbox"; }], ["Moje zadania", "list-checks", function () { location.hash = "#/my-tasks"; }],
    ].filter(function (a) { return m(a[0]); });
    if (acts.length) groups.push(["Akcje", acts.map(function (a) { return { html: ico(a[1], 15) + "<span>" + a[0] + "</span>", run: a[2] }; })]);
    pItems = []; var h = "";
    groups.forEach(function (g) {
      h += '<div class="pal-g">' + g[0] + "</div>";
      g[1].forEach(function (it) { var i = pItems.push(it) - 1; h += '<div class="pal-i" role="option" data-i="' + i + '">' + it.html + "</div>"; });
    });
    pList.innerHTML = h || '<div class="pal-empty">Nic nie znaleziono dla „' + esc(pIn.value) + "”</div>";
    pIdx = Math.min(pIdx, Math.max(0, pItems.length - 1));
    SP.hydrateIcons(pList); hl();
  }
  function hl() { pList.querySelectorAll(".pal-i").forEach(function (el) { var on = Number(el.dataset.i) === pIdx; el.setAttribute("aria-selected", on); if (on) el.scrollIntoView({ block: "nearest" }); }); }
  function openPal() { SP.closePopover(); pal.hidden = false; pIn.value = ""; pIdx = 0; buildPalette(); pIn.focus(); }
  function closePal() { pal.hidden = true; }
  function runPal(i) { var it = pItems[i]; if (!it) return; closePal(); it.run(); }
  $("#searchBtn").addEventListener("click", openPal);
  pIn.addEventListener("input", function () { pIdx = 0; buildPalette(); });
  pIn.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); pIdx = (pIdx + 1) % Math.max(1, pItems.length); hl(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); pIdx = (pIdx - 1 + pItems.length) % Math.max(1, pItems.length); hl(); }
    else if (e.key === "Enter") { e.preventDefault(); runPal(pIdx); }
    else if (e.key === "Escape") { e.preventDefault(); closePal(); }
  });
  pList.addEventListener("click", function (e) { var i = e.target.closest(".pal-i"); if (i) runPal(Number(i.dataset.i)); });
  pList.addEventListener("pointermove", function (e) { var i = e.target.closest(".pal-i"); if (i && Number(i.dataset.i) !== pIdx) { pIdx = Number(i.dataset.i); hl(); } });
  pal.addEventListener("mousedown", function (e) { if (e.target === pal) closePal(); });

  var gPending = false;
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.hidden ? openPal() : closePal(); return; }
    if (e.key === "Escape" && document.querySelector(".popover")) { SP.closePopover(); return; }
    if (e.key === "Escape" && SP.selection && SP.selection.size && !document.querySelector(".tm-bg,.dlg-bg")) { SP.clearSelection(); return; }
    var a = document.activeElement, typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !pal.hidden || document.querySelector(".tm-bg,.dlg-bg")) return;
    // Sekwencje „G, potem litera” – przejście do widoku.
    if (gPending) {
      gPending = false;
      var go = { h: "#/home", i: "#/inbox", m: "#/my-tasks", c: "#/cloud", s: "#/settings", d: "#/docs", p: "#/dashboard", o: "#/goals", a: "#/automations", w: "#/whiteboards", k: "#/chat", b: "#/trash", r: "#/sprints", t: "#/timesheet" }[e.key.toLowerCase()];
      if (go) { e.preventDefault(); location.hash = go; return; }
    }
    if (e.key === "g") { gPending = true; setTimeout(function () { gPending = false; }, 1200); return; }
    if (e.key === "t" || e.key === "n") { e.preventDefault(); SP.quickTask({ listId: route.name === "list" ? route.params.id : undefined }); }
    else if (e.key === "/") { e.preventDefault(); openPal(); }
    else if (e.key === "?") { e.preventDefault(); SP.showShortcuts(); }
  });

  render(true);
})();
