/* Sprynt – Pulpit (wykresy i statystyki), Cele i Automatyzacje. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico, views = SP.views;
  var D = SP.date;

  /* =================== Wykresy (SVG/HTML, bez bibliotek) =================== */
  /** Wykres kolumnowy jednej serii. data: [{label, value, tip}] */
  function colChart(data, o) {
    o = o || {};
    var W = 480, H = 180, padL = 34, padB = 26, padT = 10, plotW = W - padL - 6, plotH = H - padB - padT;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([o.minMax || 1]));
    var step = niceStep(max / 3); max = Math.ceil(max / step) * step;
    var band = plotW / data.length, bw = Math.min(24, band * 0.62);
    var grid = "";
    for (var v = 0; v <= max + 1e-9; v += step) {
      var y = padT + plotH - (v / max) * plotH;
      grid += '<line x1="' + padL + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '" class="ch-grid"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" class="ch-ax" text-anchor="end">' + (o.axisFmt ? o.axisFmt(v) : v) + "</text>";
    }
    var bars = data.map(function (d, i) {
      var x = padL + band * i + (band - bw) / 2, h = max ? (d.value / max) * plotH : 0, y0 = padT + plotH;
      var r = Math.min(4, h / 2, bw / 2);
      var bar = h > 0 ? '<path class="ch-bar" d="M' + x + " " + y0 + "V" + (y0 - h + r) + "Q" + x + " " + (y0 - h) + " " + (x + r) + " " + (y0 - h) + "H" + (x + bw - r) + "Q" + (x + bw) + " " + (y0 - h) + " " + (x + bw) + " " + (y0 - h + r) + "V" + y0 + 'Z"/>' : "";
      var lbl = (data.length <= 8 || i % 2 === (data.length - 1) % 2) ? '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" class="ch-ax" text-anchor="middle">' + esc(d.label) + "</text>" : "";
      return '<g class="ch-col" data-tip="' + esc(d.tip) + '"><rect class="ch-hit" x="' + (padL + band * i) + '" y="' + padT + '" width="' + band + '" height="' + plotH + '"/>' + bar + lbl + "</g>";
    }).join("");
    return '<div class="ch-wrap"><svg class="ch" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.aria || "") + '">' + grid +
      '<line x1="' + padL + '" x2="' + (W - 6) + '" y1="' + (padT + plotH) + '" y2="' + (padT + plotH) + '" class="ch-base"/>' + bars + '</svg><div class="ch-tip" hidden></div></div>';
  }
  function niceStep(x) {
    if (x <= 1) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(x))), n = x / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  /** Poziome słupki z nazwą i wartością przy każdym (kolor tylko pomocniczo). rows: [{label(html), value, color, tip}] */
  function hBars(rows, o) {
    o = o || {};
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return '<div class="hbar">' + rows.map(function (r) {
      return '<div class="hbar-r" data-tip="' + esc(r.tip || "") + '"><span class="hbar-l">' + r.label + '</span><span class="hbar-t"><i style="width:' + (r.value ? Math.max(2, r.value / max * 100) : 0) + "%;" + (r.color ? "--c:" + r.color : "") + '"></i></span><b class="hbar-v">' + (o.fmt ? o.fmt(r.value) : r.value) + "</b></div>";
    }).join("") + "</div>";
  }
  function bindTips(root) {
    root.querySelectorAll(".ch-wrap").forEach(function (w) {
      var tip = w.querySelector(".ch-tip");
      w.addEventListener("pointermove", function (e) {
        var g = e.target.closest(".ch-col");
        w.querySelectorAll(".ch-col.on").forEach(function (x) { if (x !== g) x.classList.remove("on"); });
        if (!g) { tip.hidden = true; return; }
        g.classList.add("on");
        tip.textContent = g.dataset.tip; tip.hidden = false;
        var r = w.getBoundingClientRect(), x = e.clientX - r.left, tw = tip.offsetWidth;
        tip.style.left = Math.max(0, Math.min(r.width - tw, x - tw / 2)) + "px";
        tip.style.top = Math.max(0, e.clientY - r.top - 44) + "px";
      });
      w.addEventListener("pointerleave", function () { tip.hidden = true; w.querySelectorAll(".ch-col.on").forEach(function (x) { x.classList.remove("on"); }); });
    });
  }
  function hours(ms) { var h = ms / 3600000; return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10).toLocaleString("pl-PL") + " h"; }
  function dayLabel(s) { var d = new Date(s + "T00:00:00"); return d.getDate() + "." + String(d.getMonth() + 1).padStart(2, "0"); }
  function weekday(s) { return new Date(s + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "short" }).replace(".", ""); }
  function dayOf(iso) { return D.ymd(new Date(iso)); }

  /* =================== Pulpit =================== */
  views.dashboard = {
    title: function () { return "Pulpit"; },
    crumbs: function () { return [{ icon: "chart-column", label: "Pulpit" }]; },
    render: function (el) {
      var scope = views.dashboard.scope || "all";
      if (scope !== "all" && !db.space(scope)) scope = "all";
      var tasks = scope === "all" ? db.raw.tasks.filter(function (t) { return !t.parentId; }) : db.tasksIn({ type: "space", id: scope });
      var closed = function (t) { return db.status(t.status).closed; };
      var open = tasks.filter(function (t) { return !closed(t); });
      var today = D.today();
      var doneDay = function (t) { return closed(t) ? dayOf(t.doneAt || t.updatedAt) : null; };
      var ago = function (d) { return -D.diff(d); };
      var done7 = tasks.filter(function (t) { var d = doneDay(t); return d && ago(d) < 7 && ago(d) >= 0; }).length;
      var donePrev = tasks.filter(function (t) { var d = doneDay(t); return d && ago(d) >= 7 && ago(d) < 14; }).length;
      var overdue = open.filter(function (t) { return t.due && t.due < today; });
      // czas: wpisy z ostatnich 7 dni (po dniu rozpoczęcia), także trwający stoper
      var timeByDay = {};
      tasks.forEach(function (t) { (t.time || []).forEach(function (e) { var d = dayOf(e.start); timeByDay[d] = (timeByDay[d] || 0) + ((e.end ? new Date(e.end) : new Date()) - new Date(e.start)); }); });
      var days7 = [], days14 = [];
      for (var i = 13; i >= 0; i--) { var d = D.add(today, -i); days14.push(d); if (i < 7) days7.push(d); }
      var time7 = days7.reduce(function (s, d) { return s + (timeByDay[d] || 0); }, 0);

      var delta = done7 - donePrev;
      var tiles = [
        ["list-checks", "Otwarte zadania", open.length, tasks.length ? Math.round((tasks.length - open.length) / tasks.length * 100) + "% wszystkich ukończone" : "Brak zadań"],
        ["check", "Ukończone w 7 dni", done7, delta === 0 ? "Tyle samo co tydzień wcześniej" : (delta > 0 ? "+" + delta : "−" + -delta) + " względem poprzednich 7 dni"],
        ["flag", "Po terminie", overdue.length, overdue.length ? "Wymagają uwagi" : "Wszystko na czas", overdue.length ? "bad" : "good"],
        ["clock", "Czas pracy w 7 dni", hours(time7), Object.keys(timeByDay).length ? "Ze stopera i wpisów ręcznych" : "Włącz stoper w zadaniu"],
      ];

      var completed = colChart(days14.map(function (d) {
        var n = tasks.filter(function (t) { return doneDay(t) === d; }).length;
        return { label: dayLabel(d), value: n, tip: weekday(d) + " " + dayLabel(d) + ": ukończone " + n };
      }), { aria: "Ukończone zadania dziennie, ostatnie 14 dni" });
      var timeChart = colChart(days7.map(function (d) {
        var ms = timeByDay[d] || 0;
        return { label: weekday(d), value: ms / 3600000, tip: weekday(d) + " " + dayLabel(d) + ": " + (ms ? db.fmtDuration(ms) : "brak czasu") };
      }), { aria: "Czas pracy dziennie, ostatnie 7 dni", axisFmt: function (v) { return (Math.round(v * 10) / 10).toLocaleString("pl-PL") + "h"; } });
      var byStatus = hBars(db.STATUSES.map(function (s) {
        var n = tasks.filter(function (t) { return t.status === s.id; }).length;
        return { label: SP.statusDot(s.id) + esc(s.name), value: n, color: s.color };
      }));
      var people = db.raw.people.map(function (p) {
        return { label: SP.avatar(p.id, "xs") + esc(p.name), value: open.filter(function (t) { return t.assignees.indexOf(p.id) >= 0; }).length };
      });
      var unassigned = open.filter(function (t) { return !t.assignees.length; }).length;
      if (unassigned) people.push({ label: '<span class="hbar-none">' + ico("user", 14) + "</span>Nieprzypisane", value: unassigned, color: "var(--text-3)" });
      var byPrio = hBars(db.PRIORITIES.map(function (p) {
        return { label: SP.flag(p.id) + esc(p.name), value: open.filter(function (t) { return t.priority === p.id; }).length, color: p.color };
      }).concat([{ label: '<span class="hbar-none">' + ico("flag", 14) + "</span>Bez priorytetu", value: open.filter(function (t) { return !t.priority; }).length, color: "var(--text-3)" }]));
      var upcoming = open.filter(function (t) { return t.due && t.due >= today && D.diff(t.due) <= 7; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; }).slice(0, 8);

      var opts = '<option value="all">Wszystkie przestrzenie</option>' + db.raw.spaces.map(function (s) { return '<option value="' + s.id + '"' + (s.id === scope ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("");
      el.innerHTML = '<div class="page dash"><div class="page-h"><h1>Pulpit</h1><select class="input sm dash-scope" aria-label="Zakres">' + opts + "</select></div>" +
        '<div class="kpis">' + tiles.map(function (k) {
          return '<div class="kpi' + (k[4] ? " " + k[4] : "") + '"><span class="kpi-ico">' + ico(k[0], 18) + '</span><span class="kpi-l">' + k[1] + '</span><b class="kpi-v">' + k[2] + '</b><small class="muted">' + esc(k[3]) + "</small></div>";
        }).join("") + "</div>" +
        '<div class="dash-grid">' +
        '<section class="card"><div class="card-h"><h2>Ukończone dziennie</h2><span class="muted">ostatnie 14 dni</span></div><div class="card-b ch-b">' + completed + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Zadania według statusu</h2><span class="muted">' + tasks.length + '</span></div><div class="card-b ch-b">' + byStatus + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Czas pracy</h2><span class="muted">ostatnie 7 dni</span></div><div class="card-b ch-b">' + timeChart + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Obciążenie zespołu</h2><span class="muted">otwarte zadania</span></div><div class="card-b ch-b">' + hBars(people) + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Priorytety otwartych zadań</h2></div><div class="card-b ch-b">' + byPrio + "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Najbliższe 7 dni</h2><span class="muted">' + upcoming.length + '</span></div><div class="card-b">' +
        (upcoming.map(function (t) {
          var d = SP.fmtDue(t.due);
          return '<div class="crow" data-task="' + t.id + '">' + SP.statusDot(t.status) + '<span class="r-title">' + esc(t.title) + '</span><span class="r-path">' + esc(db.pathOf(t).list.name) + "</span>" + (t.priority ? SP.flag(t.priority) : "") + '<span class="due ' + d.cls + '">' + d.label + "</span></div>";
        }).join("") || '<div class="empty-s">Brak terminów w najbliższym tygodniu.</div>') + "</div></section>" +
        "</div></div>";
      el.querySelector(".dash-scope").onchange = function (e) { views.dashboard.scope = e.target.value; SP.rerender(); };
      el.addEventListener("click", function (e) { var r = e.target.closest("[data-task]"); if (r) SP.openTask(r.dataset.task); });
      bindTips(el);
    },
  };

  /* =================== Cele =================== */
  var GOAL_COLORS = SP.SPACE_COLORS;
  function ring(p, color, size) {
    size = size || 56; var r = size / 2 - 5, c = 2 * Math.PI * r;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" style="stroke:' + color + '" stroke-dasharray="' + (c * p) + " " + c + '" transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')"/></svg>' +
      '<span class="ring-v">' + Math.round(p * 100) + "%</span>";
  }
  function locOptions() {
    var o = [];
    db.raw.spaces.forEach(function (s) {
      o.push(["space:" + s.id, "Przestrzeń: " + s.name]);
      db.raw.folders.filter(function (f) { return f.spaceId === s.id; }).forEach(function (f) { o.push(["folder:" + f.id, "  Folder: " + s.name + " / " + f.name]); });
      db.raw.lists.filter(function (l) { return l.spaceId === s.id; }).forEach(function (l) { o.push(["list:" + l.id, "  Lista: " + s.name + " / " + l.name]); });
    });
    return o;
  }
  function locName(tg) {
    var o = tg.locType === "space" ? db.space(tg.locId) : tg.locType === "folder" ? db.folder(tg.locId) : db.list(tg.locId);
    return o ? o.name : "(usunięte)";
  }
  function addTarget(g) {
    SP.form({ title: "Nowy cel cząstkowy", submit: "Dalej", fields: [
      { name: "type", label: "Jak mierzymy postęp?", type: "select", options: [["tasks", "Ukończenie zadań z listy lub przestrzeni"], ["number", "Liczba (np. przychód, klienci)"], ["check", "Zrobione / niezrobione"]], value: "tasks" },
      { name: "name", label: "Nazwa", placeholder: "np. Zamknąć sprint 16", required: true },
    ] }).then(function (v) {
      if (!v || !v.name) return;
      if (v.type === "check") { db.addTarget(g.id, { type: "check", name: v.name, done: false }); return; }
      if (v.type === "tasks") {
        var opts = locOptions(); if (!opts.length) { SP.toast("Najpierw utwórz listę"); return; }
        SP.form({ title: "Które zadania?", submit: "Dodaj", fields: [{ name: "loc", label: "Postęp = ukończone zadania w…", type: "select", options: opts, value: opts[0][0] }] }).then(function (w) {
          if (!w) return; var p = w.loc.split(":"); db.addTarget(g.id, { type: "tasks", name: v.name, locType: p[0], locId: p[1] });
        });
        return;
      }
      SP.form({ title: "Liczba: " + v.name, submit: "Dodaj", fields: [
        { name: "start", label: "Wartość początkowa", value: "0" }, { name: "target", label: "Wartość docelowa", placeholder: "np. 100", required: true },
        { name: "current", label: "Obecna wartość", value: "0" }, { name: "unit", label: "Jednostka (opcjonalnie)", placeholder: "np. zł, klientów, %" },
      ] }).then(function (w) {
        if (!w) return;
        var num = function (x) { return parseFloat(String(x).replace(",", ".").replace(/\s/g, "")) || 0; };
        if (!num(w.target) && num(w.target) !== 0) return;
        db.addTarget(g.id, { type: "number", name: v.name, start: num(w.start), target: num(w.target), current: num(w.current), unit: w.unit });
      });
    });
  }
  function goalForm(g) {
    return SP.form({ title: g ? "Edytuj cel" : "Nowy cel", submit: g ? "Zapisz" : "Utwórz cel", fields: [
      { name: "name", label: "Nazwa celu", placeholder: "np. Premiera wersji 2.0", value: g && g.name, required: true },
      { name: "due", label: "Termin (RRRR-MM-DD, opcjonalnie)", placeholder: D.add(D.today(), 30), value: g && g.due },
      { name: "color", label: "Kolor", type: "color", options: GOAL_COLORS, value: g && g.color },
    ] });
  }
  views.goals = {
    title: function () { return "Cele"; },
    crumbs: function () { return [{ icon: "target", label: "Cele" }]; },
    render: function (el) {
      var goals = db.raw.goals;
      var avg = goals.length ? goals.reduce(function (s, g) { return s + db.goalProgress(g); }, 0) / goals.length : 0;
      el.innerHTML = '<div class="page goals"><div class="page-h"><h1>Cele</h1>' + (goals.length ? '<span class="muted goals-sum">Średni postęp ' + Math.round(avg * 100) + "%</span>" : "") +
        '<button class="btn primary sm" data-new-goal>' + ico("plus", 15) + "Nowy cel</button></div>" +
        (goals.length ? '<div class="goal-grid">' + goals.map(function (g) {
          var p = db.goalProgress(g), due = g.due ? SP.fmtDue(g.due, p >= 1) : null;
          return '<section class="card goal" style="--c:' + (g.color || "#6c5ce7") + '" data-goal="' + g.id + '"><div class="goal-h"><div class="goal-ring">' + ring(p, g.color || "#6c5ce7") + '</div><div class="goal-t"><h2>' + esc(g.name) + "</h2>" +
            '<span class="muted">' + g.targets.length + " " + (g.targets.length === 1 ? "cel cząstkowy" : "celów cząstkowych") + (due ? ' · <span class="due ' + due.cls + '">' + due.label + "</span>" : "") + "</span></div>" +
            '<button class="ibtn" data-gmenu title="Więcej">' + ico("ellipsis", 16) + "</button></div>" +
            '<div class="tg-list">' + g.targets.map(function (tg) {
              var pr = db.targetProgress(tg);
              var icon = tg.type === "tasks" ? "list-checks" : tg.type === "check" ? "square-check" : "chart-line";
              var right = tg.type === "check" ? '<button class="tg-chk" data-tcheck="' + tg.id + '" aria-pressed="' + !!tg.done + '">' + ico(tg.done ? "square-check" : "square", 16) + "</button>"
                : tg.type === "number" ? '<button class="tg-val" data-tval="' + tg.id + '" title="Zmień wartość">' + esc(pr.label) + "</button>"
                : '<a class="tg-val" href="#/' + tg.locType + "/" + tg.locId + '" title="' + esc(locName(tg)) + '">' + esc(pr.label) + "</a>";
              return '<div class="tg"><span class="tg-ico">' + ico(icon, 15) + '</span><span class="tg-n">' + esc(tg.name) + (tg.type === "tasks" ? '<small class="muted">' + esc(locName(tg)) + "</small>" : "") + "</span>" +
                '<span class="tg-bar"><i style="width:' + Math.round(pr.p * 100) + '%"></i></span>' + right + '<button class="ibtn sm tg-del" data-tdel="' + tg.id + '" title="Usuń">' + ico("x", 13) + "</button></div>";
            }).join("") + '<button class="tg-add" data-tadd>' + ico("plus", 14) + "Dodaj cel cząstkowy</button></div></section>";
        }).join("") + "</div>"
          : '<div class="empty-b goals-empty">' + ico("target", 44) + "<h3>Wyznacz pierwszy cel</h3><p class='muted'>Cel składa się z celów cząstkowych: ukończenia zadań z listy, liczby do osiągnięcia albo prostego „zrobione”. Postęp liczy się sam.</p>" +
            '<button class="btn primary" data-new-goal>' + ico("plus", 16) + "Nowy cel</button></div>") + "</div>";
      el.addEventListener("click", function (e) {
        var b;
        if (e.target.closest("[data-new-goal]")) {
          goalForm(null).then(function (v) { if (v && v.name) { db.addGoal({ name: v.name, due: /^\d{4}-\d{2}-\d{2}$/.test(v.due || "") ? v.due : null, color: v.color }); SP.toast("Utworzono cel – dodaj cele cząstkowe"); } });
          return;
        }
        var card = e.target.closest("[data-goal]"); if (!card) return;
        var g = db.goal(card.dataset.goal); if (!g) return;
        if ((b = e.target.closest("[data-gmenu]"))) {
          SP.menu(b, [
            { label: "Edytuj cel", icon: "pencil", run: function () { goalForm(g).then(function (v) { if (v && v.name) db.updateGoal(g.id, { name: v.name, due: /^\d{4}-\d{2}-\d{2}$/.test(v.due || "") ? v.due : null, color: v.color }); }); } },
            { label: "Dodaj cel cząstkowy", icon: "plus", run: function () { addTarget(g); } },
            "-",
            { label: "Usuń cel", icon: "trash", danger: true, run: function () { SP.confirm("Usunąć cel?", "„" + g.name + "” i jego cele cząstkowe znikną. Zadania zostają.").then(function (ok) { if (ok) db.removeGoal(g.id); }); } },
          ], { align: "right" });
          return;
        }
        if (e.target.closest("[data-tadd]")) { addTarget(g); return; }
        if ((b = e.target.closest("[data-tcheck]"))) { var tg = g.targets.find(function (x) { return x.id === b.dataset.tcheck; }); db.updateTarget(g.id, tg.id, { done: !tg.done }); return; }
        if ((b = e.target.closest("[data-tdel]"))) { db.removeTarget(g.id, b.dataset.tdel); return; }
        if ((b = e.target.closest("[data-tval]"))) {
          var t2 = g.targets.find(function (x) { return x.id === b.dataset.tval; });
          SP.form({ title: t2.name, submit: "Zapisz", fields: [{ name: "current", label: "Obecna wartość (cel: " + t2.target + (t2.unit ? " " + t2.unit : "") + ")", value: String(t2.current) }] }).then(function (v) {
            if (!v) return; var n = parseFloat(String(v.current).replace(",", ".").replace(/\s/g, ""));
            if (isNaN(n)) { SP.toast("Wpisz liczbę"); return; }
            db.updateTarget(g.id, t2.id, { current: n });
          });
        }
      });
    },
  };

  /* =================== Automatyzacje =================== */
  function triggerOptions() {
    var o = [["created:", "Gdy utworzono zadanie"]];
    db.STATUSES.forEach(function (s) { o.push(["status:" + s.id, "Gdy status zmieni się na „" + s.name + "”"]); });
    db.PRIORITIES.forEach(function (p) { o.push(["priority:" + p.id, "Gdy priorytet zmieni się na „" + p.name + "”"]); });
    db.raw.people.forEach(function (p) { o.push(["assigned:" + p.id, "Gdy przypisano: " + p.name]); });
    return o;
  }
  function actionOptions() {
    var o = [];
    db.STATUSES.forEach(function (s) { o.push(["status:" + s.id, "Zmień status na „" + s.name + "”"]); });
    db.PRIORITIES.forEach(function (p) { o.push(["priority:" + p.id, "Ustaw priorytet „" + p.name + "”"]); });
    db.raw.people.forEach(function (p) { o.push(["assign:" + p.id, "Przypisz: " + p.name]); });
    [0, 1, 3, 7, 14].forEach(function (n) { o.push(["due:" + n, n === 0 ? "Ustaw termin na dziś" : "Ustaw termin za " + n + " " + (n === 1 ? "dzień" : "dni")]); });
    db.raw.lists.forEach(function (l) { o.push(["move:" + l.id, "Przenieś do listy „" + l.name + "”"]); });
    o.push(["tag:", "Dodaj tag (wpisz poniżej)"], ["comment:", "Dodaj komentarz (wpisz poniżej)"]);
    return o;
  }
  function describe(a) {
    var tv = a.trigger.value, av = a.action.value, t, act;
    if (a.trigger.type === "created") t = "zadanie zostanie utworzone";
    else if (a.trigger.type === "status") t = "status zmieni się na " + chip(SP.statusDot(tv) + esc(db.status(tv).name));
    else if (a.trigger.type === "priority") t = "priorytet zmieni się na " + chip(SP.flag(tv) + esc((db.priority(tv) || {}).name));
    else t = "przypisano " + chip(SP.avatar(tv, "xs") + esc((db.person(tv) || {}).name || "?"));
    switch (a.action.type) {
      case "status": act = "zmień status na " + chip(SP.statusDot(av) + esc(db.status(av).name)); break;
      case "priority": act = "ustaw priorytet " + chip(SP.flag(av) + esc((db.priority(av) || {}).name)); break;
      case "assign": act = "przypisz " + chip(SP.avatar(av, "xs") + esc((db.person(av) || {}).name || "?")); break;
      case "due": act = Number(av) ? "ustaw termin za " + chip(ico("calendar", 13) + av + " dni") : "ustaw termin na " + chip(ico("calendar", 13) + "dziś"); break;
      case "move": act = "przenieś do " + chip(ico("list", 13) + esc((db.list(av) || { name: "(usunięta lista)" }).name)); break;
      case "tag": act = "dodaj tag " + chip(ico("tag", 13) + esc(av)); break;
      case "comment": act = "dodaj komentarz " + chip(ico("message-square", 13) + "„" + esc(av.length > 40 ? av.slice(0, 40) + "…" : av) + "”"); break;
    }
    return '<span class="au-when">Gdy</span> ' + t + ' <span class="au-arrow">' + ico("arrow-right", 14) + "</span> " + act;
  }
  function chip(h) { return '<span class="au-chip">' + h + "</span>"; }
  var TEMPLATES = [
    { name: "Do przeglądu → przypisz mnie", trigger: { type: "status", value: "review" }, action: { type: "assign", value: "me" }, desc: "Zadanie gotowe do przeglądu trafia do Ciebie." },
    { name: "Nowe zadania z terminem za tydzień", trigger: { type: "created", value: null }, action: { type: "due", value: "7" }, desc: "Każde nowe zadanie dostaje termin za 7 dni." },
    { name: "Pilne od razu w toku", trigger: { type: "priority", value: "urgent" }, action: { type: "status", value: "progress" }, desc: "Pilny priorytet przenosi zadanie do „W toku”." },
    { name: "Podziękowanie po ukończeniu", trigger: { type: "status", value: "done" }, action: { type: "comment", value: "Gotowe – dzięki! ✅" }, desc: "Ukończone zadanie dostaje komentarz." },
  ];
  function newAutomation() {
    var scopes = [["", "Wszystkie przestrzenie"]].concat(db.raw.spaces.map(function (s) { return [s.id, s.name]; }));
    SP.form({ title: "Nowa automatyzacja", submit: "Utwórz", fields: [
      { name: "name", label: "Nazwa", placeholder: "np. Recenzje do mnie", required: true },
      { name: "scope", label: "Gdzie działa", type: "select", options: scopes, value: "" },
      { name: "trigger", label: "Gdy…", type: "select", options: triggerOptions(), value: "status:done" },
      { name: "action", label: "…to", type: "select", options: actionOptions(), value: "priority:normal" },
      { name: "text", label: "Tekst (dla tagu lub komentarza)", placeholder: "np. do-faktury" },
    ] }).then(function (v) {
      if (!v || !v.name) return;
      var t = v.trigger.split(":"), a = v.action.split(":");
      var val = a.slice(1).join(":");
      if (a[0] === "tag" || a[0] === "comment") { val = v.text; if (!val) { SP.toast("Wpisz tekst tagu albo komentarza"); return; } }
      db.addAutomation({ name: v.name, spaceId: v.scope || null, trigger: { type: t[0], value: t[1] || null }, action: { type: a[0], value: val } });
      SP.toast("Automatyzacja włączona");
    });
  }
  views.automations = {
    title: function () { return "Automatyzacje"; },
    crumbs: function () { return [{ icon: "zap", label: "Automatyzacje" }]; },
    render: function (el) {
      var list = db.raw.automations;
      var used = TEMPLATES.filter(function (tp) { return !list.some(function (a) { return a.name === tp.name; }); });
      el.innerHTML = '<div class="page narrow autos"><div class="page-h"><h1>Automatyzacje</h1><button class="btn primary sm" data-new-auto>' + ico("plus", 15) + "Nowa automatyzacja</button></div>" +
        '<p class="muted au-intro">Reguły „gdy… to…” wykonują się same, kiedy zmieniasz zadania – także w akcjach zbiorczych. Każde wykonanie zapisuje się w aktywności zadania.</p>' +
        (list.length ? '<div class="au-list">' + list.map(function (a) {
          var s = a.spaceId ? db.space(a.spaceId) : null;
          return '<div class="au-row' + (a.on ? "" : " off") + '" data-auto="' + a.id + '"><button class="switch" role="switch" aria-checked="' + !!a.on + '" data-toggle title="' + (a.on ? "Wyłącz" : "Włącz") + '"><i></i></button>' +
            '<div class="au-b"><b>' + esc(a.name) + '</b><div class="au-rule">' + describe(a) + '</div><small class="muted">' + (s ? SP.spaceIcon(s, "xs") + esc(s.name) : "Wszystkie przestrzenie") + " · wykonano " + (a.runs || 0) + "×" + (a.lastRun ? ", ostatnio " + SP.ago(a.lastRun) : "") + "</small></div>" +
            '<button class="ibtn" data-del title="Usuń">' + ico("trash", 16) + "</button></div>";
        }).join("") + "</div>"
          : '<div class="empty-b">' + ico("zap", 40) + "<h3>Brak automatyzacji</h3><p class='muted'>Zacznij od gotowego szablonu albo utwórz własną regułę.</p></div>") +
        (used.length ? '<h3 class="au-h">Szablony</h3><div class="au-tpl">' + used.map(function (tp, i) {
          return '<button class="au-t" data-tpl="' + TEMPLATES.indexOf(tp) + '"><span class="au-t-ico">' + ico("zap", 16) + "</span><span><b>" + esc(tp.name) + "</b><small class='muted'>" + esc(tp.desc) + "</small></span>" + ico("plus", 15) + "</button>";
        }).join("") + "</div>" : "") + "</div>";
      el.addEventListener("click", function (e) {
        var b;
        if (e.target.closest("[data-new-auto]")) { newAutomation(); return; }
        if ((b = e.target.closest("[data-tpl]"))) { var tp = TEMPLATES[+b.dataset.tpl]; db.addAutomation({ name: tp.name, spaceId: null, trigger: Object.assign({}, tp.trigger), action: Object.assign({}, tp.action) }); SP.toast("Dodano: " + tp.name); return; }
        var row = e.target.closest("[data-auto]"); if (!row) return;
        var a = db.raw.automations.find(function (x) { return x.id === row.dataset.auto; }); if (!a) return;
        if (e.target.closest("[data-toggle]")) { db.updateAutomation(a.id, { on: !a.on }); return; }
        if (e.target.closest("[data-del]")) { SP.confirm("Usunąć automatyzację?", "„" + a.name + "” przestanie działać.").then(function (ok) { if (ok) db.removeAutomation(a.id); }); }
      });
    },
  };
})();
