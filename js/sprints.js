/* Sprynt – Sprinty (punkty, backlog, wykres spalania, prędkość zespołu) i Arkusz czasu (tydzień godzin pracy). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico, views = SP.views, D = SP.date;
  var POINTS = [1, 2, 3, 5, 8, 13, 21];
  var isDay = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); };
  var closed = function (t) { return db.status(t.status).closed; };

  /* =================== Wspólne =================== */
  function shortDate(s) { return new Date(s + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" }); }
  function range(a, b) { return a && b ? shortDate(a) + " – " + shortDate(b) : a ? "od " + shortDate(a) : "bez dat"; }
  function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5); }
  function pl(n, one, few, many) { var a = Math.abs(n) % 100, b = a % 10; return n + " " + (n === 1 ? one : b >= 2 && b <= 4 && (a < 12 || a > 14) ? few : many); }
  var STATE = { planned: ["Zaplanowany", "#87909e"], active: ["Trwa", "#5b6cf9"], done: ["Zakończony", "#1aae6f"] };
  function statePill(sp) { var s = STATE[sp.state] || STATE.planned; return '<span class="st-pill" style="--c:' + s[1] + '">' + s[0] + "</span>"; }
  function pointsChip(t) { return t.points != null ? '<span class="pts" title="Punkty">' + t.points + "</span>" : ""; }
  function bar(p) { return '<span class="spr-bar"><i style="width:' + Math.round(Math.min(1, p) * 100) + '%"></i></span>'; }
  function openSprintsIn(spaceId) { return db.raw.sprints.filter(function (x) { return x.spaceId === spaceId && x.state !== "done"; }); }
  function spaceOfTask(t) { return (db.list(t.listId) || {}).spaceId; }

  /** Wybór punktów (skala Fibonacciego). */
  SP.pickPoints = function (anchor, cur, cb) {
    SP.menu(anchor, [{ header: "Punkty (szacunek pracy)" }].concat(POINTS.map(function (n) {
      return { html: '<span class="pts">' + n + "</span><span>" + pl(n, "punkt", "punkty", "punktów") + "</span>", active: cur === n, run: function () { cb(n); } };
    }), ["-", { label: "Inna liczba…", icon: "hash", run: function () {
      SP.form({ title: "Punkty", fields: [{ name: "p", label: "Liczba punktów", value: cur != null ? String(cur) : "" }] }).then(function (v) {
        if (!v) return; var n = parseFloat(String(v.p).replace(",", ".")); if (isNaN(n) || n < 0) { SP.toast("Wpisz liczbę"); return; } cb(n);
      });
    } }, { label: "Wyczyść", icon: "x", run: function () { cb(null); } }]));
  };
  /** Wybór sprintu dla zadań z jednej przestrzeni. */
  SP.pickSprint = function (anchor, spaceId, cur, cb) {
    var list = openSprintsIn(spaceId);
    SP.menu(anchor, [{ header: "Sprint" }].concat(list.map(function (x) {
      return { html: ico("gauge", 15) + "<span>" + esc(x.name) + ' <small class="muted">' + (x.state === "active" ? "trwa" : range(x.start, x.end)) + "</small></span>", active: cur === x.id, run: function () { cb(x.id); } };
    }), list.length ? ["-"] : [], [
      { label: "Backlog (bez sprintu)", icon: "inbox", active: !cur, run: function () { cb(null); } },
      { label: "Nowy sprint…", icon: "plus", run: function () { sprintForm(null, spaceId).then(function (sp) { if (sp) cb(sp.id); }); } },
    ]));
  };

  function sprintForm(sp, spaceId) {
    var sid = sp ? sp.spaceId : spaceId || (db.raw.spaces[0] || {}).id;
    if (!sid) { SP.toast("Najpierw utwórz przestrzeń"); return Promise.resolve(null); }
    var last = db.raw.sprints.filter(function (x) { return x.spaceId === sid && x.end; }).sort(function (a, b) { return a.end < b.end ? 1 : -1; })[0];
    var start = sp ? sp.start : last && last.end >= D.today() ? D.add(last.end, 1) : D.today();
    var fields = [
      { name: "name", label: "Nazwa", value: sp ? sp.name : db.nextSprintName(sid), required: true },
      { name: "start", label: "Początek (RRRR-MM-DD)", value: start, required: true },
      { name: "end", label: "Koniec (RRRR-MM-DD)", value: sp ? sp.end : D.add(start, 13), required: true },
      { name: "goal", label: "Cel sprintu (opcjonalnie)", value: sp ? sp.goal : "", placeholder: "np. Nowy formularz zamówień gotowy do testów" },
    ];
    if (!sp && db.raw.spaces.length > 1) fields.push({ name: "space", label: "Przestrzeń", type: "select", options: db.raw.spaces.map(function (s) { return [s.id, s.name]; }), value: sid });
    return SP.form({ title: sp ? "Edytuj sprint" : "Nowy sprint", submit: sp ? "Zapisz" : "Utwórz sprint", fields: fields }).then(function (v) {
      if (!v || !v.name) return null;
      if (!isDay(v.start) || !isDay(v.end)) { SP.toast("Daty wpisz jako RRRR-MM-DD"); return null; }
      if (v.end < v.start) { SP.toast("Koniec nie może być przed początkiem"); return null; }
      var patch = { name: v.name, start: v.start, end: v.end, goal: v.goal || "" };
      if (sp) return db.updateSprint(sp.id, patch);
      var n = db.createSprint(Object.assign(patch, { spaceId: v.space || sid }));
      SP.toast("Utworzono " + n.name + " – dodaj zadania z backlogu"); return n;
    });
  }
  SP.newSprint = function (spaceId) { return sprintForm(null, spaceId).then(function (sp) { if (sp) location.hash = "#/sprint/" + sp.id; return sp; }); };

  /* ---- Okno zadania: pola „Punkty” i „Sprint” ---- */
  var baseProps = SP.taskProps, baseBind = SP.bindTaskExtras;
  SP.taskProps = function (t) {
    var sp = t.sprintId ? db.sprint(t.sprintId) : null;
    return (baseProps ? baseProps(t) : "") +
      '<div class="prop"><span class="prop-l">' + ico("hash", 15) + 'Punkty</span><button class="prop-v" data-x="points">' + (t.points != null ? '<span class="pts">' + t.points + "</span>" + pl(t.points, "punkt", "punkty", "punktów") : '<span class="muted">Puste</span>') + "</button></div>" +
      '<div class="prop"><span class="prop-l">' + ico("gauge", 15) + 'Sprint</span><button class="prop-v" data-x="sprint">' + (sp ? "<span>" + esc(sp.name) + "</span>" + statePill(sp) : '<span class="muted">Backlog</span>') + "</button></div>";
  };
  SP.bindTaskExtras = function (main, taskId) {
    if (baseBind) baseBind(main, taskId);
    var p = main.querySelector('[data-x="points"]'), s = main.querySelector('[data-x="sprint"]');
    if (p) p.onclick = function () { var t = db.task(taskId); SP.pickPoints(p, t.points, function (v) { db.setPoints(taskId, v); }); };
    if (s) s.onclick = function () { var t = db.task(taskId); SP.pickSprint(s, spaceOfTask(t), t.sprintId, function (v) { db.setSprint([taskId], v); }); };
  };

  /* =================== Lista sprintów: #/sprints =================== */
  function sprintRow(sp) {
    var st = sp.state === "done" && sp.result ? sp.result : db.sprintStats(sp.id), useP = st.points > 0;
    var p = useP ? st.pointsDone / st.points : st.tasks ? st.done / st.tasks : 0;
    var left = sp.end ? daysBetween(D.today(), sp.end) : null;
    var note = sp.state === "done" ? "zakończony " + SP.ago(sp.closedAt) + (st.carried ? " · " + pl(st.carried, "zadanie przeszło", "zadania przeszły", "zadań przeszło") + " dalej" : "")
      : sp.state === "active" ? (left == null ? "" : left < 0 ? "po terminie o " + pl(-left, "dzień", "dni", "dni") : left === 0 ? "kończy się dziś" : "zostało " + pl(left, "dzień", "dni", "dni"))
      : sp.start && sp.start > D.today() ? "startuje " + SP.fmtDue(sp.start).label.toLowerCase() : "gotowy do startu";
    return '<a class="spr-row' + (sp.state === "active" ? " active" : "") + '" href="#/sprint/' + sp.id + '">' +
      '<span class="spr-ico">' + ico("gauge", 18) + '</span><span class="spr-main"><b>' + esc(sp.name) + "</b>" + statePill(sp) +
      '<small class="muted">' + esc((db.space(sp.spaceId) || {}).name || "") + " · " + range(sp.start, sp.end) + (note ? " · " + note : "") + "</small>" +
      (sp.goal ? '<small class="spr-goal">' + ico("target", 13) + esc(sp.goal) + "</small>" : "") + "</span>" +
      '<span class="spr-prog">' + bar(p) + "<small>" + (useP ? st.pointsDone + " / " + st.points + " pkt" : st.done + " / " + st.tasks + " zadań") + "</small></span></a>";
  }
  views.sprints = {
    title: function () { return "Sprinty"; },
    crumbs: function () { return [{ icon: "gauge", label: "Sprinty" }]; },
    render: function (el) {
      var scope = views.sprints.scope || "all";
      if (scope !== "all" && !db.space(scope)) scope = "all";
      var inScope = function (sp) { return scope === "all" || sp.spaceId === scope; };
      var all = db.raw.sprints.filter(inScope);
      var active = all.filter(function (x) { return x.state === "active"; });
      var planned = all.filter(function (x) { return x.state === "planned"; }).sort(function (a, b) { return (a.start || "") < (b.start || "") ? -1 : 1; });
      var done = all.filter(function (x) { return x.state === "done"; }).sort(function (a, b) { return (a.closedAt || "") < (b.closedAt || "") ? 1 : -1; });
      var spaceIds = scope === "all" ? db.raw.spaces.map(function (s) { return s.id; }) : [scope];
      var backlog = db.raw.tasks.filter(function (t) {
        if (t.parentId || closed(t) || spaceIds.indexOf(spaceOfTask(t)) < 0) return false;
        var sp = t.sprintId && db.sprint(t.sprintId); return !sp || sp.state === "done";
      });
      var opts = '<option value="all">Wszystkie przestrzenie</option>' + db.raw.spaces.map(function (s) { return '<option value="' + s.id + '"' + (s.id === scope ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("");
      var velocity = done.slice(0, 8).reverse();
      var avg = velocity.length ? Math.round(velocity.reduce(function (s, x) { return s + ((x.result || {}).pointsDone || 0); }, 0) / velocity.length * 10) / 10 : 0;
      var chart = velocity.length && SP.charts ? SP.charts.colChart(velocity.map(function (x) {
        var r = x.result || {}; return { label: x.name.replace(/^Sprint\s*/i, "#"), value: r.pointsDone || 0, tip: x.name + ": " + (r.pointsDone || 0) + " pkt, " + (r.done || 0) + "/" + (r.tasks || 0) + " zadań" };
      }), { aria: "Prędkość: punkty ukończone w kolejnych sprintach" }) : "";

      el.innerHTML = '<div class="page sprints"><div class="page-h"><h1>Sprinty</h1><select class="input sm dash-scope" aria-label="Przestrzeń">' + opts + "</select>" +
        '<button class="btn primary sm" data-new-sprint>' + ico("plus", 15) + "Nowy sprint</button></div>" +
        (!all.length ? '<div class="empty-b">' + ico("gauge", 44) + "<h3>Pracuj w sprintach</h3><p class='muted'>Sprint to krótki okres (zwykle 1–2 tygodnie) z wybranym zestawem zadań. Oceniasz zadania w punktach, a Sprynt rysuje wykres spalania i liczy prędkość zespołu.</p>" +
          '<button class="btn primary" data-new-sprint>' + ico("plus", 16) + "Utwórz pierwszy sprint</button></div>" :
          '<div class="spr-grid"><div class="spr-col">' +
          (active.length ? '<section class="card"><div class="card-h"><h2>Trwające</h2></div><div class="card-b">' + active.map(sprintRow).join("") + "</div></section>" : "") +
          '<section class="card"><div class="card-h"><h2>Zaplanowane</h2><span class="muted">' + planned.length + '</span></div><div class="card-b">' + (planned.map(sprintRow).join("") || '<div class="empty-s">Brak zaplanowanych sprintów.</div>') + "</div></section>" +
          (done.length ? '<section class="card"><div class="card-h"><h2>Zakończone</h2><span class="muted">' + done.length + '</span></div><div class="card-b">' + done.map(sprintRow).join("") + "</div></section>" : "") +
          '</div><div class="spr-col">' +
          '<section class="card"><div class="card-h"><h2>Prędkość zespołu</h2><span class="muted">' + (velocity.length ? "średnio " + avg.toLocaleString("pl-PL") + " pkt" : "") + '</span></div><div class="card-b ch-b">' +
          (chart || '<div class="empty-s">Zakończ pierwszy sprint, a zobaczysz tu, ile punktów zespół robi w jednym sprincie.</div>') + "</div></section>" +
          '<section class="card"><div class="card-h"><h2>Backlog</h2><span class="muted">' + pl(backlog.length, "otwarte", "otwarte", "otwartych") + " bez sprintu</span></div><div class=\"card-b\">" +
          (backlog.slice(0, 40).map(function (t) {
            return '<div class="crow" data-task="' + t.id + '">' + SP.statusDot(t.status) + '<span class="r-title">' + esc(t.title) + '</span><span class="r-path">' + esc(db.pathOf(t).list.name) + "</span>" + pointsChip(t) +
              '<button class="chip-btn sm" data-to-sprint="' + t.id + '">' + ico("gauge", 13) + "Do sprintu</button></div>";
          }).join("") || '<div class="empty-s">Backlog jest pusty – wszystkie otwarte zadania są w sprintach.</div>') + (backlog.length > 40 ? '<div class="empty-s">… i ' + (backlog.length - 40) + " więcej</div>" : "") + "</div></section>" +
          "</div></div>") + "</div>";
      el.querySelector(".dash-scope").onchange = function (e) { views.sprints.scope = e.target.value; SP.rerender(); };
      el.addEventListener("click", function (e) {
        var b;
        if (e.target.closest("[data-new-sprint]")) { SP.newSprint(scope === "all" ? null : scope); return; }
        if ((b = e.target.closest("[data-to-sprint]"))) { e.stopPropagation(); var t = db.task(b.dataset.toSprint); SP.pickSprint(b, spaceOfTask(t), null, function (v) { db.setSprint([t.id], v); }); return; }
        var r = e.target.closest("[data-task]"); if (r) SP.openTask(r.dataset.task);
      });
      if (SP.charts) SP.charts.bindTips(el);
    },
  };

  /* =================== Jeden sprint: #/sprint/<id> =================== */
  /** Wykres spalania: idealna linia od sumy do zera i rzeczywista – pozostało na koniec każdego dnia. */
  function burndown(sp, tasks) {
    if (!isDay(sp.start) || !isDay(sp.end)) return '<div class="empty-s">Ustaw daty sprintu, żeby zobaczyć wykres.</div>';
    var usePts = tasks.some(function (t) { return Number(t.points) > 0; });
    var val = function (t) { return usePts ? Number(t.points) || 0 : 1; };
    var total = tasks.reduce(function (s, t) { return s + val(t); }, 0);
    var n = Math.max(1, daysBetween(sp.start, sp.end)), today = D.today(), days = [];
    for (var i = 0; i <= n; i++) days.push(D.add(sp.start, i));
    var doneDay = function (t) { return closed(t) ? D.ymd(new Date(t.doneAt || t.updatedAt)) : null; };
    var remaining = days.map(function (d) {
      if (d > today) return null;
      return total - tasks.reduce(function (s, t) { var dd = doneDay(t); return s + (dd && dd <= d ? val(t) : 0); }, 0);
    });
    var W = 1080, H = 260, pl0 = 36, pb = 26, pt = 10, pw = W - pl0 - 10, ph = H - pb - pt, max = Math.max(1, total);
    var x = function (i) { return pl0 + (n ? i / n : 0) * pw; }, y = function (v) { return pt + ph - v / max * ph; };
    var grid = "", step = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : max <= 60 ? 10 : Math.ceil(max / 50) * 10;
    for (var v = 0; v <= max; v += step) grid += '<line x1="' + pl0 + '" x2="' + (W - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="ch-grid"/><text x="' + (pl0 - 8) + '" y="' + (y(v) + 4) + '" class="ch-ax" text-anchor="end">' + v + "</text>";
    var every = Math.ceil(days.length / 15), labels = "", hits = "";
    days.forEach(function (d, i) {
      if (i % every === 0 || i === n) labels += '<text x="' + x(i) + '" y="' + (H - 8) + '" class="ch-ax" text-anchor="middle">' + d.slice(8) + "." + d.slice(5, 7) + "</text>";
      var ideal = Math.round((total - total * i / n) * 10) / 10, r = remaining[i], bw = pw / (n || 1);
      hits += '<g class="ch-col" data-tip="' + shortDate(d) + ": " + (r == null ? "jeszcze przed nami" : "zostało " + r + (usePts ? " pkt" : " zad.")) + " · plan " + ideal + '"><rect class="ch-hit" x="' + (x(i) - bw / 2) + '" y="' + pt + '" width="' + bw + '" height="' + ph + '"/>' +
        (r != null ? '<circle class="bd-dot" cx="' + x(i) + '" cy="' + y(r) + '" r="3.5"/>' : "") + "</g>";
    });
    var actual = remaining.map(function (r, i) { return r == null ? null : x(i) + "," + y(r); }).filter(Boolean).join(" ");
    var ti = days.indexOf(today), todayLine = ti >= 0 ? '<line class="bd-today" x1="' + x(ti) + '" x2="' + x(ti) + '" y1="' + pt + '" y2="' + (pt + ph) + '"/>' : "";
    return '<div class="ch-wrap"><svg class="ch" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Wykres spalania sprintu">' + grid + todayLine +
      '<line x1="' + pl0 + '" x2="' + (W - 10) + '" y1="' + (pt + ph) + '" y2="' + (pt + ph) + '" class="ch-base"/>' +
      '<line class="bd-ideal" x1="' + x(0) + '" y1="' + y(total) + '" x2="' + x(n) + '" y2="' + y(0) + '"/>' +
      (actual ? '<polyline class="bd-line" points="' + actual + '"/>' : "") + labels + hits + '</svg><div class="ch-tip" hidden></div></div>' +
      '<div class="bd-legend"><span><i class="bd-k ideal"></i>Plan</span><span><i class="bd-k"></i>Pozostało (' + (usePts ? "punkty" : "zadania – dodaj punkty, by liczyć dokładniej") + ")</span></div>";
  }
  function cardHTML(t) {
    var d = SP.fmtDue(t.due, closed(t));
    return '<article class="card-t' + (closed(t) ? " closed" : "") + '" draggable="true" data-task="' + t.id + '">' +
      '<div class="ct-path">' + SP.taskKeyHTML(t) + esc(db.pathOf(t).list.name) + "</div>" +
      '<div class="ct-title">' + esc(t.title) + "</div>" +
      '<div class="ct-foot"><button class="cell-btn" data-q="assignees">' + SP.avatars(t.assignees, "xs") + "</button>" +
      (t.due ? '<span class="due ' + d.cls + '">' + ico("calendar", 13) + d.label + "</span>" : "") + (t.priority ? SP.flag(t.priority) : "") +
      '<span class="grow"></span><button class="cell-btn" data-q="points" title="Punkty">' + (t.points != null ? '<span class="pts">' + t.points + "</span>" : '<span class="pts empty">?</span>') + "</button>" +
      '<button class="ibtn sm" data-q="unsprint" title="Wyjmij ze sprintu (do backlogu)">' + ico("x", 12) + "</button></div></article>";
  }
  SP.taskKeyHTML = SP.taskKeyHTML || function (t) { return '<span class="ct-key">' + db.taskKey(t) + "</span> · "; };

  function addTasksDialog(sp) {
    var cands = db.raw.tasks.filter(function (t) {
      if (t.parentId || closed(t) || spaceOfTask(t) !== sp.spaceId || t.sprintId === sp.id) return false;
      var o = t.sprintId && db.sprint(t.sprintId); return !o || o.state === "done";
    });
    var picked = new Set();
    var bg = SP.el('<div class="dlg-bg"><form class="dlg spr-add" role="dialog" aria-modal="true" aria-label="Dodaj zadania do sprintu"><h2>Dodaj zadania do „' + esc(sp.name) + '”</h2>' +
      '<input class="input sm" placeholder="Szukaj w backlogu…" /><div class="spr-add-list"></div>' +
      '<div class="dlg-acts"><span class="muted spr-add-sum"></span><button type="button" class="btn ghost" data-cancel>Anuluj</button><button type="submit" class="btn primary">Dodaj</button></div></form></div>');
    var list = bg.querySelector(".spr-add-list"), inp = bg.querySelector("input");
    function draw() {
      var q = inp.value.trim().toLowerCase();
      var items = cands.filter(function (t) { return !q || t.title.toLowerCase().indexOf(q) >= 0 || db.taskKey(t).toLowerCase().indexOf(q) >= 0; });
      list.innerHTML = items.map(function (t) {
        return '<label class="spr-add-i"><input type="checkbox" value="' + t.id + '"' + (picked.has(t.id) ? " checked" : "") + " />" + SP.statusDot(t.status) + "<span>" + esc(t.title) + '</span><small class="muted">' + db.taskKey(t) + " · " + esc(db.pathOf(t).list.name) + "</small>" + (t.priority ? SP.flag(t.priority) : "") + pointsChip(t) + "</label>";
      }).join("") || '<div class="empty-s">' + (cands.length ? "Nic nie pasuje." : "Backlog tej przestrzeni jest pusty. Utwórz zadanie prosto w sprincie.") + "</div>";
      SP.hydrateIcons(list); sum();
    }
    function sum() {
      var pts = 0; picked.forEach(function (id) { pts += Number((db.task(id) || {}).points) || 0; });
      bg.querySelector(".spr-add-sum").textContent = picked.size ? pl(picked.size, "zadanie", "zadania", "zadań") + " · " + pts + " pkt" : "";
      bg.querySelector("[type=submit]").textContent = picked.size ? "Dodaj " + picked.size : "Dodaj";
    }
    list.addEventListener("change", function (e) { var c = e.target; if (c.type === "checkbox") { c.checked ? picked.add(c.value) : picked.delete(c.value); sum(); } });
    inp.addEventListener("input", draw);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.querySelector("[data-cancel]").onclick = close;
    bg.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault(); if (!picked.size) { close(); return; }
      db.setSprint(Array.from(picked), sp.id); SP.toast("Dodano " + pl(picked.size, "zadanie", "zadania", "zadań") + " do " + sp.name); close();
    });
    document.body.appendChild(bg); draw(); inp.focus();
  }
  function completeSprint(sp) {
    var open = db.sprintTasks(sp.id).filter(function (t) { return !closed(t); });
    var finish = function (to) {
      db.completeSprint(sp.id, to);
      var r = db.sprint(sp.id).result;
      SP.toast(sp.name + " zakończony: " + r.done + "/" + r.tasks + " zadań" + (r.points ? ", " + r.pointsDone + " pkt" : ""));
      if (SP.celebrate) SP.celebrate(innerWidth / 2, innerHeight / 3);
    };
    if (!open.length) { finish(null); return; }
    var next = openSprintsIn(sp.spaceId).filter(function (x) { return x.id !== sp.id; });
    SP.form({ title: "Zakończ " + sp.name, submit: "Zakończ sprint", fields: [{ name: "to", label: pl(open.length, "nieukończone zadanie", "nieukończone zadania", "nieukończonych zadań") + " – przenieś do:", type: "select",
      options: next.map(function (x) { return [x.id, x.name + " (" + range(x.start, x.end) + ")"]; }).concat([["__new", "Nowy sprint (utworzę go)"], ["", "Backlog"]]), value: next.length ? next[0].id : "__new" }] }).then(function (v) {
      if (!v) return;
      if (v.to === "__new") {
        var start = sp.end && sp.end >= D.today() ? D.add(sp.end, 1) : D.today();
        var len = isDay(sp.start) && isDay(sp.end) ? daysBetween(sp.start, sp.end) : 13;
        var n = db.createSprint({ spaceId: sp.spaceId, name: db.nextSprintName(sp.spaceId), start: start, end: D.add(start, len) });
        finish(n.id); location.hash = "#/sprint/" + n.id;
      } else finish(v.to || null);
    });
  }
  views.sprint = {
    title: function (p) { var sp = db.sprint(p.id); return sp ? sp.name : "Sprint"; },
    crumbs: function (p) {
      var sp = db.sprint(p.id);
      return [{ icon: "gauge", label: "Sprinty", href: "#/sprints" }, { label: sp ? sp.name : "Nie znaleziono" }];
    },
    render: function (el, p) {
      var sp = db.sprint(p.id);
      if (!sp) { el.innerHTML = '<div class="page"><div class="empty-b">' + ico("gauge", 44) + '<h3>Nie ma takiego sprintu</h3><a class="btn" href="#/sprints">Wszystkie sprinty</a></div></div>'; return; }
      var tasks = db.sprintTasks(sp.id), st = db.sprintStats(sp.id);
      var left = isDay(sp.end) ? daysBetween(D.today(), sp.end) : null, len = isDay(sp.start) && isDay(sp.end) ? daysBetween(sp.start, sp.end) + 1 : null;
      var dayNo = sp.state === "active" && isDay(sp.start) ? Math.min(len, Math.max(1, daysBetween(sp.start, D.today()) + 1)) : null;
      var tiles = [
        ["hash", "Punkty", st.pointsDone + " / " + st.points, st.points ? Math.round(st.pointsDone / st.points * 100) + "% ukończone" : "Oceń zadania w punktach"],
        ["list-checks", "Zadania", st.done + " / " + st.tasks, st.tasks - st.done ? pl(st.tasks - st.done, "otwarte", "otwarte", "otwartych") : st.tasks ? "Wszystko zrobione 🎉" : "Dodaj zadania z backlogu"],
        ["calendar", sp.state === "done" ? "Zakończony" : "Do końca", sp.state === "done" ? shortDate(D.ymd(new Date(sp.closedAt))) : left == null ? "—" : left < 0 ? "−" + -left + " d" : left + " d",
          sp.state === "done" ? (sp.result && sp.result.carried ? pl(sp.result.carried, "zadanie przeszło", "zadania przeszły", "zadań przeszło") + " dalej" : "Bez zaległości") : dayNo ? "dzień " + dayNo + " z " + len : len ? pl(len, "dzień", "dni", "dni") + " sprintu" : "", left != null && left < 0 && sp.state !== "done" ? "bad" : ""],
        ["clock", "Czas pracy", SP.charts ? SP.charts.hours(tasks.reduce(function (s, t) { return s + db.timeTotal(t) + db.subtasks(t.id).reduce(function (a, x) { return a + db.timeTotal(x); }, 0); }, 0)) : "", "zadania sprintu (stoper i wpisy)"],
      ];
      var act = sp.state === "planned" ? '<button class="btn primary sm" data-a="start">' + ico("play", 14) + "Rozpocznij sprint</button>"
        : sp.state === "active" ? '<button class="btn primary sm" data-a="complete">' + ico("check", 14) + "Zakończ sprint</button>" : "";
      el.innerHTML = '<div class="page sprint"><div class="page-h spr-h"><h1>' + esc(sp.name) + "</h1>" + statePill(sp) + '<span class="muted">' + esc((db.space(sp.spaceId) || {}).name || "") + " · " + range(sp.start, sp.end) + "</span>" +
        '<span class="grow"></span>' + (sp.state !== "done" ? '<button class="btn sm" data-a="add">' + ico("plus", 14) + "Dodaj zadania</button>" : "") + act +
        '<button class="ibtn" data-a="more" title="Więcej">' + ico("ellipsis", 16) + "</button></div>" +
        (sp.goal ? '<p class="spr-goal big">' + ico("target", 15) + esc(sp.goal) + "</p>" : "") +
        '<div class="kpis">' + tiles.map(function (k) {
          return '<div class="kpi' + (k[4] ? " " + k[4] : "") + '"><span class="kpi-ico">' + ico(k[0], 18) + '</span><span class="kpi-l">' + k[1] + '</span><b class="kpi-v">' + k[2] + '</b><small class="muted">' + esc(k[3]) + "</small></div>";
        }).join("") + "</div>" +
        '<section class="card spr-bd"><div class="card-h"><h2>Wykres spalania</h2><span class="muted">' + (st.points ? st.points + " pkt w sprincie" : st.tasks + " zadań") + '</span></div><div class="card-b ch-b">' + burndown(sp, tasks) + "</div></section>" +
        '<div class="board spr-board">' + db.STATUSES.map(function (s) {
          var items = tasks.filter(function (t) { return t.status === s.id; }), pts = items.reduce(function (a, t) { return a + (Number(t.points) || 0); }, 0);
          return '<section class="col" data-status="' + s.id + '" style="--c:' + s.color + '"><div class="col-h"><span class="st-pill" style="--c:' + s.color + '">' + esc(s.name) + '</span><span class="grp-n">' + items.length + (pts ? " · " + pts + " pkt" : "") + "</span></div>" +
            '<div class="col-b">' + items.map(cardHTML).join("") + "</div>" +
            (sp.state !== "done" ? '<form class="col-add" data-status="' + s.id + '"><span class="add-plus">' + ico("plus", 14) + '</span><input placeholder="Nowe zadanie w sprincie" /></form>' : "") + "</section>";
        }).join("") + "</div></div>";

      el.querySelector(".spr-h").addEventListener("click", function (e) {
        var b = e.target.closest("[data-a]"); if (!b) return;
        var a = b.dataset.a;
        if (a === "add") addTasksDialog(sp);
        else if (a === "start") {
          var other = db.raw.sprints.find(function (x) { return x.spaceId === sp.spaceId && x.state === "active" && x.id !== sp.id; });
          (other ? SP.confirm("Rozpocząć " + sp.name + "?", "W tej przestrzeni trwa już „" + other.name + "”. Wróci on do zaplanowanych.", "Rozpocznij") : Promise.resolve(true)).then(function (ok) {
            if (!ok) return; db.startSprint(sp.id); if (!isDay(sp.start) || sp.start > D.today()) db.updateSprint(sp.id, { start: D.today() }); SP.toast(sp.name + " wystartował – powodzenia! 🚀");
          });
        } else if (a === "complete") completeSprint(sp);
        else if (a === "more") SP.menu(b, [
          { label: "Edytuj sprint", icon: "pencil", run: function () { sprintForm(sp); } },
          sp.state === "done" ? { label: "Otwórz ponownie", icon: "repeat", run: function () { db.updateSprint(sp.id, { state: "active", closedAt: null }); } } : null,
          { label: "Wszystkie sprinty", icon: "gauge", run: function () { location.hash = "#/sprints"; } },
          "-",
          { label: "Usuń sprint", icon: "trash", danger: true, run: function () {
            SP.confirm("Usunąć " + sp.name + "?", "Zadania zostaną – wrócą do backlogu.").then(function (ok) { if (ok) { db.deleteSprint(sp.id); location.hash = "#/sprints"; SP.toast("Usunięto sprint"); } });
          } },
        ].filter(Boolean), { align: "right" });
      });
      // karty: punkty, wyjmowanie, szybkie edycje, otwieranie
      var board = el.querySelector(".spr-board");
      board.addEventListener("click", function (e) {
        var host = e.target.closest("[data-task]"); if (!host) return;
        var t = db.task(host.dataset.task); if (!t) return;
        var q = e.target.closest("[data-q]");
        if (!q) { SP.openTask(t.id); return; }
        e.stopPropagation();
        if (q.dataset.q === "points") SP.pickPoints(q, t.points, function (v) { db.setPoints(t.id, v); });
        else if (q.dataset.q === "unsprint") db.setSprint([t.id], null);
        else if (q.dataset.q === "assignees") SP.pickAssignees(q, t.assignees, function (v) { db.updateTask(t.id, { assignees: v }); });
      });
      var dragId = null;
      board.querySelectorAll(".card-t").forEach(function (c) {
        c.addEventListener("dragstart", function (e) { dragId = c.dataset.task; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); });
        c.addEventListener("dragend", function () { c.classList.remove("dragging"); board.querySelectorAll(".col.over").forEach(function (x) { x.classList.remove("over"); }); });
      });
      board.querySelectorAll(".col").forEach(function (col) {
        col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
        col.addEventListener("dragleave", function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove("over"); });
        col.addEventListener("drop", function (e) {
          e.preventDefault(); col.classList.remove("over");
          var t = db.task(dragId || e.dataTransfer.getData("text/plain")), s = col.dataset.status;
          if (t && t.status !== s) { SP.flipDrop = { id: t.id, x: e.clientX, y: e.clientY, t: Date.now() }; db.updateTask(t.id, { status: s }, "zmienił(a) status na " + db.status(s).name); }
        });
      });
      board.querySelectorAll(".col-add").forEach(function (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault(); var inp = form.querySelector("input"); if (!inp.value.trim()) return;
          var listId = (db.raw.lists.find(function (l) { return l.spaceId === sp.spaceId; }) || {}).id;
          if (!listId) { SP.toast("Ta przestrzeń nie ma jeszcze listy"); return; }
          var base = { listId: listId, status: form.dataset.status, assignees: [], sprintId: sp.id };
          db.createTask(SP.smartFields ? Object.assign(SP.smartFields(inp, base), { sprintId: sp.id }) : Object.assign(base, { title: inp.value.trim() }));
          var stt = form.dataset.status; setTimeout(function () { var again = document.querySelector('.spr-board .col-add[data-status="' + stt + '"] input'); if (again) again.focus(); }, 0);
        });
      });
      if (SP.charts) SP.charts.bindTips(el);
    },
  };

  /* =================== Arkusz czasu: #/timesheet =================== */
  function monday(s) { var d = new Date(s + "T00:00:00"); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return D.ymd(d); }
  function hm(ms) { var m = Math.round(ms / 60000); return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); }
  /** Wpisy czasu z tygodnia, przypisane do dnia rozpoczęcia. */
  function weekEntries(start) {
    var end = D.add(start, 7), out = [];
    db.raw.tasks.forEach(function (t) {
      (t.time || []).forEach(function (e) {
        var day = D.ymd(new Date(e.start)); if (day < start || day >= end) return;
        out.push({ task: t, day: day, by: e.by || "me", ms: (e.end ? new Date(e.end) : new Date()) - new Date(e.start), running: !e.end });
      });
    });
    return out;
  }
  views.timesheet = {
    title: function () { return "Arkusz czasu"; },
    crumbs: function () { return [{ icon: "countdown", label: "Arkusz czasu" }]; },
    render: function (el) {
      var V = views.timesheet;
      var start = V.week || monday(D.today()), mode = V.mode || "task", today = D.today();
      var days = []; for (var i = 0; i < 7; i++) days.push(D.add(start, i));
      var entries = weekEntries(start);
      V.extra = (V.extra || []).filter(function (id) { return db.task(id); });
      var rows = {}, order = [];
      function row(key, label) { if (!rows[key]) { rows[key] = { key: key, label: label, days: {}, total: 0 }; order.push(key); } return rows[key]; }
      function labelFor(e) {
        if (mode === "person") { var p = db.person(e.by); return SP.avatar(e.by, "xs") + "<span>" + esc(p ? p.name : "?") + "</span>"; }
        if (mode === "space") { var s = db.space(spaceOfTask(e.task)); return s ? SP.spaceIcon(s, "xs") + "<span>" + esc(s.name) + "</span>" : "<span>(usunięta)</span>"; }
        return SP.statusDot(e.task.status) + '<span class="ts-t">' + esc(e.task.title) + '</span><small class="muted">' + db.taskKey(e.task) + " · " + esc(db.pathOf(e.task).list.name) + "</small>";
      }
      entries.forEach(function (e) {
        var key = mode === "person" ? e.by : mode === "space" ? spaceOfTask(e.task) || "?" : e.task.id;
        var r = row(key, labelFor(e)); r.days[e.day] = (r.days[e.day] || 0) + e.ms; r.total += e.ms; if (e.running) r.running = true;
      });
      if (mode === "task") V.extra.forEach(function (id) { var t = db.task(id); row(id, labelFor({ task: t })); });
      var list = order.map(function (k) { return rows[k]; }).sort(function (a, b) { return b.total - a.total; });
      var dayTot = days.map(function (d) { return entries.filter(function (e) { return e.day === d; }).reduce(function (s, e) { return s + e.ms; }, 0); });
      var total = dayTot.reduce(function (a, b) { return a + b; }, 0);
      var workDays = dayTot.filter(function (x, i) { return i < 5 || x; }).length || 1;
      var best = dayTot.indexOf(Math.max.apply(null, dayTot));
      var thisWeek = start === monday(today);
      var label = shortDate(days[0]) + " – " + new Date(days[6] + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
      var dow = function (d) { return new Date(d + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "short" }).replace(".", ""); };
      var kpis = [
        ["clock", "Razem w tygodniu", SP.charts ? SP.charts.hours(total) : hm(total), entries.length ? pl(entries.length, "wpis", "wpisy", "wpisów") : "Brak wpisów"],
        ["chart-column", "Średnio dziennie", SP.charts ? SP.charts.hours(total / workDays) : hm(total / workDays), "dni robocze + weekend z pracą"],
        ["calendar", "Najdłuższy dzień", total ? dow(days[best]) + " " + shortDate(days[best]) : "—", total ? hm(dayTot[best]) + " h" : "Włącz stoper albo wpisz czas"],
      ];
      el.innerHTML = '<div class="page ts"><div class="page-h"><h1>Arkusz czasu</h1>' +
        '<div class="ts-nav"><button class="ibtn" data-w="-7" title="Poprzedni tydzień">' + ico("chevron-left", 16) + '</button><b>' + label + '</b><button class="ibtn" data-w="7" title="Następny tydzień">' + ico("chevron-right", 16) + "</button>" +
        (thisWeek ? "" : '<button class="btn sm" data-w="now">Ten tydzień</button>') + "</div>" +
        '<div class="seg" role="group" aria-label="Grupuj">' + [["task", "Zadania"], ["person", "Osoby"], ["space", "Przestrzenie"]].map(function (m) { return '<button data-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</div>" +
        '<button class="btn sm" data-csv>' + ico("download", 14) + "CSV</button></div>" +
        '<div class="kpis ts-kpis">' + kpis.map(function (k) { return '<div class="kpi"><span class="kpi-ico">' + ico(k[0], 18) + '</span><span class="kpi-l">' + k[1] + '</span><b class="kpi-v">' + k[2] + '</b><small class="muted">' + esc(k[3]) + "</small></div>"; }).join("") + "</div>" +
        '<section class="card ts-card"><div class="ts-scroll"><table class="ts-tbl"><thead><tr><th class="ts-name">' + { task: "Zadanie", person: "Osoba", space: "Przestrzeń" }[mode] + "</th>" +
        days.map(function (d, i) { return '<th class="' + (d === today ? "today" : "") + (i >= 5 ? " we" : "") + '">' + dow(d) + "<small>" + d.slice(8) + "." + d.slice(5, 7) + "</small></th>"; }).join("") + '<th class="ts-sum">Suma</th></tr></thead><tbody>' +
        (list.map(function (r) {
          return '<tr data-row="' + esc(r.key) + '"><td class="ts-name"><' + (mode === "task" ? 'button class="ts-open" data-open="' + esc(r.key) + '"' : "span") + ">" + r.label + (r.running ? '<span class="ts-live" title="Stoper włączony"></span>' : "") + "</" + (mode === "task" ? "button" : "span") + "></td>" +
            days.map(function (d, i) {
              var ms = r.days[d] || 0, cls = (d === today ? "today" : "") + (i >= 5 ? " we" : "");
              return mode === "task" ? '<td class="' + cls + '"><button class="ts-cell' + (ms ? " has" : "") + '" data-add="' + d + '" title="Dodaj czas – ' + dow(d) + " " + shortDate(d) + '">' + (ms ? hm(ms) : "<span>+</span>") + "</button></td>"
                : '<td class="' + cls + '"><span class="ts-cell' + (ms ? " has" : "") + '">' + (ms ? hm(ms) : "–") + "</span></td>";
            }).join("") + '<td class="ts-sum"><b>' + hm(r.total) + "</b></td></tr>";
        }).join("") || '<tr><td colspan="9"><div class="empty-s">W tym tygodniu nie ma zarejestrowanego czasu. Włącz stoper w zadaniu albo dodaj wiersz i wpisz czas ręcznie.</div></td></tr>') +
        "</tbody><tfoot><tr><td class=\"ts-name\">" + (mode === "task" ? '<button class="btn ghost sm" data-addrow>' + ico("plus", 14) + "Dodaj zadanie</button>" : "Razem") + "</td>" +
        dayTot.map(function (ms, i) { return '<td class="' + (days[i] === today ? "today" : "") + (i >= 5 ? " we" : "") + '"><b>' + (ms ? hm(ms) : "–") + "</b></td>"; }).join("") + '<td class="ts-sum"><b>' + hm(total) + "</b></td></tr></tfoot></table></div></section>" +
        '<p class="muted ts-hint">Czas liczony jest według dnia rozpoczęcia wpisu. Kliknij komórkę, żeby dopisać czas (np. „1h 30m”, „45m”, „2”). Wpisy usuniesz w oknie zadania.</p></div>';

      el.querySelector(".page-h").addEventListener("click", function (e) {
        var b;
        if ((b = e.target.closest("[data-w]"))) { V.week = b.dataset.w === "now" ? null : D.add(start, Number(b.dataset.w)); SP.rerender(); }
        else if ((b = e.target.closest("[data-mode]"))) { V.mode = b.dataset.mode; SP.rerender(); }
        else if (e.target.closest("[data-csv]")) exportCSV(list, days, dayTot, total, mode, label);
      });
      el.querySelector(".ts-tbl").addEventListener("click", function (e) {
        var b;
        if ((b = e.target.closest("[data-open]"))) { SP.openTask(b.dataset.open); return; }
        if ((b = e.target.closest("[data-addrow]"))) {
          var ex = list.map(function (r) { return r.key; });
          SP.pickTask(b, ex, function (id) { V.extra.push(id); SP.rerender(); });
          return;
        }
        if ((b = e.target.closest("[data-add]"))) {
          var tid = b.closest("tr").dataset.row, t = db.task(tid), d = b.dataset.add; if (!t) return;
          SP.form({ title: "Czas: " + t.title, submit: "Dodaj", fields: [{ name: "v", label: dow(d) + ", " + shortDate(d) + " – ile czasu dodać?", placeholder: "np. 1h 30m", required: true }] }).then(function (v) {
            if (!v) return; var ms = db.parseDuration(v.v);
            if (!ms) { SP.toast("Nie rozumiem – wpisz np. 1h 30m albo 45m"); return; }
            if (ms > 24 * 3600000) { SP.toast("Maksymalnie 24 godziny na dzień"); return; }
            db.addTimeOn(t.id, ms, d); SP.toast("Dodano " + db.fmtDuration(ms));
          });
        }
      });
    },
  };
  function exportCSV(list, days, dayTot, total, mode, label) {
    var strip = function (h) { var x = document.createElement("div"); x.innerHTML = h; x.querySelectorAll("small").forEach(function (s) { s.textContent = " (" + s.textContent + ")"; }); return x.textContent.trim(); };
    var num = function (ms) { return ms ? (ms / 3600000).toFixed(2).replace(".", ",") : ""; };
    var head = [{ task: "Zadanie", person: "Osoba", space: "Przestrzeń" }[mode]].concat(days).concat(["Suma (h)"]);
    var rows = list.map(function (r) { return [strip(r.label)].concat(days.map(function (d) { return num(r.days[d] || 0); })).concat([num(r.total)]); });
    rows.push(["Razem"].concat(dayTot.map(num)).concat([num(total)]));
    var csv = "﻿" + [head].concat(rows).map(function (r) { return r.map(function (c) { c = String(c == null ? "" : c); return /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
    a.href = url; a.download = "Arkusz czasu " + days[0] + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    SP.toast("Wyeksportowano arkusz czasu (" + label + ")");
  }
})();
