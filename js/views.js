/* Sprynt – widoki obszaru roboczego. Każdy widok: render(el, params) + opcjonalnie crumbs(params). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, esc = SP.esc, ico = SP.ico;
  var views = (SP.views = {});
  var groupState = {}; // zwinięte grupy: { "<loc>:<grp>": true }
  var locState = {};   // filtry per miejsce

  /* =================== Wspólne: wiersz zadania =================== */
  function chipsHTML(t, showPath) {
    var subs = db.subtasks(t.id), h = "";
    if (showPath) { var p = db.pathOf(t); h += '<span class="r-path">' + esc(p.list.name) + "</span>"; }
    if (subs.length) h += '<span class="r-chip" title="Podzadania">' + ico("git-branch", 13) + subs.length + "</span>";
    if (t.checklist.length) h += '<span class="r-chip" title="Lista kontrolna">' + ico("list-checks", 13) + t.checklist.filter(function (c) { return c.done; }).length + "/" + t.checklist.length + "</span>";
    if (t.comments.length) h += '<span class="r-chip" title="Komentarze">' + ico("message-square", 13) + t.comments.length + "</span>";
    var tt = db.timeTotal(t);
    if (tt >= 60000 || (t.time || []).some(function (e) { return !e.end; })) h += '<span class="r-chip" title="Zarejestrowany czas">' + ico("clock", 13) + '<span data-live-total="' + t.id + '">' + db.fmtDuration(tt) + "</span></span>";
    if (t.points != null) h += '<span class="pts" title="Punkty">' + t.points + "</span>";
    var spr = t.sprintId && db.sprint && db.sprint(t.sprintId);
    if (spr && spr.state !== "done") h += '<a class="r-chip spr-chip" data-q="go" href="#/sprint/' + spr.id + '" title="Sprint">' + ico("gauge", 13) + esc(spr.name) + "</a>";
    if (t.recur) h += '<span class="r-chip" title="Powtarza się ' + db.RECUR[t.recur] + '">' + ico("repeat", 13) + "</span>";
    var att = db.filesFor(t.id).length;
    if (att) h += '<span class="r-chip" title="Załączniki">' + ico("paperclip", 13) + att + "</span>";
    if (t.desc) h += '<span class="r-chip" title="Ma opis">' + ico("file-text", 13) + "</span>";
    if (SP.rowChips) h += SP.rowChips(t);
    h += t.tags.map(SP.tagChip).join("");
    return h;
  }
  function rowHTML(t, opts) {
    opts = opts || {};
    var closed = db.status(t.status).closed, d = SP.fmtDue(t.due, closed);
    var running = (t.time || []).some(function (e) { return !e.end; });
    return '<div class="row' + (closed ? " closed" : "") + (sel.has(t.id) ? " selected" : "") + '" data-task="' + t.id + '"' + (opts.drag ? ' draggable="true"' : "") + ">" +
      '<div class="c-name"><button class="sel-box" data-q="select" aria-label="Zaznacz zadanie" aria-pressed="' + sel.has(t.id) + '">' + ico("check", 11) + "</button>" +
      '<button class="st-btn" data-q="status" title="Status: ' + esc(db.status(t.status).name) + '">' + SP.statusDot(t.status) + "</button>" +
      '<span class="r-title">' + esc(t.title) + "</span>" + chipsHTML(t, opts.path) +
      '<button class="row-timer' + (running ? " on" : "") + '" data-q="timer" title="' + (running ? "Zatrzymaj stoper" : "Włącz stoper") + '">' + ico(running ? "pause" : "play", 13) + "</button></div>" +
      '<div class="c-ass"><button class="cell-btn" data-q="assignees">' + SP.avatars(t.assignees, "sm") + "</button></div>" +
      '<div class="c-due"><button class="cell-btn" data-q="due">' + (t.due ? '<span class="due ' + d.cls + '">' + d.label + "</span>" : '<span class="cell-empty">' + ico("calendar", 15) + "</span>") + "</button></div>" +
      '<div class="c-prio"><button class="cell-btn" data-q="priority">' + (t.priority ? SP.flag(t.priority, true) : '<span class="cell-empty">' + ico("flag", 15) + "</span>") + "</button></div>" +
      "</div>";
  }
  var TABLE_HEAD = '<div class="tbl-h"><div class="c-name">Nazwa</div><div class="c-ass">Osoby</div><div class="c-due">Termin</div><div class="c-prio">Priorytet</div></div>';

  /* ---- Zaznaczanie wielu zadań + pasek akcji zbiorczych ---- */
  var sel = new Set();
  SP.selection = sel;
  function toggleSel(id, host) {
    sel.has(id) ? sel.delete(id) : sel.add(id);
    document.querySelectorAll('[data-task="' + id + '"]').forEach(function (r) {
      r.classList.toggle("selected", sel.has(id));
      var b = r.querySelector(".sel-box"); if (b) b.setAttribute("aria-pressed", String(sel.has(id)));
    });
    drawBulk();
  }
  SP.clearSelection = function () { sel.clear(); document.querySelectorAll(".row.selected,.tr.selected").forEach(function (r) { r.classList.remove("selected"); var b = r.querySelector(".sel-box"); if (b) b.setAttribute("aria-pressed", "false"); }); drawBulk(); };
  function drawBulk() {
    Array.from(sel).forEach(function (id) { if (!db.task(id)) sel.delete(id); });
    var bar = document.getElementById("bulkBar");
    if (!sel.size) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = SP.el('<div class="bulk" id="bulkBar" role="toolbar" aria-label="Akcje dla zaznaczonych zadań"></div>');
      document.body.appendChild(bar);
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("[data-b]"); if (!b) return;
        var ids = Array.from(sel), k = b.dataset.b, first = db.task(ids[0]) || {};
        if (k === "status") SP.pickStatus(b, null, function (v) { db.bulkUpdate(ids, { status: v }, "zmienił(a) status na " + db.status(v).name); SP.toast("Zmieniono status " + ids.length + " zadań"); });
        else if (k === "priority") SP.pickPriority(b, null, function (v) { db.bulkUpdate(ids, { priority: v }); });
        else if (k === "assignees") SP.pickAssignees(b, first.assignees || [], function (v) { db.bulkUpdate(ids, { assignees: v }); });
        else if (k === "due") SP.pickDate(b, null, function (v) { db.bulkUpdate(ids, { due: v }, v ? "ustawił(a) termin" : "usunął/usunęła termin"); });
        else if (k === "list") SP.pickList(b, null, function (v) { db.bulkUpdate(ids, { listId: v }, "przeniósł/przeniosła do listy " + db.list(v).name); SP.toast("Przeniesiono " + ids.length + " zadań"); });
        else if (k === "sprint") {
          var sids = new Set(ids.map(function (id) { var x = db.task(id); return x && (db.list(x.listId) || {}).spaceId; }));
          if (sids.size > 1) { SP.toast("Zaznacz zadania z jednej przestrzeni"); return; }
          SP.pickSprint(b, Array.from(sids)[0], null, function (v) { db.setSprint(ids, v); SP.toast(v ? "Dodano " + ids.length + " zadań do " + db.sprint(v).name : "Przeniesiono do backlogu"); });
        }
        else if (k === "points") SP.pickPoints(b, null, function (v) { ids.forEach(function (id) { db.setPoints(id, v); }); });
        else if (k === "dup") { ids.forEach(function (id) { db.duplicateTask(id); }); SP.toast("Zduplikowano " + ids.length + " zadań"); }
        else if (k === "del") SP.confirm("Usunąć " + ids.length + " zadań?", "Zaznaczone zadania i ich podzadania trafią do kosza (30 dni na przywrócenie).").then(function (ok) { if (ok) { db.bulkDelete(ids); sel.clear(); drawBulk(); SP.toast("Przeniesiono do kosza"); } });
        else if (k === "clear") SP.clearSelection();
      });
    }
    bar.innerHTML = '<span class="bulk-n">' + sel.size + "</span><span class=\"bulk-l\">zaznaczonych</span>" +
      [["status", "check", "Status"], ["assignees", "users", "Osoby"], ["due", "calendar", "Termin"], ["priority", "flag", "Priorytet"], ["list", "list", "Przenieś"]].concat(SP.pickSprint ? [["sprint", "gauge", "Sprint"], ["points", "hash", "Punkty"]] : []).concat([["dup", "files", "Duplikuj"]]).map(function (x) {
        return '<button class="bulk-b" data-b="' + x[0] + '">' + ico(x[1], 15) + x[2] + "</button>";
      }).join("") + '<button class="bulk-b danger" data-b="del">' + ico("trash", 15) + 'Usuń</button><button class="ibtn" data-b="clear" title="Odznacz (Esc)">' + ico("x", 16) + "</button>";
  }
  SP.drawBulk = drawBulk;
  addEventListener("hashchange", function () { sel.clear(); drawBulk(); });

  /** Obsługa kliknięć w wierszach/kartach: szybkie edycje i otwieranie zadania. */
  function bindTaskClicks(root) {
    root.addEventListener("click", function (e) {
      var host = e.target.closest("[data-task]"); if (!host || !root.contains(host)) return;
      var t = db.task(host.dataset.task); if (!t) return;
      var q = e.target.closest("[data-q]");
      if (!q) { SP.openTask(t.id); return; }
      e.stopPropagation();
      var k = q.dataset.q;
      if (k === "select") { toggleSel(t.id, host); return; }
      if (k.indexOf("cf:") === 0) { if (SP.editField) SP.editField(q, t.id, k.slice(3)); return; }
      if (k === "timer") { (t.time || []).some(function (x) { return !x.end; }) ? db.stopTimer() : db.startTimer(t.id); return; }
      if (k === "start") { SP.pickDate(q, t.start, function (v) { db.updateTask(t.id, { start: v }, v ? "ustawił(a) datę startu" : "usunął/usunęła datę startu"); }); return; }
      if (k === "status") SP.pickStatus(q, t.status, function (v) { db.updateTask(t.id, { status: v }, "zmienił(a) status na " + db.status(v).name); });
      else if (k === "assignees") SP.pickAssignees(q, t.assignees, function (v) { db.updateTask(t.id, { assignees: v }); });
      else if (k === "due") SP.pickDate(q, t.due, function (v) { db.updateTask(t.id, { due: v }, v ? "ustawił(a) termin" : "usunął/usunęła termin"); });
      else if (k === "priority") SP.pickPriority(q, t.priority, function (v) { db.updateTask(t.id, { priority: v }); });
    });
  }

  /* =================== Strona główna =================== */
  views.home = {
    title: function () { return "Strona główna"; },
    crumbs: function () { return [{ icon: "house", label: "Strona główna" }]; },
    render: function (el) {
      var me = db.me, tasks = db.raw.tasks;
      var mineOpen = tasks.filter(function (t) { return t.assignees.indexOf(me) >= 0 && !db.status(t.status).closed; });
      var mineDone = tasks.filter(function (t) { return t.assignees.indexOf(me) >= 0 && db.status(t.status).closed; });
      var h = new Date().getHours(), hello = (h < 12 ? "Dzień dobry" : h < 18 ? "Cześć" : "Dobry wieczór") + ", " + esc(String(SP.user.name).split(/\s+/)[0]);
      if (!tasks.length) { renderWelcome(el, hello); return; }
      var tab = views.home.tab || "open";
      var list = tab === "open" ? mineOpen : mineDone;
      var buckets = [["Zaległe", function (t) { return t.due && SP.date.diff(t.due) < 0; }], ["Dziś", function (t) { return t.due && SP.date.diff(t.due) === 0; }],
        ["Następne", function (t) { return t.due && SP.date.diff(t.due) > 0; }], ["Bez terminu", function (t) { return !t.due; }]];
      var mine = tab === "open" ? buckets.map(function (b) {
        var items = list.filter(b[1]).sort(byDue); if (!items.length) return "";
        return '<div class="hb"><div class="hb-h">' + b[0] + '<span class="muted">' + items.length + "</span></div>" + items.map(compactRow).join("") + "</div>";
      }).join("") : list.sort(byUpdated).map(compactRow).join("");

      var recents = db.raw.recents.map(function (r) {
        var o = r.type === "task" ? db.task(r.id) : r.type === "doc" ? db.doc(r.id) : db[r.type] ? db[r.type](r.id) : null;
        if (!o) return "";
        var href = r.type === "task" ? "" : r.type === "doc" ? "#/doc/" + o.id : r.type === "whiteboard" ? "#/wb/" + o.id : "#/" + r.type + "/" + o.id;
        var icon = { task: "check", doc: "file-text", list: "list", folder: "folder", space: "layout-dashboard", whiteboard: "presentation" }[r.type];
        var name = o.title || o.name;
        var sub = r.type === "task" ? db.pathOf(o).list.name : r.type === "doc" || r.type === "whiteboard" ? (db.space(o.spaceId) || {}).name : r.type === "list" ? (db.space(o.spaceId) || {}).name : "";
        return '<a class="rec" ' + (href ? 'href="' + href + '"' : 'data-task="' + o.id + '"') + ">" + ico(icon, 16) + '<span class="rec-n">' + esc(name) + '</span><span class="muted">' + esc(sub || "") + "</span></a>";
      }).filter(Boolean).slice(0, 7).join("") || '<div class="empty-s">Tu pojawią się ostatnio otwierane listy, zadania i dokumenty.</div>';

      var agenda = [0, 1, 2].map(function (off) {
        var d = SP.date.add(SP.date.today(), off);
        var items = tasks.filter(function (t) { return t.due === d && !t.parentId; });
        var label = off === 0 ? "Dziś" : off === 1 ? "Jutro" : new Date(d + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "long" });
        return '<div class="ag-day"><div class="ag-h"><b>' + label + '</b><span class="muted">' + new Date(d + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) + "</span></div>" +
          (items.length ? items.map(function (t) { return '<button class="ag-item" data-task="' + t.id + '" style="--c:' + db.status(t.status).color + '"><span>' + esc(t.title) + "</span>" + SP.avatars(t.assignees, "xs", 2) + "</button>"; }).join("") : '<div class="ag-empty">Brak zadań</div>') + "</div>";
      }).join("");

      var prio = mineOpen.filter(function (t) { return t.priority === "urgent" || t.priority === "high"; }).sort(function (a, b) { return (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1) || byDue(a, b); });

      var progress = db.raw.spaces.map(function (s) {
        var all = db.tasksIn({ type: "space", id: s.id }), done = all.filter(function (t) { return db.status(t.status).closed; }).length;
        var pct = all.length ? Math.round(done / all.length * 100) : 0;
        return '<a class="pg" href="#/space/' + s.id + '">' + SP.spaceIcon(s, "sm") + '<span class="pg-n">' + esc(s.name) + '</span><span class="progress"><i style="width:' + pct + "%;background:" + s.color + '"></i></span><span class="pg-p">' + pct + "%</span></a>";
      }).join("");

      el.innerHTML =
        '<div class="page home"><div class="home-head"><div><h1>' + hello + "</h1><p class='muted'>" + cap(new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })) + "</p></div>" +
        (SP.weekRecap ? '<button class="recap-btn" data-recap title="Twój tydzień w liczbach">' + ico("trophy", 18) + "<span><b>Podsumowanie tygodnia</b><small>" + weekDone() + "</small></span></button>" : "") + "</div>" +
        '<div class="home-grid">' +
        '<section class="card span2"><div class="card-h"><h2>Moje zadania</h2><div class="seg"><button data-tab="open" aria-pressed="' + (tab === "open") + '">Do zrobienia <span>' + mineOpen.length + '</span></button><button data-tab="done" aria-pressed="' + (tab === "done") + '">Ukończone <span>' + mineDone.length + '</span></button></div><a class="card-link" href="#/my-tasks">Wszystkie</a></div>' +
        '<div class="card-b">' + (mine || '<div class="empty-s">Nic tu nie ma. Dobra robota!</div>') + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Agenda</h2></div><div class="card-b agenda">' + agenda + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Ostatnie</h2></div><div class="card-b">' + recents + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Priorytety</h2><span class="muted">' + prio.length + '</span></div><div class="card-b">' + (prio.map(compactRow).join("") || '<div class="empty-s">Brak pilnych zadań.</div>') + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Postęp przestrzeni</h2></div><div class="card-b">' + progress + "</div></section>" +
        "</div></div>";
      el.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { views.home.tab = b.dataset.tab; SP.rerender(); }; });
      var rb = el.querySelector("[data-recap]"); if (rb) rb.onclick = function () { SP.weekRecap(); };
      bindTaskClicks(el);
    },
  };
  /** Pierwsze kroki – nowe konto z pustym projektem. */
  function renderWelcome(el, hello) {
    var s = db.raw.spaces[0], l = db.raw.lists[0];
    var steps = [
      ["plus", "Dodaj pierwsze zadanie", "Naciśnij T w dowolnym miejscu albo kliknij „Nowe” w górnym pasku.", "task"],
      ["users", "Zaproś zespół", "Dodaj osoby, żeby przypisywać im zadania.", "invite"],
      ["file-text", "Napisz dokument", "Notatki, specyfikacje i briefy obok zadań.", "doc"],
    ];
    el.innerHTML = '<div class="page narrow welcome"><div class="wl-hero"><img class="wl-logo" src="img/logo.svg" alt="" /><h1>' + hello + '!</h1><p class="muted">' +
      (s ? "Twój projekt <b>„" + esc(s.name) + "”</b> jest gotowy – na razie pusty. Zacznij od pierwszego zadania." : "Utwórz pierwszą przestrzeń, żeby zacząć.") + "</p>" +
      '<div class="wl-cta">' + (l ? '<button class="btn primary" data-w="task">' + ico("plus", 16) + 'Dodaj pierwsze zadanie</button><a class="btn" href="#/list/' + l.id + '">' + ico("list", 16) + "Otwórz listę „" + esc(l.name) + "”</a>"
        : '<button class="btn primary" data-w="space">' + ico("plus", 16) + "Nowa przestrzeń</button>") + "</div></div>" +
      '<div class="wl-steps">' + steps.map(function (x, i) {
        return '<button class="wl-step" data-w="' + x[3] + '" style="--d:' + (0.1 + i * 0.08) + 's"><span class="wl-ico">' + ico(x[0], 20) + '</span><span><b>' + x[1] + "</b><small>" + x[2] + "</small></span>" + ico("chevron-right", 16) + "</button>";
      }).join("") + "</div></div>";
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-w]"); if (!b) return;
      var w = b.dataset.w;
      if (w === "task") SP.quickTask({ listId: l && l.id });
      else if (w === "invite") document.getElementById("inviteBtn").click();
      else if (w === "doc") SP.newDoc(s && s.id);
      else if (w === "space") document.getElementById("addSpaceBtn").click();
    });
  }
  function weekDone() {
    var from = SP.date.add(SP.date.today(), -6), n = db.raw.tasks.filter(function (t) { return t.doneAt && db.status(t.status).closed && SP.date.ymd(new Date(t.doneAt)) >= from; }).length;
    return n ? "ukończono " + n + " w 7 dni" : "zobacz swój tydzień";
  }
  function compactRow(t) {
    var d = SP.fmtDue(t.due, db.status(t.status).closed);
    return '<div class="crow" data-task="' + t.id + '"><button class="st-btn" data-q="status">' + SP.statusDot(t.status) + '</button><span class="r-title">' + esc(t.title) + '</span><span class="r-path">' + esc(db.pathOf(t).list.name) + "</span>" +
      (t.priority ? SP.flag(t.priority) : "") + (t.due ? '<span class="due ' + d.cls + '">' + d.label + "</span>" : "") + "</div>";
  }
  function byDue(a, b) { return (a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0; }
  function byUpdated(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* =================== Skrzynka =================== */
  views.inbox = {
    title: function () { return "Skrzynka"; },
    crumbs: function () { return [{ icon: "inbox", label: "Skrzynka" }]; },
    render: function (el) {
      var tab = views.inbox.tab || "important";
      var all = db.raw.notifications.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
      var count = function (s) { return all.filter(function (n) { return n.state === s; }).length; };
      var items = all.filter(function (n) { return n.state === tab; });
      el.innerHTML = '<div class="page narrow"><div class="page-h"><h1>Skrzynka</h1>' +
        (tab !== "cleared" && items.length ? '<button class="btn ghost" data-clear-all>' + ico("check", 15) + "Wyczyść wszystko</button>" : "") + "</div>" +
        '<div class="tabs-u"><button data-tab="important" aria-pressed="' + (tab === "important") + '">Ważne<span>' + count("important") + '</span></button><button data-tab="other" aria-pressed="' + (tab === "other") + '">Inne<span>' + count("other") + '</span></button><button data-tab="cleared" aria-pressed="' + (tab === "cleared") + '">Wyczyszczone</button></div>' +
        '<div class="inbox">' + (items.map(function (n) {
          var p = db.person(n.by) || {}, t = db.task(n.taskId);
          return '<div class="ib-row"' + (t ? ' data-task="' + t.id + '"' : "") + ">" + SP.avatar(n.by) +
            '<div class="ib-b"><div><b>' + esc(p.name) + "</b> " + esc(n.text) + "</div>" + (t ? '<div class="ib-t">' + SP.statusDot(t.status) + esc(t.title) + '<span class="muted"> · ' + esc(db.pathOf(t).list.name) + "</span></div>" : "") + "</div>" +
            '<time class="muted">' + SP.ago(n.at) + "</time>" +
            (tab === "cleared" ? '<button class="ibtn" data-restore="' + n.id + '" title="Przywróć">' + ico("inbox", 16) + "</button>"
              : '<button class="ibtn" data-clear="' + n.id + '" title="Wyczyść">' + ico("check", 16) + "</button>") + "</div>";
        }).join("") || '<div class="empty-b">' + ico("inbox", 40) + "<h3>Wszystko przeczytane</h3><p class='muted'>Nowe powiadomienia pojawią się tutaj.</p></div>") + "</div></div>";
      el.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { views.inbox.tab = b.dataset.tab; SP.rerender(); }; });
      el.addEventListener("click", function (e) {
        var c = e.target.closest("[data-clear]"), r = e.target.closest("[data-restore]"), all2 = e.target.closest("[data-clear-all]");
        if (c) { e.stopPropagation(); db.setNotification(c.dataset.clear, "cleared"); return; }
        if (r) { e.stopPropagation(); db.setNotification(r.dataset.restore, "important"); return; }
        if (all2) { items.forEach(function (n) { n.state = "cleared"; }); db.changed("inbox"); return; }
        var row = e.target.closest("[data-task]"); if (row) SP.openTask(row.dataset.task);
      });
    },
  };

  /* =================== Moje zadania =================== */
  views["my-tasks"] = {
    title: function () { return "Moje zadania"; },
    crumbs: function () { return [{ icon: "list-checks", label: "Moje zadania" }]; },
    render: function (el) {
      var mine = db.raw.tasks.filter(function (t) { return t.assignees.indexOf(db.me) >= 0; });
      var open = mine.filter(function (t) { return !db.status(t.status).closed; });
      var groups = [
        ["overdue", "Zaległe", "#e5484d", function (t) { return t.due && SP.date.diff(t.due) < 0; }],
        ["today", "Dziś", "#f0a020", function (t) { return t.due && SP.date.diff(t.due) === 0; }],
        ["tomorrow", "Jutro", "#5b6cf9", function (t) { return t.due && SP.date.diff(t.due) === 1; }],
        ["week", "W tym tygodniu", "#6c5ce7", function (t) { var d = t.due && SP.date.diff(t.due); return d >= 2 && d <= 7; }],
        ["later", "Później", "#87909e", function (t) { return t.due && SP.date.diff(t.due) > 7; }],
        ["none", "Bez terminu", "#b5bac4", function (t) { return !t.due; }],
      ];
      var h = '<div class="page"><div class="page-h"><h1>Moje zadania</h1><span class="muted">' + open.length + " otwartych</span></div><div class=\"list-view\">";
      groups.forEach(function (g) {
        var items = open.filter(g[3]).sort(byDue);
        if (!items.length) return;
        h += groupHTML("my:" + g[0], '<span class="grp-pill" style="--c:' + g[2] + '">' + g[1] + "</span>", items, { path: true });
      });
      var done = mine.filter(function (t) { return db.status(t.status).closed; });
      if (done.length) {
        if (groupState["my:done"] === undefined) groupState["my:done"] = true;
        h += groupHTML("my:done", SP.statusPill("done"), done.sort(byUpdated), { path: true });
      }
      el.innerHTML = h + "</div></div>";
      bindGroups(el);
      bindTaskClicks(el);
    },
  };

  /* =================== Miejsce: przestrzeń / folder / lista =================== */
  function locOf(type, id) {
    var o = db[type](id); if (!o) return null;
    return { type: type, id: id, obj: o };
  }
  function filtersFor(id) { return locState[id] || (locState[id] = { q: "", me: false, showClosed: true, group: "status", month: null, sort: "manual", tsort: { key: "due", dir: 1 }, tl: null }); }
  var PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
  var SORTS = { manual: "Ręcznie (kolejność dodania)", due: "Termin", priority: "Priorytet", title: "Nazwa", created: "Data utworzenia", updated: "Ostatnia zmiana" };
  function sortTasks(tasks, key, dir) {
    dir = dir || 1;
    var get = {
      due: function (t) { return t.due || "9999-99-99"; }, start: function (t) { return t.start || "9999-99-99"; },
      priority: function (t) { return t.priority ? PRIO_RANK[t.priority] : 9; }, title: function (t) { return t.title.toLowerCase(); },
      created: function (t) { return -new Date(t.createdAt).getTime(); }, updated: function (t) { return -new Date(t.updatedAt).getTime(); },
      status: function (t) { return db.STATUSES.findIndex(function (s) { return s.id === t.status; }); },
      time: function (t) { return -db.timeTotal(t); }, assignees: function (t) { return t.assignees.length ? (db.person(t.assignees[0]) || {}).name || "" : "\uffff"; },
      list: function (t) { return db.pathOf(t).list.name; },
    }[key];
    if (!get && key.indexOf("cf:") === 0) {
      var fd = db.field(key.slice(3)), num = fd && (fd.type === "number" || fd.type === "money" || fd.type === "checkbox");
      get = function (t) {
        var v = (t.cf || {})[key.slice(3)];
        if (fd && fd.type === "select") { var o = (fd.options || []).findIndex(function (x) { return x.id === v; }); return o < 0 ? 999 : o; }
        if (num) return v == null ? Infinity : Number(v);
        return v == null ? "\uffff" : String(v).toLowerCase();
      };
    }
    if (!get) return tasks;
    return tasks.slice().sort(function (a, b) { var x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }
  function applyFilters(tasks, f) {
    var q = f.q.trim().toLowerCase();
    return tasks.filter(function (t) {
      if (q && t.title.toLowerCase().indexOf(q) < 0 && db.taskKey(t).toLowerCase() !== q) return false;
      if (f.me && t.assignees.indexOf(db.me) < 0) return false;
      if (!f.showClosed && db.status(t.status).closed) return false;
      return true;
    });
  }
  function firstListOf(loc) { var ids = db.listsIn(loc); return ids[0] || null; }

  function locationView(type) {
    return {
      title: function (p) { var o = db[type](p.id); return o ? o.name : "Nie znaleziono"; },
      crumbs: function (p) {
        var o = db[type](p.id); if (!o) return [];
        var s = db.space(o.spaceId || o.id), c = [{ space: s, label: s.name, href: "#/space/" + s.id }];
        if (type === "folder") c.push({ icon: "folder", label: o.name });
        if (type === "list") { var f = o.folderId && db.folder(o.folderId); if (f) c.push({ icon: "folder", label: f.name, href: "#/folder/" + f.id }); c.push({ icon: "list", label: o.name }); }
        return c;
      },
      render: function (el, p) {
        var loc = locOf(type, p.id);
        if (!loc) { el.innerHTML = '<div class="page"><div class="empty-b"><h3>Nie znaleziono</h3><p class="muted">Ta lista lub przestrzeń została usunięta.</p><a class="btn" href="#/home">Wróć na stronę główną</a></div></div>'; return; }
        db.addRecent(type, p.id);
        var view = p.view || db.viewFor(p.id);
        var f = filtersFor(p.id);
        var fav = db.isFavorite(type, p.id);
        var iconHTML = type === "space" ? SP.spaceIcon(loc.obj, "md") : '<span class="loc-ico">' + ico(type === "folder" ? "folder" : "list", 20) + "</span>";
        var base = "#/" + type + "/" + p.id;
        el.innerHTML =
          '<div class="loc">' +
          '<div class="loc-head"><div class="loc-title">' + iconHTML + "<h1>" + esc(loc.obj.name) + "</h1>" +
          '<button class="ibtn' + (fav ? " fav-on" : "") + '" data-act="fav" title="' + (fav ? "Usuń z ulubionych" : "Dodaj do ulubionych") + '">' + ico("star", 17) + "</button>" +
          '<button class="ibtn" data-act="more" title="Więcej">' + ico("ellipsis", 17) + "</button></div>" +
          '<nav class="vtabs">' +
          [["list", "list", "Lista"], ["board", "kanban", "Tablica"], ["table", "spreadsheet", "Tabela"], ["calendar", "calendar", "Kalendarz"], ["timeline", "timeline", "Oś czasu"]].map(function (v) {
            return '<a href="' + base + "/" + v[0] + '" class="vtab" aria-current="' + (view === v[0] ? "page" : "false") + '">' + ico(v[1], 16) + v[2] + "</a>";
          }).join("") + "</nav></div>" +
          '<div class="toolbar"><label class="tsearch">' + ico("search", 15) + '<input placeholder="Szukaj zadań…" value="' + esc(f.q) + '" /></label>' +
          (view === "list" ? '<button class="tbtn" data-act="group">' + ico("layout-dashboard", 15) + "Grupuj: <b>" + { status: "Status", priority: "Priorytet", assignee: "Osoba" }[f.group] + "</b></button>" : "") +
          (view === "list" || view === "board" ? '<button class="tbtn" data-act="sort">' + ico("arrow-down-up", 15) + "Sortuj: <b>" + (f.sort === "manual" ? "ręcznie" : SORTS[f.sort].toLowerCase()) + "</b></button>" : "") +
          '<button class="tbtn" data-act="me" aria-pressed="' + f.me + '">' + ico("user", 15) + "Przypisane do mnie</button>" +
          '<button class="tbtn" data-act="closed" aria-pressed="' + !f.showClosed + '">' + ico(f.showClosed ? "eye" : "eye-off", 15) + (f.showClosed ? "Ukryj ukończone" : "Pokaż ukończone") + "</button>" +
          '<span class="grow"></span><button class="btn sm" data-act="from-file" title="Wyciągnij zadania z dokumentu albo arkusza">' + ico("sparkles", 15) + 'Z pliku</button><button class="btn primary sm" data-act="add">' + ico("plus", 15) + "Zadanie</button></div>" +
          '<div class="loc-body"></div></div>';

        var body = el.querySelector(".loc-body");
        var tasks = sortTasks(applyFilters(db.tasksIn(loc), f), f.sort);
        if (view === "board") renderBoard(body, loc, tasks);
        else if (view === "table") renderTable(body, loc, tasks, f);
        else if (view === "timeline") renderTimeline(body, loc, tasks, f);
        else if (view === "calendar") renderCalendar(body, loc, tasks, f);
        else renderList(body, loc, tasks, f);

        var input = el.querySelector(".tsearch input");
        input.addEventListener("input", function () {
          f.q = input.value;
          var t2 = applyFilters(db.tasksIn(loc), f);
          t2 = sortTasks(t2, f.sort);
          if (view === "board") renderBoard(body, loc, t2); else if (view === "calendar") renderCalendar(body, loc, t2, f);
          else if (view === "table") renderTable(body, loc, t2, f); else if (view === "timeline") renderTimeline(body, loc, t2, f); else renderList(body, loc, t2, f);
        });
        el.querySelector('[data-act="fav"]').onclick = function () { db.toggleFavorite(type, p.id); };
        el.querySelector('[data-act="more"]').onclick = function (e) { SP.nodeMenu(e.currentTarget, type, p.id); };
        el.querySelector('[data-act="me"]').onclick = function () { f.me = !f.me; SP.rerender(); };
        el.querySelector('[data-act="closed"]').onclick = function () { f.showClosed = !f.showClosed; SP.rerender(); };
        var so = el.querySelector('[data-act="sort"]');
        if (so) so.onclick = function () {
          SP.menu(so, [{ header: "Sortuj według" }].concat(Object.keys(SORTS).map(function (k) { return { label: SORTS[k], active: f.sort === k, run: function () { f.sort = k; SP.rerender(); } }; })));
        };
        var g = el.querySelector('[data-act="group"]');
        if (g) g.onclick = function () {
          SP.menu(g, [{ header: "Grupuj według" }].concat([["status", "Status"], ["priority", "Priorytet"], ["assignee", "Osoba"]].map(function (x) {
            return { label: x[1], active: f.group === x[0], run: function () { f.group = x[0]; SP.rerender(); } };
          })));
        };
        el.querySelector('[data-act="add"]').onclick = function () { SP.quickTask({ listId: type === "list" ? p.id : firstListOf(loc) }); };
        el.querySelector('[data-act="from-file"]').onclick = function () { SP.extractTasks({ listId: type === "list" ? p.id : firstListOf(loc) }); };
        if (p.view) db.setView(p.id, p.view);
      },
    };
  }
  views.space = locationView("space");
  views.folder = locationView("folder");
  views.list = locationView("list");

  /* ---- Lista ---- */
  function groupHTML(key, headHTML, items, opts) {
    opts = opts || {};
    var collapsed = !!groupState[key];
    return '<section class="grp' + (collapsed ? " collapsed" : "") + '" data-grp="' + key + '">' +
      '<div class="grp-h"><button class="grp-tog" data-tog="' + key + '">' + ico(collapsed ? "chevron-right" : "chevron-down", 14) + "</button>" + headHTML +
      '<span class="grp-n">' + items.length + "</span>" + (opts.add ? '<button class="grp-add" data-add-focus="' + key + '" title="Dodaj zadanie">' + ico("plus", 14) + "</button>" : "") + "</div>" +
      (collapsed ? "" : TABLE_HEAD + '<div class="rows">' + items.map(function (t) { return rowHTML(t, opts); }).join("") + "</div>" +
        (opts.add ? '<form class="add-row" data-add="' + esc(JSON.stringify(opts.add)) + '"><span class="add-plus">' + ico("plus", 14) + '</span><input placeholder="Dodaj zadanie" /></form>' : "")) +
      "</section>";
  }
  function bindGroups(root) {
    root.querySelectorAll("[data-tog]").forEach(function (b) { b.onclick = function () { groupState[b.dataset.tog] = !groupState[b.dataset.tog]; SP.rerender(); }; });
    root.querySelectorAll("[data-add-focus]").forEach(function (b) {
      b.onclick = function () { var i = root.querySelector('[data-grp="' + b.dataset.addFocus + '"] .add-row input'); if (i) i.focus(); };
    });
  }
  function renderList(body, loc, tasks, f) {
    var listId = loc.type === "list" ? loc.id : firstListOf(loc);
    var showPath = loc.type !== "list";
    var groups;
    if (f.group === "priority") groups = db.PRIORITIES.map(function (p) { return { key: p.id, head: '<span class="grp-pill" style="--c:' + p.color + '">' + SP.ico("flag", 13) + p.name + "</span>", items: tasks.filter(function (t) { return t.priority === p.id; }), add: { priority: p.id } }; })
      .concat([{ key: "none", head: '<span class="grp-pill" style="--c:#a0a7b4">Bez priorytetu</span>', items: tasks.filter(function (t) { return !t.priority; }), add: {} }]);
    else if (f.group === "assignee") groups = db.raw.people.map(function (p) { return { key: p.id, head: SP.avatar(p.id, "sm") + '<b class="grp-name">' + esc(p.name) + "</b>", items: tasks.filter(function (t) { return t.assignees.indexOf(p.id) >= 0; }), add: { assignees: [p.id] } }; })
      .concat([{ key: "none", head: '<b class="grp-name muted">Nieprzypisane</b>', items: tasks.filter(function (t) { return !t.assignees.length; }), add: {} }]);
    else groups = db.STATUSES.map(function (s) { return { key: s.id, head: SP.statusPill(s.id), items: tasks.filter(function (t) { return t.status === s.id; }), add: { status: s.id } }; });
    if (!f.showClosed && f.group === "status") groups = groups.filter(function (g) { return !db.status(g.key).closed; });
    var html = groups.filter(function (g) { return g.items.length || f.group === "status"; }).map(function (g) {
      return groupHTML(loc.id + ":" + f.group + ":" + g.key, g.head, g.items, { path: showPath, add: listId ? Object.assign({ listId: listId }, g.add) : null });
    }).join("");
    body.innerHTML = '<div class="list-view">' + (html || emptyLoc()) + "</div>";
    bindGroups(body);
    body.querySelectorAll(".add-row").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var inp = form.querySelector("input"), v = inp.value.trim(); if (!v) return;
        var fields = JSON.parse(form.dataset.add);
        db.createTask(SP.smartFields ? SP.smartFields(inp, Object.assign({ assignees: [] }, fields)) : Object.assign({ title: v, assignees: fields.assignees || [] }, fields));
        var key = form.closest("[data-grp]").dataset.grp;
        setTimeout(function () { var again = document.querySelector('[data-grp="' + key + '"] .add-row input'); if (again) again.focus(); }, 0);
      });
    });
    if (!body._bound) { bindTaskClicks(body); body._bound = true; }
  }
  function emptyLoc() { return '<div class="empty-b">' + ico("list-checks", 40) + "<h3>Brak zadań</h3><p class='muted'>Dodaj pierwsze zadanie przyciskiem „Zadanie”.</p></div>"; }

  /* ---- Tabela ---- */
  function renderTable(body, loc, tasks, f) {
    var showList = loc.type !== "list";
    var cols = [["title", "Nazwa"], ["status", "Status"], ["assignees", "Osoby"], ["start", "Start"], ["due", "Termin"], ["priority", "Priorytet"], ["time", "Czas"]]
      .concat(showList ? [["list", "Lista"]] : []).concat([["created", "Utworzono"]]);
    var cfs = loc.type === "list" ? db.fieldsFor(loc.id) : [];
    cols = cols.concat(cfs.map(function (fd) { return ["cf:" + fd.id, fd.name]; }));
    var ts = f.tsort || { key: "due", dir: 1 };
    var rows = sortTasks(tasks, ts.key, ts.dir);
    body.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="th-sel"></th>' + cols.map(function (c) {
      return '<th data-sort="' + c[0] + '"' + (ts.key === c[0] ? ' class="sorted"' : "") + ' aria-sort="' + (ts.key === c[0] ? (ts.dir > 0 ? "ascending" : "descending") : "none") + '">' + c[1] +
        (ts.key === c[0] ? '<span class="sort-ind">' + (ts.dir > 0 ? "↑" : "↓") + "</span>" : "") + "</th>";
    }).join("") + "</tr></thead><tbody>" + (rows.map(function (t) {
      var closed = db.status(t.status).closed, d = SP.fmtDue(t.due, closed), s = t.start ? SP.fmtDue(t.start, true) : null;
      return '<tr class="tr' + (sel.has(t.id) ? " selected" : "") + (closed ? " closed" : "") + '" data-task="' + t.id + '"><td class="td-sel"><button class="sel-box" data-q="select" aria-pressed="' + sel.has(t.id) + '" aria-label="Zaznacz">' + ico("check", 11) + "</button></td>" +
        '<td class="td-title"><span class="r-title">' + esc(t.title) + "</span>" + (db.subtasks(t.id).length ? '<span class="r-chip">' + ico("git-branch", 12) + db.subtasks(t.id).length + "</span>" : "") + "</td>" +
        '<td><button class="cell-btn" data-q="status">' + SP.statusPill(t.status) + "</button></td>" +
        '<td><button class="cell-btn" data-q="assignees">' + SP.avatars(t.assignees, "xs", 4) + "</button></td>" +
        '<td><button class="cell-btn" data-q="start">' + (s ? '<span class="due">' + s.label + "</span>" : '<span class="cell-empty">—</span>') + "</button></td>" +
        '<td><button class="cell-btn" data-q="due">' + (t.due ? '<span class="due ' + d.cls + '">' + d.label + "</span>" : '<span class="cell-empty">—</span>') + "</button></td>" +
        '<td><button class="cell-btn" data-q="priority">' + (t.priority ? SP.flag(t.priority, true) : '<span class="cell-empty">—</span>') + "</button></td>" +
        '<td class="muted"><span data-live-total="' + t.id + '">' + (db.timeTotal(t) ? db.fmtDuration(db.timeTotal(t)) : "—") + "</span></td>" +
        (showList ? '<td class="muted">' + esc(db.pathOf(t).list.name) + "</td>" : "") +
        '<td class="muted">' + new Date(t.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) + "</td>" +
        cfs.map(function (fd) { return '<td><button class="cell-btn" data-q="cf:' + fd.id + '">' + (SP.fieldValueHTML ? SP.fieldValueHTML(fd, (t.cf || {})[fd.id]) : "") + "</button></td>"; }).join("") + "</tr>";
    }).join("") || '<tr><td colspan="' + (cols.length + 1) + '"><div class="empty-s">Brak zadań.</div></td></tr>') + "</tbody></table></div>" +
      '<p class="tbl-foot muted">' + rows.length + " zadań · kliknij nagłówek kolumny, żeby sortować</p>";
    body.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.onclick = function () { var k = th.dataset.sort; f.tsort = ts.key === k ? { key: k, dir: -ts.dir } : { key: k, dir: 1 }; renderTable(body, loc, tasks, f); SP.hydrateIcons(body); };
    });
    if (!body._bound) { bindTaskClicks(body); body._bound = true; }
  }

  /* ---- Oś czasu (Gantt) ---- */
  var DAY_W = 34;
  function renderTimeline(body, loc, tasks, f) {
    var today = SP.date.today();
    if (!f.tl) { var d0 = new Date(today + "T00:00:00"); d0.setDate(d0.getDate() - ((d0.getDay() + 6) % 7) - 7); f.tl = SP.date.ymd(d0); }
    var start = f.tl, days = 42, dates = [];
    for (var i = 0; i < days; i++) dates.push(SP.date.add(start, i));
    var end = dates[days - 1];
    var dated = tasks.filter(function (t) { return t.start || t.due; });
    var undated = tasks.filter(function (t) { return !t.start && !t.due; });
    function idx(s) { return Math.round((new Date(s + "T00:00:00") - new Date(start + "T00:00:00")) / 864e5); }
    var months = [], cur = null;
    dates.forEach(function (d, i) { var m = d.slice(0, 7); if (m !== cur) { months.push({ m: m, i: i, n: 0 }); cur = m; } months[months.length - 1].n++; });
    var head = '<div class="tl-months">' + months.map(function (m) {
      return '<span style="left:' + m.i * DAY_W + "px;width:" + m.n * DAY_W + 'px">' + cap(new Date(m.m + "-01T00:00:00").toLocaleDateString("pl-PL", { month: "long", year: "numeric" })) + "</span>";
    }).join("") + '</div><div class="tl-days">' + dates.map(function (d) {
      var dd = new Date(d + "T00:00:00"), we = dd.getDay() === 0 || dd.getDay() === 6;
      return '<span class="' + (we ? "we" : "") + (d === today ? " today" : "") + '">' + dd.getDate() + "</span>";
    }).join("") + "</div>";
    var grid = '<div class="tl-grid" style="width:' + days * DAY_W + 'px">' + dates.map(function (d, i) {
      var dd = new Date(d + "T00:00:00");
      return (dd.getDay() === 0 || dd.getDay() === 6) ? '<i class="tl-we" style="left:' + i * DAY_W + "px;width:" + DAY_W + 'px"></i>' : "";
    }).join("") + (today >= start && today <= end ? '<i class="tl-today" style="left:' + (idx(today) * DAY_W + DAY_W / 2) + 'px"></i>' : "") + "</div>";
    var rowsL = "", rowsR = "";
    sortTasks(dated, "start").sort(function (a, b) { return (a.start || a.due) < (b.start || b.due) ? -1 : 1; }).forEach(function (t) {
      var s = t.start || t.due, e = t.due || t.start;
      if (e < s) { var tmp = s; s = e; e = tmp; }
      var a = idx(s), b = idx(e), st = db.status(t.status);
      var vis = b >= 0 && a < days, wDays = Math.min(b, days - 1) - Math.max(a, 0) + 1;
      rowsL += '<div class="tl-name" data-task="' + t.id + '">' + SP.statusDot(t.status) + '<span class="r-title">' + esc(t.title) + "</span>" + SP.avatars(t.assignees, "xs", 2) + "</div>";
      rowsR += '<div class="tl-row">' + (vis ? '<div class="tl-bar' + (st.closed ? " closed" : "") + (wDays < 3 ? " short" : "") + '" data-bar="' + t.id + '" style="--c:' + st.color + ";left:" + (Math.max(a, 0) * DAY_W + 3) + "px;width:" + ((Math.min(b, days - 1) - Math.max(a, 0) + 1) * DAY_W - 6) + 'px" title="' + esc(t.title) + '"><span>' + esc(t.title) + '</span><i class="tl-h" data-resize></i></div>'
        : '<span class="tl-off">' + (b < 0 ? "← wcześniej" : "później →") + "</span>") + "</div>";
    });
    body.innerHTML = '<div class="tl"><div class="tl-bar-top"><button class="tbtn" data-tl="today">Dziś</button><button class="ibtn" data-tl="-14" title="2 tygodnie wstecz">' + ico("chevron-left", 16) + '</button><button class="ibtn" data-tl="14" title="2 tygodnie dalej">' + ico("chevron-right", 16) + "</button>" +
      '<span class="muted">' + new Date(start + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) + " – " + new Date(end + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }) +
      '</span><span class="grow"></span><span class="muted tl-hint">Przeciągnij pasek, żeby przesunąć termin · złap prawą krawędź, żeby zmienić długość</span></div>' +
      '<div class="tl-body"><div class="tl-left"><div class="tl-left-h">Zadanie</div>' + (rowsL || '<div class="empty-s">Brak zadań z datami.</div>') + "</div>" +
      '<div class="tl-right"><div class="tl-head" style="width:' + days * DAY_W + 'px">' + head + '</div><div class="tl-rows" style="width:' + days * DAY_W + 'px">' + grid + rowsR + "</div></div></div>" +
      (undated.length ? '<div class="tl-undated"><b>Bez dat (' + undated.length + ")</b>" + undated.map(function (t) { return '<button class="tl-chip" data-task="' + t.id + '">' + SP.statusDot(t.status) + esc(t.title) + "</button>"; }).join("") + "</div>" : "") + "</div>";
    var right = body.querySelector(".tl-right");
    if (today >= start && today <= end) right.scrollLeft = Math.max(0, idx(today) * DAY_W - 200);
    body.querySelectorAll("[data-tl]").forEach(function (b) {
      b.onclick = function () { var v = b.dataset.tl; f.tl = v === "today" ? null : SP.date.add(start, Number(v)); renderTimeline(body, loc, tasks, f); SP.hydrateIcons(body); };
    });
    // Przeciąganie pasków (przesunięcie albo zmiana długości), z przyciąganiem do dni.
    body.querySelectorAll("[data-bar]").forEach(function (bar) {
      bar.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var t = db.task(bar.dataset.bar), resize = !!e.target.closest("[data-resize]");
        var x0 = e.clientX, left0 = bar.offsetLeft, w0 = bar.offsetWidth, moved = 0;
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* np. zdarzenie syntetyczne */ } bar.classList.add("drag");
        function mv(ev) {
          moved = Math.round((ev.clientX - x0) / DAY_W);
          if (resize) bar.style.width = Math.max(DAY_W - 6, w0 + moved * DAY_W) + "px";
          else bar.style.left = (left0 + moved * DAY_W) + "px";
        }
        function up() {
          bar.removeEventListener("pointermove", mv); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up);
          bar.classList.remove("drag");
          if (!moved) { SP.openTask(t.id); return; }
          var s = t.start || t.due, en = t.due || t.start;
          if (resize) { var nd = SP.date.add(en, moved); if (nd < s) nd = s; db.updateTask(t.id, { start: s, due: nd }, "zmienił(a) termin na osi czasu"); }
          else db.updateTask(t.id, { start: t.start ? SP.date.add(t.start, moved) : null, due: t.due ? SP.date.add(t.due, moved) : null }, "przesunął/przesunęła zadanie na osi czasu");
        }
        bar.addEventListener("pointermove", mv); bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
      });
    });
    if (!body._bound) { bindTaskClicks(body); body._bound = true; }
  }

  /* ---- Tablica (kanban) ---- */
  function renderBoard(body, loc, tasks) {
    var listId = loc.type === "list" ? loc.id : firstListOf(loc);
    body.innerHTML = '<div class="board">' + db.STATUSES.map(function (s) {
      var items = tasks.filter(function (t) { return t.status === s.id; });
      return '<section class="col" data-status="' + s.id + '" style="--c:' + s.color + '"><div class="col-h"><span class="st-pill" style="--c:' + s.color + '">' + esc(s.name) + '</span><span class="grp-n">' + items.length + "</span></div>" +
        '<div class="col-b">' + items.map(cardHTML).join("") + "</div>" +
        (listId ? '<form class="col-add" data-add="' + esc(JSON.stringify({ listId: listId, status: s.id })) + '"><span class="add-plus">' + ico("plus", 14) + '</span><input placeholder="Nowe zadanie" /></form>' : "") + "</section>";
    }).join("") + "</div>";
    var dragId = null;
    body.querySelectorAll(".card-t").forEach(function (c) {
      c.addEventListener("dragstart", function (e) { dragId = c.dataset.task; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); });
      c.addEventListener("dragend", function () { c.classList.remove("dragging"); body.querySelectorAll(".col").forEach(function (x) { x.classList.remove("over"); }); });
    });
    body.querySelectorAll(".col").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); if (!col.classList.contains("over")) { body.querySelectorAll(".col.over").forEach(function (x) { x.classList.remove("over"); }); col.classList.add("over"); } });
      col.addEventListener("dragleave", function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove("over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault(); col.classList.remove("over");
        var id = dragId || e.dataTransfer.getData("text/plain"), t = db.task(id);
        if (t && t.status !== col.dataset.status) SP.flipDrop = { id: id, x: e.clientX, y: e.clientY, t: Date.now() };
        if (t && t.status !== col.dataset.status) db.updateTask(id, { status: col.dataset.status }, "zmienił(a) status na " + db.status(col.dataset.status).name);
      });
      var form = col.querySelector(".col-add");
      if (form) form.addEventListener("submit", function (e) {
        e.preventDefault(); var inp = form.querySelector("input"), v = inp.value.trim(); if (!v) return;
        db.createTask(SP.smartFields ? SP.smartFields(inp, { listId: listId, status: col.dataset.status, assignees: [] }) : { listId: listId, title: v, status: col.dataset.status });
        var st = col.dataset.status;
        setTimeout(function () { var again = document.querySelector('.col[data-status="' + st + '"] .col-add input'); if (again) again.focus(); }, 0);
      });
    });
    if (!body._bound) { bindTaskClicks(body); body._bound = true; }
  }
  function cardHTML(t) {
    var closed = db.status(t.status).closed, d = SP.fmtDue(t.due, closed), subs = db.subtasks(t.id);
    return '<article class="card-t' + (closed ? " closed" : "") + '" draggable="true" data-task="' + t.id + '">' +
      '<div class="ct-path">' + esc(db.pathOf(t).list.name) + "</div>" +
      '<div class="ct-title">' + esc(t.title) + "</div>" +
      (t.tags.length ? '<div class="ct-tags">' + t.tags.map(SP.tagChip).join("") + "</div>" : "") +
      '<div class="ct-foot"><button class="cell-btn" data-q="assignees">' + SP.avatars(t.assignees, "xs") + "</button>" +
      (t.due ? '<button class="cell-btn" data-q="due"><span class="due ' + d.cls + '">' + ico("calendar", 13) + d.label + "</span></button>" : "") +
      (t.priority ? '<button class="cell-btn" data-q="priority">' + SP.flag(t.priority) + "</button>" : "") +
      '<span class="grow"></span>' + (t.points != null ? '<span class="pts" title="Punkty">' + t.points + "</span>" : "") +
      (subs.length ? '<span class="r-chip">' + ico("git-branch", 13) + subs.length + "</span>" : "") +
      (t.comments.length ? '<span class="r-chip">' + ico("message-square", 13) + t.comments.length + "</span>" : "") +
      "</div></article>";
  }

  /* ---- Kalendarz ---- */
  function renderCalendar(body, loc, tasks, f) {
    var base = f.month ? new Date(f.month + "T00:00:00") : new Date();
    base.setDate(1); base.setHours(0, 0, 0, 0);
    var y = base.getFullYear(), m = base.getMonth();
    var start = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7));
    var today = SP.date.today();
    var noDate = tasks.filter(function (t) { return !t.due; }).length;
    var h = '<div class="cal"><div class="cal-bar"><button class="tbtn" data-cal="today">Dziś</button><button class="ibtn" data-cal="-1" title="Poprzedni miesiąc">' + ico("chevron-left", 16) + '</button><button class="ibtn" data-cal="1" title="Następny miesiąc">' + ico("chevron-right", 16) + "</button>" +
      "<h2>" + cap(base.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })) + "</h2>" + (noDate ? '<span class="muted">' + noDate + " bez terminu</span>" : "") + "</div>" +
      '<div class="cal-grid">' + ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"].map(function (d) { return '<div class="cal-dow">' + d + "</div>"; }).join("");
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var s = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var items = tasks.filter(function (t) { return t.due === s; });
      h += '<div class="cal-day' + (d.getMonth() !== m ? " out" : "") + (s === today ? " today" : "") + '" data-day="' + s + '"><div class="cal-n">' + d.getDate() + "</div>" +
        items.slice(0, 4).map(function (t) { return '<div class="cal-t' + (db.status(t.status).closed ? " closed" : "") + '" draggable="true" data-task="' + t.id + '" style="--c:' + db.status(t.status).color + '">' + esc(t.title) + "</div>"; }).join("") +
        (items.length > 4 ? '<div class="cal-more">+' + (items.length - 4) + " więcej</div>" : "") + "</div>";
    }
    body.innerHTML = h + "</div></div>";
    body.querySelectorAll("[data-cal]").forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.cal;
        if (v === "today") f.month = null; else { var nd = new Date(y, m + Number(v), 1); f.month = nd.getFullYear() + "-" + String(nd.getMonth() + 1).padStart(2, "0") + "-01"; }
        renderCalendar(body, loc, applyFilters(db.tasksIn(loc), f), f);
      };
    });
    var dragId = null;
    body.querySelectorAll(".cal-t").forEach(function (c) {
      c.addEventListener("dragstart", function (e) { dragId = c.dataset.task; e.dataTransfer.setData("text/plain", dragId); });
    });
    body.querySelectorAll(".cal-day").forEach(function (day) {
      day.addEventListener("dragover", function (e) { e.preventDefault(); day.classList.add("over"); });
      day.addEventListener("dragleave", function () { day.classList.remove("over"); });
      day.addEventListener("drop", function (e) {
        e.preventDefault(); day.classList.remove("over");
        var id = dragId || e.dataTransfer.getData("text/plain");
        if (id) { SP.flipDrop = { id: id, x: e.clientX, y: e.clientY, t: Date.now() }; db.updateTask(id, { due: day.dataset.day }, "przesunął/przesunęła termin"); }
      });
      day.addEventListener("dblclick", function (e) {
        if (e.target.closest(".cal-t")) return;
        SP.quickTask({ listId: loc.type === "list" ? loc.id : firstListOf(loc), due: day.dataset.day });
      });
    });
    if (!body._bound) { bindTaskClicks(body); body._bound = true; }
  }

  /* =================== Chmura =================== */
  views.cloud = {
    title: function () { return "Chmura"; },
    crumbs: function () { return [{ icon: "cloud", label: "Chmura" }]; },
    render: function (el) {
      var all = db.raw.files, used = db.storageUsed(), quota = db.QUOTA;
      var q = (views.cloud.q || "").toLowerCase(), kf = views.cloud.kind || "all";
      var byKind = {};
      all.forEach(function (f) { var k = SP.fileKind(f); byKind[k] = (byKind[k] || 0) + f.size; });
      var kinds = Object.keys(SP.fileKinds).filter(function (k) { return byKind[k]; });
      var list = all.filter(function (f) { return (kf === "all" || SP.fileKind(f) === kf) && (!q || f.name.toLowerCase().indexOf(q) >= 0); });
      var pct = Math.min(100, used / quota * 100);
      el.innerHTML = '<div class="page cloud"><div class="page-h"><h1>Chmura</h1><button class="btn primary sm" data-up>' + ico("upload", 15) + "Wgraj pliki</button></div>" +
        '<section class="card usage' + (pct > 90 ? " full" : "") + '"><div class="usage-top"><div><div class="usage-num"><b>' + SP.fmtSize(used) + '</b> z ' + SP.fmtSize(quota) + "</div>" +
        '<div class="muted">Plan Free · zostało ' + SP.fmtSize(Math.max(0, quota - used)) + " · " + all.length + " " + (all.length === 1 ? "plik" : all.length % 10 >= 2 && all.length % 10 <= 4 && (all.length % 100 < 12 || all.length % 100 > 14) ? "pliki" : "plików") + '</div></div>' +
        '<a class="btn sm" href="index.html#cennik">Więcej miejsca</a></div>' +
        '<div class="ubar" role="img" aria-label="Zajęte ' + Math.round(pct) + '%">' + kinds.map(function (k) {
          return '<i style="width:' + (byKind[k] / quota * 100) + "%;background:" + SP.fileKinds[k].color + '" title="' + SP.fileKinds[k].label + ": " + SP.fmtSize(byKind[k]) + '"></i>';
        }).join("") + "</div>" +
        (kinds.length ? '<div class="ulegend">' + kinds.map(function (k) { return '<span><i style="background:' + SP.fileKinds[k].color + '"></i>' + SP.fileKinds[k].label + ' <b>' + SP.fmtSize(byKind[k]) + "</b></span>"; }).join("") + "</div>" : "") +
        "</section>" +
        '<div class="dropzone" data-drop><span class="dz-ico">' + ico("file-dropzone", 26) + '</span><div><b>Przeciągnij pliki tutaj</b> albo <button class="link" data-up>wybierz z dysku</button><div class="muted">Do ' + SP.fmtSize(db.MAX_FILE) + " na plik · obrazy, dokumenty, arkusze, wideo, archiwa</div></div></div>" +
        (all.length ? '<div class="cloud-bar"><label class="tsearch">' + ico("search", 15) + '<input placeholder="Szukaj plików…" value="' + esc(views.cloud.q || "") + '" /></label><div class="kchips">' +
          [["all", "Wszystkie"]].concat(kinds.map(function (k) { return [k, SP.fileKinds[k].label]; })).map(function (k) {
            return '<button class="kchip" data-kind="' + k[0] + '" aria-pressed="' + (kf === k[0]) + '">' + k[1] + "</button>";
          }).join("") + "</div></div>" : "") +
        (all.length ? '<div class="ftable"><div class="ft-h"><span>Nazwa</span><span>Zadanie</span><span>Rozmiar</span><span>Dodano</span><span></span></div>' +
          (list.map(function (f) {
            var t = f.taskId && db.task(f.taskId);
            return '<div class="ft-row" data-file="' + f.id + '"><button class="ft-n" data-open>' + SP.fileTile(f) + '<span>' + esc(f.name) + '</span><small class="ext">' + SP.fileExt(f) + "</small></button>" +
              "<span>" + (t ? '<button class="ft-task" data-task="' + t.id + '">' + SP.statusDot(t.status) + "<span>" + esc(t.title) + "</span></button>" : '<span class="muted">—</span>') + "</span>" +
              '<span class="muted">' + SP.fmtSize(f.size) + '</span><span class="muted">' + SP.ago(f.uploadedAt) + "</span>" +
              '<span class="ft-acts">' + (SP.canExtract && SP.canExtract(f) ? '<button class="ibtn ft-x" data-extract title="Wyciągnij zadania z pliku">' + ico("sparkles", 16) + "</button>" : "") + '<button class="ibtn" data-dl title="Pobierz">' + ico("download", 16) + '</button><button class="ibtn" data-del title="Usuń">' + ico("trash", 16) + "</button></span></div>";
          }).join("") || '<div class="empty-s">Brak plików pasujących do filtra.</div>') + "</div>"
          : '<div class="empty-b">' + ico("cloud", 40) + "<h3>Twoja chmura jest pusta</h3><p class='muted'>Wgraj pliki albo dodaj załącznik w zadaniu.</p></div>") +
        '<p class="cloud-note muted">' + ico("lock", 13) + "Do czasu podłączenia serwera pliki są przechowywane na tym urządzeniu, w tej przeglądarce.</p></div>";

      el.querySelectorAll("[data-up]").forEach(function (b) { b.onclick = function () { SP.pickFiles(); }; });
      var inp = el.querySelector(".cloud-bar input");
      if (inp) inp.addEventListener("input", function () { views.cloud.q = inp.value; var pos = inp.selectionStart; SP.rerender(); var again = document.querySelector(".cloud-bar input"); if (again) { again.focus(); again.setSelectionRange(pos, pos); } });
      el.querySelectorAll("[data-kind]").forEach(function (b) { b.onclick = function () { views.cloud.kind = b.dataset.kind; SP.rerender(); }; });
      el.addEventListener("click", function (e) {
        var row = e.target.closest("[data-file]"); if (!row) return;
        var id = row.dataset.file, tb = e.target.closest("[data-task]");
        if (tb) { SP.openTask(tb.dataset.task); return; }
        if (e.target.closest("[data-extract]")) SP.extractFromCloud(id);
        else if (e.target.closest("[data-dl]")) SP.downloadFile(id);
        else if (e.target.closest("[data-del]")) SP.deleteFile(id);
        else if (e.target.closest("[data-open]")) SP.previewFile(id);
      });
      var dz = el.querySelector("[data-drop]");
      el.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) { e.preventDefault(); dz.classList.add("over"); } });
      el.addEventListener("dragleave", function (e) { if (!el.contains(e.relatedTarget)) dz.classList.remove("over"); });
      el.addEventListener("drop", function (e) { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); dz.classList.remove("over"); SP.uploadFiles(e.dataTransfer.files); });
    },
  };

  /* =================== Dokumenty =================== */
  views.docs = {
    title: function () { return "Dokumenty"; },
    crumbs: function () { return [{ icon: "file-text", label: "Dokumenty" }]; },
    render: function (el) {
      var docs = db.raw.docs.slice().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
      el.innerHTML = '<div class="page"><div class="page-h"><h1>Dokumenty</h1><button class="btn primary sm" data-new-doc>' + ico("plus", 15) + "Nowy dokument</button></div>" +
        '<div class="doc-table"><div class="dt-h"><span>Nazwa</span><span>Przestrzeń</span><span>Autor</span><span>Zmieniono</span></div>' +
        (docs.map(function (d) {
          var s = db.space(d.spaceId) || { name: "—", color: "#ccc" };
          return '<a class="dt-row" href="#/doc/' + d.id + '"><span class="dt-n">' + ico("file-text", 16) + esc(d.title) + "</span><span>" + SP.spaceIcon(s, "xs") + esc(s.name) + "</span><span>" + SP.avatar(d.by, "xs") + esc((db.person(d.by) || {}).name || "") + '</span><span class="muted">' + SP.ago(d.updatedAt) + "</span></a>";
        }).join("") || '<div class="empty-b">' + ico("file-text", 40) + "<h3>Brak dokumentów</h3></div>") + "</div></div>";
      el.querySelector("[data-new-doc]").onclick = function () { SP.newDoc(); };
    },
  };
  views.doc = {
    title: function (p) { var d = db.doc(p.id); return d ? d.title : "Dokument"; },
    crumbs: function (p) { var d = db.doc(p.id); return [{ icon: "file-text", label: "Dokumenty", href: "#/docs" }, { label: d ? d.title : "?" }]; },
    render: function (el, p) {
      var d = db.doc(p.id);
      if (!d) { el.innerHTML = '<div class="page"><div class="empty-b"><h3>Dokument nie istnieje</h3><a class="btn" href="#/docs">Wszystkie dokumenty</a></div></div>'; return; }
      db.addRecent("doc", d.id);
      el.innerHTML = '<div class="doc-page"><div class="doc-bar">' +
        [["formatBlock:h1", "H1"], ["formatBlock:h2", "H2"], ["formatBlock:p", "Tekst"], ["bold", "<b>B</b>"], ["italic", "<i>I</i>"], ["insertUnorderedList", "• Lista"], ["insertOrderedList", "1. Lista"]]
          .map(function (b) { return '<button class="tbtn" data-cmd="' + b[0] + '">' + b[1] + "</button>"; }).join("") +
        '<span class="grow"></span><span class="muted doc-saved">Zapisano</span><button class="ibtn" data-del-doc title="Usuń dokument">' + ico("trash", 16) + "</button></div>" +
        '<div class="doc-paper"><h1 class="doc-title" contenteditable="true" spellcheck="false"></h1><div class="doc-meta muted">' + SP.avatar(d.by, "xs") + esc((db.person(d.by) || {}).name) + " · zmieniono " + SP.ago(d.updatedAt) + "</div>" +
        '<div class="doc-body" contenteditable="true" data-ph="Zacznij pisać…"></div></div></div>';
      var title = el.querySelector(".doc-title"), body = el.querySelector(".doc-body"), saved = el.querySelector(".doc-saved");
      title.textContent = d.title; body.innerHTML = d.body;
      var t;
      function save() {
        saved.textContent = "Zapisywanie…";
        clearTimeout(t);
        t = setTimeout(function () {
          db.updateDoc(d.id, { title: title.innerText.trim() || "Bez tytułu", body: body.innerHTML });
          saved.textContent = "Zapisano";
          SP.refreshChrome();
        }, 400);
      }
      title.addEventListener("input", save); body.addEventListener("input", save);
      title.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); body.focus(); } });
      el.querySelectorAll("[data-cmd]").forEach(function (b) {
        b.addEventListener("mousedown", function (e) { e.preventDefault(); });
        b.onclick = function () { var c = b.dataset.cmd.split(":"); body.focus(); document.execCommand(c[0], false, c[1] || null); save(); };
      });
      el.querySelector("[data-del-doc]").onclick = function () {
        SP.confirm("Usunąć dokument?", "„" + d.title + "” zostanie usunięty.").then(function (ok) { if (ok) { db.deleteDoc(d.id); location.hash = "#/docs"; } });
      };
      if (!d.body) body.focus();
    },
  };
})();
