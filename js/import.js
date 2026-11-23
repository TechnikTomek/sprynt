/* Sprynt – import zadań z innych narzędzi: Trello (JSON), Jira, Asana, Linear, Todoist (CSV), GitHub Issues (publiczne
 * repozytorium przez api.github.com) i dowolny CSV/Excel (kolumny rozpoznawane po nazwach, także po polsku).
 * Wszystko dzieje się w przeglądarce – plik nie trafia na żaden serwer (GitHub: tylko zapytanie o publiczne zgłoszenia). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico;

  var SOURCES = [
    { id: "trello", name: "Trello", logo: "trello", accept: ".json", kind: "JSON", how: "Menu tablicy → Drukuj, eksportuj i udostępnij → Eksportuj jako JSON." },
    { id: "jira", name: "Jira", logo: "jira", accept: ".csv", kind: "CSV", how: "Wyszukiwanie zgłoszeń → Eksportuj → CSV (wszystkie pola). Punkty, osoby, terminy i etykiety przejdą razem z zadaniami." },
    { id: "asana", name: "Asana", logo: "asana", accept: ".csv", kind: "CSV", how: "Menu projektu → Eksportuj → CSV. Sekcje staną się statusami, ukończone zadania zostaną oznaczone." },
    { id: "linear", name: "Linear", logo: "linear", accept: ".csv", kind: "CSV", how: "Ustawienia → Import / eksport → Eksport CSV. Estymacje przejdą jako punkty." },
    { id: "todoist", name: "Todoist", logo: "todoist", accept: ".csv", kind: "CSV", how: "Projekt → ⋯ → Eksportuj jako szablon → Pobierz jako CSV. Sekcje przejdą jako tagi." },
    { id: "github", name: "GitHub Issues", logo: "github", repo: true, kind: "repozytorium", how: "Wpisz publiczne repozytorium (np. owner/nazwa albo link). Pobierzemy zgłoszenia bez pull requestów." },
    { id: "csv", name: "Inny CSV albo Excel", icon: "spreadsheet", accept: ".csv,.tsv,.txt,.xlsx,.xls,.ods", kind: "CSV / XLSX", how: "Pierwszy wiersz to nagłówki. Rozpoznajemy m.in. Tytuł/Zadanie, Opis, Status, Osoba, Termin, Priorytet, Punkty, Tagi." },
  ];
  SP.IMPORT_SOURCES = SOURCES;

  /* =================== Pomocnicze: CSV, daty, statusy, priorytety =================== */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var head = text.split(/\r?\n/)[0] || "", cnt = function (c) { return head.split(c).length - 1; };
    var sep = [",", ";", "\t"].sort(function (a, b) { return cnt(b) - cnt(a); })[0];
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"' && cur === "") q = true;
      else if (ch === sep) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); if (row.some(function (c) { return c.trim(); })) rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); if (row.some(function (c) { return c.trim(); })) rows.push(row); }
    return rows;
  }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, sty: 1, lut: 2, kwi: 4, maj: 5, cze: 6, lip: 7, sie: 8, wrz: 9, paź: 10, paz: 10, lis: 11, gru: 12 };
  function ymd(y, m, d) { y = +y; if (y < 100) y += 2000; var dt = new Date(y, m - 1, +d); return dt.getMonth() === m - 1 ? SP.date.ymd(dt) : null; }
  /** Data z różnych formatów eksportu → „RRRR-MM-DD” (czas lokalny). */
  function parseDate(s) {
    s = String(s || "").trim(); if (!s) return null; var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/.exec(s))) return /T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(s) ? SP.date.ymd(new Date(s)) : ymd(m[1], +m[2], m[3]);
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s))) return ymd(m[3], +m[2], m[1]);
    if ((m = /^(\d{1,2})[\/ -]([A-Za-zżźćńółęąś]{3})[a-ząęłńóśźż]*[\/ -](\d{2,4})/.exec(s)) && MON[m[2].toLowerCase()]) return ymd(m[3], MON[m[2].toLowerCase()], m[1]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))) return +m[1] > 12 ? ymd(m[3], +m[2], m[1]) : ymd(m[3], +m[1], m[2]);
    // Polskie zapisy terminów („WD+3”, „jutro”, „do piątku”) – wspólny parser z „Zadań z pliku”.
    var pd = SP._extract && SP._extract.parseDue(s, true); if (pd && pd.due) return pd.due;
    // Ostatnia szansa: tylko tekst z rokiem (Date.parse bywa zbyt pobłażliwy, np. „WD+3” → 2001).
    if (!/\b(19|20)\d{2}\b/.test(s)) return null;
    var t = Date.parse(s); return isNaN(t) ? null : SP.date.ymd(new Date(t));
  }
  function mapStatus(s, done) {
    if (done) return "done";
    s = String(s || "").toLowerCase();
    if (/done|closed|resolved|complete|finished|ukończ|zrobione|zamkn|gotowe|archiw/.test(s)) return "done";
    if (/review|qa|test|verif|przegl|akcept|weryfik/.test(s)) return "review";
    if (/progress|doing|dev|working|started|active|w toku|realiz|w trakcie|robię|robimy/.test(s)) return "progress";
    return "todo";
  }
  function mapPriority(s, numericHighFirst) {
    s = String(s == null ? "" : s).trim().toLowerCase(); if (!s || /^(no priority|none|brak|-)$/.test(s)) return null;
    if (/^\d$/.test(s)) { var n = +s; if (!numericHighFirst) n = 5 - n; return n <= 1 ? "urgent" : n === 2 ? "high" : n === 3 ? "normal" : null; }
    if (/urgent|highest|critical|blocker|asap|piln|krytycz|p0|p1\b/.test(s)) return "urgent";
    if (/high|major|wysok|ważn|p2\b/.test(s)) return "high";
    if (/medium|normal|średni|normalny|p3\b/.test(s)) return "normal";
    if (/low|minor|trivial|niski|p4\b/.test(s)) return "low";
    return null;
  }
  var ALIAS = {
    key: ["issue key", "key", "id", "identifier", "issue id"],
    title: ["summary", "title", "name", "task name", "task", "content", "card name", "zadanie", "tytuł", "nazwa", "temat"],
    desc: ["description", "notes", "body", "opis", "notatki", "szczegóły"],
    status: ["status", "state", "stan", "section/column", "column", "kolumna", "list", "lista"],
    assignee: ["assignee", "assigned to", "assignees", "responsible", "owner", "osoba", "osoby", "przypisany", "przypisana", "przypisani", "wykonawca", "odpowiedzialny"],
    due: ["due date", "due", "deadline", "due on", "termin", "data", "date", "termin wykonania"],
    priority: ["priority", "priorytet"],
    points: ["custom field (story points)", "story points", "custom field (story point estimate)", "story point estimate", "estimate", "points", "punkty", "estymacja", "sp"],
    tags: ["labels", "label", "tags", "tag", "tagi", "etykiety"],
    done: ["completed at", "completed", "resolved", "resolution date", "done", "ukończone", "data ukończenia"],
    section: ["section/column", "section", "sekcja", "sprint", "epic name", "project", "projekt"],
    type: ["type"],
  };
  function colsOf(header) {
    var h = header.map(function (x) { return String(x || "").trim().toLowerCase(); }), out = {};
    Object.keys(ALIAS).forEach(function (k) {
      for (var a = 0; a < ALIAS[k].length; a++) {
        var idx = []; h.forEach(function (x, i) { if (x === ALIAS[k][a]) idx.push(i); });
        if (idx.length) { out[k] = idx; return; }
      }
    });
    return out;
  }
  function splitList(s) { return String(s || "").split(/[,;|]/).map(function (x) { return x.trim(); }).filter(Boolean); }

  /* =================== Parsery źródeł → wspólny format =================== */
  /* Element: {title, desc, status, assignees[], due, priority, points, tags[], checklist[{text,done}], ref} */
  function fromTable(rows, src) {
    if (rows.length < 2) throw new Error("Plik nie ma wierszy z zadaniami (pierwszy wiersz to nagłówki).");
    var c = colsOf(rows[0]);
    if (!c.title) throw new Error("Nie znalazłem kolumny z nazwą zadania (np. „Summary”, „Name”, „Title”, „Zadanie”). Kolumny w pliku: " + rows[0].slice(0, 8).join(", ") + ".");
    var get = function (r, k) { return c[k] ? String(r[c[k][0]] == null ? "" : r[c[k][0]]).trim() : ""; };
    var all = function (r, k) { return c[k] ? c[k].map(function (i) { return String(r[i] || "").trim(); }).filter(Boolean) : []; };
    var items = [], section = "";
    rows.slice(1).forEach(function (r) {
      if (src === "todoist") {
        var type = get(r, "type").toLowerCase();
        if (type === "section") { section = get(r, "title"); return; }
        if (type && type !== "task") return;
      }
      var title = get(r, "title"); if (!title) return;
      var tags = [];
      all(r, "tags").forEach(function (x) { tags = tags.concat(splitList(x)); });
      if (src === "todoist") { title = title.replace(/(^|\s)@([\p{L}\d_-]+)/gu, function (m, a, b) { tags.push(b); return a; }).trim(); if (section) tags.push(section); }
      var doneVal = get(r, "done"), statusRaw = get(r, "status"), sec = src === "asana" ? get(r, "section") : "";
      var pts = parseFloat(String(get(r, "points")).replace(",", "."));
      var key = get(r, "key");
      items.push({
        title: title, desc: get(r, "desc"),
        status: mapStatus(statusRaw || sec, src === "asana" ? !!doneVal : /^(true|yes|tak|1|x)$/i.test(doneVal) || (!!doneVal && !!parseDate(doneVal) && !statusRaw)),
        assignees: all(r, "assignee").reduce(function (a, x) { return a.concat(splitList(x)); }, []).map(function (n) { return n.replace(/\s*\(\d+\)$/, "").trim(); }).filter(Boolean),
        due: parseDate(get(r, "due")), priority: mapPriority(get(r, "priority"), src === "todoist" || src === "csv"),
        points: isNaN(pts) || pts < 0 ? null : pts, tags: tags.filter(function (t, i) { return tags.indexOf(t) === i; }).slice(0, 8), checklist: [],
        ref: key && src === "jira" ? "Jira: " + key : key && src === "linear" ? "Linear: " + key : "",
      });
    });
    return items;
  }
  function fromTrello(text) {
    var j; try { j = JSON.parse(text); } catch (e) { throw new Error("To nie jest plik JSON z Trello. Wyeksportuj tablicę: Menu → Drukuj, eksportuj i udostępnij → Eksportuj jako JSON."); }
    if (!j || !Array.isArray(j.cards)) throw new Error("W pliku nie ma kart Trello (brak „cards”).");
    var lists = {}, members = {}, checks = {};
    (j.lists || []).forEach(function (l) { lists[l.id] = l; });
    (j.members || []).forEach(function (m) { members[m.id] = m.fullName || m.username; });
    (j.checklists || []).forEach(function (cl) { (checks[cl.idCard] = checks[cl.idCard] || []).push(cl); });
    return { name: j.name || "Trello", items: j.cards.filter(function (c) { return !c.closed && !(lists[c.idList] || {}).closed; }).map(function (c) {
      var list = (lists[c.idList] || {}).name || "", cl = [];
      (checks[c.id] || []).forEach(function (x) { (x.checkItems || []).sort(function (a, b) { return a.pos - b.pos; }).forEach(function (it) { cl.push({ text: it.name, done: it.state === "complete" }); }); });
      var labels = (c.labels || []).map(function (l) { return l.name; }).filter(Boolean);
      return { title: c.name, desc: c.desc || "", status: mapStatus(list, c.dueComplete), assignees: (c.idMembers || []).map(function (id) { return members[id]; }).filter(Boolean),
        due: c.due ? SP.date.ymd(new Date(c.due)) : null, priority: mapPriority(labels.join(" ")), points: null,
        tags: labels.concat(mapStatus(list) === "todo" && list && !/to ?do|do zrobienia|backlog/i.test(list) ? [list] : []).slice(0, 8), checklist: cl, ref: c.shortUrl ? "Trello: " + c.shortUrl : "" };
    }) };
  }
  function githubRepo(s) {
    var m = /(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/?#].*)?$/.exec(String(s || "").trim());
    return m ? { owner: m[1], repo: m[2] } : null;
  }
  function fromGitHub(input, withClosed) {
    var r = githubRepo(input); if (!r) return Promise.reject(new Error("Wpisz repozytorium jako owner/nazwa albo link do GitHuba."));
    var out = [], base = "https://api.github.com/repos/" + encodeURIComponent(r.owner) + "/" + encodeURIComponent(r.repo) + "/issues?per_page=100&state=" + (withClosed ? "all" : "open") + "&page=";
    function page(n) {
      return fetch(base + n, { headers: { Accept: "application/vnd.github+json" } }).then(function (res) {
        if (res.status === 404) throw new Error("Nie ma takiego publicznego repozytorium: " + r.owner + "/" + r.repo + ".");
        if (res.status === 403 || res.status === 429) throw new Error("GitHub chwilowo ogranicza zapytania (limit dla niezalogowanych) – spróbuj za kilka minut.");
        if (!res.ok) throw new Error("GitHub odpowiedział błędem " + res.status + ".");
        return res.json();
      }).then(function (arr) {
        arr.filter(function (x) { return !x.pull_request; }).forEach(function (x) {
          var labels = (x.labels || []).map(function (l) { return typeof l === "string" ? l : l.name; }).filter(Boolean);
          out.push({ title: x.title, desc: x.body || "", status: x.state === "closed" ? "done" : (x.assignees || []).length ? "progress" : "todo",
            assignees: (x.assignees || []).map(function (a) { return a.login; }), due: x.milestone && x.milestone.due_on ? SP.date.ymd(new Date(x.milestone.due_on)) : null,
            priority: mapPriority(labels.join(" ")), points: null, tags: labels.slice(0, 8), checklist: [], ref: "GitHub: " + x.html_url });
        });
        return arr.length === 100 && n < 5 ? page(n + 1) : null;
      });
    }
    return page(1).then(function () { return { name: r.repo, items: out }; }, function (e) { throw e instanceof TypeError ? new Error("Brak połączenia z api.github.com – sprawdź internet.") : e; });
  }
  function readFile(file, src) {
    var name = file.name.replace(/\.[^.]+$/, "");
    if (src === "trello" || /\.json$/i.test(file.name)) return file.text().then(function (t) { return fromTrello(t); });
    if (/\.(xlsx|xls|xlsm|ods)$/i.test(file.name) && SP._extract) {
      return SP._extract.readSource(file).then(function (s) {
        var sh = (s.sheets || []).find(function (x) { return x.rows.length > 1; }); if (!sh) throw new Error("Arkusz jest pusty.");
        return { name: name, items: fromTable(sh.rows.map(function (r) { return r.map(function (c) { return c ? c.d || c.s || "" : ""; }); }), src) };
      });
    }
    return file.text().then(function (t) { return { name: name, items: fromTable(parseCSV(t), src) }; });
  }

  /* =================== Osoby =================== */
  function personFor(name) {
    var n = String(name || "").trim().toLowerCase(); if (!n) return null;
    var me = SP.user && SP.user.name && SP.user.name.toLowerCase();
    if (n === me || (SP.user && SP.user.email && n === SP.user.email.toLowerCase())) return db.person("me");
    return db.raw.people.find(function (p) { return p.name.toLowerCase() === n || (p.email || "").toLowerCase() === n; }) ||
      db.raw.people.find(function (p) { return p.name.toLowerCase().split(/\s+/)[0] === n.split(/[\s@.]+/)[0] && n.split(/\s+/).length === 1; }) || null;
  }

  /* =================== Okno importu =================== */
  SP.importTasks = function (srcId, opts) {
    opts = opts || {};
    var src = SOURCES.find(function (s) { return s.id === srcId; }), data = null, busy = false;
    var bg = SP.el('<div class="sx-bg"><div class="sx imp" role="dialog" aria-modal="true" aria-label="Import zadań">' +
      '<header class="xt-h"><span class="xt-hi">' + ico("download", 18) + '</span><div><h2>Przenieś zadania do Sprynt</h2><p class="muted">Z Trello, Jiry, Asany, Linear, Todoist, GitHuba albo z arkusza – razem z osobami, terminami i punktami.</p></div><button class="ibtn" data-x title="Zamknij (Esc)">' + ico("x", 18) + "</button></header>" +
      '<div class="sx-body imp-body"></div><footer class="pt-f imp-f"></footer></div></div>');
    var body = bg.querySelector(".imp-body"), foot = bg.querySelector(".imp-f");
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape" && !document.querySelector(".popover")) { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) close(); });
    document.body.appendChild(bg);

    function logoOf(s, size) { return s.logo ? SP.logo(s.logo, size) : ico(s.icon, size); }
    function pick() {
      src = null; data = null;
      body.innerHTML = '<p class="muted imp-lead">Skąd przenosisz zadania?</p><div class="imp-grid">' + SOURCES.map(function (s, i) {
        return '<button class="imp-src" data-src="' + s.id + '" style="--i:' + i + '"><span class="imp-logo">' + logoOf(s, 30) + "</span><b>" + esc(s.name) + '</b><small class="muted">' + esc(s.kind) + "</small></button>";
      }).join("") + '</div><p class="muted imp-note">' + ico("lock", 13) + "Pliki czytamy tylko w tej przeglądarce – nic nie wysyłamy na serwer. Importowane zadania trafią na nową listę, którą potem przeniesiesz albo usuniesz.</p>";
      foot.innerHTML = '<span class="grow"></span><button class="btn ghost sm" data-x>Anuluj</button>';
      SP.hydrateIcons(bg);
    }
    function source() {
      body.innerHTML = '<button class="link imp-back" data-back>' + ico("chevron-left", 14) + "Inne źródło</button>" +
        '<div class="imp-head"><span class="imp-logo lg">' + logoOf(src, 40) + "</span><div><h3>" + esc(src.name) + '</h3><p class="muted">' + esc(src.how) + "</p></div></div>" +
        (src.repo ? '<form class="imp-repo"><input class="input" placeholder="np. facebook/react albo https://github.com/owner/repo" autocomplete="off" spellcheck="false" /><label class="imp-chk"><input type="checkbox" /> także zamknięte</label><button class="btn primary sm" type="submit">Pobierz zgłoszenia</button></form>'
          : '<label class="xt-drop imp-drop" tabindex="0"><input type="file" hidden accept="' + src.accept + '" /><span class="xt-drop-ico">' + ico("file-dropzone", 34) + "</span><b>Upuść plik " + esc(src.kind) + " albo kliknij</b><span class=\"muted\">" + esc(src.accept.replace(/\./g, "").toUpperCase().split(",").join(", ")) + "</span></label>") +
        '<div class="imp-msg" hidden></div>';
      foot.innerHTML = '<span class="grow"></span><button class="btn ghost sm" data-x>Anuluj</button>';
      SP.hydrateIcons(bg);
      var drop = body.querySelector(".imp-drop"), inp = drop && drop.querySelector("input");
      if (drop) {
        inp.addEventListener("change", function () { if (inp.files[0]) load(readFile(inp.files[0], src.id)); });
        drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
        drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
        drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
        drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); var f = e.dataTransfer.files[0]; if (f) load(readFile(f, src.id)); });
      } else {
        var f = body.querySelector(".imp-repo"), ri = f.querySelector(".input");
        f.addEventListener("submit", function (e) { e.preventDefault(); if (ri.value.trim()) load(fromGitHub(ri.value, f.querySelector("[type=checkbox]").checked)); });
        setTimeout(function () { ri.focus(); }, 0);
      }
    }
    function msg(html, err) { var m = body.querySelector(".imp-msg"); if (!m) return; m.hidden = false; m.className = "imp-msg" + (err ? " err" : ""); m.innerHTML = html; }
    function load(p) {
      if (busy) return; busy = true; msg(spinner("Czytam…"));
      Promise.resolve(p).then(function (res) {
        busy = false; if (!bg.isConnected) return;
        if (!res.items.length) { msg("Nie znalazłem zadań w tym źródle.", true); return; }
        data = res; review();
      }, function (e) { busy = false; if (bg.isConnected) msg(esc(e.message || "Nie udało się wczytać."), true); });
    }
    function spinner(t) { return '<span class="xt-spin sm"></span>' + esc(t); }
    function review() {
      var items = data.items, names = {}, unknown = [];
      items.forEach(function (it) { it.assignees.forEach(function (n) { names[n] = 1; }); });
      Object.keys(names).forEach(function (n) { if (!personFor(n)) unknown.push(n); });
      var done = items.filter(function (i) { return i.status === "done"; }).length, pts = items.filter(function (i) { return i.points != null; }).length;
      var spaces = db.raw.spaces, sp0 = opts.spaceId || (spaces[0] || {}).id;
      var counts = { todo: 0, progress: 0, review: 0, done: 0 }; items.forEach(function (i) { counts[i.status]++; });
      body.innerHTML = '<button class="link imp-back" data-back>' + ico("chevron-left", 14) + "Inny plik</button>" +
        '<div class="imp-head"><span class="imp-logo">' + logoOf(src, 30) + "</span><div><h3>" + esc(data.name) + '</h3><p class="muted">' + pl(items.length, "zadanie", "zadania", "zadań") +
        (pts ? " · " + pts + " z punktami" : "") + (Object.keys(names).length ? " · " + pl(Object.keys(names).length, "osoba", "osoby", "osób") : "") + " · " + db.STATUSES.map(function (s) { return counts[s.id] ? s.name.toLowerCase() + ": " + counts[s.id] : ""; }).filter(Boolean).join(", ") + "</p></div></div>" +
        '<div class="imp-opts"><label>Przestrzeń <select class="input sm" data-o="space">' + spaces.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sp0 ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></label>" +
        '<label>Nazwa nowej listy <input class="input sm" data-o="list" value="' + esc((src.id === "csv" ? "" : src.name + " – ") + data.name) + '" maxlength="80" /></label>' +
        (unknown.length ? '<label class="imp-chk"><input type="checkbox" data-o="people" checked /> Dodaj do zespołu: ' + esc(unknown.slice(0, 6).join(", ")) + (unknown.length > 6 ? " i " + (unknown.length - 6) + " więcej" : "") + "</label>" : "") +
        (done ? '<label class="imp-chk"><input type="checkbox" data-o="skipDone" /> Pomiń ukończone (' + done + ")</label>" : "") + "</div>" +
        '<div class="imp-prev"><table><thead><tr><th>Zadanie</th><th>Osoby</th><th>Termin</th><th class="n">Pkt</th><th>Tagi</th></tr></thead><tbody>' + items.slice(0, 60).map(function (it) {
          return "<tr><td>" + SP.statusDot(it.status) + "<span>" + esc(it.title) + "</span>" + (it.priority ? SP.flag(it.priority) : "") + (it.checklist.length ? '<small class="muted"> ☑ ' + it.checklist.length + "</small>" : "") + "</td><td>" + esc(it.assignees.join(", ")) + "</td><td>" + (it.due ? SP.fmtDue(it.due, it.status === "done").label : "") + '</td><td class="n">' + (it.points != null ? it.points : "") + "</td><td>" + it.tags.slice(0, 3).map(function (t) { return '<span class="imp-tag">' + esc(t) + "</span>"; }).join("") + "</td></tr>";
        }).join("") + "</tbody></table>" + (items.length > 60 ? '<p class="muted imp-more">… i ' + (items.length - 60) + " więcej</p>" : "") + "</div>";
      foot.innerHTML = '<span class="muted imp-sum"></span><span class="grow"></span><button class="btn ghost sm" data-x>Anuluj</button><button class="btn primary sm" data-go>' + ico("download", 14) + "<span></span></button>";
      SP.hydrateIcons(bg);
      function sum() { var skip = body.querySelector('[data-o="skipDone"]'), n = items.length - (skip && skip.checked ? done : 0); foot.querySelector("[data-go] span").textContent = "Importuj " + pl(n, "zadanie", "zadania", "zadań"); }
      body.addEventListener("change", sum); sum();
    }
    function run() {
      var o = function (k) { return body.querySelector('[data-o="' + k + '"]'); };
      var spaceId = o("space").value, listName = o("list").value.trim() || src.name, addPeople = o("people") && o("people").checked, skipDone = o("skipDone") && o("skipDone").checked;
      var list = db.createList(spaceId, null, listName), made = 0, map = {};
      data.items.forEach(function (it) {
        if (skipDone && it.status === "done") return;
        var ids = [];
        it.assignees.forEach(function (n) {
          if (!(n in map)) { var p = personFor(n) || (addPeople ? db.addPerson(n) : null); map[n] = p ? p.id : null; }
          if (map[n] && ids.indexOf(map[n]) < 0) ids.push(map[n]);
        });
        it.tags.forEach(function (t) { if (!db.tag(t)) db.createTag(t); });
        var desc = (it.desc ? "<p>" + esc(it.desc.slice(0, 20000)).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>") + "</p>" : "") + (it.ref ? '<p class="muted">' + esc(it.ref) + "</p>" : "");
        db.createTask({ listId: list.id, title: it.title.slice(0, 300), desc: desc, status: it.status, assignees: ids, due: it.due, priority: it.priority, points: it.points, tags: it.tags,
          checklist: it.checklist.map(function (c, i) { return { id: "c" + Date.now().toString(36) + made + "_" + i, text: c.text, done: c.done }; }) });
        made++;
      });
      close(); location.hash = "#/list/" + list.id;
      SP.toast("Zaimportowano " + pl(made, "zadanie", "zadania", "zadań") + " z " + src.name);
      if (SP.celebrate && made) setTimeout(function () { SP.celebrate(innerWidth / 2, innerHeight / 3); }, 200);
    }
    bg.addEventListener("click", function (e) {
      var b;
      if ((b = e.target.closest("[data-src]"))) { src = SOURCES.find(function (s) { return s.id === b.dataset.src; }); source(); return; }
      if (e.target.closest("[data-back]")) { if (data) { data = null; source(); } else pick(); return; }
      if (e.target.closest("[data-go]")) run();
    });
    if (src) source(); else pick();
  };
  function pl(n, one, few, many) { var a = Math.abs(n) % 100, b = a % 10; return n + " " + (n === 1 ? one : b >= 2 && b <= 4 && (a < 12 || a > 14) ? few : many); }

  /** Sekcja w Ustawieniach. */
  SP.importSection = function () {
    return '<section class="card set-card" id="import-sec"><div class="set-h"><h2>' + ico("download", 17) + ' Przenieś zadania z innych narzędzi</h2><p class="muted">Eksport z Trello, Jiry, Asany, Linear albo Todoist, zgłoszenia z GitHuba lub dowolny arkusz – z osobami, terminami, priorytetami, punktami i checklistami.</p></div>' +
      '<div class="imp-row">' + SOURCES.map(function (s) { return '<button class="imp-chip" data-imp="' + s.id + '">' + (s.logo ? SP.logo(s.logo, 18) : ico(s.icon, 18)) + "<span>" + esc(s.name) + "</span></button>"; }).join("") + "</div></section>";
  };
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-imp]"); if (b) SP.importTasks(b.dataset.imp); });

  SP._import = { parseCSV: parseCSV, parseDate: parseDate, mapStatus: mapStatus, mapPriority: mapPriority, fromTable: fromTable, fromTrello: fromTrello, githubRepo: githubRepo, fromGitHub: fromGitHub };
})();
