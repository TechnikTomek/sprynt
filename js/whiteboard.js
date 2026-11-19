/* Sprynt – tablice online (whiteboard): karteczki, tekst, prostokąty, elipsy, rysik,
 * zadania na tablicy, przesuwanie i zoom, cofanie. Wszystko w świecie (współrzędne tablicy),
 * widok = przesunięcie (x, y) + skala z. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico, views = SP.views;

  var NOTE_COLORS = ["#fde68a", "#fbcfe8", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fed7aa"];
  var INK_COLORS = ["ink", "#6c5ce7", "#e84393", "#00a884", "#0984e3", "#f39c12", "#e5484d"];
  var TOOLS = [
    ["select", "mouse-pointer", "Zaznacz i przesuwaj", "V"],
    ["hand", "hand", "Przesuwanie tablicy (albo przytrzymaj spację)", "H"],
    ["note", "sticky-note", "Karteczka", "N"],
    ["text", "type", "Tekst", "T"],
    ["rect", "square", "Prostokąt", "R"],
    ["ellipse", "circle", "Elipsa", "O"],
    ["pen", "pen-line", "Rysik", "P"],
  ];
  var uid = function () { return "i" + Math.random().toString(36).slice(2, 9); };
  var inkCss = function (c) { return c === "ink" || !c ? "var(--text)" : c; };
  var selByBoard = {};

  /* =================== Lista tablic =================== */
  function thumb(w) {
    var it = w.items.filter(function (i) { return i.type !== "task" || true; });
    if (!it.length) return '<div class="wbt-empty">' + ico("presentation", 30) + "</div>";
    var b = bbox(it), pad = 20, W = b.w + pad * 2, H = b.h + pad * 2;
    return '<svg viewBox="' + (b.x - pad) + " " + (b.y - pad) + " " + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' + it.map(function (i) {
      if (i.type === "note") return '<rect x="' + i.x + '" y="' + i.y + '" width="' + i.w + '" height="' + i.h + '" rx="6" fill="' + i.color + '"/>';
      if (i.type === "task") return '<rect x="' + i.x + '" y="' + i.y + '" width="' + i.w + '" height="' + (i.h || 84) + '" rx="8" class="wbt-task"/>';
      if (i.type === "rect") return '<rect x="' + i.x + '" y="' + i.y + '" width="' + i.w + '" height="' + i.h + '" rx="6" fill="none" stroke="' + inkCss(i.color) + '" stroke-width="3"/>';
      if (i.type === "ellipse") return '<ellipse cx="' + (i.x + i.w / 2) + '" cy="' + (i.y + i.h / 2) + '" rx="' + i.w / 2 + '" ry="' + i.h / 2 + '" fill="none" stroke="' + inkCss(i.color) + '" stroke-width="3"/>';
      if (i.type === "path") return '<path transform="translate(' + i.x + " " + i.y + ')" d="' + pathD(i.pts) + '" fill="none" stroke="' + inkCss(i.color) + '" stroke-width="' + (i.sw || 3) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      if (i.type === "text") return '<rect x="' + i.x + '" y="' + (i.y + 8) + '" width="' + Math.min(i.w, 200) + '" height="8" rx="4" class="wbt-text"/>';
      return "";
    }).join("") + "</svg>";
  }
  function newBoard(spaceId) {
    var spaces = db.raw.spaces.map(function (s) { return [s.id, s.name]; });
    if (!spaces.length) { SP.toast("Najpierw utwórz przestrzeń"); return; }
    SP.form({ title: "Nowa tablica online", submit: "Utwórz", fields: [
      { name: "title", label: "Nazwa", placeholder: "np. Burza mózgów – kampania", required: true },
      { name: "space", label: "Przestrzeń", type: "select", options: spaces, value: spaceId || spaces[0][0] },
    ] }).then(function (v) { if (v && v.title) { var w = db.createWhiteboard(v.space, v.title); location.hash = "#/wb/" + w.id; } });
  }
  SP.newWhiteboard = newBoard;
  views.whiteboards = {
    title: function () { return "Tablice online"; },
    crumbs: function () { return [{ icon: "presentation", label: "Tablice online" }]; },
    render: function (el) {
      var list = db.raw.whiteboards.slice().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
      el.innerHTML = '<div class="page"><div class="page-h"><h1>Tablice online</h1><button class="btn primary sm" data-new-wb>' + ico("plus", 15) + "Nowa tablica</button></div>" +
        (list.length ? '<div class="wb-grid">' + list.map(function (w) {
          var s = db.space(w.spaceId) || { name: "—", color: "#ccc" };
          return '<a class="wb-card" href="#/wb/' + w.id + '"><div class="wbt">' + thumb(w) + '</div><div class="wb-card-b"><b>' + esc(w.title) + '</b><span class="muted">' + SP.spaceIcon(s, "xs") + esc(s.name) + " · " + SP.ago(w.updatedAt) + "</span></div>" +
            '<button class="ibtn wb-card-m" data-wbmenu="' + w.id + '" title="Więcej">' + ico("ellipsis", 16) + "</button></a>";
        }).join("") + "</div>"
          : '<div class="empty-b">' + ico("presentation", 44) + "<h3>Brak tablic</h3><p class='muted'>Tablica online to nieskończone płótno na burze mózgów: karteczki, kształty, rysunki – a karteczkę jednym kliknięciem zamienisz w zadanie.</p>" +
            '<button class="btn primary" data-new-wb>' + ico("plus", 16) + "Nowa tablica</button></div>") + "</div>";
      el.addEventListener("click", function (e) {
        var b;
        if (e.target.closest("[data-new-wb]")) { newBoard(); return; }
        if ((b = e.target.closest("[data-wbmenu]"))) {
          e.preventDefault(); e.stopPropagation();
          var w = db.whiteboard(b.dataset.wbmenu);
          SP.menu(b, [
            { label: "Zmień nazwę", icon: "pencil", run: function () { SP.form({ title: "Zmień nazwę", fields: [{ name: "t", label: "Nazwa", value: w.title, required: true }] }).then(function (v) { if (v && v.t) db.renameWhiteboard(w.id, v.t); }); } },
            { label: db.isFavorite("whiteboard", w.id) ? "Usuń z ulubionych" : "Dodaj do ulubionych", icon: "star", run: function () { db.toggleFavorite("whiteboard", w.id); } },
            "-",
            { label: "Usuń tablicę", icon: "trash", danger: true, run: function () { SP.confirm("Usunąć tablicę?", "„" + w.title + "” zniknie razem z zawartością. Zadania utworzone z karteczek zostają.").then(function (ok) { if (ok) db.deleteWhiteboard(w.id); }); } },
          ], { align: "right" });
        }
      });
    },
  };

  /* =================== Geometria =================== */
  function bbox(items) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    items.forEach(function (i) { x1 = Math.min(x1, i.x); y1 = Math.min(y1, i.y); x2 = Math.max(x2, i.x + (i.w || 0)); y2 = Math.max(y2, i.y + (i.h || 40)); });
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }
  function pathD(pts) {
    if (!pts.length) return "";
    if (pts.length < 3) return "M" + pts.map(function (p) { return p[0] + " " + p[1]; }).join("L");
    var d = "M" + pts[0][0] + " " + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += "Q" + pts[i][0] + " " + pts[i][1] + " " + mx + " " + my;
    }
    var l = pts[pts.length - 1];
    return d + "L" + l[0] + " " + l[1];
  }
  /** Upraszcza linię (odrzuca punkty bliżej niż 2 px od poprzedniego). */
  function thin(pts) { var out = [pts[0]]; for (var i = 1; i < pts.length; i++) { var p = out[out.length - 1]; if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) > 2) out.push(pts[i]); } return out; }

  /* =================== Tablica =================== */
  views.wb = {
    title: function (p) { var w = db.whiteboard(p.id); return w ? w.title : "Tablica online"; },
    crumbs: function (p) { var w = db.whiteboard(p.id); return [{ icon: "presentation", label: "Tablice online", href: "#/whiteboards" }, { label: w ? w.title : "?" }]; },
    render: function (el, p) {
      var w = db.whiteboard(p.id);
      if (!w) { el.innerHTML = '<div class="page"><div class="empty-b"><h3>Tablica nie istnieje</h3><a class="btn" href="#/whiteboards">Wszystkie tablice</a></div></div>'; return; }
      db.addRecent("whiteboard", w.id);
      mount(el, w);
    },
  };

  function mount(el, w) {
    w.view = w.view || { x: 0, y: 0, z: 1 };
    var view = w.view, tool = "select", sel = selByBoard[w.id] || null, editing = null, spaceDown = false;
    var undo = [], saveT = null;

    el.innerHTML = '<div class="wb" data-tool="select">' +
      '<div class="wb-vp" tabindex="0" aria-label="Tablica ' + esc(w.title) + '"><div class="wb-world"></div></div>' +
      '<div class="wb-top"><input class="wb-title" value="' + esc(w.title) + '" maxlength="120" aria-label="Nazwa tablicy" /><span class="muted wb-saved">Zapisano</span></div>' +
      '<div class="wb-tools" role="toolbar" aria-label="Narzędzia">' + TOOLS.map(function (t) {
        return '<button class="wb-tool" data-tool="' + t[0] + '" title="' + t[2] + " (" + t[3] + ')" aria-pressed="' + (t[0] === "select") + '">' + ico(t[1], 18) + "</button>";
      }).join("") + '<span class="wb-sep"></span><button class="wb-tool" data-act="undo" title="Cofnij (Ctrl/⌘ + Z)">' + ico("undo", 17) + "</button></div>" +
      '<div class="wb-zoom"><button class="ibtn" data-zoom="-1" title="Oddal (−)">' + ico("minus", 16) + '</button><button class="wb-zv" data-zoom="0" title="100% (0)"></button><button class="ibtn" data-zoom="1" title="Przybliż (+)">' + ico("plus", 16) +
      '</button><button class="ibtn" data-zoom="fit" title="Pokaż wszystko (Shift + 1)">' + ico("fullscreen", 16) + "</button></div>" +
      '<div class="wb-bar" hidden></div>' +
      '<div class="wb-hint" hidden><b>Pusta tablica</b><span>Wybierz <kbd>N</kbd> karteczkę, <kbd>T</kbd> tekst, <kbd>R</kbd> prostokąt albo <kbd>P</kbd> rysik i kliknij na tablicy. Przeciągaj puste miejsce, żeby się przesuwać; <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + kółko przybliża.</span></div></div>';
    SP.hydrateIcons(el);
    var root = el.querySelector(".wb"), vp = el.querySelector(".wb-vp"), world = el.querySelector(".wb-world"), bar = el.querySelector(".wb-bar");

    /* ---- Zapis, cofanie ---- */
    function commit() {
      el.querySelector(".wb-saved").textContent = "Zapisywanie…";
      clearTimeout(saveT);
      saveT = setTimeout(function () { db.saveWhiteboard(w.id, { items: w.items, view: view }); var s = el.querySelector(".wb-saved"); if (s) s.textContent = "Zapisano"; }, 250);
    }
    function snap() { undo.push(JSON.stringify(w.items)); if (undo.length > 60) undo.shift(); }
    function doUndo() {
      if (!undo.length) { SP.toast("Nie ma czego cofnąć"); return; }
      w.items = JSON.parse(undo.pop()); setSel(null); draw(); commit();
    }
    function item(id) { return w.items.find(function (i) { return i.id === id; }); }

    /* ---- Widok ---- */
    function applyView() {
      world.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.z + ")";
      var g = 24 * view.z;
      vp.style.backgroundSize = g + "px " + g + "px";
      vp.style.backgroundPosition = view.x + "px " + view.y + "px";
      el.querySelector(".wb-zv").textContent = Math.round(view.z * 100) + "%";
      placeBar();
    }
    function toWorld(cx, cy) { var r = vp.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; }
    function zoomAt(z, cx, cy) {
      z = Math.max(0.2, Math.min(3, z));
      var r = vp.getBoundingClientRect(); if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      var wx = (cx - r.left - view.x) / view.z, wy = (cy - r.top - view.y) / view.z;
      view.z = z; view.x = cx - r.left - wx * z; view.y = cy - r.top - wy * z;
      applyView(); commit();
    }
    function fit() {
      var r = vp.getBoundingClientRect();
      if (!w.items.length) { view.x = r.width / 2; view.y = r.height / 2; view.z = 1; applyView(); return; }
      var b = bbox(w.items), pad = 80;
      var z = Math.max(0.2, Math.min(1.5, Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h)));
      view.z = z; view.x = r.width / 2 - (b.x + b.w / 2) * z; view.y = r.height / 2 - (b.y + b.h / 2) * z;
      applyView(); commit();
    }

    /* ---- Rysowanie elementów ---- */
    function itemHTML(i) {
      var inner = "";
      if (i.type === "note" || i.type === "text" || i.type === "rect" || i.type === "ellipse") inner = '<div class="wb-tx"></div>';
      if (i.type === "rect" || i.type === "ellipse") inner = '<svg class="wb-shape" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">' + (i.type === "rect" ? '<rect x="1.5" y="1.5" width="97" height="97" rx="4" vector-effect="non-scaling-stroke"/>' : '<ellipse cx="50" cy="50" rx="48.5" ry="48.5" vector-effect="non-scaling-stroke"/>') + "</svg>" + inner;
      if (i.type === "path") inner = '<svg class="wb-ink" width="' + i.w + '" height="' + i.h + '" viewBox="0 0 ' + i.w + " " + i.h + '" aria-hidden="true"><path d="' + pathD(i.pts) + '" stroke-width="' + (i.sw || 3) + '"/></svg>';
      if (i.type === "task") {
        var t = db.task(i.taskId);
        if (!t) inner = '<div class="wb-tk gone">' + ico("x", 14) + "Zadanie zostało usunięte</div>";
        else {
          var d = SP.fmtDue(t.due, db.status(t.status).closed);
          inner = '<div class="wb-tk"><div class="wbk-top">' + SP.statusDot(t.status) + '<span class="muted">' + db.taskKey(t) + " · " + esc(db.status(t.status).name) + "</span>" + (t.priority ? SP.flag(t.priority) : "") + "</div>" +
            '<div class="wbk-t' + (db.status(t.status).closed ? " done" : "") + '">' + esc(t.title) + '</div><div class="wbk-f">' + (t.assignees.length ? SP.avatars(t.assignees, "xs") : "") + (t.due ? '<span class="due ' + d.cls + '">' + d.label + "</span>" : "") + "</div></div>";
        }
      }
      var resizable = i.type === "note" || i.type === "rect" || i.type === "ellipse" || i.type === "text" || i.type === "task";
      return inner + (resizable ? '<span class="wb-h" data-h title="Zmień rozmiar"></span>' : "");
    }
    function styleItem(node, i) {
      node.style.left = i.x + "px"; node.style.top = i.y + "px";
      node.style.width = (i.w || 200) + "px";
      if (i.type === "note" || i.type === "rect" || i.type === "ellipse") node.style.minHeight = node.style.height = i.h + "px";
      if (i.type === "path") node.style.height = i.h + "px";
      if (i.type === "note") node.style.setProperty("--c", i.color || NOTE_COLORS[0]);
      else node.style.setProperty("--c", inkCss(i.color));
      if (i.type === "text") node.style.fontSize = (i.fs || 20) + "px";
    }
    function draw() {
      world.innerHTML = "";
      w.items.forEach(function (i) {
        var n = document.createElement("div");
        n.className = "wb-it wb-" + i.type + (sel === i.id ? " sel" : "");
        n.dataset.id = i.id;
        n.innerHTML = itemHTML(i);
        var tx = n.querySelector(".wb-tx"); if (tx) tx.textContent = i.text || "";
        styleItem(n, i);
        world.appendChild(n);
      });
      SP.hydrateIcons(world);
      el.querySelector(".wb-hint").hidden = w.items.length > 0;
      placeBar();
    }
    function nodeOf(id) { return world.querySelector('[data-id="' + id + '"]'); }
    function syncSize(i) {
      // wysokość notatki/tekstu/zadania może urosnąć z treścią – zapamiętaj realny rozmiar
      var n = nodeOf(i.id); if (!n) return;
      if (i.type === "task" || i.type === "text") i.h = n.offsetHeight;
    }

    /* ---- Zaznaczenie i pasek akcji ---- */
    function setSel(id) {
      sel = id; selByBoard[w.id] = id;
      world.querySelectorAll(".wb-it.sel").forEach(function (n) { n.classList.remove("sel"); });
      if (id) { var n = nodeOf(id); if (n) n.classList.add("sel"); }
      drawBar();
    }
    function drawBar() {
      var i = sel && item(sel);
      if (!i || editing) { bar.hidden = true; return; }
      var h = "";
      if (i.type === "note") h += NOTE_COLORS.map(function (c) { return '<button class="wb-sw" data-color="' + c + '" style="--c:' + c + '" aria-pressed="' + (i.color === c) + '" title="Kolor"></button>'; }).join("") + '<span class="wb-sep v"></span>';
      if (i.type === "rect" || i.type === "ellipse" || i.type === "path" || i.type === "text") h += INK_COLORS.map(function (c) { return '<button class="wb-sw" data-color="' + c + '" style="--c:' + inkCss(c) + '" aria-pressed="' + ((i.color || "ink") === c) + '" title="Kolor"></button>'; }).join("") + '<span class="wb-sep v"></span>';
      if (i.type === "text") h += '<button class="ibtn" data-fs="-1" title="Mniejszy tekst">' + ico("minus", 15) + '</button><button class="ibtn" data-fs="1" title="Większy tekst">' + ico("plus", 15) + '</button><span class="wb-sep v"></span>';
      if (i.type === "note") h += '<button class="btn sm wb-totask" data-act="totask">' + ico("check", 14) + "Zamień w zadanie</button>";
      if (i.type === "task" && db.task(i.taskId)) h += '<button class="btn sm" data-act="opentask">' + ico("arrow-up-right", 14) + "Otwórz zadanie</button>";
      h += '<button class="ibtn" data-act="front" title="Na wierzch">' + ico("bring-to-front", 15) + '</button><button class="ibtn" data-act="dup" title="Duplikuj (Ctrl/⌘ + D)">' + ico("copy", 15) + '</button><button class="ibtn" data-act="del" title="Usuń (Delete)">' + ico("trash", 15) + "</button>";
      bar.innerHTML = h; SP.hydrateIcons(bar); bar.hidden = false; placeBar();
    }
    function placeBar() {
      if (bar.hidden || !sel) return;
      var n = nodeOf(sel); if (!n) { bar.hidden = true; return; }
      var r = n.getBoundingClientRect(), rr = root.getBoundingClientRect();
      var x = r.left - rr.left + r.width / 2 - bar.offsetWidth / 2, y = r.top - rr.top - bar.offsetHeight - 12;
      if (y < 56) y = r.bottom - rr.top + 12;
      bar.style.left = Math.max(76, Math.min(rr.width - bar.offsetWidth - 8, x)) + "px"; bar.style.top = y + "px";
    }
    bar.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    bar.addEventListener("click", function (e) {
      var i = item(sel); if (!i) return; var b;
      if ((b = e.target.closest("[data-color]"))) { snap(); i.color = b.dataset.color; redrawItem(i); drawBar(); commit(); return; }
      if ((b = e.target.closest("[data-fs]"))) { snap(); i.fs = Math.max(12, Math.min(72, (i.fs || 20) + (+b.dataset.fs) * 4)); redrawItem(i); commit(); return; }
      if (!(b = e.target.closest("[data-act]"))) return;
      var a = b.dataset.act;
      if (a === "del") removeSel();
      else if (a === "dup") duplicate();
      else if (a === "front") { snap(); w.items = w.items.filter(function (x) { return x !== i; }).concat([i]); draw(); setSel(i.id); commit(); }
      else if (a === "opentask") SP.openTask(i.taskId);
      else if (a === "totask") toTask(i);
    });
    function redrawItem(i) { var n = nodeOf(i.id); if (!n) return draw(); n.innerHTML = itemHTML(i); var tx = n.querySelector(".wb-tx"); if (tx) tx.textContent = i.text || ""; styleItem(n, i); SP.hydrateIcons(n); placeBar(); }
    function removeSel() { if (!sel) return; snap(); w.items = w.items.filter(function (x) { return x.id !== sel; }); setSel(null); draw(); commit(); }
    function duplicate() {
      var i = item(sel); if (!i) return; snap();
      var c = JSON.parse(JSON.stringify(i)); c.id = uid(); c.x += 24; c.y += 24;
      if (c.type === "task") { var t = db.duplicateTask(i.taskId); if (t) c.taskId = t.id; }
      w.items.push(c); draw(); setSel(c.id); commit();
    }
    function toTask(i) {
      finishEdit();
      var text = (i.text || "").trim();
      if (!text) { SP.toast("Najpierw wpisz coś na karteczce"); return; }
      var lists = db.raw.lists.filter(function (l) { return l.spaceId === w.spaceId; });
      var listId = (lists[0] || db.raw.lists[0] || {}).id;
      if (!listId) { SP.toast("Najpierw utwórz listę"); return; }
      snap();
      var lines = text.split("\n"), title = lines[0].slice(0, 200), rest = lines.slice(1).join("\n").trim();
      var idx = w.items.indexOf(i);
      var card = { id: uid(), type: "task", x: i.x, y: i.y, w: Math.max(220, i.w), taskId: null };
      w.items[idx] = card; selByBoard[w.id] = card.id;
      db.saveWhiteboard(w.id, { items: w.items, view: view });
      var t = db.createTask({ listId: listId, title: title, desc: rest ? "<p>" + esc(rest).replace(/\n/g, "<br>") + "</p>" : "", assignees: [db.me] });
      card.taskId = t.id;
      t.activity.push({ by: "me", text: "utworzył(a) zadanie z karteczki na tablicy „" + w.title + "”", at: new Date().toISOString() });
      db.saveWhiteboard(w.id, { items: w.items, view: view });
      SP.toast("Utworzono " + db.taskKey(t) + " w liście " + db.list(listId).name);
      // createTask przerysuje widok (db.onChange) – nowy mount pokaże kartę zadania
    }

    /* ---- Edycja tekstu ---- */
    var editCtx = null;
    function startEdit(i) {
      finishEdit();
      var n = nodeOf(i.id), tx = n && n.querySelector(".wb-tx"); if (!tx) return;
      editing = i.id; bar.hidden = true; n.classList.add("editing");
      editCtx = { i: i, n: n, tx: tx, before: JSON.stringify(w.items), orig: i.text || "" };
      tx.contentEditable = "true"; tx.focus();
      var r = document.createRange(); r.selectNodeContents(tx); var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      // Tekst zapisujemy na bieżąco – nie polegamy na „blur” (Firefox nie zawsze go wysyła).
      tx.addEventListener("input", function () { if (editCtx && editCtx.tx === tx) { i.text = tx.innerText.replace(/\n$/, ""); commit(); } });
      tx.addEventListener("blur", function () { if (editCtx && editCtx.tx === tx) finishEdit(); });
      tx.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishEdit(); vp.focus({ preventScroll: true }); } });
    }
    /** Kończy edycję tekstu (idempotentnie): zapis, cofanie, sprzątanie pustego tekstu. */
    function finishEdit() {
      var c = editCtx; if (!c) return;
      editCtx = null; editing = null;
      c.tx.contentEditable = "false"; c.n.classList.remove("editing");
      var v = c.tx.innerText.replace(/\n$/, "");
      c.i.text = v;
      if (v !== c.orig) { undo.push(c.before); if (undo.length > 60) undo.shift(); }
      if (c.i.type === "text" && !v.trim()) { w.items = w.items.filter(function (x) { return x !== c.i; }); if (sel === c.i.id) setSel(null); draw(); }
      else { syncSize(c.i); drawBar(); }
      commit();
    }

    /* ---- Narzędzia ---- */
    function setTool(t) {
      tool = t; root.dataset.tool = t;
      el.querySelectorAll(".wb-tool[data-tool]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tool === t)); });
      if (t !== "select") setSel(null);
    }
    el.querySelector(".wb-tools").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tool]"); if (b) { setTool(b.dataset.tool); vp.focus(); return; }
      if (e.target.closest('[data-act="undo"]')) doUndo();
    });
    el.querySelector(".wb-zoom").addEventListener("click", function (e) {
      var b = e.target.closest("[data-zoom]"); if (!b) return;
      var z = b.dataset.zoom;
      if (z === "fit") fit(); else if (z === "0") zoomAt(1); else zoomAt(view.z * (z === "1" ? 1.25 : 0.8));
    });
    var titleIn = el.querySelector(".wb-title");
    titleIn.addEventListener("change", function () { var v = titleIn.value.trim() || "Tablica bez nazwy"; titleIn.value = v; w.title = v; db.saveWhiteboard(w.id, {}); SP.refreshChrome(); document.title = v + " · Sprynt"; });
    titleIn.addEventListener("keydown", function (e) { if (e.key === "Enter") titleIn.blur(); });

    /* ---- Wskaźnik: przesuwanie, tworzenie, rysowanie ---- */
    var drag = null;
    vp.addEventListener("pointerdown", function (e) {
      if (editing) { var en = nodeOf(editing); if (en && en.contains(e.target)) return; finishEdit(); }
      if (e.button === 2) return;
      vp.focus({ preventScroll: true });
      var pt = toWorld(e.clientX, e.clientY), itNode = e.target.closest(".wb-it"), i = itNode && item(itNode.dataset.id);
      if (e.button === 1 || tool === "hand" || spaceDown) { drag = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; }
      else if (tool === "select") {
        if (i && e.target.closest("[data-h]")) { snap(); drag = { kind: "resize", i: i, sx: pt.x, sy: pt.y, w: i.w, h: i.h || nodeOf(i.id).offsetHeight, fs: i.fs || 20 }; setSel(i.id); }
        else if (i) { setSel(i.id); drag = { kind: "move", i: i, sx: pt.x, sy: pt.y, x: i.x, y: i.y, moved: false }; }
        else { setSel(null); drag = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; }
      } else if (tool === "note" || tool === "text") {
        snap();
        var n = tool === "note" ? { id: uid(), type: "note", x: Math.round(pt.x - 90), y: Math.round(pt.y - 75), w: 180, h: 150, color: NOTE_COLORS[0], text: "" }
          : { id: uid(), type: "text", x: Math.round(pt.x - 4), y: Math.round(pt.y - 16), w: 260, text: "", fs: 20, color: "ink" };
        w.items.push(n); draw(); setTool("select"); setSel(n.id); startEdit(n); commit(); e.preventDefault(); return;
      } else if (tool === "rect" || tool === "ellipse") {
        snap();
        var s = { id: uid(), type: tool, x: pt.x, y: pt.y, w: 1, h: 1, color: "#6c5ce7", text: "" };
        w.items.push(s); draw();
        drag = { kind: "shape", i: s, sx: pt.x, sy: pt.y };
      } else if (tool === "pen") {
        snap();
        drag = { kind: "pen", pts: [[pt.x, pt.y]] };
        drag.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        drag.svg.setAttribute("class", "wb-live"); drag.svg.innerHTML = '<path stroke-width="3"/>';
        world.appendChild(drag.svg);
      }
      if (drag) { vp.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    vp.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var pt = toWorld(e.clientX, e.clientY);
      if (drag.kind === "pan") { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); vp.classList.add("panning"); }
      else if (drag.kind === "move") {
        var dx = pt.x - drag.sx, dy = pt.y - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) * view.z < 3) return;
        if (!drag.moved) { snap(); drag.moved = true; bar.hidden = true; }
        drag.i.x = Math.round(drag.x + dx); drag.i.y = Math.round(drag.y + dy);
        var n = nodeOf(drag.i.id); n.style.left = drag.i.x + "px"; n.style.top = drag.i.y + "px";
      } else if (drag.kind === "resize") {
        var i = drag.i, nw = Math.max(40, Math.round(drag.w + pt.x - drag.sx)), nh = Math.max(30, Math.round(drag.h + pt.y - drag.sy));
        if (i.type === "text") { i.w = nw; }
        else if (i.type === "task") { i.w = Math.max(180, nw); }
        else { if (e.shiftKey) nh = nw * drag.h / drag.w; i.w = nw; i.h = Math.round(nh); }
        styleItem(nodeOf(i.id), i); bar.hidden = true;
      } else if (drag.kind === "shape") {
        var x1 = Math.min(drag.sx, pt.x), y1 = Math.min(drag.sy, pt.y), ww = Math.abs(pt.x - drag.sx), hh = Math.abs(pt.y - drag.sy);
        if (e.shiftKey) { ww = hh = Math.max(ww, hh); }
        Object.assign(drag.i, { x: Math.round(x1), y: Math.round(y1), w: Math.round(ww), h: Math.round(hh) });
        styleItem(nodeOf(drag.i.id), drag.i);
      } else if (drag.kind === "pen") {
        drag.pts.push([pt.x, pt.y]);
        drag.svg.firstChild.setAttribute("d", pathD(drag.pts));
      }
    });
    function endDrag() {
      if (!drag) return;
      var d = drag; drag = null; vp.classList.remove("panning");
      if (d.kind === "pan") { commit(); return; }
      if (d.kind === "move") { if (d.moved) { commit(); drawBar(); } return; }
      if (d.kind === "resize") { syncSize(d.i); drawBar(); commit(); return; }
      if (d.kind === "shape") {
        if (d.i.w < 8 || d.i.h < 8) Object.assign(d.i, { x: d.sx - 80, y: d.sy - 55, w: 160, h: 110 });
        draw(); setTool("select"); setSel(d.i.id); commit(); return;
      }
      if (d.kind === "pen") {
        d.svg.remove();
        var pts = thin(d.pts);
        if (pts.length < 2) { undo.pop(); return; }
        var b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
        pts.forEach(function (p) { b.x1 = Math.min(b.x1, p[0]); b.y1 = Math.min(b.y1, p[1]); b.x2 = Math.max(b.x2, p[0]); b.y2 = Math.max(b.y2, p[1]); });
        var pad = 4, x = b.x1 - pad, y = b.y1 - pad;
        var it = { id: uid(), type: "path", x: Math.round(x), y: Math.round(y), w: Math.ceil(b.x2 - b.x1 + pad * 2), h: Math.ceil(b.y2 - b.y1 + pad * 2), color: "ink", sw: 3,
          pts: pts.map(function (p) { return [Math.round((p[0] - x) * 10) / 10, Math.round((p[1] - y) * 10) / 10]; }) };
        w.items.push(it); draw(); commit();
      }
    }
    vp.addEventListener("pointerup", endDrag);
    vp.addEventListener("pointercancel", endDrag);
    vp.addEventListener("dblclick", function (e) {
      var n = e.target.closest(".wb-it"), i = n && item(n.dataset.id);
      if (!i) {
        if (tool !== "select") return;
        var pt = toWorld(e.clientX, e.clientY); snap();
        var note = { id: uid(), type: "note", x: Math.round(pt.x - 90), y: Math.round(pt.y - 75), w: 180, h: 150, color: NOTE_COLORS[0], text: "" };
        w.items.push(note); draw(); setSel(note.id); startEdit(note); commit(); return;
      }
      if (i.type === "task") { if (db.task(i.taskId)) SP.openTask(i.taskId); return; }
      if (i.type !== "path") startEdit(i);
    });
    vp.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(view.z * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
      else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); commit(); }
    }, { passive: false });

    /* ---- Klawiatura (przed skrótami aplikacji, żeby T/N działały jako narzędzia) ---- */
    function onKey(e) {
      if (!root.isConnected) { finishEdit(); document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onKeyUp, true); return; }
      var a = document.activeElement, typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
      if (typing || document.querySelector(".tm-bg,.dlg-bg,.kb-bg,.pv-bg") || !document.getElementById("palette").hidden) return;
      var k = e.key, mod = e.metaKey || e.ctrlKey, handled = true;
      if (mod && k.toLowerCase() === "z") doUndo();
      else if (mod && k.toLowerCase() === "d") duplicate();
      else if (mod) handled = false;
      else if (k === " ") { if (!spaceDown) { spaceDown = true; root.classList.add("space-pan"); } }
      else if (k === "Delete" || k === "Backspace") removeSel();
      else if (k === "Escape") { if (sel) setSel(null); else if (tool !== "select") setTool("select"); else handled = false; }
      else if (k === "Enter" && sel) { var i = item(sel); if (i && i.type !== "path" && i.type !== "task") startEdit(i); else if (i && i.type === "task") SP.openTask(i.taskId); }
      else if (k === "+" || k === "=") zoomAt(view.z * 1.25);
      else if (k === "-") zoomAt(view.z * 0.8);
      else if (k === "0") zoomAt(1);
      else if (k === "!" && e.shiftKey) fit();
      else {
        var t = TOOLS.find(function (x) { return x[3].toLowerCase() === k.toLowerCase(); });
        if (t) setTool(t[0]); else handled = false;
      }
      if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
    function onKeyUp(e) { if (e.key === " ") { spaceDown = false; root.classList.remove("space-pan"); } }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);

    draw();
    applyView();
    // Element trafia do dokumentu dopiero po render() – rozmiary i środek liczymy chwilę później.
    setTimeout(function () {
      if (!root.isConnected) return;
      if (!w.items.length && view.x === 0 && view.y === 0) { var r = vp.getBoundingClientRect(); view.x = r.width / 2; view.y = r.height / 2; applyView(); }
      w.items.forEach(syncSize);
      if (sel && item(sel)) setSel(sel); else sel = null;
      vp.focus({ preventScroll: true });
    }, 0);
  }
})();
