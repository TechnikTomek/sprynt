/* Sprynt – Sprinty (punkty, backlog, wykres spalania, prędkość zespołu) i Arkusz czasu (tydzień godzin pracy). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico, views = SP.views, D = SP.date;
  var POINTS = [1, 2, 3, 5, 8, 13, 21];
  /** Najbliższa wartość ze skali (AI może zwrócić np. 4). */
  function snapPts(n) { n = Number(n) || 1; return POINTS.reduce(function (b, x) { return Math.abs(x - n) < Math.abs(b - n) ? x : b; }, POINTS[0]); }
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
  var PRIO_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
  function byImportance(a, b) {
    var pa = a.priority in PRIO_RANK ? PRIO_RANK[a.priority] : 4, pb = b.priority in PRIO_RANK ? PRIO_RANK[b.priority] : 4;
    return pa - pb || (a.due || "9999").localeCompare(b.due || "9999") || (a.num || 0) - (b.num || 0);
  }
  /** Prędkość: średnia ukończonych punktów z ostatnich 3 zakończonych sprintów przestrzeni. */
  function velocityOf(spaceId, exceptId) {
    var hist = db.raw.sprints.filter(function (x) { return x.spaceId === spaceId && x.state === "done" && x.result && x.id !== exceptId; })
      .sort(function (a, b) { return (a.closedAt || "") < (b.closedAt || "") ? 1 : -1; }).slice(0, 3);
    var avg = hist.length ? Math.round(hist.reduce(function (s, x) { return s + (x.result.pointsDone || 0); }, 0) / hist.length) : 0;
    return { avg: avg, hist: hist.map(function (x) { return { name: x.name, points: x.result.points || 0, pointsDone: x.result.pointsDone || 0 }; }) };
  }
  function backlogOf(spaceId) {
    return db.raw.tasks.filter(function (t) {
      if (t.parentId || closed(t) || spaceOfTask(t) !== spaceId) return false;
      var o = t.sprintId && db.sprint(t.sprintId); return !o || o.state === "done";
    });
  }
  function sumPts(ts) { return ts.reduce(function (s, t) { return s + (Number(t.points) || 0); }, 0); }
  function personName(id) { return id === "me" ? SP.user.name : (db.person(id) || {}).name || "?"; }
  /** Imię z odpowiedzi AI → id osoby z zespołu (dokładnie albo po pierwszym słowie). */
  function findPerson(name) {
    if (!name) return null; var n = name.trim().toLowerCase();
    var p = db.raw.people.find(function (x) { return personName(x.id).toLowerCase() === n; }) ||
      db.raw.people.find(function (x) { return personName(x.id).toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]; });
    return p ? p.id : null;
  }
  function aiOn() { return !!(SP.ai && SP.ai.enabled()); }
  function modelLabel(id) { var m = SP.ai && SP.ai.MODELS.find(function (x) { return x.id === id; }); return m ? m.name : id || ""; }
  function goAiSettings() {
    location.hash = "#/settings";
    setTimeout(function () { var a = document.getElementById("ai-sec"); if (a) a.scrollIntoView({ behavior: "smooth", block: "center" }); }, 150);
  }
  function spin(label) { return '<span class="xt-spin sm"></span>' + esc(label); }
  /** Liczy elementy w odpowiedzi AI, która jeszcze się pisze (np. ile ocen już jest). */
  function countKey(snap, key) { var m = snap.match(new RegExp('"' + key + '"\\s*:', "g")); return m ? m.length : 0; }

  /* ---- Burndown: dane wspólne dla wykresu, oceny kondycji i AI ---- */
  function burnData(sp, tasks) {
    if (!isDay(sp.start) || !isDay(sp.end)) return null;
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
    var ideal = function (i) { return Math.round((total - total * i / n) * 10) / 10; };
    var ti = days.indexOf(today), fc = null;
    // Prognoza: tempo z dotychczasowych dni → gdzie będziemy na koniec sprintu.
    if (sp.state === "active" && ti >= 1 && remaining[ti] != null) {
      var pace = (total - remaining[ti]) / ti;
      fc = pace > 0 ? { pace: pace, end: Math.max(0, remaining[ti] - pace * (n - ti)), finish: ti + remaining[ti] / pace } : { pace: 0, end: remaining[ti], finish: Infinity };
      fc.from = ti; fc.left = remaining[ti];
    }
    return { usePts: usePts, total: total, n: n, days: days, remaining: remaining, ideal: ideal, ti: ti, fc: fc };
  }
  var HEALTH = { on_track: ["Na dobrej drodze", "#1aae6f"], at_risk: ["Zagrożony", "#f0a020"], off_track: ["Opóźniony", "#e5484d"] };
  /** Kondycja trwającego sprintu z prognozy (bez AI). */
  function healthOf(sp, bd) {
    if (sp.state !== "active" || !bd || !bd.total) return null;
    if (bd.ti < 0) return bd.days[bd.n] < D.today() ? (bd.remaining[bd.n] ? "off_track" : "on_track") : null;
    if (!bd.remaining[bd.ti]) return "on_track";
    if (bd.ti < 2 || !bd.fc) return bd.remaining[bd.ti] <= bd.ideal(bd.ti) + bd.total * 0.15 ? "on_track" : "at_risk";
    var r = bd.fc.end / bd.total;
    return r <= 0.05 ? "on_track" : r <= 0.25 ? "at_risk" : "off_track";
  }
  function healthPill(h, tip) { var x = HEALTH[h]; return x ? '<span class="st-pill" style="--c:' + x[1] + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" + x[0] + "</span>" : ""; }

  /** Wybór punktów (skala Fibonacciego). taskId – opcjonalnie, włącza „Oszacuj z AI”. */
  SP.pickPoints = function (anchor, cur, cb, taskId) {
    SP.menu(anchor, [{ header: "Punkty (szacunek pracy)" }].concat(POINTS.map(function (n) {
      return { html: '<span class="pts">' + n + "</span><span>" + pl(n, "punkt", "punkty", "punktów") + "</span>", active: cur === n, run: function () { cb(n); } };
    }), taskId && aiOn() ? ["-", { label: "Oszacuj z AI", icon: "sparkles", run: function () { estimateOne(taskId); } }] : [], ["-", { label: "Inna liczba…", icon: "hash", run: function () {
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

  /* =================== AI: okno-powłoka (wspólne dla szacowania) =================== */
  function aiShell(title, sub, icon, o) {
    o = o || {};
    var bg = SP.el('<div class="sx-bg"><div class="sx spr-ai' + (o.cls ? " " + o.cls : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header class="xt-h"><span class="xt-hi">' + ico(icon || "sparkles", 18) + '</span><div><h2>' + esc(title) + '</h2><p class="muted">' + esc(sub) + '</p></div><button class="ibtn" data-x title="Zamknij (Esc)">' + ico("x", 18) + "</button></header>" +
      '<div class="sx-body"><div class="sx-info muted"></div><div class="spr-ai-list"></div></div>' +
      '<footer class="pt-f"><span class="muted spr-ai-meta"></span><span class="grow"></span><span class="spr-ai-acts"></span><button class="btn ghost sm" data-x>' + (o.noGo ? "Zamknij" : "Anuluj") + "</button>" + (o.noGo ? "" : '<button class="btn primary sm" data-go disabled>' + ico("check", 15) + "<span>Zastosuj</span></button>") + "</footer></div></div>");
    var S = { bg: bg, body: bg.querySelector(".spr-ai-list"), info: bg.querySelector(".sx-info"), go: bg.querySelector("[data-go]"), meta: bg.querySelector(".spr-ai-meta"), acts: bg.querySelector(".spr-ai-acts"), open: true };
    function onKey(e) { if (e.key === "Escape" && !document.querySelector(".popover")) { e.stopPropagation(); S.close(); } }
    S.close = function () { if (!S.open) return; S.open = false; bg.remove(); document.removeEventListener("keydown", onKey, true); };
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) S.close(); });
    bg.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) S.close(); });
    document.body.appendChild(bg); SP.hydrateIcons(bg);
    return S;
  }
  var CONF = { low: "niska pewność", medium: "średnia pewność", high: "wysoka pewność" };
  /** Szacowanie punktów z AI dla wielu zadań: podgląd propozycji, poprawki, zastosowanie. */
  function estimateDialog(tasks, spaceId) {
    if (!aiOn()) { goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby szacować z AI"); return; }
    tasks = tasks.slice().sort(byImportance).slice(0, 60);
    if (!tasks.length) { SP.toast("Nie ma zadań do oszacowania"); return; }
    var S = aiShell("Oszacuj punkty z AI", "Claude ocenia pracochłonność w skali Fibonacciego, ucząc się z punktów, które zespół już nadał.", "sparkles");
    S.info.innerHTML = spin("AI ocenia " + pl(tasks.length, "zadanie", "zadania", "zadań") + "…");
    S.body.innerHTML = tasks.map(function (t) { return '<div class="est-row wait"><span class="pts empty">?</span><span class="est-t"><b>' + esc(t.title) + '</b><small class="muted">' + db.taskKey(t) + (t.points != null ? " · teraz " + t.points + " pkt" : "") + "</small></span></div>"; }).join("");
    var rows = [];
    SP.ai.estimate(tasks, spaceId, function (snap) {
      if (S.open) S.info.innerHTML = spin("AI ocenia… " + Math.max(0, countKey(snap, "points")) + " / " + tasks.length);
    }).then(function (res) {
      if (!S.open) return;
      var byKey = {}; tasks.forEach(function (t) { byKey[db.taskKey(t)] = t; });
      res.estimates.forEach(function (e) { var t = byKey[e.key]; if (t && !rows.some(function (r) { return r.t === t; })) var pts = snapPts(e.points); rows.push({ t: t, pts: pts, conf: e.confidence, reason: e.reason, on: t.points !== pts }); });
      S.info.textContent = res.note || "";
      S.meta.textContent = modelLabel(res.model);
      draw();
    }, function (err) {
      if (!S.open) return;
      S.info.innerHTML = '<span class="spr-err">' + esc(err.message || "Błąd AI") + "</span>";
    });
    function draw() {
      S.body.innerHTML = rows.map(function (r, i) {
        return '<div class="est-row' + (r.on ? "" : " off") + '" data-i="' + i + '" style="--i:' + i + '"><button type="button" class="pt-on" aria-pressed="' + r.on + '">' + ico("check", 12) + "</button>" +
          '<button type="button" class="cell-btn est-p" title="Zmień"><span class="pts">' + r.pts + "</span></button>" +
          '<span class="est-t"><b>' + esc(r.t.title) + '</b><small class="muted">' + db.taskKey(r.t) + (r.t.points != null ? " · teraz " + r.t.points + " pkt" : "") + " · " + CONF[r.conf] + "</small>" +
          '<small class="est-why">' + esc(r.reason) + "</small></span></div>";
      }).join("") || '<div class="empty-s">AI nie zwróciło ocen – spróbuj ponownie.</div>';
      SP.hydrateIcons(S.body); upd();
    }
    function upd() {
      var on = rows.filter(function (r) { return r.on; });
      S.go.disabled = !on.length; S.go.querySelector("span").textContent = on.length ? "Zastosuj " + on.length + " · " + on.reduce(function (s, r) { return s + r.pts; }, 0) + " pkt" : "Zastosuj";
    }
    S.body.addEventListener("click", function (e) {
      var row = e.target.closest(".est-row[data-i]"); if (!row) return;
      var r = rows[+row.dataset.i], b;
      if ((b = e.target.closest(".est-p"))) { SP.pickPoints(b, r.pts, function (v) { if (v != null) { r.pts = v; r.on = true; draw(); } }); return; }
      if (e.target.closest(".pt-on")) { r.on = !r.on; row.classList.toggle("off", !r.on); row.querySelector(".pt-on").setAttribute("aria-pressed", r.on); upd(); }
    });
    S.go.addEventListener("click", function () {
      var on = rows.filter(function (r) { return r.on; }); if (!on.length) return;
      on.forEach(function (r) { db.updateTask(r.t.id, { points: r.pts }, "ustawił(a) punkty z AI: " + r.pts); });
      S.close(); SP.toast("AI oszacowało " + pl(on.length, "zadanie", "zadania", "zadań") + " – razem " + on.reduce(function (s, r) { return s + r.pts; }, 0) + " pkt");
    });
  }
  SP.estimateWithAI = estimateDialog;
  /** Jedno zadanie: AI od razu ustawia punkty i mówi dlaczego. */
  function estimateOne(taskId) {
    var t = db.task(taskId); if (!t) return;
    SP.toast("AI szacuje „" + t.title + "”…");
    SP.ai.estimate([t], spaceOfTask(t)).then(function (res) {
      var e = res.estimates[0]; if (!e) { SP.toast("AI nie oceniło zadania"); return; } e.points = snapPts(e.points);
      db.updateTask(taskId, { points: e.points }, "ustawił(a) punkty z AI: " + e.points);
      SP.toast(e.points + " pkt – " + e.reason);
    }, function (err) { SP.toast(err.message || "Błąd AI"); });
  }

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
    if (p) p.onclick = function () { var t = db.task(taskId); SP.pickPoints(p, t.points, function (v) { db.setPoints(taskId, v); }, taskId); };
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
      var noPts = backlog.filter(function (t) { return t.points == null; });
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
          historyHTML(done) +
          '<section class="card"><div class="card-h"><h2>Backlog</h2><span class="muted">' + pl(backlog.length, "otwarte", "otwarte", "otwartych") + " bez sprintu</span>" +
          (noPts.length ? '<span class="grow"></span><button class="chip-btn sm magic" data-estimate title="Zadania bez punktów: ' + noPts.length + '">' + ico("sparkles", 13) + (aiOn() ? "Oszacuj z AI (" + noPts.length + ")" : "Szacuj z AI") + "</button>" : "") + "</div><div class=\"card-b\">" +
          (backlog.slice(0, 40).map(function (t) {
            return '<div class="crow" data-task="' + t.id + '">' + SP.statusDot(t.status) + '<span class="r-title">' + esc(t.title) + '</span><span class="r-path">' + esc(db.pathOf(t).list.name) + "</span>" + pointsChip(t) +
              '<button class="chip-btn sm" data-to-sprint="' + t.id + '">' + ico("gauge", 13) + "Do sprintu</button></div>";
          }).join("") || '<div class="empty-s">Backlog jest pusty – wszystkie otwarte zadania są w sprintach.</div>') + (backlog.length > 40 ? '<div class="empty-s">… i ' + (backlog.length - 40) + " więcej</div>" : "") + "</div></section>" +
          "</div></div>") + "</div>";
      el.querySelector(".dash-scope").onchange = function (e) { views.sprints.scope = e.target.value; SP.rerender(); };
      el.addEventListener("click", function (e) {
        var b;
        if (e.target.closest("[data-new-sprint]")) { SP.newSprint(scope === "all" ? null : scope); return; }
        if (e.target.closest("[data-estimate]")) { estimateDialog(noPts, scope === "all" ? null : scope); return; }
        if ((b = e.target.closest("[data-to-sprint]"))) { e.stopPropagation(); var t = db.task(b.dataset.toSprint); SP.pickSprint(b, spaceOfTask(t), null, function (v) { db.setSprint([t.id], v); }); return; }
        var r = e.target.closest("[data-task]"); if (r) SP.openTask(r.dataset.task);
      });
      if (SP.charts) SP.charts.bindTips(el);
    },
  };

  /* =================== Jeden sprint: #/sprint/<id> =================== */
  /** Wykres spalania: idealna linia od sumy do zera i rzeczywista – pozostało na koniec każdego dnia. */
  function burndown(sp, bd) {
    if (!bd) return '<div class="empty-s">Ustaw daty sprintu, żeby zobaczyć wykres.</div>';
    if (!bd.total) return '<div class="empty-s">Dodaj zadania do sprintu, a zobaczysz tu, jak praca ubywa z dnia na dzień.</div>';
    var usePts = bd.usePts, total = bd.total, n = bd.n, days = bd.days, remaining = bd.remaining, today = D.today(), fc = bd.fc;
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
    // Prognoza: przerywana linia z dzisiejszego punktu w tempie dotychczasowym.
    var fcLine = "", fcNote = "", unit = usePts ? " pkt" : " zad.";
    if (fc && fc.left > 0) {
      var endI = fc.pace > 0 && fc.finish <= n ? fc.finish : n, endV = fc.pace > 0 && fc.finish <= n ? 0 : fc.end;
      fcLine = '<line class="bd-fc" x1="' + x(fc.from) + '" y1="' + y(fc.left) + '" x2="' + x(endI) + '" y2="' + y(endV) + '"/>';
      fcNote = fc.pace <= 0 ? "Jeszcze nic nie spalono – prognoza pojawi się po pierwszych ukończonych zadaniach."
        : fc.finish <= n ? "W obecnym tempie (" + (Math.round(fc.pace * 10) / 10).toLocaleString("pl-PL") + unit + "/dzień) skończycie ok. " + shortDate(D.add(sp.start, Math.ceil(fc.finish))) + "."
        : "W obecnym tempie na koniec zostanie ok. " + Math.round(fc.end) + unit + " – rozważ zmniejszenie zakresu.";
    }
    return '<div class="ch-wrap"><svg class="ch" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Wykres spalania sprintu">' + grid + todayLine +
      '<line x1="' + pl0 + '" x2="' + (W - 10) + '" y1="' + (pt + ph) + '" y2="' + (pt + ph) + '" class="ch-base"/>' +
      '<line class="bd-ideal" x1="' + x(0) + '" y1="' + y(total) + '" x2="' + x(n) + '" y2="' + y(0) + '"/>' + fcLine +
      (actual ? '<polyline class="bd-line" points="' + actual + '"/>' : "") + labels + hits + '</svg><div class="ch-tip" hidden></div></div>' +
      '<div class="bd-legend"><span><i class="bd-k ideal"></i>Plan</span><span><i class="bd-k"></i>Pozostało (' + (usePts ? "punkty" : "zadania – dodaj punkty, by liczyć dokładniej") + ")</span>" +
      (fcLine ? '<span><i class="bd-k fc"></i>Prognoza</span>' : "") + (fcNote ? '<span class="bd-note">' + esc(fcNote) + "</span>" : "") + "</div>";
  }
  var scopeIds = {};
  function cardHTML(t) {
    var d = SP.fmtDue(t.due, closed(t));
    return '<article class="card-t' + (closed(t) ? " closed" : "") + '" draggable="true" data-task="' + t.id + '">' +
      '<div class="ct-path">' + SP.taskKeyHTML(t) + esc(db.pathOf(t).list.name) + (scopeIds[t.id] ? '<span class="ct-scope" title="Dodane po starcie sprintu">+ w trakcie</span>' : "") + "</div>" +
      '<div class="ct-title">' + esc(t.title) + "</div>" +
      '<div class="ct-foot"><button class="cell-btn" data-q="assignees">' + SP.avatars(t.assignees, "xs") + "</button>" +
      (t.due ? '<span class="due ' + d.cls + '">' + ico("calendar", 13) + d.label + "</span>" : "") + (t.priority ? SP.flag(t.priority) : "") +
      '<span class="grow"></span><button class="cell-btn" data-q="points" title="Punkty">' + (t.points != null ? '<span class="pts">' + t.points + "</span>" : '<span class="pts empty">?</span>') + "</button>" +
      '<button class="ibtn sm" data-q="unsprint" title="Wyjmij ze sprintu (do backlogu)">' + ico("x", 12) + "</button></div></article>";
  }
  SP.taskKeyHTML = SP.taskKeyHTML || function (t) { return '<span class="ct-key">' + db.taskKey(t) + "</span> · "; };

  /** Dodawanie zadań z backlogu: pojemność (średnia prędkość), „Do pojemności” i plan z AI. o.ai = od razu zapytaj AI. */
  function addTasksDialog(sp, o) {
    o = o || {};
    var cands = backlogOf(sp.spaceId).filter(function (t) { return t.sprintId !== sp.id; }).sort(byImportance);
    var inSprint = db.sprintTasks(sp.id), havePts = sumPts(inSprint), vel = velocityOf(sp.spaceId, sp.id);
    var picked = new Set(), why = {}, plan = null, busy = false;
    var bg = SP.el('<div class="dlg-bg"><form class="dlg spr-add" role="dialog" aria-modal="true" aria-label="Dodaj zadania do sprintu"><h2>Dodaj zadania do „' + esc(sp.name) + '”</h2>' +
      '<div class="spr-cap"></div><div class="spr-plan" hidden></div>' +
      '<div class="spr-add-tools"><input class="input sm" placeholder="Szukaj w backlogu…" />' +
      '<button type="button" class="chip-btn sm" data-fill title="Zaznacz najważniejsze zadania (priorytet, termin), aż do średniej prędkości zespołu">' + ico("gauge", 13) + "Do pojemności</button>" +
      '<button type="button" class="chip-btn sm magic" data-plan>' + ico("sparkles", 13) + "<span>" + (aiOn() ? "Zaplanuj z AI" : "Włącz AI") + "</span></button></div>" +
      '<div class="spr-add-list"></div>' +
      '<div class="dlg-acts"><span class="muted spr-add-sum"></span><button type="button" class="btn ghost" data-cancel>Anuluj</button><button type="submit" class="btn primary">Dodaj</button></div></form></div>');
    var list = bg.querySelector(".spr-add-list"), inp = bg.querySelector("input"), planEl = bg.querySelector(".spr-plan"), planBtn = bg.querySelector("[data-plan]");
    var pickedPts = function () { var s = 0; picked.forEach(function (id) { s += Number((db.task(id) || {}).points) || 0; }); return s; };
    function draw() {
      var q = inp.value.trim().toLowerCase();
      var items = cands.filter(function (t) { return !q || t.title.toLowerCase().indexOf(q) >= 0 || db.taskKey(t).toLowerCase().indexOf(q) >= 0; });
      list.innerHTML = items.map(function (t) {
        return '<label class="spr-add-i' + (why[t.id] ? " ai" : "") + '"><input type="checkbox" value="' + t.id + '"' + (picked.has(t.id) ? " checked" : "") + " />" + SP.statusDot(t.status) +
          '<span class="spr-add-t"><span>' + esc(t.title) + "</span>" + (why[t.id] ? '<small class="spr-why">' + ico("sparkles", 11) + esc(why[t.id]) + "</small>" : "") + "</span>" +
          '<small class="muted">' + db.taskKey(t) + " · " + esc(db.pathOf(t).list.name) + (t.due ? " · " + SP.fmtDue(t.due).label : "") + "</small>" + SP.avatars(t.assignees, "xs", 2) + (t.priority ? SP.flag(t.priority) : "") + (t.points != null ? pointsChip(t) : '<span class="pts empty" title="Bez punktów">?</span>') + "</label>";
      }).join("") || '<div class="empty-s">' + (cands.length ? "Nic nie pasuje." : "Backlog tej przestrzeni jest pusty. Utwórz zadanie prosto w sprincie.") + "</div>";
      SP.hydrateIcons(list); sum();
    }
    function sum() {
      var pts = pickedPts(), all = havePts + pts, cap = vel.avg, over = cap && all > cap * 1.1, scale = Math.max(cap, all) || 1;
      bg.querySelector(".spr-cap").innerHTML = '<div class="spr-cap-h"><span>W sprincie <b>' + havePts + " pkt</b>" + (pts ? " + wybrane <b>" + pts + " pkt</b>" : "") + '</span><span class="' + (over ? "spr-over" : "muted") + '">' +
        (cap ? (over ? "Ponad pojemność: " : "Pojemność: ") + all + " / ~" + cap + " pkt" : "Brak historii prędkości – zakończ sprint, by poznać pojemność") + "</span></div>" +
        (cap ? '<span class="spr-bar cap' + (over ? " over" : "") + '"><i style="width:' + Math.round(havePts / scale * 100) + '%"></i><i class="add" style="width:' + Math.round(pts / scale * 100) + '%"></i></span>' : "");
      bg.querySelector(".spr-add-sum").textContent = picked.size ? pl(picked.size, "zadanie", "zadania", "zadań") + " · " + pts + " pkt" : "";
      bg.querySelector("[type=submit]").textContent = picked.size ? "Dodaj " + picked.size : "Dodaj";
    }
    /** Bez AI: od najważniejszych, dopóki mieści się w średniej prędkości. */
    function fill() {
      if (!vel.avg) { SP.toast("Brak historii prędkości – zakończ pierwszy sprint albo wybierz zadania ręcznie"); return; }
      picked.clear(); why = {}; var room = vel.avg - havePts, n = 0;
      cands.forEach(function (t) { var p = Number(t.points) || 0; if (t.points != null && p <= room) { picked.add(t.id); room -= p; n++; } });
      draw(); SP.toast(n ? "Zaznaczono " + pl(n, "zadanie", "zadania", "zadań") + " do pojemności ~" + vel.avg + " pkt" : "Nic się nie mieści – sprint jest już pełny");
    }
    function askPlan() {
      if (!aiOn()) { close(); goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby planować z AI"); return; }
      if (busy) return;
      if (!cands.length) { SP.toast("Backlog jest pusty – nie ma czego planować"); return; }
      busy = true; planBtn.disabled = true; planBtn.querySelector("span").textContent = "AI planuje…";
      planEl.hidden = false; planEl.innerHTML = '<div class="spr-plan-h">' + spin("AI czyta " + pl(Math.min(cands.length, 150), "zadanie", "zadania", "zadań") + " z backlogu…") + "</div>";
      SP.ai.planSprint({ sprint: sp, inSprint: inSprint, candidates: cands.slice(0, 150), velocity: vel.avg, history: vel.hist }, function (snap) {
        if (bg.isConnected) { var k = countKey(snap, "key"); if (k) planEl.querySelector(".spr-plan-h").innerHTML = spin("AI wybiera… " + pl(k, "zadanie", "zadania", "zadań")); }
      }).then(function (res) {
        busy = false; if (!bg.isConnected) return;
        plan = res; var byKey = {}; cands.forEach(function (t) { byKey[db.taskKey(t)] = t; });
        picked.clear(); why = {};
        res.picks.forEach(function (p) { var t = byKey[p.key]; if (t) { picked.add(t.id); why[t.id] = p.reason; } });
        planEl.innerHTML = '<div class="spr-plan-h">' + ico("sparkles", 15) + '<b>Propozycja AI</b><span class="muted">' + pl(picked.size, "zadanie", "zadania", "zadań") + " · " + pickedPts() + " pkt</span></div>" +
          (res.goal ? '<div class="spr-plan-goal">' + ico("target", 14) + "<span>" + esc(res.goal) + '</span><button type="button" class="chip-btn sm" data-goal>' + (sp.goal ? "Zamień cel" : "Ustaw jako cel") + "</button></div>" : "") +
          (res.note ? '<p class="muted">' + esc(res.note) + "</p>" : "") +
          (res.risks.length ? '<ul class="spr-risks">' + res.risks.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : "");
        SP.hydrateIcons(planEl);
        planBtn.disabled = false; planBtn.querySelector("span").textContent = "Jeszcze raz";
        draw();
        var first = list.querySelector(".spr-add-i.ai"); if (first) first.scrollIntoView({ block: "nearest" });
      }, function (err) {
        busy = false; if (!bg.isConnected) return;
        planBtn.disabled = false; planBtn.querySelector("span").textContent = "Spróbuj ponownie";
        planEl.innerHTML = '<div class="spr-plan-h spr-err">' + esc(err.message || "Błąd AI") + "</div>";
      });
    }
    list.addEventListener("change", function (e) { var c = e.target; if (c.type === "checkbox") { c.checked ? picked.add(c.value) : picked.delete(c.value); sum(); } });
    inp.addEventListener("input", draw);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    bg.querySelector("[data-fill]").onclick = fill;
    planBtn.onclick = askPlan;
    planEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-goal]"); if (!b || !plan) return;
      db.updateSprint(sp.id, { goal: plan.goal }); sp = db.sprint(sp.id); b.textContent = "Ustawiono ✓"; b.disabled = true;
    });
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape" && !document.querySelector(".popover")) { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.querySelector("[data-cancel]").onclick = close;
    bg.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault(); if (!picked.size) { close(); return; }
      db.setSprint(Array.from(picked), sp.id); SP.toast("Dodano " + pl(picked.size, "zadanie", "zadania", "zadań") + " do " + sp.name); close();
    });
    document.body.appendChild(bg); SP.hydrateIcons(bg); draw(); inp.focus();
    if (o.ai) askPlan();
  }
  function completeSprint(sp) {
    var open = db.sprintTasks(sp.id).filter(function (t) { return !closed(t); });
    var finish = function (to) {
      db.completeSprint(sp.id, to);
      var r = db.sprint(sp.id).result;
      SP.toast(sp.name + " zakończony: " + r.done + "/" + r.tasks + " zadań" + (r.points ? ", " + r.pointsDone + " pkt" : "") + " – czas na retrospektywę");
      if (SP.celebrate) SP.celebrate(innerWidth / 2, innerHeight / 3);
      setTimeout(function () { var el = document.getElementById("spr-retro"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 400);
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
  /* ---- Obciążenie zespołu: punkty (albo zadania) na osobę, ukończone + otwarte ---- */
  function workloadHTML(tasks, usePts, who) {
    var m = {}, order = [];
    tasks.forEach(function (t) {
      (t.assignees.length ? t.assignees : ["_none"]).forEach(function (id) {
        if (!m[id]) { m[id] = { id: id, total: 0, done: 0, n: 0, open: 0 }; order.push(id); }
        var w = m[id], v = usePts ? Number(t.points) || 0 : 1; w.total += v; w.n++; if (closed(t)) w.done += v; else w.open++;
      });
    });
    var rows = order.map(function (k) { return m[k]; }).sort(function (a, b) { return b.total - a.total || b.n - a.n; });
    if (!rows.length) return '<div class="empty-s">Dodaj zadania, a zobaczysz, kto ile ma pracy.</div>';
    var people = rows.filter(function (r) { return r.id !== "_none"; }), max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1]));
    var avg = people.length ? people.reduce(function (s, r) { return s + r.total; }, 0) / people.length : 0, unit = usePts ? " pkt" : "";
    return '<div class="wl">' + rows.map(function (r) {
      var over = people.length >= 2 && r.id !== "_none" && r.total > avg * 1.4 && r.total - r.done > 0;
      var name = r.id === "_none" ? "Bez osoby" : personName(r.id);
      return '<button class="wl-r' + (who === r.id ? " on" : "") + (over ? " over" : "") + '" data-who="' + r.id + '" title="' + esc(name + ": " + r.n + " zad., otwartych " + r.open + (over ? " – dużo więcej niż średnio w zespole" : "") + " · kliknij, by filtrować tablicę") + '">' +
        '<span class="wl-l">' + (r.id === "_none" ? '<span class="av av-xs av-empty">?</span>' : SP.avatar(r.id, "xs")) + "<span>" + esc(name) + "</span>" + (over ? '<span class="wl-warn">przeciążenie</span>' : "") + "</span>" +
        '<span class="wl-t"><i class="d" style="width:' + (r.done / max * 100) + '%"></i><i class="o" style="width:' + ((r.total - r.done) / max * 100) + '%"></i></span>' +
        '<b class="wl-v">' + r.done + " / " + r.total + unit + "</b></button>";
    }).join("") + '</div><div class="bd-legend"><span><i class="wl-k d"></i>Ukończone</span><span><i class="wl-k o"></i>Do zrobienia</span>' + (usePts ? "" : '<span class="muted">liczone w zadaniach – dodaj punkty, by ważyć pracę</span>') + "</div>";
  }

  /* ---- Przegląd / retrospektywa: sp.retro = {summary, health, risks[], at, model, good[], bad[], actions[]} ---- */
  var reviewing = {};
  var rid = function () { return "r" + Math.random().toString(36).slice(2, 9); };
  function retroOf(sp) {
    var r = sp.retro || {};
    return { summary: r.summary || "", health: r.health || null, risks: (r.risks || []).slice(), at: r.at || null, model: r.model || "",
      good: (r.good || []).slice(), bad: (r.bad || []).slice(), actions: (r.actions || []).map(function (a) { return Object.assign({}, a); }) };
  }
  /** Dane sprintu dla AI (przegląd, stand-up, pytania). */
  function aiCtx(sp) {
    var tasks = db.sprintTasks(sp.id), bd = burnData(sp, tasks), sc = db.sprintScope(sp.id);
    return { sprint: sp, tasks: tasks, stats: sp.state === "done" && sp.result ? sp.result : db.sprintStats(sp.id), velocity: velocityOf(sp.spaceId, sp.id).avg,
      burn: bd ? bd.days.map(function (d, i) { return bd.remaining[i] == null ? null : { day: d, left: bd.remaining[i], ideal: bd.ideal(i) }; }).filter(Boolean) : [],
      scope: { tasks: sc.tasks, points: sc.points, keys: sc.ids.map(function (id) { return db.taskKey(db.task(id)); }) } };
  }
  function runReview(sp) {
    if (!aiOn()) { goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby AI przygotowało " + (sp.state === "done" ? "retrospektywę" : "przegląd")); return; }
    if (reviewing[sp.id]) return;
    var tasks = db.sprintTasks(sp.id);
    if (!tasks.length && !(sp.result && sp.result.tasks)) { SP.toast("Sprint nie ma zadań – nie ma czego analizować"); return; }
    reviewing[sp.id] = true; SP.rerender();
    var mine = retroOf(sp);
    var human = function (a) { return a.filter(function (x) { return !x.ai; }); };
    SP.ai.reviewSprint(Object.assign(aiCtx(sp), { retro: { good: human(mine.good), bad: human(mine.bad), actions: human(mine.actions) } })).then(function (res) {
      delete reviewing[sp.id];
      var cur = db.sprint(sp.id); if (!cur) return;
      var r = retroOf(cur);
      // Poprzednie punkty AI zastępujemy nowymi; działania, z których powstały zadania, zostają.
      r.good = human(r.good).concat(res.went_well.map(function (x) { return { id: rid(), text: x, ai: true }; }));
      r.bad = human(r.bad).concat(res.to_improve.map(function (x) { return { id: rid(), text: x, ai: true }; }));
      r.actions = r.actions.filter(function (a) { return !a.ai || a.taskId; }).concat(res.actions.map(function (a) { return { id: rid(), text: a.title, assignee: findPerson(a.assignee), why: a.reason, ai: true }; }));
      r.summary = res.summary; r.health = res.health; r.risks = res.risks; r.at = new Date().toISOString(); r.model = res.model || "";
      db.updateSprint(cur.id, { retro: r });
      SP.toast((cur.state === "done" ? "Retrospektywa" : "Przegląd") + " gotowy – " + (HEALTH[res.health] || [""])[0].toLowerCase());
    }, function (err) { delete reviewing[sp.id]; SP.rerender(); SP.toast(err.message || "Błąd AI"); });
  }
  var RETRO_COLS = [["good", "Co poszło dobrze", "trophy", "Np. szybkie przeglądy kodu"], ["bad", "Do poprawy", "flag", "Np. za dużo zadań bez punktów"], ["actions", "Działania", "zap", "Np. Oceniać zadania przed sprintem @Anna"]];
  function retroHTML(sp) {
    var r = retroOf(sp), done = sp.state === "done", busy = reviewing[sp.id];
    var aiLbl = busy ? spin("AI analizuje sprint…") : ico("sparkles", 13) + (r.at ? "Odśwież z AI" : done ? "Retro z AI" : "Przegląd z AI");
    return '<section class="card spr-retro" id="spr-retro"><div class="card-h"><h2>' + (done ? "Retrospektywa" : "Przegląd sprintu") + "</h2>" + (r.health ? healthPill(r.health, "Ocena AI z ostatniego przeglądu") : "") +
      '<span class="grow"></span><button class="chip-btn sm magic" data-r="ai"' + (busy ? " disabled" : "") + ">" + aiLbl + "</button></div><div class=\"card-b\">" +
      (r.summary ? '<div class="retro-ai"><p>' + esc(r.summary) + "</p>" + (r.risks.length ? '<ul class="spr-risks">' + r.risks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
        '<small class="muted">' + ico("sparkles", 11) + "AI · " + SP.ago(r.at) + (r.model ? " · " + esc(modelLabel(r.model)) : "") + "</small></div>"
        : !done ? '<p class="muted retro-hint">Zapisujcie na bieżąco, co działa, a co przeszkadza – na koniec sprintu macie gotową retrospektywę.' + (aiOn() ? "" : " Z kluczem AI Claude przygotuje przegląd sam.") + "</p>" : "") +
      '<div class="retro-cols">' + RETRO_COLS.map(function (c) {
        var items = r[c[0]];
        return '<div class="retro-col" data-col="' + c[0] + '"><h3>' + ico(c[2], 15) + c[1] + '<span class="muted">' + items.length + "</span></h3><ul>" + items.map(function (x) {
          var task = x.taskId && db.task(x.taskId);
          return '<li class="retro-i' + (x.ai ? " ai" : "") + '" data-id="' + x.id + '"' + (x.why ? ' title="' + esc(x.why) + '"' : "") + "><span>" + esc(x.text) + "</span>" +
            (c[0] === "actions" ? (x.assignee && db.person(x.assignee) ? SP.avatar(x.assignee, "xs") : "") +
              (task ? '<button class="chip-btn sm" data-r="open" data-t="' + task.id + '">' + SP.statusDot(task.status) + db.taskKey(task) + "</button>" : '<button class="chip-btn sm" data-r="task" title="Utwórz zadanie w backlogu">' + ico("plus", 12) + "Zadanie</button>") : "") +
            '<button class="ibtn sm" data-r="del" title="Usuń">' + ico("x", 12) + "</button></li>";
        }).join("") + '</ul><form class="retro-add" data-col="' + c[0] + '"><input placeholder="' + esc(c[3]) + '" maxlength="300" /></form></div>';
      }).join("") + "</div></div></section>";
  }
  function bindRetro(el, sp) {
    var card = el.querySelector(".spr-retro"); if (!card) return;
    var edit = function (fn) { var cur = db.sprint(sp.id); if (!cur) return; var r = retroOf(cur); fn(r); db.updateSprint(cur.id, { retro: r }); };
    card.addEventListener("click", function (e) {
      var b = e.target.closest("[data-r]"); if (!b) return;
      var li = b.closest(".retro-i"), col = b.closest(".retro-col"), id = li && li.dataset.id, k = col && col.dataset.col;
      if (b.dataset.r === "ai") runReview(sp);
      else if (b.dataset.r === "del") edit(function (r) { r[k] = r[k].filter(function (x) { return x.id !== id; }); });
      else if (b.dataset.r === "open") SP.openTask(b.dataset.t);
      else if (b.dataset.r === "task") {
        var listId = (db.raw.lists.find(function (l) { return l.spaceId === sp.spaceId; }) || {}).id;
        if (!listId) { SP.toast("Ta przestrzeń nie ma jeszcze listy"); return; }
        edit(function (r) {
          var a = r.actions.find(function (x) { return x.id === id; }); if (!a) return;
          var p = SP.parseQuick ? SP.parseQuick(a.text) : null;
          var f = p && SP.applyQuick ? SP.applyQuick(p, { listId: listId, assignees: [] }) : { listId: listId, title: a.text, assignees: [] };
          if (a.assignee && f.assignees.indexOf(a.assignee) < 0) f.assignees.push(a.assignee);
          f.tags = (f.tags || []).concat(["retro"]);
          f.desc = "<p>Działanie z retrospektywy „" + esc(sp.name) + "”." + (a.why ? " " + esc(a.why) : "") + "</p>";
          var t = db.createTask(f); a.taskId = t.id;
          SP.toast("Utworzono " + db.taskKey(t) + " w backlogu");
        });
      }
    });
    card.querySelectorAll(".retro-add").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault(); var inp = form.querySelector("input"), v = inp.value.trim(), k = form.dataset.col; if (!v) return;
        edit(function (r) {
          var item = { id: rid(), text: v };
          if (k === "actions") { var m = v.match(/@([\p{L}][\p{L}-]*(?:\s[\p{L}][\p{L}-]*)?)/u), pid = m && findPerson(m[1]); if (pid) { item.assignee = pid; item.text = v.replace(m[0], "").replace(/\s{2,}/g, " ").trim(); } }
          r[k].push(item);
        });
        setTimeout(function () { var again = document.querySelector('.spr-retro .retro-add[data-col="' + k + '"] input'); if (again) again.focus(); }, 0);
      });
    });
  }

  /* ---- Planowanie (sprint zaplanowany): pojemność, punkty, gotowość ---- */
  function planHTML(sp, tasks, vel) {
    var pts = sumPts(tasks), noPts = tasks.filter(function (t) { return t.points == null; }).length, noWho = tasks.filter(function (t) { return !t.assignees.length; }).length;
    var cap = vel.avg, over = cap && pts > cap * 1.1, scale = Math.max(cap, pts) || 1;
    var checks = [
      [tasks.length > 0, tasks.length ? pl(tasks.length, "zadanie", "zadania", "zadań") + " w sprincie" : "Dodaj zadania z backlogu"],
      tasks.length ? [!noPts, noPts ? pl(noPts, "zadanie", "zadania", "zadań") + " bez punktów" : "Wszystkie zadania mają punkty"] : null,
      tasks.length ? [!noWho, noWho ? pl(noWho, "zadanie", "zadania", "zadań") + " bez osoby" : "Każde zadanie ma osobę"] : null,
      [!!sp.goal, sp.goal ? "Cel sprintu ustawiony" : "Brak celu sprintu"],
      [!over, cap ? (over ? "Ponad pojemność: " : "Mieści się w pojemności: ") + pts + " / ~" + cap + " pkt" : "Pojemność poznasz po pierwszym sprincie"],
    ].filter(Boolean);
    return '<section class="card spr-planc"><div class="card-h"><h2>Gotowość do startu</h2></div><div class="card-b">' +
      (cap ? '<div class="spr-cap"><div class="spr-cap-h"><span>Zaplanowane <b>' + pts + ' pkt</b></span><span class="' + (over ? "spr-over" : "muted") + '">średnia prędkość ~' + cap + ' pkt</span></div><span class="spr-bar cap' + (over ? " over" : "") + '"><i style="width:' + Math.round(pts / scale * 100) + '%"></i></span></div>' : "") +
      '<ul class="spr-checks">' + checks.map(function (c) { return '<li class="' + (c[0] ? "ok" : "") + '">' + ico(c[0] ? "check" : "circle", 14) + "<span>" + esc(c[1]) + "</span></li>"; }).join("") + "</ul>" +
      '<div class="spr-plan-acts"><button class="chip-btn sm magic" data-a="ai-plan">' + ico("sparkles", 13) + "Zaplanuj z AI</button>" +
      (noPts ? '<button class="chip-btn sm" data-a="poker">' + ico("kanban-card", 13) + "Planning poker (" + noPts + ")</button>" : "") +
      (noPts ? '<button class="chip-btn sm magic" data-a="ai-est">' + ico("sparkles", 13) + "Oszacuj punkty (" + noPts + ")</button>" : "") +
      (!sp.goal ? '<button class="chip-btn sm" data-a="edit">' + ico("target", 13) + "Ustaw cel</button>" : "") + "</div></div></section>";
  }

  /* =================== Daily stand-up =================== */
  function prevWorkday(day) { var x = new Date(day + "T00:00:00"); do { x.setDate(x.getDate() - 1); } while (x.getDay() === 0 || x.getDay() === 6); return D.ymd(x); }
  function dowName(day) { return new Date(day + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "long" }); }
  /** Na osobę: co skończyła od poprzedniego dnia roboczego, nad czym pracuje, co dalej, co blokuje. */
  function standupData(sp) {
    var tasks = db.sprintTasks(sp.id), today = D.today(), since = prevWorkday(today), m = {}, order = [];
    function get(id) { if (!m[id]) { m[id] = { id: id, done: [], doing: [], next: [], blocked: [] }; order.push(id); } return m[id]; }
    tasks.slice().sort(byImportance).forEach(function (t) {
      (t.assignees.length ? t.assignees : ["_none"]).forEach(function (id) {
        var p = get(id);
        if (closed(t)) { if (t.doneAt && D.ymd(new Date(t.doneAt)) >= since) p.done.push(t); return; }
        if (t.status === "todo") p.next.push(t); else p.doing.push(t);
        if (db.isBlocked(t)) p.blocked.push({ t: t, why: "czeka na " + db.waitingOn(t).filter(function (x) { return !closed(x); }).map(db.taskKey).join(", ") });
        else if (t.due && t.due < today) p.blocked.push({ t: t, why: "po terminie (" + shortDate(t.due) + ")" });
        else if (t.status !== "todo" && t.updatedAt && daysBetween(D.ymd(new Date(t.updatedAt)), today) >= 3) p.blocked.push({ t: t, why: "bez zmian od " + pl(daysBetween(D.ymd(new Date(t.updatedAt)), today), "dnia", "dni", "dni") });
      });
    });
    var people = order.map(function (k) { return m[k]; }).sort(function (a, b) { return (a.id === "_none") - (b.id === "_none") || (a.id === "me" ? -1 : b.id === "me" ? 1 : personName(a.id).localeCompare(personName(b.id), "pl")); });
    var sinceLbl = since === D.add(today, -1) ? "Wczoraj" : "Od " + (dowName(since) === "piątek" ? "piątku" : shortDate(since));
    return { people: people, since: since, sinceLbl: sinceLbl, tasks: tasks };
  }
  function standupText(sp, d) {
    var st = db.sprintStats(sp.id), len = isDay(sp.start) && isDay(sp.end) ? daysBetween(sp.start, sp.end) + 1 : null, no = isDay(sp.start) ? daysBetween(sp.start, D.today()) + 1 : null;
    var k = function (t) { return db.taskKey(t) + " " + t.title; };
    var out = ["Stand-up – " + sp.name + ", " + dowName(D.today()) + " " + shortDate(D.today()) + (no && len ? " (dzień " + Math.min(no, len) + " z " + len + ")" : "") + " · " + st.pointsDone + "/" + st.points + " pkt, " + st.done + "/" + st.tasks + " zadań"];
    d.people.forEach(function (p) {
      out.push("", p.id === "_none" ? "Bez osoby" : personName(p.id));
      if (p.done.length) out.push("  " + d.sinceLbl + " ukończone: " + p.done.map(k).join("; "));
      out.push("  Dziś: " + (p.doing.length ? p.doing.map(k).join("; ") : p.next.length ? "(nic w toku) następne: " + k(p.next[0]) : "brak otwartych zadań – wolne moce"));
      if (p.blocked.length) out.push("  Blokery: " + p.blocked.map(function (b) { return db.taskKey(b.t) + " – " + b.why; }).join("; "));
    });
    return out.join("\n");
  }
  function standupDialog(sp, withAI) {
    var d = standupData(sp);
    var S = aiShell("Stand-up · " + sp.name, dowName(D.today()).replace(/^./, function (c) { return c.toUpperCase(); }) + ", " + shortDate(D.today()) + " – co zrobione, co dziś, co blokuje.", "users", { noGo: true, cls: "spr-su" });
    var row = function (t, extra) { return '<button class="su-t" data-t="' + t.id + '">' + SP.statusDot(t.status) + '<span class="ct-key">' + db.taskKey(t) + "</span><span>" + esc(t.title) + "</span>" + pointsChip(t) + (extra ? '<small class="su-why">' + esc(extra) + "</small>" : "") + "</button>"; };
    var sec = function (cls, label, items) { return items.length ? '<div class="su-sec ' + cls + '"><h4>' + label + "</h4>" + items.join("") + "</div>" : ""; };
    S.body.innerHTML = '<div class="su-ai" hidden></div><div class="su-grid">' + (d.people.map(function (p, i) {
      return '<section class="su-p" style="--i:' + i + '"><header>' + (p.id === "_none" ? '<span class="av av-xs av-empty">?</span>' : SP.avatar(p.id, "sm")) + "<b>" + esc(p.id === "_none" ? "Bez osoby" : personName(p.id)) + "</b>" +
        (p.blocked.length ? '<span class="wl-warn">' + pl(p.blocked.length, "bloker", "blokery", "blokerów") + "</span>" : "") + "</header>" +
        sec("done", d.sinceLbl + " ukończone", p.done.map(function (t) { return row(t); })) +
        sec("doing", "Dziś w toku", p.doing.map(function (t) { return row(t); })) +
        (!p.doing.length ? sec("next", p.next.length ? "Następne do wzięcia" : "Dziś", p.next.length ? p.next.slice(0, 2).map(function (t) { return row(t); }) : ['<p class="muted su-empty">Brak otwartych zadań – wolne moce, można przejąć coś od innych.</p>']) : "") +
        sec("blocked", "Blokery", p.blocked.map(function (b) { return row(b.t, b.why); })) + "</section>";
    }).join("") || '<div class="empty-s">W sprincie nie ma jeszcze zadań.</div>') + "</div>";
    S.info.textContent = d.people.length ? pl(d.people.reduce(function (s, p) { return s + p.done.length; }, 0), "zadanie ukończone", "zadania ukończone", "zadań ukończonych") + " od " + (d.sinceLbl === "Wczoraj" ? "wczoraj" : shortDate(d.since)) + " · " +
      pl(d.people.reduce(function (s, p) { return s + p.blocked.length; }, 0), "bloker", "blokery", "blokerów") : "";
    S.acts.innerHTML = '<button class="btn sm" data-copy>' + ico("copy", 14) + "Kopiuj</button>" + '<button class="btn sm" data-send>' + ico("send-horizontal", 14) + "Wyślij</button>" + '<button class="btn sm magic" data-su-ai>' + ico("sparkles", 14) + "<span>" + (aiOn() ? "Podsumuj z AI" : "Włącz AI") + "</span></button>";
    SP.hydrateIcons(S.bg);
    var aiEl = S.body.querySelector(".su-ai"), aiRes = null;
    function fullText() {
      var text = standupText(sp, d);
      if (aiRes) text = "Podsumowanie: " + aiRes.summary + (aiRes.focus.length ? "\nNa dziś:\n" + aiRes.focus.map(function (x) { return "- " + x; }).join("\n") : "") + (aiRes.blockers.length ? "\nZagrożenia:\n" + aiRes.blockers.map(function (x) { return "- " + x; }).join("\n") : "") + "\n\n" + text;
      return text;
    }
    function copy() {
      (navigator.clipboard ? navigator.clipboard.writeText(fullText()) : Promise.reject()).then(function () { SP.toast("Skopiowano stand-up – wklej na czat zespołu"); }, function () { SP.toast("Nie udało się skopiować"); });
    }
    function askAI() {
      if (!aiOn()) { S.close(); goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby AI podsumowało stand-up"); return; }
      var b = S.acts.querySelector("[data-su-ai]"); if (b.disabled) return;
      b.disabled = true; b.querySelector("span").textContent = "AI pisze…";
      aiEl.hidden = false; aiEl.innerHTML = spin("AI czyta sprint i raport dnia…");
      SP.ai.standup(Object.assign(aiCtx(sp), { report: standupText(sp, d) })).then(function (res) {
        if (!S.open) return; aiRes = res;
        var list = function (lbl, a, cls) { return a.length ? '<div class="su-ai-l ' + cls + '"><b>' + lbl + "</b><ul>" + a.map(function (x) { return "<li>" + linkKeys(esc(x)) + "</li>"; }).join("") + "</ul></div>" : ""; };
        aiEl.innerHTML = '<p>' + linkKeys(esc(res.summary)) + "</p>" + '<div class="su-ai-cols">' + list("Na dziś", res.focus, "f") + list("Zagrożenia", res.blockers, "b") + list("Rady", res.suggestions, "s") + "</div>" +
          '<small class="muted">' + ico("sparkles", 11) + "AI · " + esc(modelLabel(res.model)) + "</small>";
        SP.hydrateIcons(aiEl);
        b.disabled = false; b.querySelector("span").textContent = "Jeszcze raz";
      }, function (err) {
        if (!S.open) return;
        b.disabled = false; b.querySelector("span").textContent = "Spróbuj ponownie";
        aiEl.innerHTML = '<span class="spr-err">' + esc(err.message || "Błąd AI") + "</span>";
      });
    }
    S.bg.addEventListener("click", function (e) {
      var t = e.target.closest("[data-t]");
      if (t) { S.close(); SP.openTask(t.dataset.t); return; }
      var snd = e.target.closest("[data-send]");
      if (snd) { SP.shareText(snd, { subject: "Stand-up – " + sp.name + ", " + shortDate(D.today()), text: fullText() }); return; }
      if (e.target.closest("[data-copy]")) copy();
      else if (e.target.closest("[data-su-ai]")) askAI();
    });
    if (withAI) askAI();
  }
  /** „SP-12” w tekście AI → przycisk otwierający zadanie (tekst już escapowany). */
  function linkKeys(html) {
    return html.replace(/\bSP-(\d+)\b/g, function (k, n) {
      var t = db.raw.tasks.find(function (x) { return String(x.num) === n; });
      return t ? '<button class="su-key" data-t="' + t.id + '" title="' + esc(t.title) + '">' + k + "</button>" : k;
    });
  }

  /* =================== Zapytaj AI o sprint =================== */
  var askHist = {};
  function askDialog(sp) {
    if (!aiOn()) { goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby pytać AI o sprint"); return; }
    var hist = askHist[sp.id] = askHist[sp.id] || [];
    var S = aiShell("Zapytaj o " + sp.name, "Claude odpowiada na podstawie zadań, postępu i obciążenia w tym sprincie.", "message-square", { noGo: true, cls: "spr-ask" });
    var other = db.sprintTasks(sp.id).reduce(function (a, t) { return a.concat(t.assignees); }, []).filter(function (id) { return id !== "me"; })[0];
    var sugg = ["Czy zdążymy z celem sprintu?", "Kto ma najwięcej pracy?", "Które zadania są zagrożone i dlaczego?", other ? "Co zostało dla " + personName(other).split(" ")[0] + "?" : "Co zostało mi do zrobienia?", "Co przenieść, jeśli nie zdążymy?"];
    S.info.remove();
    S.body.innerHTML = '<div class="ask-log"></div><div class="ask-sugg">' + sugg.map(function (q) { return '<button class="chip-btn sm" data-q="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div>";
    var foot = S.bg.querySelector(".pt-f");
    foot.innerHTML = '<form class="ask-f"><input class="input" placeholder="Zadaj pytanie o sprint…" maxlength="500" /><button class="btn primary sm" type="submit">' + ico("send-horizontal", 15) + "</button></form>";
    SP.hydrateIcons(S.bg);
    var log = S.body.querySelector(".ask-log"), inp = foot.querySelector("input"), busy = false;
    function bubble(q, a, i) {
      return '<div class="ask-q">' + esc(q) + "</div>" + '<div class="ask-a" style="--i:' + (i || 0) + '">' + (a == null ? spin("AI myśli…") : linkKeys(esc(a)).replace(/\n/g, "<br>")) + "</div>";
    }
    function draw() { log.innerHTML = hist.map(function (h) { return bubble(h.q, h.a); }).join(""); S.body.querySelector(".ask-sugg").hidden = hist.length > 0; log.lastElementChild && log.lastElementChild.scrollIntoView({ block: "end" }); }
    function ask(q) {
      q = (q || "").trim(); if (!q || busy) return;
      busy = true; inp.value = ""; S.body.querySelector(".ask-sugg").hidden = true;
      log.insertAdjacentHTML("beforeend", bubble(q, null)); var a = log.lastElementChild; a.scrollIntoView({ block: "end" });
      SP.ai.askSprint(aiCtx(sp), q, hist, function (snap) {
        var m = snap.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/); if (m && S.open) { try { a.textContent = JSON.parse('"' + m[1].replace(/\\$/, "") + '"'); } catch (e) {} }
      }).then(function (res) {
        busy = false; hist.push({ q: q, a: res.answer }); if (S.open) { draw(); inp.focus(); }
      }, function (err) {
        busy = false; if (!S.open) return;
        a.innerHTML = '<span class="spr-err">' + esc(err.message || "Błąd AI") + "</span>";
      });
    }
    foot.querySelector("form").addEventListener("submit", function (e) { e.preventDefault(); ask(inp.value); });
    S.bg.addEventListener("click", function (e) {
      var b = e.target.closest("[data-q]"); if (b) { ask(b.dataset.q); return; }
      var t = e.target.closest("[data-t]"); if (t) { S.close(); SP.openTask(t.dataset.t); }
    });
    draw(); inp.focus();
  }
  SP.sprintStandup = function (id) { var sp = db.sprint(id); if (sp) standupDialog(sp); };

  /* =================== Historia sprintów (dotrzymanie planu) =================== */
  function historyHTML(done) {
    var rows = done.slice(0, 10).filter(function (x) { return x.result; });
    if (!rows.length) return "";
    var commit = function (x) { var r = x.result, plan = r.planned != null ? r.planned : r.points; return plan ? Math.round(r.pointsDone / plan * 100) : null; };
    var cs = rows.map(commit).filter(function (v) { return v != null; }), avg = cs.length ? Math.round(cs.reduce(function (a, b) { return a + b; }, 0) / cs.length) : null;
    return '<section class="card"><div class="card-h"><h2>Historia sprintów</h2><span class="muted">' + (avg != null ? "dotrzymanie planu średnio " + avg + "%" : "") + '</span></div><div class="card-b ts-scroll"><table class="hist-tbl"><thead><tr><th>Sprint</th><th title="Punkty na starcie sprintu">Plan</th><th>Zrobione</th><th title="Zrobione / plan">Plan %</th><th title="Dodane po starcie">Dodane</th><th title="Przeniesione dalej">Dalej</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var r = x.result, c = commit(x), plan = r.planned != null ? r.planned : r.points;
        return '<tr data-href="#/sprint/' + x.id + '"><td><a href="#/sprint/' + x.id + '">' + esc(x.name) + "</a></td><td>" + plan + "</td><td>" + (r.pointsDone || 0) + "</td>" +
          '<td><span class="hist-c ' + (c == null ? "" : c >= 85 ? "ok" : c >= 60 ? "mid" : "low") + '">' + (c == null ? "—" : c + "%") + "</span></td><td>" + (r.added ? "+" + (r.addedPoints ? r.addedPoints + " pkt" : r.added + " zad.") : "–") + "</td><td>" + (r.carried || "–") + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  views.sprint = {
    title: function (p) { var sp = db.sprint(p.id); return sp ? sp.name : "Sprint"; },
    crumbs: function (p) {
      var sp = db.sprint(p.id);
      return [{ icon: "gauge", label: "Sprinty", href: "#/sprints" }, { label: sp ? sp.name : "Nie znaleziono" }];
    },
    render: function (el, p) {
      var V = views.sprint, sp = db.sprint(p.id);
      if (!sp) { el.innerHTML = '<div class="page"><div class="empty-b">' + ico("gauge", 44) + '<h3>Nie ma takiego sprintu</h3><a class="btn" href="#/sprints">Wszystkie sprinty</a></div></div>'; return; }
      if (V.whoFor !== sp.id) { V.who = null; V.whoFor = sp.id; }
      var tasks = db.sprintTasks(sp.id), st = db.sprintStats(sp.id), bd = burnData(sp, tasks), health = healthOf(sp, bd), vel = velocityOf(sp.spaceId, sp.id);
      var left = isDay(sp.end) ? daysBetween(D.today(), sp.end) : null, len = isDay(sp.start) && isDay(sp.end) ? daysBetween(sp.start, sp.end) + 1 : null;
      var dayNo = sp.state === "active" && isDay(sp.start) ? Math.min(len, Math.max(1, daysBetween(sp.start, D.today()) + 1)) : null;
      var overCap = sp.state !== "done" && vel.avg && st.points > vel.avg * 1.1;
      var noPts = tasks.filter(function (t) { return t.points == null && !closed(t); });
      var scope = db.sprintScope(sp.id); scopeIds = {}; scope.ids.forEach(function (id) { scopeIds[id] = 1; });
      var scopeNote = sp.plan && scope.tasks ? "zakres +" + (bd && bd.usePts ? scope.points + " pkt" : pl(scope.tasks, "zadanie", "zadania", "zadań")) + " po starcie" : "";
      var tiles = [
        ["hash", "Punkty", st.pointsDone + " / " + st.points, overCap ? "Ponad pojemność (~" + vel.avg + " pkt)" : st.points ? Math.round(st.pointsDone / st.points * 100) + "% ukończone" + (vel.avg ? " · pojemność ~" + vel.avg : "") : "Oceń zadania w punktach", overCap ? "bad" : ""],
        ["list-checks", "Zadania", st.done + " / " + st.tasks, st.tasks - st.done ? pl(st.tasks - st.done, "otwarte", "otwarte", "otwartych") + (noPts.length ? " · " + noPts.length + " bez punktów" : "") + (scopeNote ? " · " + scopeNote : "") : st.tasks ? "Wszystko zrobione 🎉" : "Dodaj zadania z backlogu", scopeNote ? "warn" : ""],
        ["calendar", sp.state === "done" ? "Zakończony" : "Do końca", sp.state === "done" ? shortDate(D.ymd(new Date(sp.closedAt))) : left == null ? "—" : left < 0 ? "−" + -left + " d" : left + " d",
          sp.state === "done" ? (sp.result && sp.result.carried ? pl(sp.result.carried, "zadanie przeszło", "zadania przeszły", "zadań przeszło") + " dalej" : "Bez zaległości") : dayNo ? "dzień " + dayNo + " z " + len : len ? pl(len, "dzień", "dni", "dni") + " sprintu" : "", left != null && left < 0 && sp.state !== "done" ? "bad" : ""],
        ["clock", "Czas pracy", SP.charts ? SP.charts.hours(tasks.reduce(function (s, t) { return s + db.timeTotal(t) + db.subtasks(t.id).reduce(function (a, x) { return a + db.timeTotal(x); }, 0); }, 0)) : "", "zadania sprintu (stoper i wpisy)"],
      ];
      var act = sp.state === "planned" ? '<button class="btn primary sm" data-a="start">' + ico("play", 14) + "Rozpocznij sprint</button>"
        : sp.state === "active" ? '<button class="btn primary sm" data-a="complete">' + ico("check", 14) + "Zakończ sprint</button>" : "";
      // Filtr tablicy po osobie
      var who = V.who, inSprint = {};
      tasks.forEach(function (t) { (t.assignees.length ? t.assignees : ["_none"]).forEach(function (id) { inSprint[id] = 1; }); });
      if (who && !inSprint[who]) who = V.who = null;
      var shown = who ? tasks.filter(function (t) { return who === "_none" ? !t.assignees.length : t.assignees.indexOf(who) >= 0; }) : tasks;
      var whoIds = Object.keys(inSprint);
      var whoBar = whoIds.length > 1 ? '<div class="spr-who" role="group" aria-label="Pokaż zadania osoby"><button class="chip-btn sm' + (!who ? " on" : "") + '" data-who="">Wszyscy</button>' + whoIds.map(function (id) {
        return '<button class="chip-btn sm' + (who === id ? " on" : "") + '" data-who="' + id + '">' + (id === "_none" ? "Bez osoby" : SP.avatar(id, "xs") + esc(personName(id))) + "</button>";
      }).join("") + "</div>" : "";

      el.innerHTML = '<div class="page sprint"><div class="page-h spr-h"><h1>' + esc(sp.name) + "</h1>" + statePill(sp) + (health ? healthPill(health, "Prognoza z dotychczasowego tempa spalania") : "") + '<span class="muted">' + esc((db.space(sp.spaceId) || {}).name || "") + " · " + range(sp.start, sp.end) + "</span>" +
        '<span class="grow"></span>' + (sp.state === "active" ? '<button class="btn sm" data-a="standup" title="Kto co zrobił, co robi dziś i co blokuje">' + ico("users", 14) + "Stand-up</button>" : "") +
        '<button class="btn sm magic" data-a="ai">' + ico("sparkles", 14) + "AI</button>" + (sp.state !== "done" ? '<button class="btn sm" data-a="add">' + ico("plus", 14) + "Dodaj zadania</button>" : "") + act +
        '<button class="ibtn" data-a="more" title="Więcej">' + ico("ellipsis", 16) + "</button></div>" +
        (sp.goal ? '<p class="spr-goal big">' + ico("target", 15) + esc(sp.goal) + "</p>" : "") +
        '<div class="kpis">' + tiles.map(function (k) {
          return '<div class="kpi' + (k[4] ? " " + k[4] : "") + '"><span class="kpi-ico">' + ico(k[0], 18) + '</span><span class="kpi-l">' + k[1] + '</span><b class="kpi-v">' + k[2] + '</b><small class="muted">' + esc(k[3]) + "</small></div>";
        }).join("") + "</div>" +
        '<section class="card spr-bd"><div class="card-h"><h2>Wykres spalania</h2><span class="muted">' + (st.points ? st.points + " pkt w sprincie" : st.tasks + " zadań") + (sp.plan ? " · na starcie " + (st.points ? sp.plan.points + " pkt" : sp.plan.tasks + " zad.") : "") + '</span></div><div class="card-b ch-b">' + burndown(sp, bd) + "</div></section>" +
        '<div class="spr-grid2"><section class="card spr-wl"><div class="card-h"><h2>Obciążenie zespołu</h2>' + (who ? '<button class="chip-btn sm" data-who="">' + ico("x", 12) + "Pokaż wszystkich</button>" : "") + '</div><div class="card-b">' + workloadHTML(tasks, bd ? bd.usePts : tasks.some(function (t) { return Number(t.points) > 0; }), who) + "</div></section>" +
        (sp.state === "planned" ? planHTML(sp, tasks, vel) : retroHTML(sp)) + "</div>" +
        whoBar +
        '<div class="board spr-board">' + db.STATUSES.map(function (s) {
          var items = shown.filter(function (t) { return t.status === s.id; }), pts = items.reduce(function (a, t) { return a + (Number(t.points) || 0); }, 0);
          return '<section class="col" data-status="' + s.id + '" style="--c:' + s.color + '"><div class="col-h"><span class="st-pill" style="--c:' + s.color + '">' + esc(s.name) + '</span><span class="grp-n">' + items.length + (pts ? " · " + pts + " pkt" : "") + "</span></div>" +
            '<div class="col-b">' + items.map(cardHTML).join("") + "</div>" +
            (sp.state !== "done" ? '<form class="col-add" data-status="' + s.id + '"><span class="add-plus">' + ico("plus", 14) + '</span><input placeholder="Nowe zadanie w sprincie" /></form>' : "") + "</section>";
        }).join("") + "</div></div>";

      function aiMenu(b) {
        if (!aiOn()) {
          SP.menu(b, [{ header: "Asystent sprintu (Claude)" }, { html: '<span class="pm-note">Szacowanie punktów, plan sprintu z backlogu, stand-up, pytania o sprint, przegląd i retrospektywa. Potrzebny własny klucz API Anthropic.</span>' }, "-",
            { label: "Włącz AI w Ustawieniach", icon: "settings", run: goAiSettings }], { align: "right" });
          return;
        }
        var open = tasks.filter(function (t) { return !closed(t); });
        SP.menu(b, [{ header: "Asystent sprintu (Claude)" },
          sp.state !== "done" ? { label: "Zaplanuj sprint z backlogu", icon: "wand-sparkles", run: function () { addTasksDialog(sp, { ai: true }); } } : null,
          noPts.length ? { label: "Oszacuj punkty (" + noPts.length + " bez punktów)", icon: "hash", run: function () { estimateDialog(noPts, sp.spaceId); } }
            : open.length ? { label: "Oszacuj ponownie otwarte zadania", icon: "hash", run: function () { estimateDialog(open, sp.spaceId); } } : null,
          sp.state === "active" ? { label: "Stand-up z podsumowaniem AI", icon: "users", run: function () { standupDialog(sp, true); } } : null,
          tasks.length ? { label: "Zapytaj o sprint…", icon: "message-square", run: function () { askDialog(sp); } } : null,
          tasks.some(closed) ? { label: "Notatki wydania z AI", icon: "megaphone", run: function () { SP.releaseNotes(sp, true); } } : null,
          sp.state !== "planned" ? { label: sp.state === "done" ? "Retrospektywa z AI" : "Przegląd sprintu z AI", icon: "sparkles", run: function () {
            runReview(sp); setTimeout(function () { var r = document.getElementById("spr-retro"); if (r) r.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
          } } : null,
        ].filter(Boolean), { align: "right" });
      }
      el.querySelector(".page").addEventListener("click", function (e) {
        var w = e.target.closest("[data-who]");
        if (w && !w.closest(".spr-board")) { V.who = w.dataset.who && V.who !== w.dataset.who ? w.dataset.who : null; SP.rerender(); return; }
        var b = e.target.closest("[data-a]"); if (!b) return;
        var a = b.dataset.a;
        if (a === "add") addTasksDialog(sp);
        else if (a === "ai") aiMenu(b);
        else if (a === "standup") standupDialog(sp);
        else if (a === "poker") SP.planningPoker(sp);
        else if (a === "ai-plan") { if (aiOn()) addTasksDialog(sp, { ai: true }); else { goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby planować z AI"); } }
        else if (a === "ai-est") estimateDialog(noPts, sp.spaceId);
        else if (a === "edit") sprintForm(sp);
        else if (a === "start") {
          var other = db.raw.sprints.find(function (x) { return x.spaceId === sp.spaceId && x.state === "active" && x.id !== sp.id; });
          (other ? SP.confirm("Rozpocząć " + sp.name + "?", "W tej przestrzeni trwa już „" + other.name + "”. Wróci on do zaplanowanych.", "Rozpocznij") : Promise.resolve(true)).then(function (ok) {
            if (!ok) return; db.startSprint(sp.id); if (!isDay(sp.start) || sp.start > D.today()) db.updateSprint(sp.id, { start: D.today() }); SP.toast(sp.name + " wystartował – powodzenia! 🚀");
          });
        } else if (a === "complete") completeSprint(sp);
        else if (a === "more") SP.menu(b, [
          { label: "Edytuj sprint", icon: "pencil", run: function () { sprintForm(sp); } },
          sp.state === "done" ? { label: "Otwórz ponownie", icon: "repeat", run: function () { db.updateSprint(sp.id, { state: "active", closedAt: null }); } } : null,
          { label: "Planning poker", icon: "kanban-card", run: function () { SP.planningPoker(sp); } },
          { label: "Raport do druku / PDF", icon: "printer", run: function () { SP.sprintReport(sp); } },
          { label: "Notatki wydania", icon: "megaphone", run: function () { SP.releaseNotes(sp); } },
          "-",
          { label: "Kopiuj podsumowanie", icon: "copy", run: function () { copySummary(sp); } },
          { label: "Wyślij podsumowanie…", icon: "send-horizontal", run: function () { setTimeout(function () { SP.shareText(b, { subject: "Podsumowanie: " + sp.name, text: summaryText(sp) }, { align: "right" }); }, 0); } },
          { label: "Wszystkie sprinty", icon: "gauge", run: function () { location.hash = "#/sprints"; } },
          "-",
          { label: "Usuń sprint", icon: "trash", danger: true, run: function () {
            SP.confirm("Usunąć " + sp.name + "?", "Zadania zostaną – wrócą do backlogu.").then(function (ok) { if (ok) { db.deleteSprint(sp.id); location.hash = "#/sprints"; SP.toast("Usunięto sprint"); } });
          } },
        ].filter(Boolean), { align: "right" });
      });
      bindRetro(el, sp);
      // karty: punkty, wyjmowanie, szybkie edycje, otwieranie
      var board = el.querySelector(".spr-board");
      board.addEventListener("click", function (e) {
        var host = e.target.closest("[data-task]"); if (!host) return;
        var t = db.task(host.dataset.task); if (!t) return;
        var q = e.target.closest("[data-q]");
        if (!q) { SP.openTask(t.id); return; }
        e.stopPropagation();
        if (q.dataset.q === "points") SP.pickPoints(q, t.points, function (v) { db.setPoints(t.id, v); }, t.id);
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
          var base = { listId: listId, status: form.dataset.status, assignees: who && who !== "_none" ? [who] : [], sprintId: sp.id };
          var at = { sprintId: sp.id, sprintAt: new Date().toISOString() };
          db.createTask(Object.assign(SP.smartFields ? SP.smartFields(inp, base) : Object.assign(base, { title: inp.value.trim() }), at));
          var stt = form.dataset.status; setTimeout(function () { var again = document.querySelector('.spr-board .col-add[data-status="' + stt + '"] input'); if (again) again.focus(); }, 0);
        });
      });
      if (SP.charts) SP.charts.bindTips(el);
    },
  };
  /** Podsumowanie sprintu jako tekst (do czatu, e-maila, raportu). */
  function copySummary(sp) {
    var text = summaryText(sp);
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { SP.toast("Skopiowano podsumowanie " + sp.name); }, function () { SP.form({ title: "Podsumowanie " + sp.name, submit: "Zamknij", fields: [{ name: "t", label: "Skopiuj tekst", type: "textarea", value: text }] }); });
  }
  function summaryText(sp) {
    var tasks = db.sprintTasks(sp.id), st = sp.state === "done" && sp.result ? sp.result : db.sprintStats(sp.id), r = retroOf(sp);
    var lines = [sp.name + " (" + range(sp.start, sp.end) + ")" + (sp.goal ? " – cel: " + sp.goal : ""),
      "Postęp: " + st.done + "/" + st.tasks + " zadań, " + st.pointsDone + "/" + st.points + " pkt" + (st.carried ? ", przeniesione: " + st.carried : ""), ""];
    var done = tasks.filter(closed), open = tasks.filter(function (t) { return !closed(t); });
    if (done.length) lines.push("Ukończone:", done.map(function (t) { return "✓ " + db.taskKey(t) + " " + t.title + (t.points != null ? " (" + t.points + " pkt)" : ""); }).join("\n"), "");
    if (open.length) lines.push("W toku / do zrobienia:", open.map(function (t) { return "• " + db.taskKey(t) + " " + t.title + " – " + db.status(t.status).name; }).join("\n"), "");
    if (r.summary) lines.push("Podsumowanie: " + r.summary, "");
    [["Dobrze", r.good], ["Do poprawy", r.bad], ["Działania", r.actions]].forEach(function (g) { if (g[1].length) lines.push(g[0] + ":", g[1].map(function (x) { return "- " + x.text; }).join("\n"), ""); });
    return lines.join("\n").trim();
  }

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
  /** Wspólne narzędzia dla js/sprint-tools.js (planning poker, raport, notatki wydania, widżet, przypomnienia). */
  SP._spr = { burnData: burnData, burndown: burndown, healthOf: healthOf, HEALTH: HEALTH, healthPill: healthPill, velocityOf: velocityOf, aiShell: aiShell, aiCtx: aiCtx,
    sumPts: sumPts, personName: personName, pl: pl, shortDate: shortDate, range: range, daysBetween: daysBetween, isDay: isDay, closed: closed, byImportance: byImportance,
    spin: spin, modelLabel: modelLabel, aiOn: aiOn, goAiSettings: goAiSettings, linkKeys: linkKeys, POINTS: POINTS, snapPts: snapPts, backlogOf: backlogOf, retroOf: retroOf,
    spaceOfTask: spaceOfTask, statePill: statePill, standupDialog: standupDialog, askDialog: askDialog, addTasksDialog: addTasksDialog, estimateDialog: estimateDialog, summaryText: summaryText };
})();
