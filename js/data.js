/* Sprynt – dane.
 * Cały stan w jednym obiekcie, zapisywany do localStorage (klucz "sprynt:db").
 * Wszystkie zmiany idą przez SP.db.* – widoki nie dotykają localStorage.
 */
(function () {
  "use strict";
  var SP = (window.SP = window.SP || {});
  // Dane są osobne dla każdego konta. Bez zalogowania SP.db nie powstaje (app.html przekierowuje do logowania).
  var user = window.SPAuth && SPAuth.current();
  if (!user) return;
  SP.user = user;
  var KEY = "sprynt:db:" + user.id, AI_KEY = "sprynt:ai:" + user.id, SYNC_KEY = "sprynt:sync:" + user.id;
  var VERSION = 1;

  var uid = function (p) { return (p || "") + Math.random().toString(36).slice(2, 9); };

  var STATUSES = [
    { id: "todo", name: "Do zrobienia", color: "#87909e" },
    { id: "progress", name: "W toku", color: "#5b6cf9" },
    { id: "review", name: "Do przeglądu", color: "#f0a020" },
    { id: "done", name: "Ukończone", color: "#1aae6f", closed: true },
  ];
  var PRIORITIES = [
    { id: "urgent", name: "Pilny", color: "#e5484d" },
    { id: "high", name: "Wysoki", color: "#f5a623" },
    { id: "normal", name: "Normalny", color: "#4f7cff" },
    { id: "low", name: "Niski", color: "#a0a7b4" },
  ];

  /** Pusty projekt dla nowego konta: jedna przestrzeń z jedną pustą listą. */
  function emptyWorkspace(user) {
    return {
      version: VERSION,
      people: [{ id: "me", name: user.name, email: user.email, color: "#6c5ce7" }],
      spaces: [{ id: "sp-1", name: user.firstProject || "Mój projekt", color: "#6c5ce7" }],
      folders: [],
      lists: [{ id: "li-1", spaceId: "sp-1", folderId: null, name: "Zadania" }],
      tasks: [], tags: [], notifications: [], docs: [], favorites: [], recents: [], files: [],
      goals: [], automations: [], whiteboards: [], fields: [], trash: [], chat: [], templates: [], sprints: [],
      ui: { expanded: { "sp-1": true }, views: {} },
    };
  }

  var data;
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); if (d && d.version === VERSION) return d; } } catch (e) {}
    return emptyWorkspace(user);
  }
  var saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { SP.toast && SP.toast("Nie udało się zapisać – brak miejsca w przeglądarce"); }
      if (SP.cloudDirty) SP.cloudDirty();
    }, 120);
  }
  data = load();
  // Konta założone przed dodaniem nowych funkcji.
  ["files", "goals", "automations", "whiteboards", "fields", "trash", "chat", "templates", "sprints"].forEach(function (k) { if (!Array.isArray(data[k])) data[k] = []; });
  save();

  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var RECUR = { daily: "codziennie", weekly: "co tydzień", monthly: "co miesiąc" };
  function shiftDate(s, recur) {
    var d = new Date(s + "T00:00:00");
    if (recur === "daily") d.setDate(d.getDate() + 1);
    else if (recur === "weekly") d.setDate(d.getDate() + 7);
    else if (recur === "monthly") d.setMonth(d.getMonth() + 1);
    return ymd(d);
  }

  var listeners = new Set();
  function changed(what) { save(); listeners.forEach(function (fn) { fn(what); }); }

  var byId = function (arr, id) { return arr.find(function (x) { return x.id === id; }); };

  /* ---- Kosz: usunięte rzeczy przez 30 dni ---- */
  var TRASH_DAYS = 30;
  function trashPush(kind, label, payload) {
    data.trash.unshift({ id: uid("x"), kind: kind, label: label || "", at: new Date().toISOString(), payload: JSON.parse(JSON.stringify(payload)) });
    if (data.trash.length > 300) data.trash.length = 300;
  }
  data.trash = data.trash.filter(function (x) { return Date.now() - new Date(x.at) < TRASH_DAYS * 864e5; });

  /* ---- Po zmianie zadania: data ukończenia + automatyzacje ---- */
  function afterChange(t, before) {
    var closedNow = SP.db.status(t.status).closed, closedBefore = SP.db.status(before.status).closed;
    if (closedNow && !closedBefore) t.doneAt = new Date().toISOString();
    if (!closedNow) t.doneAt = null;
    if (t.status !== before.status) runAutomations("status", t, t.status);
    if (t.priority !== before.priority && t.priority) runAutomations("priority", t, t.priority);
    t.assignees.forEach(function (a) { if (before.assignees.indexOf(a) < 0) runAutomations("assigned", t, a); });
  }
  var TRIGGERS = {
    created: "Utworzono zadanie",
    status: "Status zmienił się na…",
    priority: "Priorytet zmienił się na…",
    assigned: "Przypisano osobę…",
  };
  var ACTIONS = {
    status: "Zmień status na…",
    priority: "Ustaw priorytet…",
    assign: "Przypisz osobę…",
    tag: "Dodaj tag…",
    due: "Ustaw termin za … dni",
    move: "Przenieś do listy…",
    comment: "Dodaj komentarz…",
  };
  var autoDepth = 0;
  /** Uruchamia pasujące reguły. Akcje zmieniają zadanie bezpośrednio; łańcuch reguł ma limit 3 poziomów. */
  function runAutomations(event, t, value) {
    if (autoDepth > 2 || !data.automations || !data.automations.length) return;
    var l = byId(data.lists, t.listId) || {};
    data.automations.forEach(function (a) {
      if (!a.on || a.trigger.type !== event) return;
      if (a.spaceId && a.spaceId !== l.spaceId) return;
      if (event !== "created" && a.trigger.value && a.trigger.value !== value) return;
      autoDepth++;
      try {
        var before = { status: t.status, priority: t.priority, assignees: t.assignees.slice() }, v = a.action.value, did = "";
        switch (a.action.type) {
          case "status": if (t.status !== v) { t.status = v; did = "zmieniła status na „" + SP.db.status(v).name + "”"; } break;
          case "priority": if (t.priority !== v) { t.priority = v; did = "ustawiła priorytet „" + (SP.db.priority(v) || {}).name + "”"; } break;
          case "assign": if (t.assignees.indexOf(v) < 0) { t.assignees.push(v); did = "przypisała " + ((SP.db.person(v) || {}).name || "osobę"); } break;
          case "tag": if (v && t.tags.indexOf(v) < 0) { if (!SP.db.tag(v)) SP.db.createTag(v); t.tags.push(v); did = "dodała tag „" + v + "”"; } break;
          case "due": var d = new Date(); d.setDate(d.getDate() + (parseInt(v, 10) || 0)); t.due = ymd(d); did = "ustawiła termin " + t.due; break;
          case "move": if (byId(data.lists, v) && t.listId !== v) { t.listId = v; did = "przeniosła do listy „" + byId(data.lists, v).name + "”"; } break;
          case "comment": if (v) { t.comments.push({ id: uid("m"), by: "me", text: v, at: new Date().toISOString(), auto: true }); did = "dodała komentarz"; } break;
        }
        if (did) {
          a.runs = (a.runs || 0) + 1; a.lastRun = new Date().toISOString();
          t.activity.push({ by: "me", text: "⚡ automatyzacja „" + a.name + "” " + did, at: new Date().toISOString() });
          afterChange(t, before);
        }
      } finally { autoDepth--; }
    });
  }

  SP.db = {
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    me: "me",
    get raw() { return data; },
    onChange: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    changed: changed,

    status: function (id) { return byId(STATUSES, id) || STATUSES[0]; },
    priority: function (id) { return byId(PRIORITIES, id); },
    person: function (id) { return byId(data.people, id); },
    space: function (id) { return byId(data.spaces, id); },
    folder: function (id) { return byId(data.folders, id); },
    list: function (id) { return byId(data.lists, id); },
    task: function (id) { return byId(data.tasks, id); },
    doc: function (id) { return byId(data.docs, id); },
    tag: function (name) { return data.tags.find(function (t) { return t.name === name; }); },

    /** Listy należące do miejsca: przestrzeni, folderu albo pojedynczej listy. */
    listsIn: function (loc) {
      if (loc.type === "list") return [loc.id];
      return data.lists.filter(function (l) { return loc.type === "space" ? l.spaceId === loc.id : l.folderId === loc.id; }).map(function (l) { return l.id; });
    },
    tasksIn: function (loc, opts) {
      opts = opts || {};
      var ids = new Set(SP.db.listsIn(loc));
      return data.tasks.filter(function (t) { return ids.has(t.listId) && (opts.subtasks || !t.parentId); });
    },
    subtasks: function (id) { return data.tasks.filter(function (t) { return t.parentId === id; }); },
    taskKey: function (t) { return "SP-" + t.num; },
    pathOf: function (t) {
      var l = SP.db.list(t.listId) || {}, f = l.folderId ? SP.db.folder(l.folderId) : null, s = SP.db.space(l.spaceId) || {};
      return { space: s, folder: f, list: l };
    },

    createTask: function (fields) {
      var num = data.tasks.reduce(function (m, t) { return Math.max(m, t.num); }, 0) + 1;
      var t = Object.assign({
        id: uid("t"), num: num, parentId: null, status: "todo", priority: null, assignees: [], due: null, tags: [], desc: "",
        checklist: [], comments: [], start: null, time: [], recur: null, cf: {}, deps: [], remind: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        activity: [{ by: "me", text: "utworzył(a) to zadanie", at: new Date().toISOString() }],
      }, fields);
      if (SP.db.status(t.status).closed && !t.doneAt) t.doneAt = new Date().toISOString();
      data.tasks.push(t);
      runAutomations("created", t, null);
      changed("tasks"); return t;
    },
    updateTask: function (id, patch, activityText) {
      var t = SP.db.task(id); if (!t) return;
      var wasClosed = SP.db.status(t.status).closed, before = { status: t.status, priority: t.priority, assignees: t.assignees.slice() };
      Object.assign(t, patch, { updatedAt: new Date().toISOString() });
      if (activityText) t.activity.push({ by: "me", text: activityText, at: new Date().toISOString() });
      afterChange(t, before);
      // Ukończenie zadania powtarzalnego tworzy kolejne wystąpienie (raz).
      if (!wasClosed && SP.db.status(t.status).closed && t.recur && !t.recurNext) {
        var next = SP.db.createTask({
          listId: t.listId, parentId: t.parentId, title: t.title, desc: t.desc, priority: t.priority, assignees: t.assignees.slice(),
          tags: t.tags.slice(), recur: t.recur, checklist: (t.checklist || []).map(function (c) { return { id: uid("c"), text: c.text, done: false }; }),
          start: t.start ? shiftDate(t.start, t.recur) : null, due: shiftDate(t.due || ymd(new Date()), t.recur),
        });
        t.recurNext = next.id;
        t.activity.push({ by: "me", text: "utworzył(a) kolejne wystąpienie (" + RECUR[t.recur] + ")", at: new Date().toISOString() });
      }
      changed("tasks"); return t;
    },
    RECUR: RECUR,
    duplicateTask: function (id) {
      var t = SP.db.task(id); if (!t) return null;
      var copy = SP.db.createTask({
        listId: t.listId, parentId: t.parentId, title: t.title + " (kopia)", desc: t.desc, status: t.status, priority: t.priority,
        assignees: t.assignees.slice(), tags: t.tags.slice(), due: t.due, start: t.start, recur: t.recur,
        checklist: (t.checklist || []).map(function (c) { return { id: uid("c"), text: c.text, done: c.done }; }),
      });
      SP.db.subtasks(id).forEach(function (s) { SP.db.createTask({ listId: s.listId, parentId: copy.id, title: s.title, status: s.status, priority: s.priority, assignees: s.assignees.slice(), due: s.due }); });
      return copy;
    },
    bulkUpdate: function (ids, patch, activityText) {
      ids.forEach(function (id) {
        var t = SP.db.task(id); if (!t) return;
        var before = { status: t.status, priority: t.priority, assignees: t.assignees.slice() };
        Object.assign(t, patch, { updatedAt: new Date().toISOString() });
        if (activityText) t.activity.push({ by: "me", text: activityText, at: new Date().toISOString() });
        afterChange(t, before);
      });
      changed("tasks");
    },
    bulkDelete: function (ids) {
      var all = new Set();
      ids.forEach(function (id) {
        var one = new Set([id]); SP.db.subtasks(id).forEach(function (s) { one.add(s.id); });
        var tk = SP.db.task(id);
        if (tk && !tk.parentId || (tk && ids.indexOf(tk.parentId) < 0)) trashPush("task", tk.title, { tasks: data.tasks.filter(function (t) { return one.has(t.id); }), files: data.files.filter(function (f) { return one.has(f.taskId); }).map(function (f) { return [f.id, f.taskId]; }) });
        one.forEach(function (x) { all.add(x); });
      });
      data.files.forEach(function (f) { if (all.has(f.taskId)) f.taskId = null; });
      data.tasks = data.tasks.filter(function (t) { return !all.has(t.id); });
      changed("tasks");
    },

    /* ---- Śledzenie czasu ---- */
    timeTotal: function (t) {
      return (t.time || []).reduce(function (s, e) { return s + ((e.end ? new Date(e.end) : new Date()) - new Date(e.start)); }, 0);
    },
    running: function () {
      for (var i = 0; i < data.tasks.length; i++) {
        var t = data.tasks[i], e = (t.time || []).find(function (x) { return !x.end; });
        if (e) return { task: t, entry: e };
      }
      return null;
    },
    startTimer: function (taskId) {
      var r = SP.db.running(); if (r) SP.db.stopTimer(true);
      var t = SP.db.task(taskId); if (!t) return;
      t.time = t.time || [];
      t.time.push({ id: uid("e"), start: new Date().toISOString(), end: null, by: "me" });
      changed("time");
    },
    stopTimer: function (silent) {
      var r = SP.db.running(); if (!r) return;
      r.entry.end = new Date().toISOString();
      var ms = new Date(r.entry.end) - new Date(r.entry.start);
      if (ms < 1000) r.task.time = r.task.time.filter(function (e) { return e !== r.entry; }); // przypadkowe kliknięcie
      else r.task.activity.push({ by: "me", text: "zarejestrował(a) czas: " + SP.db.fmtDuration(ms), at: r.entry.end });
      if (!silent) changed("time"); else save();
    },
    addTime: function (taskId, ms) {
      var t = SP.db.task(taskId); if (!t || ms <= 0) return;
      var end = new Date(), start = new Date(end - ms);
      t.time = t.time || [];
      t.time.push({ id: uid("e"), start: start.toISOString(), end: end.toISOString(), by: "me", manual: true });
      t.activity.push({ by: "me", text: "dodał(a) ręcznie czas: " + SP.db.fmtDuration(ms), at: end.toISOString() });
      changed("time");
    },
    /** Czas wpisany ręcznie na konkretny dzień (arkusz czasu): wpis kończy się o 17:00 tego dnia (albo teraz, gdy to dziś). */
    addTimeOn: function (taskId, ms, day) {
      var t = SP.db.task(taskId); if (!t || ms <= 0) return;
      var end = day === ymd(new Date()) ? new Date() : new Date(day + "T17:00:00"), start = new Date(end - ms);
      if (ymd(start) !== day) { start = new Date(day + "T00:00:00"); end = new Date(start.getTime() + ms); }
      t.time = t.time || [];
      t.time.push({ id: uid("e"), start: start.toISOString(), end: end.toISOString(), by: "me", manual: true });
      t.activity.push({ by: "me", text: "dodał(a) czas w arkuszu: " + SP.db.fmtDuration(ms) + " (" + day + ")", at: new Date().toISOString() });
      changed("time");
    },
    removeTime: function (taskId, entryId) {
      var t = SP.db.task(taskId); if (!t) return;
      t.time = (t.time || []).filter(function (e) { return e.id !== entryId; });
      changed("time");
    },
    fmtDuration: function (ms, clock) {
      var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      if (clock) return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
      return h ? h + " godz. " + (m ? m + " min" : "") : m ? m + " min" : sec + " s";
    },
    /** "1h 30m", "45m", "2h", "1,5h", "90" (minuty) → ms; null gdy nie da się odczytać. */
    parseDuration: function (str) {
      str = String(str || "").trim().toLowerCase().replace(",", ".");
      if (!str) return null;
      if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * 60000);
      var h = (str.match(/(\d+(?:\.\d+)?)\s*(?:h|godz)/) || [])[1], m = (str.match(/(\d+)\s*(?:m|min)(?!s)/) || [])[1];
      if (h == null && m == null) return null;
      return Math.round((parseFloat(h || 0) * 60 + parseInt(m || 0, 10)) * 60000);
    },

    /* ---- Kopia zapasowa ---- */
    exportData: function () {
      var copy = JSON.parse(JSON.stringify(data));
      return { app: "sprynt", version: VERSION, exportedAt: new Date().toISOString(), workspace: copy };
    },
    importData: function (obj) {
      var w = obj && obj.app === "sprynt" && obj.workspace;
      if (!w || !Array.isArray(w.spaces) || !Array.isArray(w.lists) || !Array.isArray(w.tasks) || !Array.isArray(w.people)) throw new Error("To nie jest plik kopii Sprynt.");
      w.version = VERSION;
      w.files = []; // zawartość plików z chmury nie jest częścią kopii
      ["goals", "automations", "whiteboards", "fields", "trash", "chat", "templates", "sprints", "tags", "notifications", "docs", "favorites", "recents", "folders"].forEach(function (k) { if (!Array.isArray(w[k])) w[k] = []; });
      w.ui = w.ui || { expanded: {}, views: {} };
      w.people[0] = Object.assign({}, w.people[0], { id: "me", name: user.name, email: user.email });
      data = w; changed("all");
    },
    wipe: function () { try { localStorage.removeItem(KEY); localStorage.removeItem(AI_KEY); localStorage.removeItem(SYNC_KEY); } catch (e) {} },

    /* ---- Synchronizacja z chmurą (js/cloud.js) ---- */
    syncMeta: function () { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || { rev: 0, dirty: false }; } catch (e) { return { rev: 0, dirty: false }; } },
    saveSyncMeta: function (m) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(m)); } catch (e) {} },
    /** Zastępuje cały stan (np. nowszą wersją z chmury) bez oznaczania go jako „do wysłania”. */
    replaceData: function (d) {
      if (!d || !Array.isArray(d.spaces)) return;
      d.version = VERSION;
      ["files", "goals", "automations", "whiteboards", "fields", "trash", "chat", "templates", "sprints", "tags", "notifications", "docs", "favorites", "recents", "folders", "lists", "tasks", "people"].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
      d.ui = d.ui || { expanded: {}, views: {} };
      if (!d.people.some(function (p) { return p.id === "me"; })) d.people.unshift({ id: "me", name: user.name, email: user.email, color: "#6c5ce7" });
      data = d;
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
      listeners.forEach(function (fn) { fn("all"); });
    },
    /** Dane konta lokalnego z tym samym e-mailem (do przeniesienia do chmury przy pierwszym logowaniu). */
    legacyLocalData: function () {
      try {
        var acc = (JSON.parse(localStorage.getItem("sprynt:accounts")) || []).find(function (a) { return a.email === String(user.email || "").toLowerCase(); });
        var d = acc && JSON.parse(localStorage.getItem("sprynt:db:" + acc.id));
        return d && Array.isArray(d.tasks) ? d : null;
      } catch (e) { return null; }
    },
    isEmpty: function () { return !data.tasks.length && !data.docs.length && data.spaces.length <= 1 && data.lists.length <= 1; },

    /* ---- Ustawienia AI (osobny klucz – klucz API nie trafia do kopii zapasowej ani eksportu) ---- */
    aiSettings: function () { try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (e) { return {}; } },
    saveAiSettings: function (s) { try { if (s) localStorage.setItem(AI_KEY, JSON.stringify(s)); else localStorage.removeItem(AI_KEY); } catch (e) {} changed("ai"); },

    /* ---- Zaproszenia ---- */
    markInvited: function (personId, via, link) {
      var p = byId(data.people, personId); if (!p) return;
      p.invites = (p.invites || []).concat([{ via: via, at: new Date().toISOString() }]).slice(-10);
      p.inviteLink = link || p.inviteLink; changed("people");
    },
    removePerson: function (id) {
      if (id === "me") return;
      data.people = data.people.filter(function (p) { return p.id !== id; });
      data.tasks.forEach(function (t) { t.assignees = t.assignees.filter(function (a) { return a !== id; }); });
      changed("people");
    },
    /** Kopia przestrzeni do zaproszenia (bez historii, czasu pracy i plików). */
    shareSnapshot: function (spaceIds) {
      var set = new Set(spaceIds), lists = data.lists.filter(function (l) { return set.has(l.spaceId); }), lset = new Set(lists.map(function (l) { return l.id; }));
      var tasks = data.tasks.filter(function (t) { return lset.has(t.listId); }).map(function (t) {
        return { id: t.id, parentId: t.parentId, listId: t.listId, title: t.title, status: t.status, priority: t.priority, assignees: t.assignees, due: t.due, start: t.start, tags: t.tags, desc: t.desc, checklist: t.checklist, cf: t.cf, recur: t.recur, points: t.points };
      });
      return {
        spaces: data.spaces.filter(function (s) { return set.has(s.id); }).map(function (s) { return { id: s.id, name: s.name, color: s.color }; }),
        folders: data.folders.filter(function (f) { return set.has(f.spaceId); }), lists: lists, tasks: tasks,
        fields: data.fields.filter(function (f) { return lset.has(f.listId); }),
        docs: data.docs.filter(function (d) { return set.has(d.spaceId); }).map(function (d) { return { id: d.id, spaceId: d.spaceId, title: d.title, body: d.body }; }),
        people: data.people.map(function (p) { return { id: p.id, name: p.id === "me" ? user.name : p.name, email: p.id === "me" ? user.email : p.email, color: p.color }; }),
        tags: data.tags,
      };
    },
    /** Wczytuje udostępnioną przestrzeń z zaproszenia. Ten sam nadawca + przestrzeń = aktualizacja zamiast duplikatu. */
    importShared: function (inv) {
      var snap = inv.snapshot || {}, from = inv.from || {}, idMap = {}, nid = function (old, p) { return idMap[old] || (idMap[old] = uid(p)); };
      var meEmail = String(inv.to && inv.to.email || user.email || "").toLowerCase();
      // osoby: zapraszający i reszta zespołu; adresat = „me”
      (snap.people || []).forEach(function (p) {
        var em = String(p.email || "").toLowerCase();
        if ((em && em === meEmail) || (!em && inv.to && inv.to.name && p.name === inv.to.name)) { idMap[p.id] = "me"; return; }
        var ex = data.people.find(function (q) { return (em && String(q.email || "").toLowerCase() === em) || q.name === p.name; });
        if (ex) { idMap[p.id] = ex.id; return; }
        var np = { id: uid("p"), name: p.name, email: p.email || "", color: p.color || "#0984e3" };
        data.people.push(np); idMap[p.id] = np.id;
      });
      var summary = { spaces: 0, tasks: 0, updated: false };
      (snap.spaces || []).forEach(function (s) {
        var shareKey = (from.email || from.name || "?") + "|" + s.id;
        var existing = data.spaces.find(function (x) { return x.shared && x.shared.key === shareKey; });
        if (existing) {
          // aktualizacja: usuń starą zawartość tej przestrzeni i wczytaj nową
          var oldLists = new Set(data.lists.filter(function (l) { return l.spaceId === existing.id; }).map(function (l) { return l.id; }));
          data.tasks = data.tasks.filter(function (t) { return !oldLists.has(t.listId); });
          data.lists = data.lists.filter(function (l) { return !oldLists.has(l.id); });
          data.folders = data.folders.filter(function (f) { return f.spaceId !== existing.id; });
          data.fields = data.fields.filter(function (f) { return !oldLists.has(f.listId); });
          idMap[s.id] = existing.id; existing.name = s.name; existing.shared.at = new Date().toISOString(); summary.updated = true;
        } else {
          data.spaces.push({ id: nid(s.id, "sp-"), name: s.name, color: s.color || "#6c5ce7", shared: { key: shareKey, from: from.name || from.email, at: new Date().toISOString() } });
          data.ui.expanded[idMap[s.id]] = true;
        }
        summary.spaces++;
      });
      (snap.folders || []).forEach(function (f) { data.folders.push({ id: nid(f.id, "fo-"), spaceId: idMap[f.spaceId], name: f.name }); });
      (snap.lists || []).forEach(function (l) { data.lists.push({ id: nid(l.id, "li-"), spaceId: idMap[l.spaceId], folderId: l.folderId ? idMap[l.folderId] || null : null, name: l.name }); });
      (snap.fields || []).forEach(function (f) { data.fields.push(Object.assign({}, f, { id: nid(f.id, "cf"), listId: idMap[f.listId] })); });
      (snap.tags || []).forEach(function (tg) { if (!SP.db.tag(tg.name)) data.tags.push(tg); });
      var num = data.tasks.reduce(function (m, t) { return Math.max(m, t.num); }, 0), now = new Date().toISOString();
      var order = (snap.tasks || []).filter(function (t) { return !t.parentId; }).concat((snap.tasks || []).filter(function (t) { return t.parentId; }));
      order.forEach(function (t) {
        if (!idMap[t.listId]) return;
        var cf = {}; Object.keys(t.cf || {}).forEach(function (k) { if (idMap[k]) cf[idMap[k]] = t.cf[k]; });
        data.tasks.push({ id: nid(t.id, "t"), num: ++num, parentId: t.parentId ? idMap[t.parentId] || null : null, listId: idMap[t.listId], title: t.title, status: t.status || "todo", priority: t.priority || null,
          assignees: (t.assignees || []).map(function (a) { return idMap[a]; }).filter(Boolean), due: t.due || null, start: t.start || null, tags: t.tags || [], desc: t.desc || "",
          checklist: t.checklist || [], comments: [], time: [], recur: t.recur || null, cf: cf, deps: [], remind: null, points: t.points != null ? t.points : null, createdAt: now, updatedAt: now,
          activity: [{ by: "me", text: "dołączył(a) z zaproszenia od " + (from.name || from.email || "znajomego"), at: now }] });
        summary.tasks++;
      });
      (snap.docs || []).forEach(function (d) { if (idMap[d.spaceId]) data.docs.unshift({ id: nid(d.id, "d"), spaceId: idMap[d.spaceId], title: d.title, body: d.body, updatedAt: now, by: "me" }); });
      data.notifications.unshift({ id: uid("n"), taskId: null, by: "me", text: (summary.updated ? "zaktualizowano udostępnioną przestrzeń od " : "dołączono do przestrzeni od ") + (from.name || from.email || "znajomego"), state: "important", at: now });
      changed("all");
      summary.spaceId = idMap[(snap.spaces || [])[0] && snap.spaces[0].id];
      return summary;
    },
    deleteTask: function (id) {
      var ids = new Set([id].concat(SP.db.subtasks(id).map(function (s) { return s.id; })));
      var tk = SP.db.task(id);
      if (tk) trashPush("task", tk.title, { tasks: data.tasks.filter(function (t) { return ids.has(t.id); }), files: data.files.filter(function (f) { return ids.has(f.taskId); }).map(function (f) { return [f.id, f.taskId]; }) });
      // Załączniki zostają w chmurze, tylko tracą powiązanie z usuniętym zadaniem.
      data.files.forEach(function (f) { if (ids.has(f.taskId)) f.taskId = null; });
      data.tasks = data.tasks.filter(function (t) { return !ids.has(t.id); });
      data.notifications = data.notifications.filter(function (n) { return !ids.has(n.taskId); });
      changed("tasks");
    },
    addComment: function (id, text) {
      var t = SP.db.task(id); if (!t) return;
      t.comments.push({ id: uid("m"), by: "me", text: text, at: new Date().toISOString() });
      changed("tasks");
    },

    createSpace: function (name, color) { var s = { id: uid("sp-"), name: name, color: color }; data.spaces.push(s); data.ui.expanded[s.id] = true; changed("tree"); return s; },
    createFolder: function (spaceId, name) { var f = { id: uid("fo-"), spaceId: spaceId, name: name }; data.folders.push(f); data.ui.expanded[f.id] = true; data.ui.expanded[spaceId] = true; changed("tree"); return f; },
    createList: function (spaceId, folderId, name) {
      var l = { id: uid("li-"), spaceId: spaceId, folderId: folderId || null, name: name }; data.lists.push(l);
      data.ui.expanded[spaceId] = true; if (folderId) data.ui.expanded[folderId] = true; changed("tree"); return l;
    },
    rename: function (kind, id, name) { var o = SP.db[kind](id); if (o) { o.name = name; changed("tree"); } },
    removeNode: function (kind, id) {
      var listIds;
      if (kind === "list") listIds = [id];
      else if (kind === "folder") listIds = data.lists.filter(function (l) { return l.folderId === id; }).map(function (l) { return l.id; });
      else listIds = data.lists.filter(function (l) { return l.spaceId === id; }).map(function (l) { return l.id; });
      var set = new Set(listIds), node = SP.db[kind](id);
      if (node) trashPush(kind, node.name, {
        spaces: kind === "space" ? [node] : [], folders: data.folders.filter(function (f) { return kind === "folder" ? f.id === id : kind === "space" && f.spaceId === id; }),
        lists: data.lists.filter(function (l) { return set.has(l.id); }), tasks: data.tasks.filter(function (t) { return set.has(t.listId); }),
        docs: kind === "space" ? data.docs.filter(function (d) { return d.spaceId === id; }) : [], whiteboards: kind === "space" ? data.whiteboards.filter(function (w) { return w.spaceId === id; }) : [],
        fields: data.fields.filter(function (f) { return set.has(f.listId); }),
      });
      data.tasks = data.tasks.filter(function (t) { return !set.has(t.listId); });
      data.lists = data.lists.filter(function (l) { return !set.has(l.id); });
      if (kind === "folder") data.folders = data.folders.filter(function (f) { return f.id !== id; });
      if (kind === "space") { data.folders = data.folders.filter(function (f) { return f.spaceId !== id; }); data.spaces = data.spaces.filter(function (s) { return s.id !== id; }); data.docs = data.docs.filter(function (d) { return d.spaceId !== id; }); data.whiteboards = data.whiteboards.filter(function (w) { return w.spaceId !== id; }); data.automations = data.automations.filter(function (a) { return a.spaceId !== id; }); data.sprints = data.sprints.filter(function (x) { return x.spaceId !== id; }); }
      data.favorites = data.favorites.filter(function (f) { return f.id !== id && !set.has(f.id); });
      changed("tree");
    },

    toggleFavorite: function (type, id) {
      var i = data.favorites.findIndex(function (f) { return f.type === type && f.id === id; });
      if (i >= 0) data.favorites.splice(i, 1); else data.favorites.push({ type: type, id: id });
      changed("tree");
    },
    isFavorite: function (type, id) { return data.favorites.some(function (f) { return f.type === type && f.id === id; }); },
    toggleExpanded: function (id) { data.ui.expanded[id] = !data.ui.expanded[id]; changed("tree"); },
    viewFor: function (locId) { return data.ui.views[locId] || "list"; },
    setView: function (locId, v) { data.ui.views[locId] = v; save(); },
    /** Zapis ustawień interfejsu bez przerysowania widoku. */
    saveUi: function () { save(); },
    addRecent: function (type, id) {
      data.recents = [{ type: type, id: id, at: new Date().toISOString() }].concat(data.recents.filter(function (r) { return !(r.type === type && r.id === id); })).slice(0, 12);
      save();
    },
    createDoc: function (spaceId, title) {
      var d = { id: uid("d"), spaceId: spaceId, title: title || "Bez tytułu", body: "", updatedAt: new Date().toISOString(), by: "me" };
      data.docs.unshift(d); changed("docs"); return d;
    },
    updateDoc: function (id, patch) { var d = SP.db.doc(id); if (d) { Object.assign(d, patch, { updatedAt: new Date().toISOString() }); save(); } },
    deleteDoc: function (id) { var d0 = SP.db.doc(id); if (d0) trashPush("doc", d0.title, { docs: [d0] }); data.docs = data.docs.filter(function (d) { return d.id !== id; }); changed("docs"); },
    /** Powiadomienie w Skrzynce bez zadania (np. o sprincie). o = {href, taskId, state}. */
    notify: function (text, o) {
      o = o || {};
      data.notifications.unshift({ id: uid("n"), taskId: o.taskId || null, href: o.href || null, by: "me", text: text, state: o.state || "important", at: new Date().toISOString() });
      changed("inbox");
    },
    setNotification: function (id, state) { var n = byId(data.notifications, id); if (n) { n.state = state; changed("inbox"); } },
    /** Osoba dodana po imieniu (np. znaleziona w pliku z notatkami) – bez e-maila. */
    addPerson: function (name) {
      name = String(name || "").trim(); if (!name) return null;
      var ex = data.people.find(function (p) { return p.name.toLowerCase() === name.toLowerCase(); }); if (ex) return ex;
      var colors = ["#e84393", "#00a884", "#f39c12", "#0984e3", "#e5484d", "#2d3436"];
      var p = { id: uid("p"), name: name, email: "", color: colors[data.people.length % colors.length], invited: true };
      data.people.push(p); changed("people"); return p;
    },
    /** Zaproszona osoba (lokalnie – e-mail z zaproszeniem wyślemy po podłączeniu serwera). */
    invite: function (email) {
      email = String(email).trim().toLowerCase();
      if (data.people.some(function (p) { return p.email === email; })) return null;
      var colors = ["#e84393", "#00a884", "#f39c12", "#0984e3", "#e5484d", "#2d3436"];
      var raw = email.split("@")[0].replace(/[._-]+/g, " ").trim();
      var name = raw.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || email;
      var p = { id: uid("p"), name: name, email: email, color: colors[data.people.length % colors.length], invited: true };
      data.people.push(p); changed("people"); return p;
    },
    /* ---- Chmura: metadane plików (zawartość leży w IndexedDB – js/files.js) ---- */
    QUOTA: 100 * 1024 * 1024,      // plan Free: 100 MB
    MAX_FILE: 25 * 1024 * 1024,    // pojedynczy plik: 25 MB
    file: function (id) { return byId(data.files, id); },
    filesFor: function (taskId) { return data.files.filter(function (f) { return f.taskId === taskId; }); },
    addFile: function (meta) { data.files.unshift(meta); changed("files"); return meta; },
    removeFile: function (id) { data.files = data.files.filter(function (f) { return f.id !== id; }); changed("files"); },
    storageUsed: function () { return data.files.reduce(function (s, f) { return s + (f.size || 0); }, 0); },
    createTag: function (name) { var colors = ["#6c5ce7", "#00a884", "#e84393", "#f39c12", "#0984e3", "#e5484d"]; var t = { name: name, color: colors[data.tags.length % colors.length] }; data.tags.push(t); save(); return t; },

    /* ---- Kosz ---- */
    TRASH_DAYS: TRASH_DAYS,
    /** Przywraca element z kosza. Zadania bez listy trafiają do pierwszej listy. Zwraca opis albo null. */
    restore: function (trashId) {
      var x = byId(data.trash, trashId); if (!x) return null;
      var p = x.payload, has = function (arr, id) { return arr.some(function (o) { return o.id === id; }); };
      (p.spaces || []).forEach(function (o) { if (!has(data.spaces, o.id)) { data.spaces.push(o); data.ui.expanded[o.id] = true; } });
      (p.folders || []).forEach(function (o) { if (!has(data.folders, o.id) && SP.db.space(o.spaceId)) data.folders.push(o); });
      (p.lists || []).forEach(function (o) {
        if (has(data.lists, o.id)) return;
        if (!SP.db.space(o.spaceId)) o.spaceId = (data.spaces[0] || {}).id;
        if (o.folderId && !SP.db.folder(o.folderId)) o.folderId = null;
        if (o.spaceId) data.lists.push(o);
      });
      (p.tasks || []).forEach(function (o) {
        if (has(data.tasks, o.id)) return;
        if (!SP.db.list(o.listId)) o.listId = (data.lists[0] || {}).id;
        if (o.parentId && !SP.db.task(o.parentId) && !(p.tasks || []).some(function (q) { return q.id === o.parentId; })) o.parentId = null;
        if (o.listId) data.tasks.push(o);
      });
      (p.files || []).forEach(function (fx) { var f = SP.db.file(fx[0]); if (f && !f.taskId) f.taskId = fx[1]; });
      (p.docs || []).forEach(function (o) { if (!has(data.docs, o.id)) { if (!SP.db.space(o.spaceId)) o.spaceId = (data.spaces[0] || {}).id; data.docs.unshift(o); } });
      (p.whiteboards || []).forEach(function (o) { if (!has(data.whiteboards, o.id)) { if (!SP.db.space(o.spaceId)) o.spaceId = (data.spaces[0] || {}).id; data.whiteboards.unshift(o); } });
      (p.fields || []).forEach(function (o) { if (!has(data.fields, o.id) && SP.db.list(o.listId)) data.fields.push(o); });
      data.trash = data.trash.filter(function (y) { return y !== x; });
      changed("all"); return x;
    },
    purge: function (trashId) { data.trash = data.trash.filter(function (y) { return y.id !== trashId; }); changed("trash"); },
    emptyTrash: function () { data.trash = []; changed("trash"); },

    /* ---- Pola niestandardowe (na listę) ---- */
    FIELD_TYPES: { text: "Tekst", number: "Liczba", money: "Kwota (zł)", select: "Lista wyboru", checkbox: "Pole wyboru", date: "Data", url: "Link" },
    field: function (id) { return byId(data.fields, id); },
    fieldsFor: function (listId) { return data.fields.filter(function (f) { return f.listId === listId; }); },
    addField: function (listId, f) {
      f = Object.assign({ id: uid("cf"), listId: listId, options: [] }, f);
      var colors = ["#6c5ce7", "#00a884", "#e84393", "#f39c12", "#0984e3", "#e5484d", "#636e72"];
      f.options = (f.options || []).map(function (o, i) { return typeof o === "string" ? { id: uid("o"), name: o, color: colors[i % colors.length] } : o; });
      data.fields.push(f); changed("fields"); return f;
    },
    updateField: function (id, patch) { var f = byId(data.fields, id); if (f) { Object.assign(f, patch); changed("fields"); } },
    removeField: function (id) {
      data.fields = data.fields.filter(function (f) { return f.id !== id; });
      data.tasks.forEach(function (t) { if (t.cf && id in t.cf) delete t.cf[id]; });
      changed("fields");
    },
    setFieldValue: function (taskId, fieldId, v) {
      var t = SP.db.task(taskId), f = byId(data.fields, fieldId); if (!t || !f) return;
      t.cf = t.cf || {};
      if (v === null || v === "" || v === undefined) delete t.cf[fieldId]; else t.cf[fieldId] = v;
      SP.db.updateTask(taskId, {}, "zmienił(a) pole „" + f.name + "”");
    },

    /* ---- Zależności: t.deps = [id zadań, na które czeka] ---- */
    addDep: function (taskId, waitOnId) {
      var t = SP.db.task(taskId), o = SP.db.task(waitOnId); if (!t || !o || taskId === waitOnId) return false;
      // bez cykli: o nie może (pośrednio) czekać na t
      var seen = {}, stack = [waitOnId];
      while (stack.length) { var c = stack.pop(); if (c === taskId) return false; if (seen[c]) continue; seen[c] = 1; var ct = SP.db.task(c); if (ct) stack = stack.concat(ct.deps || []); }
      t.deps = t.deps || []; if (t.deps.indexOf(waitOnId) >= 0) return true;
      t.deps.push(waitOnId);
      SP.db.updateTask(taskId, {}, "czeka teraz na " + SP.db.taskKey(o) + " „" + o.title + "”"); return true;
    },
    removeDep: function (taskId, waitOnId) { var t = SP.db.task(taskId); if (!t) return; t.deps = (t.deps || []).filter(function (x) { return x !== waitOnId; }); SP.db.updateTask(taskId, {}); },
    waitingOn: function (t) { return (t.deps || []).map(SP.db.task).filter(Boolean); },
    blocking: function (t) { return data.tasks.filter(function (x) { return (x.deps || []).indexOf(t.id) >= 0; }); },
    isBlocked: function (t) { return SP.db.waitingOn(t).some(function (o) { return !SP.db.status(o.status).closed; }); },

    /* ---- Czat (kanał na przestrzeń) ---- */
    messages: function (spaceId) { return data.chat.filter(function (m) { return m.spaceId === spaceId; }); },
    addMessage: function (spaceId, text) { var m = { id: uid("c"), spaceId: spaceId, by: "me", text: text, at: new Date().toISOString(), reactions: {} }; data.chat.push(m); changed("chat"); return m; },
    editMessage: function (id, text) { var m = byId(data.chat, id); if (m) { m.text = text; m.edited = true; changed("chat"); } },
    deleteMessage: function (id) { data.chat = data.chat.filter(function (m) { return m.id !== id; }); changed("chat"); },
    react: function (id, emoji) {
      var m = byId(data.chat, id); if (!m) return;
      m.reactions = m.reactions || {}; var a = m.reactions[emoji] || [];
      a = a.indexOf("me") >= 0 ? a.filter(function (x) { return x !== "me"; }) : a.concat(["me"]);
      if (a.length) m.reactions[emoji] = a; else delete m.reactions[emoji];
      changed("chat");
    },

    /* ---- Szablony zadań ---- */
    saveTemplate: function (taskId, name) {
      var t = SP.db.task(taskId); if (!t) return null;
      var tpl = { id: uid("tp"), name: name || t.title, createdAt: new Date().toISOString(), task: {
        title: t.title, desc: t.desc, priority: t.priority, tags: t.tags.slice(), recur: t.recur,
        checklist: (t.checklist || []).map(function (c) { return c.text; }), subtasks: SP.db.subtasks(t.id).map(function (s) { return s.title; }), cf: JSON.parse(JSON.stringify(t.cf || {})),
      } };
      data.templates.push(tpl); changed("templates"); return tpl;
    },
    removeTemplate: function (id) { data.templates = data.templates.filter(function (x) { return x.id !== id; }); changed("templates"); },
    fromTemplate: function (tplId, listId, extra) {
      var tp = byId(data.templates, tplId); if (!tp || !SP.db.list(listId)) return null;
      var k = tp.task;
      var t = SP.db.createTask(Object.assign({ listId: listId, title: k.title, desc: k.desc || "", priority: k.priority || null, tags: (k.tags || []).slice(), recur: k.recur || null, assignees: ["me"],
        checklist: (k.checklist || []).map(function (x) { return { id: uid("c"), text: x, done: false }; }),
        cf: Object.keys(k.cf || {}).reduce(function (o, fid) { var f = byId(data.fields, fid); if (f && f.listId === listId) o[fid] = k.cf[fid]; return o; }, {}) }, extra || {}));
      (k.subtasks || []).forEach(function (x) { SP.db.createTask({ listId: listId, parentId: t.id, title: x }); });
      t.activity.push({ by: "me", text: "utworzył(a) z szablonu „" + tp.name + "”", at: new Date().toISOString() });
      changed("tasks"); return t;
    },

    /* ---- Przypomnienia ---- */
    setReminder: function (taskId, iso) {
      var t = SP.db.task(taskId); if (!t) return;
      t.remind = iso; t.reminded = false;
      SP.db.updateTask(taskId, {}, iso ? "ustawił(a) przypomnienie" : "usunął/usunęła przypomnienie");
    },
    /** Zadania, których przypomnienie już minęło – zamienia je w powiadomienia w Skrzynce. */
    fireReminders: function () {
      var now = Date.now(), fired = [];
      data.tasks.forEach(function (t) {
        if (t.remind && !t.reminded && new Date(t.remind).getTime() <= now) {
          t.reminded = true; fired.push(t);
          data.notifications.unshift({ id: uid("n"), taskId: t.id, by: "me", text: "przypomnienie o zadaniu", state: "important", at: new Date().toISOString() });
        }
      });
      if (fired.length) changed("inbox");
      return fired;
    },
    /* ---- Automatyzacje ---- */
    TRIGGERS: TRIGGERS,
    ACTIONS: ACTIONS,
    addAutomation: function (a) { a = Object.assign({ id: uid("a"), on: true, runs: 0, createdAt: new Date().toISOString() }, a); data.automations.push(a); changed("automations"); return a; },
    updateAutomation: function (id, patch) { var a = byId(data.automations, id); if (a) { Object.assign(a, patch); changed("automations"); } },
    removeAutomation: function (id) { data.automations = data.automations.filter(function (a) { return a.id !== id; }); changed("automations"); },

    /* ---- Cele ---- */
    goal: function (id) { return byId(data.goals, id); },
    addGoal: function (g) { g = Object.assign({ id: uid("g"), targets: [], createdAt: new Date().toISOString() }, g); data.goals.push(g); changed("goals"); return g; },
    updateGoal: function (id, patch) { var g = byId(data.goals, id); if (g) { Object.assign(g, patch); changed("goals"); } },
    removeGoal: function (id) { data.goals = data.goals.filter(function (g) { return g.id !== id; }); changed("goals"); },
    addTarget: function (goalId, tg) { var g = byId(data.goals, goalId); if (!g) return; tg = Object.assign({ id: uid("tg") }, tg); g.targets.push(tg); changed("goals"); return tg; },
    updateTarget: function (goalId, tgId, patch) { var g = byId(data.goals, goalId), tg = g && byId(g.targets, tgId); if (tg) { Object.assign(tg, patch); changed("goals"); } },
    removeTarget: function (goalId, tgId) { var g = byId(data.goals, goalId); if (g) { g.targets = g.targets.filter(function (x) { return x.id !== tgId; }); changed("goals"); } },
    /** Postęp celu cząstkowego 0..1 oraz opis „x z y”. */
    targetProgress: function (tg) {
      if (tg.type === "tasks") {
        var loc = { type: tg.locType || "list", id: tg.locId };
        var all = (tg.locType === "space" ? SP.db.space(tg.locId) : tg.locType === "folder" ? SP.db.folder(tg.locId) : SP.db.list(tg.locId)) ? SP.db.tasksIn(loc) : [];
        var done = all.filter(function (t) { return SP.db.status(t.status).closed; }).length;
        return { p: all.length ? done / all.length : 0, label: done + " z " + all.length + " zadań" };
      }
      if (tg.type === "check") return { p: tg.done ? 1 : 0, label: tg.done ? "Zrobione" : "Do zrobienia" };
      var start = Number(tg.start) || 0, target = Number(tg.target) || 0, cur = Number(tg.current) || 0;
      var p = target === start ? (cur >= target ? 1 : 0) : (cur - start) / (target - start);
      return { p: Math.max(0, Math.min(1, p)), label: cur.toLocaleString("pl-PL") + " / " + target.toLocaleString("pl-PL") + (tg.unit ? " " + tg.unit : "") };
    },
    goalProgress: function (g) {
      if (!g.targets.length) return 0;
      return g.targets.reduce(function (s, tg) { return s + SP.db.targetProgress(tg).p; }, 0) / g.targets.length;
    },

    /* ---- Sprinty: db.raw.sprints[] = {spaceId, name, start, end, goal, state: planned|active|done}; zadanie: t.sprintId, t.points ---- */
    sprint: function (id) { return byId(data.sprints, id); },
    createSprint: function (sp) {
      sp = Object.assign({ id: uid("s"), state: "planned", goal: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, sp);
      data.sprints.push(sp); changed("sprints"); return sp;
    },
    updateSprint: function (id, patch) { var sp = byId(data.sprints, id); if (sp) { Object.assign(sp, patch, { updatedAt: new Date().toISOString() }); changed("sprints"); } return sp; },
    deleteSprint: function (id) {
      data.sprints = data.sprints.filter(function (x) { return x.id !== id; });
      data.tasks.forEach(function (t) { if (t.sprintId === id) t.sprintId = null; });
      changed("sprints");
    },
    sprintTasks: function (id) { return data.tasks.filter(function (t) { return t.sprintId === id && !t.parentId; }); },
    /** Następny numer sprintu w przestrzeni („Sprint 4”). */
    nextSprintName: function (spaceId) {
      var n = data.sprints.filter(function (x) { return x.spaceId === spaceId; }).reduce(function (m, x) { var k = parseInt((String(x.name).match(/(\d+)\s*$/) || [])[1], 10); return Math.max(m, k || 0); }, 0);
      return "Sprint " + (n + 1);
    },
    setPoints: function (taskId, pts) {
      var t = SP.db.task(taskId); if (!t) return;
      pts = pts === null || pts === "" || pts === undefined ? null : Math.max(0, Number(pts) || 0);
      SP.db.updateTask(taskId, { points: pts }, pts == null ? "usunął/usunęła punkty" : "ustawił(a) punkty: " + pts);
    },
    setSprint: function (taskIds, sprintId) {
      var sp = sprintId ? byId(data.sprints, sprintId) : null;
      // sprintAt – kiedy zadanie weszło do sprintu (zmiana zakresu po starcie).
      SP.db.bulkUpdate(taskIds, { sprintId: sprintId || null, sprintAt: sprintId ? new Date().toISOString() : null }, sp ? "dodał(a) do „" + sp.name + "”" : "przeniósł/przeniosła do backlogu");
    },
    /** Postęp sprintu: zadania i punkty (zadanie bez punktów liczy się jako 0 pkt). */
    sprintStats: function (id) {
      var ts = SP.db.sprintTasks(id), done = ts.filter(function (t) { return SP.db.status(t.status).closed; });
      var pts = function (a) { return a.reduce(function (s, t) { return s + (Number(t.points) || 0); }, 0); };
      return { tasks: ts.length, done: done.length, points: pts(ts), pointsDone: pts(done) };
    },
    /** Zmiana zakresu: zadania dodane po starcie sprintu (z minutą zapasu). */
    sprintScope: function (id) {
      var sp = byId(data.sprints, id); if (!sp || !sp.startedAt) return { tasks: 0, points: 0, ids: [] };
      var from = new Date(sp.startedAt).getTime() + 60000;
      var add = SP.db.sprintTasks(id).filter(function (t) { return t.sprintAt && new Date(t.sprintAt).getTime() > from; });
      return { tasks: add.length, points: add.reduce(function (s, t) { return s + (Number(t.points) || 0); }, 0), ids: add.map(function (t) { return t.id; }) };
    },
    startSprint: function (id) {
      var sp = byId(data.sprints, id); if (!sp) return;
      data.sprints.forEach(function (x) { if (x.spaceId === sp.spaceId && x.state === "active" && x.id !== id) x.state = "planned"; });
      sp.state = "active"; sp.startedAt = new Date().toISOString(); sp.updatedAt = sp.startedAt;
      // Migawka planu przy starcie – do zmiany zakresu i dotrzymania planu.
      var st0 = SP.db.sprintStats(id); sp.plan = { tasks: st0.tasks, points: st0.points, at: sp.startedAt };
      changed("sprints");
    },
    /** Zamyka sprint: zapisuje wynik, nieukończone zadania przenosi do moveTo (id sprintu) albo do backlogu (null). */
    completeSprint: function (id, moveTo) {
      var sp = byId(data.sprints, id); if (!sp) return null;
      var st = SP.db.sprintTasks(id), open = st.filter(function (t) { return !SP.db.status(t.status).closed; });
      sp.result = SP.db.sprintStats(id); sp.result.carried = open.length;
      var sc = SP.db.sprintScope(id); sp.result.added = sc.tasks; sp.result.addedPoints = sc.points;
      if (sp.plan) sp.result.planned = sp.plan.points;
      sp.state = "done"; sp.closedAt = new Date().toISOString(); sp.updatedAt = sp.closedAt;
      var to = moveTo ? byId(data.sprints, moveTo) : null;
      open.forEach(function (t) {
        t.sprintId = to ? to.id : null; t.sprintAt = to ? sp.closedAt : null; t.updatedAt = sp.closedAt;
        t.activity.push({ by: "me", text: "przeszło z „" + sp.name + "” " + (to ? "do „" + to.name + "”" : "do backlogu"), at: sp.closedAt });
      });
      changed("sprints"); return sp;
    },

    /* ---- Tablice online (whiteboard) ---- */
    whiteboard: function (id) { return byId(data.whiteboards, id); },
    createWhiteboard: function (spaceId, title) {
      var w = { id: uid("w"), spaceId: spaceId, title: title || "Tablica bez nazwy", items: [], view: { x: 0, y: 0, z: 1 }, updatedAt: new Date().toISOString(), by: "me" };
      data.whiteboards.unshift(w); changed("whiteboards"); return w;
    },
    /** Zapis bez przerysowania widoku (tablica rysuje się sama). */
    saveWhiteboard: function (id, patch) { var w = byId(data.whiteboards, id); if (w) { Object.assign(w, patch, { updatedAt: new Date().toISOString() }); save(); } },
    deleteWhiteboard: function (id) { var w0 = SP.db.whiteboard(id); if (w0) trashPush("whiteboard", w0.title, { whiteboards: [w0] }); data.whiteboards = data.whiteboards.filter(function (w) { return w.id !== id; }); data.favorites = data.favorites.filter(function (f) { return f.id !== id; }); changed("whiteboards"); },
    renameWhiteboard: function (id, title) { var w = byId(data.whiteboards, id); if (w) { w.title = title; changed("whiteboards"); } },
  };
})();
