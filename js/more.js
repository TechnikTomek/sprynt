/* Sprynt – pola niestandardowe, zależności, przypomnienia, szablony, kosz, czat, eksport CSV. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico, views = SP.views;

  /* =================== Tekst z wzmiankami i odnośnikami =================== */
  /** Bezpieczny HTML: @Imię → wzmianka, SP-12 → link do zadania, adresy → linki, \n → <br>. */
  SP.richText = function (text) {
    var h = esc(text || "");
    h = h.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"'”]/g, function (u) { return '<a class="rt-link" href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>"; });
    h = h.replace(/\bSP-(\d+)\b/g, function (m, n) {
      var t = db.raw.tasks.find(function (x) { return String(x.num) === n; });
      return t ? '<button class="tref" data-open-task="' + t.id + '" title="' + esc(t.title) + '">' + SP.statusDot(t.status) + m + "</button>" : m;
    });
    db.raw.people.slice().sort(function (a, b) { return b.name.length - a.name.length; }).forEach(function (p) {
      var name = esc(p.name);
      h = h.split("@" + name).join('<span class="mention">@' + name + "</span>");
    });
    return h.replace(/\n/g, "<br>");
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-open-task]"); if (!b) return;
    e.preventDefault(); e.stopPropagation(); SP.openTask(b.dataset.openTask);
  });

  /* =================== Wybór zadania (zależności) =================== */
  SP.pickTask = function (anchor, exclude, cb) {
    var el = SP.el('<div class="tp"><input class="input sm" placeholder="Szukaj zadania lub SP-12…" /><div class="tp-list"></div></div>');
    var inp = el.querySelector("input"), list = el.querySelector(".tp-list");
    function draw() {
      var q = inp.value.trim().toLowerCase();
      var items = db.raw.tasks.filter(function (t) { return exclude.indexOf(t.id) < 0 && (!q || t.title.toLowerCase().indexOf(q) >= 0 || db.taskKey(t).toLowerCase().indexOf(q) >= 0); })
        .sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }).slice(0, 30);
      list.innerHTML = items.map(function (t) {
        return '<button class="pm-item" data-id="' + t.id + '">' + SP.statusDot(t.status) + "<span>" + esc(t.title) + '</span><small class="muted">' + db.taskKey(t) + "</small></button>";
      }).join("") || '<div class="empty-s">Brak zadań</div>';
    }
    inp.addEventListener("input", draw);
    list.addEventListener("click", function (e) { var b = e.target.closest("[data-id]"); if (b) { SP.closePopover(); cb(b.dataset.id); } });
    draw();
    SP.popover(anchor, el, { cls: "pm tp-pop" });
  };

  /* =================== Pola niestandardowe =================== */
  var FIELD_ICON = { text: "type", number: "hash", money: "coins", select: "chevron-down", checkbox: "square-check", date: "calendar", url: "link" };
  SP.fieldValueHTML = function (f, v) {
    if (v == null || v === "") return f.type === "checkbox" ? '<span class="cf-box">' + ico("square", 16) + "</span>" : '<span class="cell-empty">—</span>';
    if (f.type === "checkbox") return '<span class="cf-box on">' + ico("square-check", 16) + "</span>";
    if (f.type === "select") { var o = (f.options || []).find(function (x) { return x.id === v; }); return o ? '<span class="cf-opt" style="--c:' + o.color + '">' + esc(o.name) + "</span>" : '<span class="cell-empty">—</span>'; }
    if (f.type === "money") return '<span class="cf-num">' + Number(v).toLocaleString("pl-PL", { style: "currency", currency: "PLN" }) + "</span>";
    if (f.type === "number") return '<span class="cf-num">' + Number(v).toLocaleString("pl-PL") + "</span>";
    if (f.type === "date") return '<span class="due">' + ico("calendar", 14) + SP.fmtDue(v, true).label + "</span>";
    if (f.type === "url") return '<span class="cf-url">' + ico("link", 13) + esc(String(v).replace(/^https?:\/\//, "").slice(0, 32)) + "</span>";
    return "<span>" + esc(String(v)) + "</span>";
  };
  /** Edycja wartości pola przy elemencie anchor. */
  SP.editField = function (anchor, taskId, fid) {
    var f = db.field(fid), t = db.task(taskId); if (!f || !t) return;
    var v = (t.cf || {})[fid];
    if (f.type === "checkbox") { db.setFieldValue(taskId, fid, v ? null : true); return; }
    if (f.type === "date") { SP.pickDate(anchor, v || null, function (d) { db.setFieldValue(taskId, fid, d); }); return; }
    if (f.type === "select") {
      SP.menu(anchor, [{ header: f.name }].concat((f.options || []).map(function (o) {
        return { html: '<span class="cf-opt" style="--c:' + o.color + '">' + esc(o.name) + "</span>", active: v === o.id, run: function () { db.setFieldValue(taskId, fid, o.id); } };
      })).concat(v ? ["-", { label: "Wyczyść", icon: "x", run: function () { db.setFieldValue(taskId, fid, null); } }] : []));
      return;
    }
    var numeric = f.type === "number" || f.type === "money";
    var el = SP.el('<form class="cf-edit"><label class="muted">' + esc(f.name) + '</label><input class="input sm" ' + (numeric ? 'inputmode="decimal"' : "") + ' /><div class="cf-edit-a"><button type="button" class="btn ghost sm" data-clear>Wyczyść</button><button class="btn primary sm">Zapisz</button></div></form>');
    var inp = el.querySelector("input"); inp.value = v == null ? "" : String(v);
    if (f.type === "url") inp.placeholder = "https://…";
    el.addEventListener("submit", function (e) {
      e.preventDefault(); var x = inp.value.trim();
      if (numeric && x) { x = parseFloat(x.replace(/\s/g, "").replace(",", ".")); if (isNaN(x)) { SP.toast("Wpisz liczbę"); return; } }
      if (f.type === "url" && x && !/^https?:\/\//i.test(x)) x = "https://" + x;
      SP.closePopover(); db.setFieldValue(taskId, fid, x === "" ? null : x);
    });
    el.querySelector("[data-clear]").onclick = function () { SP.closePopover(); db.setFieldValue(taskId, fid, null); };
    SP.popover(anchor, el, { cls: "cf-pop" });
  };
  /** Okno zarządzania polami listy. */
  SP.manageFields = function (listId) {
    var l = db.list(listId); if (!l) return;
    var bg = SP.el('<div class="dlg-bg"><div class="dlg mf" role="dialog" aria-modal="true" aria-label="Pola niestandardowe"><div class="kb-h"><h2>' + ico("spreadsheet", 20) + "Pola listy „" + esc(l.name) + '”</h2><button class="ibtn" data-x>' + ico("x", 17) + "</button></div>" +
      '<p class="muted mf-intro">Pola pojawiają się w oknie zadania i jako kolumny w widoku Tabela tej listy.</p><div class="mf-list"></div>' +
      '<form class="mf-add"><input class="input sm" name="name" placeholder="Nazwa nowego pola, np. Budżet" required maxlength="40" />' +
      '<select class="input sm" name="type">' + Object.keys(db.FIELD_TYPES).map(function (k) { return '<option value="' + k + '">' + db.FIELD_TYPES[k] + "</option>"; }).join("") + "</select>" +
      '<input class="input sm mf-opts" name="opts" placeholder="Opcje po przecinku, np. Niski, Średni, Wysoki" hidden />' +
      '<button class="btn primary sm">' + ico("plus", 15) + "Dodaj pole</button></form></div></div>");
    function draw() {
      var fs = db.fieldsFor(listId);
      bg.querySelector(".mf-list").innerHTML = fs.map(function (f) {
        return '<div class="mf-row"><span class="mf-ico">' + ico(FIELD_ICON[f.type] || "type", 16) + '</span><b>' + esc(f.name) + '</b><span class="muted">' + db.FIELD_TYPES[f.type] +
          (f.type === "select" ? " · " + f.options.map(function (o) { return esc(o.name); }).join(", ") : "") + '</span><button class="ibtn sm" data-rename="' + f.id + '" title="Zmień nazwę">' + ico("pencil", 14) +
          '</button><button class="ibtn sm" data-del="' + f.id + '" title="Usuń pole">' + ico("trash", 14) + "</button></div>";
      }).join("") || '<div class="empty-s">Ta lista nie ma jeszcze pól.</div>';
      SP.hydrateIcons(bg);
    }
    var form = bg.querySelector(".mf-add");
    form.type.onchange = function () { form.opts.hidden = form.type.value !== "select"; };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.name.value.trim(); if (!name) return;
      var opts = form.type.value === "select" ? form.opts.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean) : [];
      if (form.type.value === "select" && !opts.length) { SP.toast("Podaj opcje listy wyboru"); form.opts.focus(); return; }
      db.addField(listId, { name: name, type: form.type.value, options: opts });
      form.reset(); form.opts.hidden = true; draw(); form.name.focus();
    });
    bg.querySelector(".mf-list").addEventListener("click", function (e) {
      var b = e.target.closest("[data-del]"), r = e.target.closest("[data-rename]");
      if (b) { var f = db.field(b.dataset.del); SP.confirm("Usunąć pole „" + f.name + "”?", "Wartości tego pola we wszystkich zadaniach znikną.").then(function (ok) { if (ok) { db.removeField(f.id); draw(); } }); }
      if (r) { var f2 = db.field(r.dataset.rename); SP.form({ title: "Zmień nazwę pola", fields: [{ name: "n", label: "Nazwa", value: f2.name, required: true }] }).then(function (v) { if (v && v.n) { db.updateField(f2.id, { name: v.n }); draw(); } }); }
    });
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape" && !document.querySelectorAll(".dlg-bg")[1] && !document.querySelector(".popover")) { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.querySelector("[data-x]").onclick = close;
    document.body.appendChild(bg); draw(); form.name.focus();
  };

  /* =================== Okno zadania: dodatki =================== */
  function fmtRemind(iso) {
    var d = new Date(iso), today = SP.date.today(), ymd = SP.date.ymd(d);
    var time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    var day = ymd === today ? "Dziś" : ymd === SP.date.add(today, 1) ? "Jutro" : d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
    return day + ", " + time;
  }
  SP.taskProps = function (t) {
    var r = t.remind;
    return '<div class="prop"><span class="prop-l">' + ico("alarm-clock", 15) + 'Przypomnienie</span><button class="prop-v" data-x="remind">' +
      (r ? '<span class="remind' + (t.reminded ? " done" : "") + '">' + ico("bell", 14) + fmtRemind(r) + (t.reminded ? " · wysłane" : "") + "</span>" : '<span class="muted">Puste</span>') + "</button></div>";
  };
  SP.taskFields = function (t) {
    var fs = db.fieldsFor(t.listId);
    return '<div class="tm-sec cf-sec"><div class="tm-sec-h">' + ico("spreadsheet", 15) + "Pola" + '<button class="tm-sec-a" data-x="fields">' + (fs.length ? "Zarządzaj" : ico("plus", 13) + "Dodaj pole") + "</button></div>" +
      (fs.length ? '<div class="props cf-props">' + fs.map(function (f) {
        return '<div class="prop"><span class="prop-l">' + ico(FIELD_ICON[f.type] || "type", 15) + esc(f.name) + '</span><button class="prop-v" data-cf="' + f.id + '">' + SP.fieldValueHTML(f, (t.cf || {})[f.id]) + "</button></div>";
      }).join("") + "</div>" : "") + "</div>";
  };
  function depRow(o, kind) {
    var closed = db.status(o.status).closed;
    return '<div class="dep' + (closed ? " closed" : "") + '"><button class="dep-t" data-open-task="' + o.id + '">' + SP.statusDot(o.status) + "<span>" + esc(o.title) + '</span><small class="muted">' + db.taskKey(o) + "</small></button>" +
      (kind === "wait" ? '<button class="ibtn sm" data-dep-del="' + o.id + '" title="Usuń zależność">' + ico("x", 13) + "</button>" : "") + "</div>";
  }
  SP.taskDeps = function (t) {
    var wait = db.waitingOn(t), block = db.blocking(t);
    var blocked = db.isBlocked(t);
    return '<div class="tm-sec deps"><div class="tm-sec-h">' + ico("lock", 15) + "Zależności" + (blocked ? '<span class="dep-warn">' + ico("lock", 12) + "Zablokowane</span>" : "") +
      '<button class="tm-sec-a" data-x="dep-add">' + ico("plus", 13) + "Czeka na…</button></div>" +
      (wait.length ? '<div class="dep-g"><span class="dep-l">Czeka na</span>' + wait.map(function (o) { return depRow(o, "wait"); }).join("") + "</div>" : "") +
      (block.length ? '<div class="dep-g"><span class="dep-l">Blokuje</span>' + block.map(function (o) { return depRow(o, "block"); }).join("") + "</div>" : "") +
      (!wait.length && !block.length ? '<p class="muted dep-empty">Zaznacz, na które zadania to czeka – Sprynt pokaże, co blokuje pracę.</p>' : "") + "</div>";
  };
  SP.bindTaskExtras = function (main, taskId) {
    main.querySelectorAll("[data-cf]").forEach(function (b) { b.onclick = function () { SP.editField(b, taskId, b.dataset.cf); }; });
    main.querySelectorAll("[data-dep-del]").forEach(function (b) { b.onclick = function () { db.removeDep(taskId, b.dataset.depDel); }; });
    var x;
    if ((x = main.querySelector('[data-x="remind"]'))) x.onclick = function () { SP.pickReminder(x, taskId); };
    if ((x = main.querySelector('[data-x="fields"]'))) { var fb = x; fb.onclick = function () { SP.manageFields(db.task(taskId).listId); }; }
    if ((x = main.querySelector('[data-x="dep-add"]'))) { var db2 = x; db2.onclick = function () { addDep(db2, taskId); }; }
  };
  function addDep(anchor, taskId) {
    var t = db.task(taskId);
    SP.pickTask(anchor, [taskId].concat(t.deps || []), function (other) {
      if (!db.addDep(taskId, other)) SP.toast("Nie można – powstałaby pętla zależności");
    });
  }
  SP.rowChips = function (t) {
    var h = "";
    if (db.isBlocked(t)) h += '<span class="r-chip blocked" title="Czeka na nieukończone zadania">' + ico("lock", 12) + "Zablokowane</span>";
    if (t.remind && !t.reminded) h += '<span class="r-chip" title="Przypomnienie: ' + esc(fmtRemind(t.remind)) + '">' + ico("bell", 13) + "</span>";
    return h;
  };

  /* =================== Przypomnienia =================== */
  function at(dayOffset, h, m) { var d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m || 0, 0, 0); return d; }
  SP.pickReminder = function (anchor, taskId) {
    var t = db.task(taskId);
    var nextMon = (8 - new Date().getDay()) % 7 || 7;
    var opts = [
      ["Za 1 godzinę", new Date(Date.now() + 3600e3)], ["Za 3 godziny", new Date(Date.now() + 3 * 3600e3)],
      ["Jutro o 9:00", at(1, 9)], ["W poniedziałek o 9:00", at(nextMon, 9)],
    ];
    if (t.due) { var dd = new Date(t.due + "T09:00:00"); dd.setDate(dd.getDate() - 1); if (dd > new Date()) opts.push(["Dzień przed terminem, 9:00", dd]); }
    SP.menu(anchor, [{ header: "Przypomnij mi" }].concat(opts.map(function (o) {
      return { label: o[0], icon: "alarm-clock", run: function () { set(o[1]); } };
    })).concat([{ label: "Własna data i godzina…", icon: "calendar", run: function () {
      SP.form({ title: "Przypomnienie", submit: "Ustaw", fields: [{ name: "d", label: "Data i godzina (RRRR-MM-DD GG:MM)", placeholder: SP.date.add(SP.date.today(), 1) + " 09:00", required: true }] }).then(function (v) {
        if (!v) return; var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(v.d.trim());
        if (!m) { SP.toast("Wpisz datę jak 2026-11-20 09:00"); return; }
        set(new Date(m[1] + "T" + m[2].padStart(2, "0") + ":" + m[3] + ":00"));
      });
    } }]).concat(t.remind ? ["-", { label: "Usuń przypomnienie", icon: "x", danger: true, run: function () { db.setReminder(taskId, null); } }] : []));
    function set(d) {
      if (d <= new Date()) { SP.toast("Ta godzina już minęła"); return; }
      db.setReminder(taskId, d.toISOString());
      SP.toast("Przypomnę: " + fmtRemind(d.toISOString()));
      if (window.Notification && Notification.permission === "default") { try { Notification.requestPermission(); } catch (e) {} }
    }
  };
  function checkReminders() {
    var fired = db.fireReminders();
    fired.forEach(function (t) {
      SP.toast("⏰ Przypomnienie: " + t.title);
      if (window.Notification && Notification.permission === "granted") {
        try { var n = new Notification("Sprynt – przypomnienie", { body: t.title, icon: "img/logo.svg", tag: t.id }); n.onclick = function () { window.focus(); SP.openTask(t.id); }; } catch (e) {}
      }
    });
  }
  setInterval(checkReminders, 10000);
  setTimeout(checkReminders, 1500);

  /* =================== Menu „Więcej” w zadaniu =================== */
  SP.taskMoreMenu = function (anchor, taskId) {
    var t = db.task(taskId);
    SP.menu(anchor, [
      { label: "Zapisz jako szablon", icon: "files", run: function () {
        SP.form({ title: "Zapisz jako szablon", submit: "Zapisz", fields: [{ name: "n", label: "Nazwa szablonu", value: t.title, required: true }] }).then(function (v) {
          if (v && v.n) { db.saveTemplate(taskId, v.n); SP.toast("Zapisano szablon „" + v.n + "”"); }
        });
      } },
      { label: "Ustaw przypomnienie", icon: "alarm-clock", run: function () { SP.pickReminder(anchor, taskId); } },
      { label: "Dodaj zależność (czeka na…)", icon: "lock", run: function () { addDep(anchor, taskId); } },
      { label: "Pola niestandardowe listy", icon: "spreadsheet", run: function () { SP.manageFields(t.listId); } },
    ], { align: "right" });
  };

  /* =================== Eksport CSV =================== */
  SP.exportCSV = function (type, id) {
    var node = db[type](id); if (!node) return;
    var tasks = db.tasksIn({ type: type, id: id }, { subtasks: true });
    var lists = db.listsIn({ type: type, id: id });
    var fields = db.raw.fields.filter(function (f) { return lists.indexOf(f.listId) >= 0; });
    var head = ["ID", "Nazwa", "Status", "Priorytet", "Osoby", "Start", "Termin", "Tagi", "Lista", "Podzadanie w", "Czas (h)", "Czeka na", "Utworzono", "Ukończono"].concat(fields.map(function (f) { return f.name; }));
    var rows = tasks.map(function (t) {
      var parent = t.parentId ? db.task(t.parentId) : null;
      return [db.taskKey(t), t.title, db.status(t.status).name, t.priority ? db.priority(t.priority).name : "", t.assignees.map(function (a) { return (db.person(a) || {}).name; }).join(", "),
        t.start || "", t.due || "", t.tags.join(", "), db.pathOf(t).list.name, parent ? db.taskKey(parent) : "", (db.timeTotal(t) / 3600000).toFixed(2).replace(".", ","),
        db.waitingOn(t).map(db.taskKey).join(", "), t.createdAt.slice(0, 10), t.doneAt ? SP.date.ymd(new Date(t.doneAt)) : ""]
        .concat(fields.map(function (f) {
          var v = (t.cf || {})[f.id]; if (v == null || f.listId !== t.listId) return "";
          if (f.type === "select") { var o = f.options.find(function (x) { return x.id === v; }); return o ? o.name : ""; }
          if (f.type === "checkbox") return v ? "tak" : "";
          if (f.type === "number" || f.type === "money") return String(v).replace(".", ",");
          return String(v);
        }));
    });
    var csv = "﻿" + [head].concat(rows).map(function (r) { return r.map(function (c) { c = String(c == null ? "" : c); return /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
    a.href = url; a.download = (node.name || "zadania").replace(/[\\/:*?"<>|]+/g, "-") + " – zadania.csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    SP.toast("Wyeksportowano " + tasks.length + " zadań do CSV");
  };

  /* =================== Szablony =================== */
  views.templates = {
    title: function () { return "Szablony zadań"; },
    crumbs: function () { return [{ icon: "files", label: "Szablony zadań" }]; },
    render: function (el) {
      var tps = db.raw.templates;
      el.innerHTML = '<div class="page narrow"><div class="page-h"><h1>Szablony zadań</h1></div>' +
        (tps.length ? '<div class="tpl-list">' + tps.map(function (tp) {
          var k = tp.task, bits = [];
          if (k.subtasks.length) bits.push(ico("git-branch", 13) + k.subtasks.length + " podzadań");
          if (k.checklist.length) bits.push(ico("list-checks", 13) + k.checklist.length + " punktów checklisty");
          if (k.priority) bits.push(SP.flag(k.priority, true));
          if (k.tags.length) bits.push(k.tags.map(SP.tagChip).join(""));
          return '<div class="tpl" data-tpl="' + tp.id + '"><span class="tpl-ico">' + ico("files", 18) + '</span><div class="tpl-b"><b>' + esc(tp.name) + '</b><div class="tpl-meta muted">' + (bits.join("<i>·</i>") || "Pusty szablon") + "</div></div>" +
            '<button class="btn sm primary" data-use>' + ico("plus", 14) + 'Użyj</button><button class="ibtn" data-del title="Usuń szablon">' + ico("trash", 16) + "</button></div>";
        }).join("") + "</div>"
          : '<div class="empty-b">' + ico("files", 44) + "<h3>Brak szablonów</h3><p class='muted'>Otwórz dowolne zadanie, kliknij ⋯ w jego nagłówku i wybierz „Zapisz jako szablon”. Opis, checklista, podzadania, tagi i pola trafią do szablonu.</p></div>") + "</div>";
      el.addEventListener("click", function (e) {
        var row = e.target.closest("[data-tpl]"); if (!row) return;
        var tp = db.raw.templates.find(function (x) { return x.id === row.dataset.tpl; }); if (!tp) return;
        if (e.target.closest("[data-use]")) SP.quickTask({ tpl: tp.id, title: tp.task.title });
        if (e.target.closest("[data-del]")) SP.confirm("Usunąć szablon?", "„" + tp.name + "” zniknie. Zadania z niego utworzone zostają.").then(function (ok) { if (ok) db.removeTemplate(tp.id); });
      });
    },
  };

  /* =================== Kosz =================== */
  var KIND = { task: ["check", "Zadanie"], list: ["list", "Lista"], folder: ["folder", "Folder"], space: ["layout-dashboard", "Przestrzeń"], doc: ["file-text", "Dokument"], whiteboard: ["presentation", "Tablica online"] };
  views.trash = {
    title: function () { return "Kosz"; },
    crumbs: function () { return [{ icon: "trash", label: "Kosz" }]; },
    render: function (el) {
      var items = db.raw.trash;
      el.innerHTML = '<div class="page narrow"><div class="page-h"><h1>Kosz</h1>' + (items.length ? '<button class="btn ghost sm" data-empty>' + ico("trash", 15) + "Opróżnij kosz</button>" : "") + "</div>" +
        '<p class="muted trash-intro">Usunięte rzeczy czekają tu ' + db.TRASH_DAYS + " dni. Potem znikają na zawsze.</p>" +
        (items.length ? '<div class="trash-list">' + items.map(function (x) {
          var k = KIND[x.kind] || ["file", x.kind], left = Math.max(0, db.TRASH_DAYS - Math.floor((Date.now() - new Date(x.at)) / 864e5));
          var extra = x.kind === "task" && x.payload.tasks.length > 1 ? " + " + (x.payload.tasks.length - 1) + " podzadań" : (x.payload.tasks && x.kind !== "task" ? " · " + x.payload.tasks.length + " zadań" : "");
          return '<div class="tr-item" data-tr="' + x.id + '"><span class="tr-ico">' + ico(k[0], 17) + '</span><div class="tr-b"><b>' + esc(x.label || "Bez nazwy") + '</b><small class="muted">' + k[1] + esc(extra) + " · usunięto " + SP.ago(x.at) + " · zostało " + left + " dni</small></div>" +
            '<button class="btn sm" data-restore>' + ico("undo", 14) + 'Przywróć</button><button class="ibtn" data-purge title="Usuń na zawsze">' + ico("x", 16) + "</button></div>";
        }).join("") + "</div>" : '<div class="empty-b">' + ico("trash", 44) + "<h3>Kosz jest pusty</h3><p class='muted'>Usunięte zadania, listy, dokumenty i tablice pojawią się tutaj.</p></div>") + "</div>";
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-empty]")) { SP.confirm("Opróżnić kosz?", "Wszystko z kosza zniknie na zawsze.", "Opróżnij").then(function (ok) { if (ok) db.emptyTrash(); }); return; }
        var row = e.target.closest("[data-tr]"); if (!row) return;
        if (e.target.closest("[data-restore]")) { var x = db.restore(row.dataset.tr); if (x) SP.toast("Przywrócono „" + x.label + "”"); }
        if (e.target.closest("[data-purge]")) SP.confirm("Usunąć na zawsze?", "Tego nie da się cofnąć.").then(function (ok) { if (ok) db.purge(row.dataset.tr); });
      });
    },
  };

  /* =================== Czat =================== */
  var drafts = {}, EMOJI = ["👍", "❤️", "🎉", "✅", "😄", "👀"];
  function dayLabel(iso) {
    var y = SP.date.ymd(new Date(iso)), t = SP.date.today();
    if (y === t) return "Dziś"; if (y === SP.date.add(t, -1)) return "Wczoraj";
    return new Date(iso).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  }
  views.chat = {
    title: function (p) { var s = db.space(p.id) || db.raw.spaces[0]; return s ? "Czat · " + s.name : "Czat"; },
    crumbs: function (p) { var s = db.space(p.id) || db.raw.spaces[0]; return [{ icon: "message-square", label: "Czat" }].concat(s ? [{ space: s, label: s.name }] : []); },
    render: function (el, p) {
      var s = db.space(p.id) || db.raw.spaces[0];
      if (!s) { el.innerHTML = '<div class="page"><div class="empty-b"><h3>Najpierw utwórz przestrzeń</h3></div></div>'; return; }
      var msgs = db.messages(s.id), last = null, lastDay = null;
      var body = msgs.map(function (m) {
        var day = SP.date.ymd(new Date(m.at)), h = "";
        if (day !== lastDay) { h += '<div class="cm-day"><span>' + dayLabel(m.at) + "</span></div>"; last = null; lastDay = day; }
        var cont = last && last.by === m.by && new Date(m.at) - new Date(last.at) < 5 * 60000;
        var p2 = db.person(m.by) || { name: "?" };
        var reacts = Object.keys(m.reactions || {}).map(function (e) { var a = m.reactions[e]; return '<button class="cm-r' + (a.indexOf("me") >= 0 ? " on" : "") + '" data-react="' + e + '">' + e + "<b>" + a.length + "</b></button>"; }).join("");
        h += '<div class="cm' + (cont ? " cont" : "") + '" data-msg="' + m.id + '">' + (cont ? '<span class="cm-av"></span>' : '<span class="cm-av">' + SP.avatar(m.by) + "</span>") +
          '<div class="cm-b">' + (cont ? "" : '<div class="cm-h"><b>' + esc(p2.name) + "</b><time>" + new Date(m.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) + "</time></div>") +
          '<div class="cm-t">' + SP.richText(m.text) + (m.edited ? ' <small class="muted">(edytowano)</small>' : "") + "</div>" + (reacts ? '<div class="cm-rs">' + reacts + "</div>" : "") + "</div>" +
          '<div class="cm-acts">' + EMOJI.slice(0, 4).map(function (e) { return '<button class="cm-ea" data-react="' + e + '" title="Reakcja">' + e + "</button>"; }).join("") +
          '<button class="ibtn sm" data-mk-task title="Utwórz zadanie z wiadomości">' + ico("check", 14) + "</button>" +
          (m.by === "me" ? '<button class="ibtn sm" data-edit title="Edytuj">' + ico("pencil", 14) + '</button><button class="ibtn sm" data-del title="Usuń">' + ico("trash", 14) + "</button>" : "") + "</div></div>";
        last = m; return h;
      }).join("");
      el.innerHTML = '<div class="chat"><aside class="ch-side"><div class="ch-side-h">Kanały</div>' + db.raw.spaces.map(function (x) {
        var n = db.messages(x.id).length;
        return '<a class="ch-ch' + (x.id === s.id ? " on" : "") + '" href="#/chat/' + x.id + '">' + ico("hash", 15) + "<span>" + esc(x.name) + "</span>" + (n ? '<small class="muted">' + n + "</small>" : "") + "</a>";
      }).join("") + '</aside><section class="ch-main"><header class="ch-top">' + ico("hash", 18) + "<b>" + esc(s.name) + '</b><span class="muted">Czat przestrzeni · wspomnij kogoś przez @, zadanie przez SP-12</span><span class="grow"></span>' + SP.avatars(db.raw.people.map(function (x) { return x.id; }), "sm", 5) + "</header>" +
        '<div class="ch-msgs">' + (body || '<div class="empty-b ch-empty">' + ico("message-square", 44) + "<h3>Zacznij rozmowę w #" + esc(s.name) + "</h3><p class='muted'>Wiadomości widzą wszyscy w przestrzeni. Wpisz <b>@</b>, żeby kogoś wspomnieć, albo <b>SP-12</b>, żeby podlinkować zadanie.</p></div>") + "</div>" +
        '<form class="ch-comp"><button type="button" class="ibtn" data-at title="Wspomnij osobę">' + ico("at-sign", 18) + '</button><textarea rows="1" placeholder="Napisz do #' + esc(s.name) + '… (Enter wysyła)"></textarea><button class="btn primary sm" type="submit">' + ico("send-horizontal", 15) + "Wyślij</button></form></section></div>";
      var ta = el.querySelector("textarea"), list = el.querySelector(".ch-msgs"), form = el.querySelector(".ch-comp");
      ta.value = drafts[s.id] || "";
      function grow() { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; ta.style.overflowY = ta.scrollHeight > 160 ? "auto" : "hidden"; }
      ta.addEventListener("input", function () { drafts[s.id] = ta.value; grow(); mention(); });
      ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !document.querySelector(".popover")) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener("submit", function (e) {
        e.preventDefault(); var v = ta.value.trim(); if (!v) return;
        drafts[s.id] = ""; db.addMessage(s.id, v);
        setTimeout(function () { var t2 = document.querySelector(".ch-comp textarea"); if (t2) t2.focus(); }, 30);
      });
      function insertMention(p3) {
        var pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/@[^\s@]*$/, ""), after = ta.value.slice(pos);
        ta.value = before + "@" + p3.name + " " + after; drafts[s.id] = ta.value; ta.focus();
        var c = (before + "@" + p3.name + " ").length; ta.setSelectionRange(c, c);
      }
      function mention() {
        var m = /@([^\s@]*)$/.exec(ta.value.slice(0, ta.selectionStart));
        if (!m) { if (document.querySelector(".popover.ment")) SP.closePopover(); return; }
        var q = m[1].toLowerCase(), ppl = db.raw.people.filter(function (x) { return x.name.toLowerCase().indexOf(q) === 0 || x.name.toLowerCase().indexOf(" " + q) >= 0; });
        if (!ppl.length) { SP.closePopover(); return; }
        SP.menu(ta, ppl.slice(0, 6).map(function (x) { return { html: SP.avatar(x.id, "xs") + "<span>" + esc(x.name) + "</span>", run: function () { insertMention(x); } }; }), { cls: "pm ment" });
        ta.focus();
      }
      el.querySelector("[data-at]").onclick = function (e) {
        SP.menu(e.currentTarget, [{ header: "Wspomnij" }].concat(db.raw.people.map(function (x) { return { html: SP.avatar(x.id, "xs") + "<span>" + esc(x.name) + "</span>", run: function () { insertMention(x); } }; })));
      };
      list.addEventListener("click", function (e) {
        var row = e.target.closest("[data-msg]"); if (!row) return;
        var m = db.raw.chat.find(function (x) { return x.id === row.dataset.msg; }); if (!m) return;
        var b;
        if ((b = e.target.closest("[data-react]"))) { db.react(m.id, b.dataset.react); return; }
        if (e.target.closest("[data-del]")) { SP.confirm("Usunąć wiadomość?", "Wiadomość zniknie z czatu.").then(function (ok) { if (ok) db.deleteMessage(m.id); }); return; }
        if (e.target.closest("[data-edit]")) { SP.form({ title: "Edytuj wiadomość", fields: [{ name: "t", label: "Treść", value: m.text, required: true }] }).then(function (v) { if (v && v.t) db.editMessage(m.id, v.t); }); return; }
        if (e.target.closest("[data-mk-task]")) {
          var l = db.raw.lists.find(function (x) { return x.spaceId === s.id; });
          SP.quickTask({ listId: l && l.id, title: m.text.replace(/\s+/g, " ").slice(0, 120) });
        }
      });
      grow();
      setTimeout(function () { list.scrollTop = list.scrollHeight; if (document.activeElement === document.body || !document.activeElement) ta.focus(); }, 0);
    },
  };
})();
