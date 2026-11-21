/* Sprynt – okno szczegółów zadania. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, esc = SP.esc, ico = SP.ico;
  var open = null; // { id, bg, unsub }

  SP.openTask = function (id) {
    var t = db.task(id); if (!t) return;
    if (open) close(true);
    db.addRecent("task", id);
    var bg = SP.el(
      '<div class="tm-bg"><div class="tm" role="dialog" aria-modal="true" aria-label="Zadanie">' +
      '<header class="tm-top"><div class="tm-crumbs"></div><span class="tm-key"></span>' +
      '<button class="ibtn" data-act="copy" title="Kopiuj ID">' + ico("copy", 16) + "</button>" +
      '<button class="ibtn" data-act="dup" title="Duplikuj zadanie">' + ico("files", 16) + "</button>" +
      '<button class="ibtn" data-act="del" title="Usuń zadanie">' + ico("trash", 16) + "</button>" +
      '<button class="ibtn" data-act="more" title="Więcej">' + ico("ellipsis", 16) + "</button>" +
      '<button class="ibtn" data-act="close" title="Zamknij (Esc)">' + ico("x", 18) + "</button></header>" +
      '<div class="tm-body"><div class="tm-main"></div>' +
      '<aside class="tm-side"><div class="tm-side-h">Aktywność</div><div class="tm-feed"></div>' +
      '<form class="tm-comment"><textarea placeholder="Napisz komentarz… (Enter wysyła, Shift+Enter nowa linia)" rows="2"></textarea>' +
      '<button class="ibtn send" type="submit" title="Wyślij">' + ico("send-horizontal", 17) + "</button></form></aside></div></div></div>"
    );
    document.body.appendChild(bg);
    open = { id: id, bg: bg };
    renderAll();
    open.unsub = db.onChange(function () { if (!open) return; if (!db.task(open.id)) { close(); return; } renderAll(true); });

    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    // Upuszczenie plików na okno zadania = załączniki.
    var tmEl = bg.querySelector(".tm");
    tmEl.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) { e.preventDefault(); tmEl.classList.add("drop-over"); } });
    tmEl.addEventListener("dragleave", function (e) { if (!tmEl.contains(e.relatedTarget)) tmEl.classList.remove("drop-over"); });
    tmEl.addEventListener("drop", function (e) { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); tmEl.classList.remove("drop-over"); SP.uploadFiles(e.dataTransfer.files, { taskId: open.id }); });
    bg.querySelector('[data-act="close"]').onclick = function () { close(); };
    bg.querySelector('[data-act="more"]').onclick = function (e) { if (SP.taskMoreMenu) SP.taskMoreMenu(e.currentTarget, open.id); };
    bg.querySelector('[data-act="dup"]').onclick = function () {
      var c = db.duplicateTask(open.id); if (c) { SP.toast("Utworzono kopię " + db.taskKey(c)); SP.openTask(c.id); }
    };
    bg.querySelector('[data-act="copy"]').onclick = function () {
      var key = db.taskKey(db.task(open.id));
      (navigator.clipboard ? navigator.clipboard.writeText(key) : Promise.reject()).then(function () { SP.toast("Skopiowano " + key); }, function () { SP.toast(key); });
    };
    bg.querySelector('[data-act="del"]').onclick = function () {
      var tt = db.task(open.id);
      SP.confirm("Usunąć zadanie?", "„" + tt.title + "” i jego podzadania trafią do kosza (możesz je przywrócić przez 30 dni).").then(function (ok) { if (ok) { db.deleteTask(tt.id); SP.toast("Usunięto zadanie"); } });
    };
    var ta = bg.querySelector(".tm-comment textarea");
    bg.querySelector(".tm-comment").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = ta.value.trim(); if (!v) return;
      db.addComment(open.id, v); ta.value = "";
    });
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); bg.querySelector(".tm-comment").requestSubmit(); } });
    document.addEventListener("keydown", onKey, true);
  };

  function onKey(e) {
    if (e.key !== "Escape" || !open) return;
    if (document.querySelector(".popover") || document.querySelector(".dlg-bg")) return; // najpierw zamknij popover/dialog
    var a = document.activeElement;
    if (a && a.isContentEditable) { a.blur(); return; }
    close();
  }
  function close(silent) {
    if (!open) return;
    flushEdits();
    open.unsub && open.unsub();
    open.bg.remove();
    open = null;
    document.removeEventListener("keydown", onKey, true);
    SP.closePopover();
    if (!silent && SP.afterTaskClose) SP.afterTaskClose();
  }
  SP.closeTask = close;
  SP.currentTaskId = function () { return open ? open.id : null; };

  function flushEdits() {
    if (!open) return;
    var t = db.task(open.id); if (!t) return;
    var title = open.bg.querySelector(".tm-title"), desc = open.bg.querySelector(".tm-desc");
    if (title) { var v = title.innerText.trim(); if (v && v !== t.title) db.updateTask(t.id, { title: v }, "zmienił(a) nazwę"); }
    if (desc && desc.innerHTML !== t.desc) db.updateTask(t.id, { desc: desc.innerText.trim() ? desc.innerHTML : "" });
  }

  function renderAll(partial) {
    var t = db.task(open.id), bg = open.bg;
    var p = db.pathOf(t);
    bg.querySelector(".tm-crumbs").innerHTML =
      SP.spaceIcon(p.space, "xs") + '<span>' + esc(p.space.name) + "</span>" +
      (p.folder ? "<i>/</i><span>" + esc(p.folder.name) + "</span>" : "") +
      '<i>/</i><button class="crumb-btn" data-pick="list">' + esc(p.list.name) + ico("chevron-down", 12) + "</button>";
    bg.querySelector(".tm-key").textContent = db.taskKey(t);

    var main = bg.querySelector(".tm-main");
    var editing = main.contains(document.activeElement) && document.activeElement.isContentEditable;
    if (!partial || !editing) {
      var parent = t.parentId ? db.task(t.parentId) : null;
      var st = db.status(t.status);
      main.innerHTML =
        (parent ? '<button class="tm-parent" data-open="' + parent.id + '">' + ico("git-branch", 14) + "Podzadanie w: <b>" + esc(parent.title) + "</b></button>" : "") +
        '<div class="tm-status-row">' +
        '<button class="tm-status" data-pick="status" style="--c:' + st.color + '">' + esc(st.name) + ico("chevron-down", 13) + "</button>" +
        '<button class="tm-done' + (st.closed ? " on" : "") + '" data-act="complete" title="' + (st.closed ? "Otwórz ponownie" : "Oznacz jako ukończone") + '">' + ico("check", 15) + "</button>" +
        "</div>" +
        '<h1 class="tm-title" contenteditable="true" spellcheck="false"></h1>' +
        '<div class="props">' +
        '<div class="prop"><span class="prop-l">' + ico("users", 15) + 'Przypisani</span><button class="prop-v" data-pick="assignees">' + SP.avatars(t.assignees, "sm", 6) + (t.assignees.length ? "" : '<span class="muted">Puste</span>') + "</button></div>" +
        '<div class="prop"><span class="prop-l">' + ico("calendar-clock", 15) + 'Start</span><button class="prop-v" data-pick="start">' + (t.start ? '<span class="due">' + ico("calendar", 14) + SP.fmtDue(t.start, true).label + "</span>" : '<span class="muted">Puste</span>') + "</button></div>" +
        '<div class="prop"><span class="prop-l">' + ico("calendar", 15) + 'Termin</span><button class="prop-v" data-pick="due">' + dueHTML(t) + "</button></div>" +
        '<div class="prop"><span class="prop-l">' + ico("flag", 15) + 'Priorytet</span><button class="prop-v" data-pick="priority">' + (t.priority ? SP.flag(t.priority, true) : '<span class="muted">Puste</span>') + "</button></div>" +
        '<div class="prop"><span class="prop-l">' + ico("tag", 15) + 'Tagi</span><button class="prop-v" data-pick="tags">' + (t.tags.length ? t.tags.map(SP.tagChip).join("") : '<span class="muted">Puste</span>') + "</button></div>" +
        '<div class="prop"><span class="prop-l">' + ico("repeat", 15) + 'Powtarzanie</span><button class="prop-v" data-pick="recur">' + (t.recur ? "<span>" + cap(db.RECUR[t.recur]) + "</span>" : '<span class="muted">Nie powtarza się</span>') + "</button></div>" +
        '<div class="prop"><span class="prop-l">' + ico("clock", 15) + 'Czas</span><span class="prop-v static"><span data-live-total="' + t.id + '">' + (db.timeTotal(t) ? db.fmtDuration(db.timeTotal(t)) : "0 min") + "</span>" + timerBtnHTML(t, true) + "</span></div>" +
        (SP.taskProps ? SP.taskProps(t) : "") +
        "</div>" + (SP.taskFields ? SP.taskFields(t) : "") +
        '<div class="tm-sec"><div class="tm-sec-h">Opis</div><div class="tm-desc" contenteditable="true" data-ph="Dodaj opis…"></div></div>' +
        (SP.taskDeps ? SP.taskDeps(t) : "") +
        attachmentsHTML(t) +
        timeHTML(t) +
        (t.parentId ? "" : subtasksHTML(t)) +
        checklistHTML(t);
      main.querySelector(".tm-title").textContent = t.title;
      main.querySelector(".tm-desc").innerHTML = t.desc || "";
      bindMain(main);
      if (SP.bindTaskExtras) SP.bindTaskExtras(main, t.id);
    }
    renderFeed();
    SP.hydrateIcons(bg);
  }

  function dueHTML(t) {
    if (!t.due) return '<span class="muted">Puste</span>';
    var d = SP.fmtDue(t.due, db.status(t.status).closed);
    return '<span class="due ' + d.cls + '">' + ico("calendar", 14) + d.label + "</span>";
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function isRunning(t) { return (t.time || []).some(function (e) { return !e.end; }); }
  function timerBtnHTML(t, small) {
    var on = isRunning(t);
    return '<button class="timer-btn' + (on ? " on" : "") + (small ? " sm" : "") + '" data-timer title="' + (on ? "Zatrzymaj stoper" : "Włącz stoper") + '">' + ico(on ? "pause" : "play", small ? 12 : 15) +
      (small ? "" : "<span>" + (on ? "Zatrzymaj" : "Włącz stoper") + "</span>") + "</button>";
  }
  function timeHTML(t) {
    var entries = (t.time || []).slice().reverse();
    return '<div class="tm-sec"><div class="tm-sec-h">' + ico("clock", 15) + "Śledzenie czasu" + '<span class="muted" data-live-total="' + t.id + '">' + (db.timeTotal(t) ? db.fmtDuration(db.timeTotal(t)) : "") + "</span></div>" +
      '<div class="time-row">' + timerBtnHTML(t) + '<form class="time-add" data-form="time"><input placeholder="Dodaj ręcznie, np. 1h 30m albo 45" aria-label="Dodaj czas ręcznie" /><button class="btn sm" type="submit">Dodaj</button></form></div>' +
      (entries.length ? '<div class="time-list">' + entries.map(function (e) {
        var ms = (e.end ? new Date(e.end) : new Date()) - new Date(e.start);
        return '<div class="time-e"><span>' + new Date(e.start).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) + ", " + new Date(e.start).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) +
          (e.manual ? ' <small class="muted">(ręcznie)</small>' : "") + "</span><b" + (e.end ? "" : ' data-live-entry="' + e.id + '"') + ">" + (e.end ? db.fmtDuration(ms) : db.fmtDuration(ms, true)) + "</b>" +
          (e.end ? '<button class="ibtn sm" data-time-del="' + e.id + '" title="Usuń wpis">' + ico("x", 12) + "</button>" : '<span class="live-dot"></span>') + "</div>";
      }).join("") + "</div>" : "") + "</div>";
  }
  function attachmentsHTML(t) {
    var files = db.filesFor(t.id);
    return '<div class="tm-sec"><div class="tm-sec-h">' + ico("paperclip", 15) + "Załączniki" + (files.length ? '<span class="muted">' + files.length + "</span>" : "") +
      '<button class="tm-sec-add" data-attach>' + ico("upload", 14) + "Dodaj plik</button></div>" +
      (files.length ? '<div class="att-grid">' + files.map(function (f) {
        return '<div class="att" data-file="' + f.id + '"><button class="att-main" data-file-open title="Otwórz">' + SP.fileTile(f, "lg") + '<span class="att-n">' + esc(f.name) + '</span><small class="muted">' + SP.fmtSize(f.size) + "</small></button>" +
          '<span class="att-acts"><button class="ibtn sm" data-file-dl title="Pobierz">' + ico("download", 13) + '</button><button class="ibtn sm" data-file-del title="Usuń">' + ico("x", 13) + "</button></span></div>";
      }).join("") + "</div>" : '<button class="att-drop" data-attach>' + ico("file-dropzone", 18) + "Upuść pliki tutaj albo kliknij, żeby wybrać</button>") + "</div>";
  }
  function subtasksHTML(t) {
    var subs = db.subtasks(t.id), done = subs.filter(function (s) { return db.status(s.status).closed; }).length;
    return '<div class="tm-sec"><div class="tm-sec-h">' + ico("git-branch", 15) + "Podzadania" + (subs.length ? '<span class="muted">' + done + "/" + subs.length + "</span>" : "") +
      (SP.splitTask ? '<button class="tm-sec-add" data-split title="Rozbij na mniejsze kroki – z listy kontrolnej, opisu albo przez AI">' + ico("split", 14) + "Rozbij zadanie</button>" : "") + "</div>" +
      (subs.length ? '<div class="progress sub-prog"><i style="width:' + Math.round(done / subs.length * 100) + '%"></i></div>' : "") +
      '<div class="sub-list">' + subs.map(function (s) {
        var d = SP.fmtDue(s.due, db.status(s.status).closed);
        return '<div class="sub-row' + (db.status(s.status).closed ? " closed" : "") + '"><button class="st-btn" data-sub-status="' + s.id + '" title="Zmień status">' + SP.statusDot(s.status) + '</button><button class="sub-title" data-open="' + s.id + '">' + esc(s.title) + "</button>" +
          (s.due ? '<span class="due ' + d.cls + '">' + d.label + "</span>" : "") + SP.avatars(s.assignees, "xs") + "</div>";
      }).join("") + "</div>" +
      '<form class="add-inline" data-form="sub"><span class="add-plus">' + ico("plus", 14) + '</span><input placeholder="Dodaj podzadanie i naciśnij Enter" /></form></div>';
  }
  function checklistHTML(t) {
    var done = t.checklist.filter(function (c) { return c.done; }).length, n = t.checklist.length;
    return '<div class="tm-sec"><div class="tm-sec-h">' + ico("list-checks", 15) + "Lista kontrolna" + (n ? '<span class="muted">' + done + "/" + n + "</span>" : "") + "</div>" +
      (n ? '<div class="progress"><i style="width:' + Math.round(done / n * 100) + '%"></i></div>' : "") +
      '<div class="cl-list">' + t.checklist.map(function (c) {
        return '<div class="cl-row' + (c.done ? " done" : "") + '"><button class="cbox' + (c.done ? " on" : "") + '" data-cl="' + c.id + '" aria-label="Zaznacz">' + (c.done ? ico("check", 12) : "") + "</button><span>" + esc(c.text) +
          '</span><button class="ibtn sm" data-cl-del="' + c.id + '" title="Usuń">' + ico("x", 13) + "</button></div>";
      }).join("") + "</div>" +
      '<form class="add-inline" data-form="cl"><span class="add-plus">' + ico("plus", 14) + '</span><input placeholder="Dodaj element listy kontrolnej" /></form></div>';
  }

  function bindMain(main) {
    var t = function () { return db.task(open.id); };
    var title = main.querySelector(".tm-title");
    title.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); title.blur(); } });
    title.addEventListener("blur", function () {
      var v = title.innerText.trim();
      if (!v) { title.textContent = t().title; return; }
      if (v !== t().title) db.updateTask(t().id, { title: v }, "zmienił(a) nazwę");
    });
    var desc = main.querySelector(".tm-desc");
    desc.addEventListener("blur", function () {
      var html = desc.innerText.trim() ? desc.innerHTML : "";
      if (html !== t().desc) db.updateTask(t().id, { desc: html }, "zaktualizował(a) opis");
    });
    main.querySelectorAll("[data-open]").forEach(function (b) { b.onclick = function () { SP.openTask(b.dataset.open); }; });
    main.querySelectorAll("[data-timer]").forEach(function (b) { b.onclick = function () { isRunning(t()) ? db.stopTimer() : db.startTimer(t().id); }; });
    main.querySelectorAll("[data-time-del]").forEach(function (b) { b.onclick = function () { db.removeTime(t().id, b.dataset.timeDel); }; });
    var tf = main.querySelector('form[data-form="time"]');
    if (tf) tf.addEventListener("submit", function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      var inp = tf.querySelector("input"), ms = db.parseDuration(inp.value);
      if (!ms) { SP.toast("Nie rozumiem czasu. Wpisz np. 1h 30m, 45m albo 90 (minuty)."); inp.focus(); return; }
      db.addTime(t().id, ms); SP.toast("Dodano " + db.fmtDuration(ms));
    }, true);
    var sp = main.querySelector("[data-split]"); if (sp) sp.onclick = function () { flushEdits(); SP.splitTask(t().id); };
    main.querySelectorAll("[data-attach]").forEach(function (b) { b.onclick = function () { SP.pickFiles({ taskId: t().id }); }; });
    main.querySelectorAll("[data-file]").forEach(function (row) {
      var id = row.dataset.file;
      row.querySelector("[data-file-open]").onclick = function () { SP.previewFile(id); };
      row.querySelector("[data-file-dl]").onclick = function () { SP.downloadFile(id); };
      row.querySelector("[data-file-del]").onclick = function () { SP.deleteFile(id); };
    });
    main.querySelector('[data-act="complete"]').onclick = function () {
      var closed = db.status(t().status).closed, next = closed ? "todo" : "done";
      db.updateTask(t().id, { status: next }, "zmienił(a) status na " + db.status(next).name);
      if (!closed) SP.toast("Ukończono " + db.taskKey(t()));
    };
    main.querySelectorAll("[data-sub-status]").forEach(function (b) {
      b.onclick = function () {
        var s = db.task(b.dataset.subStatus);
        SP.pickStatus(b, s.status, function (v) { db.updateTask(s.id, { status: v }, "zmienił(a) status na " + db.status(v).name); });
      };
    });
    main.querySelectorAll("[data-cl]").forEach(function (b) {
      b.onclick = function () {
        var cl = t().checklist.map(function (c) { return c.id === b.dataset.cl ? Object.assign({}, c, { done: !c.done }) : c; });
        db.updateTask(t().id, { checklist: cl });
      };
    });
    main.querySelectorAll("[data-cl-del]").forEach(function (b) {
      b.onclick = function () { db.updateTask(t().id, { checklist: t().checklist.filter(function (c) { return c.id !== b.dataset.clDel; }) }); };
    });
    main.querySelectorAll("form.add-inline").forEach(function (f) {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var inp = f.querySelector("input"), v = inp.value.trim(); if (!v) return;
        if (f.dataset.form === "sub") {
          if (SP.smartFields) { var sf = SP.smartFields(inp, { listId: t().listId, parentId: t().id, assignees: [] }); v = sf.title; db.createTask(sf); }
          else db.createTask({ listId: t().listId, parentId: t().id, title: v, assignees: [] });
          db.updateTask(t().id, {}, "dodał(a) podzadanie „" + v + "”");
        } else {
          db.updateTask(t().id, { checklist: t().checklist.concat([{ id: Math.random().toString(36).slice(2, 8), text: v, done: false }]) });
        }
        setTimeout(function () { var again = open && open.bg.querySelector('form[data-form="' + f.dataset.form + '"] input'); if (again) again.focus(); }, 0);
      });
    });
  }

  // Wybieraki (delegacja – działa też po przerysowaniu)
  document.addEventListener("click", function (e) {
    if (!open) return;
    var b = e.target.closest("[data-pick]"); if (!b || !open.bg.contains(b)) return;
    var t = db.task(open.id), kind = b.dataset.pick;
    if (kind === "status") SP.pickStatus(b, t.status, function (v) { db.updateTask(t.id, { status: v }, "zmienił(a) status na " + db.status(v).name); });
    else if (kind === "priority") SP.pickPriority(b, t.priority, function (v) { db.updateTask(t.id, { priority: v }, v ? "ustawił(a) priorytet: " + db.priority(v).name : "usunął/usunęła priorytet"); });
    else if (kind === "assignees") SP.pickAssignees(b, t.assignees, function (v) { db.updateTask(t.id, { assignees: v }); });
    else if (kind === "start") SP.pickDate(b, t.start, function (v) { db.updateTask(t.id, { start: v }, v ? "ustawił(a) datę startu: " + SP.fmtDue(v, true).label : "usunął/usunęła datę startu"); });
    else if (kind === "recur") SP.menu(b, [{ header: "Powtarzaj zadanie" }].concat([[null, "Nie powtarzaj"], ["daily", "Codziennie"], ["weekly", "Co tydzień"], ["monthly", "Co miesiąc"]].map(function (x) {
      return { label: x[1], active: (t.recur || null) === x[0], run: function () { db.updateTask(t.id, { recur: x[0], recurNext: null }, x[0] ? "ustawił(a) powtarzanie: " + db.RECUR[x[0]] : "wyłączył(a) powtarzanie"); if (x[0] && !t.due) SP.toast("Ustaw też termin – kolejne wystąpienie przesunie się od niego."); } };
    })));
    else if (kind === "due") SP.pickDate(b, t.due, function (v) { db.updateTask(t.id, { due: v }, v ? "ustawił(a) termin: " + SP.fmtDue(v).label : "usunął/usunęła termin"); });
    else if (kind === "tags") SP.pickTags(b, t.tags, function (v) { db.updateTask(t.id, { tags: v }); });
    else if (kind === "list") SP.pickList(b, t.listId, function (v) {
      db.updateTask(t.id, { listId: v }, "przeniósł/przeniosła do listy " + db.list(v).name);
      db.subtasks(t.id).forEach(function (s) { db.updateTask(s.id, { listId: v }); });
    });
  });

  function renderFeed() {
    var t = db.task(open.id), feed = open.bg.querySelector(".tm-feed");
    var items = t.activity.map(function (a) { return { kind: "act", at: a.at, by: a.by, text: a.text }; })
      .concat(t.comments.map(function (c) { return { kind: "com", at: c.at, by: c.by, text: c.text }; }))
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    feed.innerHTML = items.map(function (it) {
      var p = db.person(it.by) || { name: "?" };
      if (it.kind === "act") return '<div class="fa"><span class="fa-dot"></span><span><b>' + esc(p.name) + "</b> " + esc(it.text) + '</span><time>' + SP.ago(it.at) + "</time></div>";
      return '<div class="fc">' + SP.avatar(it.by, "sm") + '<div class="fc-b"><div class="fc-h"><b>' + esc(p.name) + "</b><time>" + SP.ago(it.at) + '</time></div><div class="fc-t">' + (SP.richText ? SP.richText(it.text) : esc(it.text).replace(/\n/g, "<br>")) + "</div></div></div>";
    }).join("");
    feed.scrollTop = feed.scrollHeight;
  }
})();
