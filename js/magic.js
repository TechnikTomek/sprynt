/* Sprynt – „magia” w duchu Zadań z pliku:
 *  1. Inteligentne pole zadania (SP.smartInput / SP.parseQuick): „Zadzwonić do klienta jutro @Anna !pilne #sprzedaż”
 *     – rozpoznane fragmenty podświetlają się w polu, a ich „duszki” wylatują do chipów terminu/osoby/priorytetu.
 *  2. Wklejanie wielu linii (SP.pasteTasks): lista z maila/notatek → skaner przechodzi po liniach, każda wylatuje jako karta.
 *  3. Rozbijanie zadania na podzadania (SP.splitTask): z listy kontrolnej, opisu, tytułu albo przez AI – karta pęka na kilka.
 * Parser terminów/priorytetów/osób jest wspólny z extract.js (SP._extract). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, esc = SP.esc, ico = SP.ico;
  if (!db || !SP._extract) return;
  var X = SP._extract;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BULLET = /^(?:[-*•–·▪◦○●➢►→✓✔]|\d{1,2}[.)]|[a-z][.)])\s+/u;
  var plural = function (n, one, few, many) { return n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many; };
  var uidc = function () { return Math.random().toString(36).slice(2, 8); };

  /* =================================================================== *
   *  Wspólne: lot „duszka” z punktu A do B                               *
   * =================================================================== */
  /** Leci element (html) z prostokąta `from` do `to`. Zwraca Promise. */
  SP.fly = function (from, to, html, o) {
    o = o || {};
    if (reduce || !from || !to) return Promise.resolve();
    var g = document.createElement("div"); g.className = "fly-ghost" + (o.cls ? " " + o.cls : ""); g.innerHTML = html;
    g.style.left = from.left + "px"; g.style.top = from.top + "px"; g.style.minWidth = Math.min(from.width, 360) + "px";
    document.body.appendChild(g);
    var gr = g.getBoundingClientRect();
    var dx = to.left + to.width / 2 - (gr.left + gr.width / 2), dy = to.top + to.height / 2 - (gr.top + gr.height / 2);
    var arc = o.arc == null ? -60 : o.arc, end = o.endScale == null ? .25 : o.endScale;
    return g.animate([
      { transform: "none", opacity: 1 },
      { transform: "translate(" + dx * .45 + "px," + (dy * .45 + arc) + "px) scale(" + (1 + end) / 2 + ") rotate(" + (o.rot == null ? -6 : o.rot) + "deg)", opacity: 1, offset: .5 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(" + end + ")", opacity: o.fade === false ? 1 : .15 },
    ], { duration: o.duration || 620, delay: o.delay || 0, easing: "cubic-bezier(.5,0,.3,1)", fill: "both" }).finished.then(function () { g.remove(); }, function () { g.remove(); });
  };
  function pulse(el, cls) { if (!el || reduce) return; el.classList.remove(cls || "m-pulse"); void el.offsetWidth; el.classList.add(cls || "m-pulse"); }

  /* =================================================================== *
   *  1. Parser szybkiego dodawania                                       *
   * =================================================================== */
  var PRIO_EXPL = { pilne: "urgent", pilny: "urgent", pilna: "urgent", urgent: "urgent", "1": "urgent", wysoki: "high", wysoka: "high", "ważne": "high", wazne: "high", high: "high", "2": "high", normalny: "normal", normalna: "normal", normal: "normal", "3": "normal", niski: "low", niska: "low", low: "low", "4": "low" };
  function dueLabel(ymd) {
    var d = SP.date.diff(ymd), wd = new Date(ymd + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "short" });
    return d === 0 ? "Dziś" : d === 1 ? "Jutro (" + wd + ")" : d > 1 && d < 7 ? wd.charAt(0).toUpperCase() + wd.slice(1) + ", " + SP.fmtDue(ymd).label : SP.fmtDue(ymd).label;
  }
  /**
   * „Zadzwonić do Anny jutro @Marek !pilne #klient” →
   * { title, due, priority, assignees[], newPeople[], tags[], tokens[{kind, start, end, phrase, label, value}] }
   */
  SP.parseQuick = function (text, opts) {
    opts = opts || {};
    var ign = opts.ignore || {}, toks = [], src = String(text || "");
    var P = X.People();
    function free(a, b) { return !toks.some(function (t) { return a < t.end && b > t.start; }); }
    function locate(phrase, from) {
      var i = src.indexOf(phrase, from || 0);
      while (i >= 0 && !free(i, i + phrase.length)) i = src.indexOf(phrase, i + 1);
      return i;
    }
    function add(kind, start, phrase, value, label) {
      if (start < 0 || ign[kind + ":" + phrase.trim().toLowerCase()]) return false;
      toks.push({ kind: kind, start: start, end: start + phrase.length, phrase: phrase, value: value, label: label }); return true;
    }
    var m, rx;
    // osoby: @Imię (także w odmianie: @Markowi) albo „Marek: …” na początku
    rx = /(^|[\s(,])@([\p{L}][\p{L}'-]{1,30}(?:\s\p{Lu}[\p{L}'-]+)?)/gu;
    while ((m = rx.exec(src))) {
      var nm = m[2], key = P.find(nm);
      if (!key && /\s/.test(nm)) { nm = nm.split(/\s/)[0]; key = P.find(nm); }
      var at = m.index + m[1].length, ph = "@" + nm;
      if (key) add("person", at, ph, key, (db.person(key) || {}).name || nm);
      else if (opts.allowNew !== false && /^\p{Lu}/u.test(nm)) add("newperson", at, ph, nm.charAt(0).toUpperCase() + nm.slice(1), nm.charAt(0).toUpperCase() + nm.slice(1) + " (nowa osoba)");
    }
    if ((m = /^(\p{Lu}\p{Ll}+(?:\s\p{Lu}\p{Ll}+)?)\s*:\s+\S/u.exec(src)) && P.find(m[1])) add("person", 0, m[1] + ":", P.find(m[1]), (db.person(P.find(m[1])) || {}).name || m[1]);
    // tagi
    rx = /(^|\s)#([\p{L}\d_-]{2,30})/gu;
    while ((m = rx.exec(src))) add("tag", m.index + m[1].length, "#" + m[2], m[2].toLowerCase(), "#" + m[2].toLowerCase());
    // priorytet: !pilne / !2 / !!! albo słowa („pilne”, „ASAP”, „ważne”)
    if ((m = /(^|\s)!(pilne|pilny|pilna|urgent|wysoki|wysoka|ważne|wazne|high|normalny|normalna|normal|niski|niska|low|[1-4])(?=\s|$|[,.;])/iu.exec(src)) && PRIO_EXPL[m[2].toLowerCase()]) {
      var pv = PRIO_EXPL[m[2].toLowerCase()]; add("priority", m.index + m[1].length, "!" + m[2], pv, db.priority(pv).name);
    } else {
      var pr = X.parsePriority(src);
      if (pr && pr.phrase.trim()) { var pi = locate(pr.phrase); if (pi >= 0) add("priority", pi, pr.phrase, pr.p, db.priority(pr.p).name); }
    }
    // termin
    var du = X.parseDue(src);
    if (du && du.phrase) { var di = locate(du.phrase); if (di >= 0) add("due", di, du.phrase, du.due, dueLabel(du.due)); }
    toks.sort(function (a, b) { return a.start - b.start; });

    var title = src;
    toks.slice().reverse().forEach(function (t) { title = title.slice(0, t.start) + " " + title.slice(t.end); });
    title = X.cleanTitle(title.replace(/\s+(?:na|do|w|we|przed)\s*$/i, ""), []);
    var out = { title: title, raw: src, due: null, priority: null, assignees: [], newPeople: [], tags: [], tokens: toks };
    toks.forEach(function (t) {
      if (t.kind === "due") out.due = t.value;
      else if (t.kind === "priority") out.priority = t.value;
      else if (t.kind === "person" && out.assignees.indexOf(t.value) < 0) out.assignees.push(t.value);
      else if (t.kind === "newperson" && out.newPeople.indexOf(t.value) < 0) out.newPeople.push(t.value);
      else if (t.kind === "tag" && out.tags.indexOf(t.value) < 0) out.tags.push(t.value);
    });
    return out;
  };
  /** Wynik parsera → pola zadania (nowe osoby trafiają do zespołu, nowe tagi do listy tagów). */
  SP.applyQuick = function (p, base) {
    base = base || {};
    var people = p.assignees.slice();
    p.newPeople.forEach(function (n) { var x = db.addPerson(n); if (x && people.indexOf(x.id) < 0) people.push(x.id); });
    p.tags.forEach(function (n) { if (!db.tag(n)) db.createTag(n); });
    var f = Object.assign({}, base, { title: p.title || p.raw.trim() });
    if (people.length) f.assignees = people; else f.assignees = base.assignees || [];
    if (p.due) f.due = p.due;
    if (p.priority) f.priority = p.priority;
    if (p.tags.length) f.tags = (base.tags || []).concat(p.tags.filter(function (x) { return (base.tags || []).indexOf(x) < 0; }));
    return f;
  };
  /** Pola zadania z pola tekstowego (z uwzględnieniem fragmentów, które użytkownik odrzucił). */
  SP.smartFields = function (input, base) {
    var p = input._smart ? input._smart.result() : SP.parseQuick(input.value);
    return SP.applyQuick(p, base);
  };

  var KIND_ICO = { due: "calendar", priority: "flag", person: "user", newperson: "users", tag: "tag" };
  /**
   * Podświetlanie rozpoznanych fragmentów w <input> i chipy z wynikiem.
   * opts.chips – kontener na chipy; opts.target(kind) – element, do którego ma lecieć „duszek”; opts.onChange(p).
   */
  SP.smartInput = function (input, opts) {
    if (input._smart || input._smartInit) return input._smart;
    input._smartInit = true; // focus() niżej wywołuje focusin ponownie – bez tej flagi byłaby rekurencja
    opts = opts || {};
    var wrap = document.createElement("span"); wrap.className = "smart-wrap";
    var hl = document.createElement("span"); hl.className = "smart-hl"; hl.setAttribute("aria-hidden", "true");
    // przeniesienie pola w DOM zdejmuje z niego fokus – przywracamy go razem z kursorem
    var had = document.activeElement === input, sel = had ? [input.selectionStart, input.selectionEnd] : null;
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(hl); wrap.appendChild(input);
    if (had) { input.focus(); try { input.setSelectionRange(sel[0], sel[1]); } catch (e) { /* typ pola bez zaznaczenia */ } }
    input.classList.add("smart-in");
    var cs = getComputedStyle(input);
    ["fontSize", "fontWeight", "fontFamily", "letterSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "lineHeight", "textIndent"].forEach(function (k) { hl.style[k] = cs[k]; });
    ["Left", "Right", "Top", "Bottom"].forEach(function (k) { hl.style["border" + k + "Width"] = cs["border" + k + "Width"]; });
    var ignore = {}, last = null, seen = {}, first = true;
    function render() {
      var p = SP.parseQuick(input.value, { ignore: ignore }), v = input.value, h = "", pos = 0;
      p.tokens.forEach(function (t) { h += esc(v.slice(pos, t.start)) + '<mark class="sm-mk k-' + t.kind + '" data-tk="' + t.kind + '">' + esc(v.slice(t.start, t.end)) + "</mark>"; pos = t.end; });
      hl.innerHTML = '<span class="smart-hl-t">' + h + esc(v.slice(pos)) + " </span>"; // jeden wiersz tekstu (nie osobne elementy flex)
      hl.scrollLeft = input.scrollLeft;
      var now = {};
      p.tokens.forEach(function (t) { now[t.kind + ":" + t.phrase.toLowerCase()] = t; });
      if (opts.chips) {
        opts.chips.innerHTML = p.tokens.map(function (t) {
          var k = t.kind + ":" + t.phrase.toLowerCase();
          return '<span class="sm-chip k-' + t.kind + (seen[k] ? "" : " in") + '" data-k="' + esc(k) + '" title="Rozpoznano: „' + esc(t.phrase) + '”">' + ico(KIND_ICO[t.kind], 13) + "<span>" + esc(t.label) + '</span><button type="button" class="sm-x" data-ign="' + esc(k) + '" title="To nie jest ' + ({ due: "termin", priority: "priorytet", person: "osoba", newperson: "osoba", tag: "tag" })[t.kind] + '" aria-label="Odrzuć">' + ico("x", 11) + "</button></span>";
        }).join("");
        opts.chips.hidden = !p.tokens.length;
      }
      // nowe rozpoznania: duszek frazy leci z pola do chipa/właściwości
      if (!first) Object.keys(now).forEach(function (k) {
        if (seen[k]) return;
        var t = now[k], mk = hl.querySelectorAll('.sm-mk[data-tk="' + t.kind + '"]');
        var src = Array.prototype.find.call(mk, function (x) { return x.textContent.toLowerCase() === t.phrase.toLowerCase(); }) || mk[0];
        var dst = (opts.target && opts.target(t.kind)) || (opts.chips && opts.chips.querySelector('[data-k="' + CSS.escape(k) + '"]'));
        if (src && dst) {
          var r = src.getBoundingClientRect(), ir = input.getBoundingClientRect();
          if (r.right > ir.left && r.left < ir.right) SP.fly(r, dst.getBoundingClientRect(), '<span class="fly-tok k-' + t.kind + '">' + esc(t.phrase) + "</span>", { arc: -28, endScale: .5, duration: 520, cls: "tok" }).then(function () { pulse(dst); });
        }
        if (src) pulse(src, "sm-pop");
      });
      seen = now; first = false; last = p;
      if (opts.onChange) opts.onChange(p);
      return p;
    }
    function sync() { hl.scrollLeft = input.scrollLeft; }
    input.addEventListener("input", render);
    ["scroll", "keyup", "click", "select"].forEach(function (ev) { input.addEventListener(ev, sync); });
    if (opts.chips) opts.chips.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ign]"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      ignore[b.dataset.ign] = 1; render(); input.focus();
    });
    var api = input._smart = {
      result: function () { return SP.parseQuick(input.value, { ignore: ignore }); },
      render: render,
      reset: function () { ignore = {}; seen = {}; render(); },
    };
    render();
    return api;
  };

  /* Wiersze „Dodaj zadanie” (lista), „Nowe zadanie” (tablica), podzadania w oknie zadania:
   * podświetlanie włączamy przy pierwszym fokusie (formularze powstają na nowo po każdym przerysowaniu). */
  var INLINE = ".add-row input, .col-add input, form.add-inline[data-form=sub] input";
  document.addEventListener("focusin", function (e) {
    var inp = e.target; if (!inp.matches || !inp.matches(INLINE) || inp._smart || inp._smartInit) return;
    var form = inp.closest("form"), chips = document.createElement("span");
    chips.className = "sm-chips inline"; chips.hidden = true; form.appendChild(chips);
    SP.smartInput(inp, { chips: chips });
    if (!form.querySelector(".sm-help")) {
      var h = document.createElement("span"); h.className = "sm-help"; h.textContent = "jutro · @osoba · !pilne · #tag";
      form.appendChild(h);
    }
  });

  /* =================================================================== *
   *  2. Wklejanie wielu linii → wiele zadań                              *
   * =================================================================== */
  /** Tekst → [{text, indent, task?}]: wypunktowania, [ ]/[x], wcięcia = lista kontrolna poprzedniego zadania. */
  function splitLines(text) {
    var out = [], lastTask = null;
    text.replace(/\r\n?/g, "\n").split("\n").forEach(function (raw) {
      var line = { raw: raw, text: raw.trim(), indent: 0 };
      var lead = /^[ \t]*/.exec(raw)[0]; line.indent = lead.replace(/\t/g, "    ").length;
      if (!line.text) { out.push(line); return; }
      var body = line.text, b = BULLET.exec(body); if (b) body = body.slice(b[0].length);
      var box = /^\[( |x|X|✓|✔)\]\s*/.exec(body); if (box) body = body.slice(box[0].length);
      body = body.replace(/^(TODO|Zadanie|Do zrobienia)\s*[:\-–]\s*/i, "");
      var head = !b && !box && /:$/.test(body) && body.length < 60;
      if (head) { line.skip = "nagłówek"; lastTask = null; out.push(line); return; }
      if (lastTask && line.indent > lastTask.indent && (b || box)) { lastTask.task.checklist.push(X.cleanTitle(body, [])); line.sub = lastTask.i; out.push(line); return; }
      if (body.length < 2) { line.skip = "za krótkie"; out.push(line); return; }
      var p = SP.parseQuick(body);
      line.task = { title: p.title || body, p: p, checklist: [], done: !!box && box[1] !== " ", on: true };
      lastTask = { indent: line.indent, task: line.task, i: out.length };
      out.push(line);
    });
    return out;
  }
  SP._splitLines = splitLines;

  var PT = null;
  /** Okno: wklejony tekst zamienia się w karty zadań. base = {listId, status, assignees, priority, due, parentId}. */
  SP.pasteTasks = function (text, base) {
    base = base || {};
    var lines = splitLines(text), tasks = lines.filter(function (l) { return l.task; });
    if (!tasks.length) return false;
    if (PT) closePT();
    var listId = base.listId || (db.raw.lists[0] || {}).id; if (!listId) { SP.toast("Najpierw utwórz listę"); return true; }
    var bg = SP.el('<div class="pt-bg"><div class="pt" role="dialog" aria-modal="true" aria-label="Wklejone zadania">' +
      '<header class="xt-h"><span class="xt-hi">' + ico("wand-sparkles", 18) + '</span><div><h2>Wklejone zadania</h2><p class="muted">Każda linia to osobne zadanie. Sprynt rozpoznał terminy, osoby, priorytety i tagi – popraw, co trzeba.</p></div><button class="ibtn" data-x title="Zamknij (Esc)">' + ico("x", 18) + "</button></header>" +
      '<div class="pt-body"><section class="pt-src"><div class="pt-src-h">' + ico("file-text", 15) + "<b>Wklejony tekst</b><span class=\"muted\">" + lines.filter(function (l) { return l.text; }).length + " linii</span></div>" +
      '<div class="pt-lines">' + lines.map(function (l, i) { return '<div class="pt-l' + (l.text ? "" : " empty") + (l.skip ? " skip" : "") + (l.sub != null ? " sub" : "") + '" data-l="' + i + '" style="padding-left:' + (12 + Math.min(l.indent, 12) * 4) + 'px">' + (esc(l.text) || "&nbsp;") + (l.skip ? '<small>' + l.skip + "</small>" : "") + "</div>"; }).join("") + '<div class="pt-scan"></div></div></section>' +
      '<section class="pt-res"><div class="xt-res-h"><h3>Zadania</h3><span class="xt-count pt-count">0</span></div><div class="pt-cards"></div></section></div>' +
      '<footer class="pt-f"><button class="chip-btn pt-loc" data-loc></button><span class="grow"></span><button class="btn ghost sm" data-x>Anuluj</button><button class="btn primary sm" data-go disabled>' + ico("check", 15) + "<span>Utwórz</span></button></footer></div></div>");
    PT = { bg: bg, lines: lines, listId: listId, base: base, timers: [] };
    document.body.appendChild(bg);
    SP.hydrateIcons(bg);
    var cardsEl = bg.querySelector(".pt-cards"), scan = bg.querySelector(".pt-scan"), count = bg.querySelector(".pt-count");
    function drawLoc() { var l = db.list(PT.listId), s = l && db.space(l.spaceId); bg.querySelector("[data-loc]").innerHTML = (s ? SP.spaceIcon(s, "xs") + esc(s.name) + " / " : "") + esc(l ? l.name : "?") + ico("chevron-down", 12); SP.hydrateIcons(bg.querySelector("[data-loc]")); }
    drawLoc();
    function cardHTML(l, i) {
      var t = l.task, p = t.p, chips = "";
      if (p.due) chips += '<span class="sm-chip k-due">' + ico("calendar", 12) + esc(dueLabel(p.due)) + "</span>";
      p.assignees.forEach(function (id) { chips += '<span class="sm-chip k-person">' + SP.avatar(id, "xs") + esc((db.person(id) || {}).name || "") + "</span>"; });
      p.newPeople.forEach(function (n) { chips += '<span class="sm-chip k-newperson">' + ico("users", 12) + esc(n) + " (nowa)</span>"; });
      if (p.priority) chips += '<span class="sm-chip k-priority">' + SP.flag(p.priority) + esc(db.priority(p.priority).name) + "</span>";
      p.tags.forEach(function (g) { chips += '<span class="sm-chip k-tag">#' + esc(g) + "</span>"; });
      if (t.checklist.length) chips += '<span class="sm-chip">' + ico("list-checks", 12) + t.checklist.length + " " + plural(t.checklist.length, "punkt", "punkty", "punktów") + "</span>";
      if (t.done) chips += '<span class="sm-chip k-done">' + ico("check", 12) + "ukończone</span>";
      return '<article class="pt-card" data-i="' + i + '"><button type="button" class="pt-on" aria-pressed="true" title="Pomiń / dodaj">' + ico("check", 12) + '</button><div class="pt-c"><input class="pt-t" value="' + esc(t.title) + '" maxlength="200" />' + (chips ? '<div class="pt-chips">' + chips + "</div>" : "") + "</div></article>";
    }
    function updCount() {
      var n = tasks.filter(function (l) { return l.task.on; }).length, go = bg.querySelector("[data-go]");
      count.textContent = n; go.disabled = !n; go.querySelector("span").textContent = "Utwórz " + n + " " + plural(n, "zadanie", "zadania", "zadań");
    }
    // Animacja: skaner idzie po liniach, trafione linie wylatują jako karty
    var idx = 0, lineEls = bg.querySelectorAll(".pt-l");
    function step() {
      if (!PT || PT.bg !== bg) return;
      if (idx >= lines.length) { scan.classList.add("done"); return; }
      var i = idx++, l = lines[i], le = lineEls[i];
      if (le) { scan.style.transform = "translateY(" + le.offsetTop + "px)"; scan.style.height = le.offsetHeight + "px"; }
      if (l.task) {
        le.classList.add("hit");
        cardsEl.insertAdjacentHTML("beforeend", cardHTML(l, i));
        var card = cardsEl.lastElementChild; SP.hydrateIcons(card);
        card.querySelector(".pt-t").addEventListener("input", function (e) { l.task.title = e.target.value; });
        updCount();
        if (!reduce) {
          var from = le.getBoundingClientRect(), to = card.getBoundingClientRect();
          card.style.visibility = "hidden";
          card.scrollIntoView({ block: "nearest" });
          SP.fly(from, card.getBoundingClientRect() || to, "<span>" + esc(l.task.title) + "</span>", { arc: -30, endScale: 1, fade: false, duration: 420, rot: 2, cls: "card" }).then(function () { card.style.visibility = ""; pulse(card, "pt-land"); });
        }
      } else if (l.sub != null && le) le.classList.add("hit-sub");
      PT.timers.push(setTimeout(step, reduce ? 0 : l.text ? 110 : 20));
    }
    PT.timers.push(setTimeout(step, reduce ? 0 : 260));
    bg.addEventListener("click", function (e) {
      var b;
      if (e.target.closest("[data-x]")) { closePT(); return; }
      if ((b = e.target.closest(".pt-on"))) {
        var l = lines[+b.closest(".pt-card").dataset.i]; l.task.on = !l.task.on;
        b.setAttribute("aria-pressed", l.task.on); b.closest(".pt-card").classList.toggle("off", !l.task.on); updCount(); return;
      }
      if ((b = e.target.closest("[data-loc]"))) { SP.pickList(b, PT.listId, function (v) { PT.listId = v; drawLoc(); }); return; }
      if (e.target.closest("[data-go]")) create();
    });
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) closePT(); });
    document.addEventListener("keydown", onPTKey, true);
    function create() {
      var on = tasks.filter(function (l) { return l.task.on && l.task.title.trim(); });
      if (!on.length) return;
      PT.timers.forEach(clearTimeout);
      var listId = PT.listId, b = PT.base, made = [];
      var target = document.querySelector('.tree-row.list[href="#/list/' + listId + '"]') || document.querySelector("#view .rows, #view .board, #view .loc-body") || document.querySelector(".side-nav");
      var cards = on.map(function (l) { return cardsEl.querySelector('[data-i="' + lines.indexOf(l) + '"]'); }).filter(Boolean);
      var flights = reduce ? [] : cards.slice(0, 20).map(function (c, i) {
        var r = c.getBoundingClientRect(); c.style.visibility = "hidden";
        return SP.fly(r, target.getBoundingClientRect(), "<span>" + esc(c.querySelector(".pt-t").value) + "</span>", { delay: i * 45, duration: 700, cls: "card" });
      });
      bg.classList.add("leaving");
      Promise.all(flights).then(function () {
        pulse(target, "xt-pulse");
        on.forEach(function (l) {
          var p = Object.assign({}, l.task.p, { title: l.task.title.trim() });
          var f = SP.applyQuick(p, { listId: listId, status: l.task.done ? (db.STATUSES.find(function (s) { return s.closed; }) || {}).id : b.status || "todo", assignees: b.assignees || [], priority: b.priority || null, due: b.due || null, parentId: b.parentId || null });
          f.checklist = l.task.checklist.map(function (c) { return { id: uidc(), text: c, done: false }; });
          made.push(db.createTask(f));
        });
        closePT();
        SP.toast("Utworzono " + made.length + " " + plural(made.length, "zadanie", "zadania", "zadań") + " w liście " + db.list(listId).name);
      });
    }
    return true;
  };
  function onPTKey(e) { if (e.key === "Escape" && PT && !document.querySelector(".popover")) { e.stopPropagation(); closePT(); } }
  function closePT() { if (!PT) return; PT.timers.forEach(clearTimeout); PT.bg.remove(); PT = null; document.removeEventListener("keydown", onPTKey, true); }

  // Wklejenie kilku linii do pola nowego zadania (lista, tablica, szybkie tworzenie, podzadania).
  document.addEventListener("paste", function (e) {
    var inp = e.target; if (!inp.matches || !inp.matches(INLINE + ", .qt-title")) return;
    var text = (e.clipboardData || window.clipboardData).getData("text"); if (!text) return;
    var n = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).length; if (n < 2) return;
    var base = {}, form = inp.closest("form");
    if (form && form.dataset.add) { try { base = JSON.parse(form.dataset.add); } catch (err) { base = {}; } }
    if (form && form.matches("[data-form=sub]") && SP.currentTaskId) { var par = db.task(SP.currentTaskId()); if (par) base = { listId: par.listId, parentId: par.id }; }
    if (inp.classList.contains("qt-title") && SP.quickTaskState) { var st = SP.quickTaskState(); if (st) { base = st; if (SP.closeQuickTask) SP.closeQuickTask(); } }
    e.preventDefault();
    SP.pasteTasks(text, base);
  }, true);

  /* =================================================================== *
   *  3. Rozbijanie zadania na podzadania                                  *
   * =================================================================== */
  function descLines(html) {
    if (!html) return [];
    var d = document.createElement("div"); d.innerHTML = html.replace(/<li[^>]*>/gi, "\n- ").replace(/<(?:br|\/p|\/div|\/h\d)[^>]*>/gi, "\n");
    return (d.textContent || "").split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return BULLET.test(l) || /^\[( |x)\]/i.test(l); })
      .map(function (l) { return l.replace(BULLET, "").replace(/^\[( |x)\]\s*/i, "").trim(); }).filter(function (l) { return l.length > 2; });
  }
  function titleParts(title) {
    var parts = title.split(/\s*(?:,|;|\s+i\s+|\s+oraz\s+|\s+a\s+potem\s+|\s+następnie\s+|\s+&\s+|\s+\+\s+)\s*/i).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 2; });
    if (parts.length < 2 || !parts.every(function (s) { return X.isVerbish(s.split(/\s+/)[0]); })) return [];
    return parts.map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); });
  }
  /** Propozycje bez AI: lista kontrolna → opis → tytuł („Przygotować umowę i wysłać ją klientowi”). */
  function proposals(t) {
    var out = [], have = {};
    db.subtasks(t.id).forEach(function (s) { have[s.title.toLowerCase()] = 1; });
    function push(title, src, extra) { var k = title.toLowerCase(); if (have[k]) return; have[k] = 1; var p = SP.parseQuick(title); out.push(Object.assign({ title: p.title || title, p: p, src: src, on: true }, extra || {})); }
    t.checklist.filter(function (c) { return !c.done; }).forEach(function (c) { push(c.text, "checklist", { clId: c.id }); });
    descLines(t.desc).forEach(function (l) { push(l, "desc"); });
    if (!out.length) titleParts(t.title).forEach(function (l) { push(l, "title"); });
    return out;
  }
  var SRC_LBL = { checklist: "z listy kontrolnej", desc: "z opisu", title: "z tytułu", ai: "AI", manual: "dodane" };

  var SX = null;
  SP.splitTask = function (id) {
    var t = db.task(id); if (!t) return;
    if (t.parentId) { SP.toast("To już jest podzadanie – rozbij zadanie nadrzędne"); return; }
    if (SX) closeSX();
    var items = proposals(t), ai = SP.ai && SP.ai.enabled();
    var bg = SP.el('<div class="sx-bg"><div class="sx" role="dialog" aria-modal="true" aria-label="Rozbij zadanie">' +
      '<header class="xt-h"><span class="xt-hi">' + ico("split", 18) + '</span><div><h2>Rozbij na podzadania</h2><p class="muted">Duże zadanie łatwiej skończyć w małych krokach.</p></div><button class="ibtn" data-x title="Zamknij (Esc)">' + ico("x", 18) + "</button></header>" +
      '<div class="sx-body"><div class="sx-parent">' + SP.statusDot(t.status) + '<b>' + esc(t.title) + '</b><span class="muted">' + db.taskKey(t) + "</span>" + SP.avatars(t.assignees, "xs") + '<i class="sx-shine"></i></div>' +
      '<div class="sx-info muted"></div><div class="sx-cards"></div>' +
      '<form class="sx-add"><span class="add-plus">' + ico("plus", 14) + '</span><input placeholder="Dodaj krok… (np. Zamówić druk jutro @Anna)" /></form></div>' +
      '<footer class="pt-f">' + (ai ? '<button class="btn sm" data-ai>' + ico("sparkles", 15) + "Zaproponuj z AI</button>" : '<button class="btn ghost sm" data-ai-set>' + ico("sparkles", 15) + "Włącz AI</button>") +
      '<label class="sx-opt" hidden><input type="checkbox" checked /> Usuń przeniesione punkty z listy kontrolnej</label><span class="grow"></span>' +
      '<button class="btn ghost sm" data-x>Anuluj</button><button class="btn primary sm" data-go disabled>' + ico("check", 15) + "<span>Utwórz</span></button></footer></div></div>");
    SX = { bg: bg, id: id, items: items };
    document.body.appendChild(bg); SP.hydrateIcons(bg);
    var cardsEl = bg.querySelector(".sx-cards"), parent = bg.querySelector(".sx-parent"), info = bg.querySelector(".sx-info");
    function upd() {
      var n = SX.items.filter(function (x) { return x.on && x.title.trim(); }).length, go = bg.querySelector("[data-go]");
      go.disabled = !n; go.querySelector("span").textContent = "Utwórz " + n + " " + plural(n, "podzadanie", "podzadania", "podzadań");
      bg.querySelector(".sx-opt").hidden = !SX.items.some(function (x) { return x.on && x.clId; });
      var by = {}; SX.items.forEach(function (x) { by[x.src] = (by[x.src] || 0) + 1; });
      info.innerHTML = SX.items.length ? "Propozycje: " + Object.keys(by).map(function (k) { return SRC_LBL[k] + " (" + by[k] + ")"; }).join(" · ")
        : ai ? "Brak listy kontrolnej i punktów w opisie – poproś AI o propozycję albo dopisz kroki poniżej." : "Brak listy kontrolnej i punktów w opisie – dopisz kroki poniżej (rozpoznaję terminy, @osoby i !priorytety).";
    }
    function cardHTML(x, i) {
      var p = x.p || { assignees: [], newPeople: [], tags: [] }, chips = "";
      if (p.due) chips += '<span class="sm-chip k-due">' + ico("calendar", 12) + esc(dueLabel(p.due)) + "</span>";
      (p.assignees || []).forEach(function (pid) { chips += '<span class="sm-chip k-person">' + SP.avatar(pid, "xs") + esc((db.person(pid) || {}).name || "") + "</span>"; });
      if (p.priority) chips += '<span class="sm-chip k-priority">' + SP.flag(p.priority) + esc(db.priority(p.priority).name) + "</span>";
      chips += '<span class="sx-src">' + SRC_LBL[x.src] + "</span>";
      return '<article class="pt-card sx-card' + (x.on ? "" : " off") + '" data-i="' + i + '" style="--i:' + i + '"><span class="sx-n">' + (i + 1) + '</span><button type="button" class="pt-on" aria-pressed="' + x.on + '">' + ico("check", 12) + '</button><div class="pt-c"><input class="pt-t" value="' + esc(x.title) + '" maxlength="200" /><div class="pt-chips">' + chips + "</div></div></article>";
    }
    /** Rysuje karty; nowe (od indeksu `from`) „wyskakują” z karty zadania. */
    function draw(from) {
      cardsEl.innerHTML = SX.items.map(cardHTML).join(""); SP.hydrateIcons(cardsEl); upd();
      cardsEl.querySelectorAll(".pt-t").forEach(function (inp) { inp.addEventListener("input", function () { SX.items[+inp.closest(".pt-card").dataset.i].title = inp.value; upd(); }); });
      if (reduce || from == null) return;
      var pr = parent.getBoundingClientRect();
      Array.prototype.slice.call(cardsEl.children, from).forEach(function (c, k) {
        var r = c.getBoundingClientRect(), dx = pr.left + pr.width / 2 - (r.left + r.width / 2), dy = pr.top + pr.height / 2 - (r.top + r.height / 2);
        c.animate([{ transform: "translate(" + dx + "px," + dy + "px) scale(.55) rotate(" + (k % 2 ? 4 : -4) + "deg)", opacity: 0 }, { transform: "translate(" + dx * .15 + "px," + dy * .15 + "px) scale(1.03)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }],
          { duration: 560, delay: k * 85, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "backwards" });
      });
    }
    function crack() { pulse(parent, "sx-crack"); }
    if (items.length) { setTimeout(function () { if (SX && SX.bg === bg) { crack(); draw(0); } }, reduce ? 0 : 180); } else draw();
    if (!items.length && ai) setTimeout(function () { if (SX && SX.bg === bg) askAI(); }, 250);

    function askAI() {
      var b = bg.querySelector("[data-ai]"); if (!b || b.disabled) return;
      b.disabled = true; b.innerHTML = '<span class="xt-spin sm"></span>AI myśli…'; parent.classList.add("thinking");
      var shown = 0, base = SX.items.length;
      SP.ai.breakdown(db.task(SX.id), function (snap) {
        if (!SX || SX.bg !== bg) return;
        var titles = [], rx = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g, m;
        while ((m = rx.exec(snap))) titles.push(m[1]);
        if (titles.length > shown + 1) { info.textContent = "AI pisze… " + (titles.length - 1) + " " + plural(titles.length - 1, "krok", "kroki", "kroków"); shown = titles.length - 1; }
      }).then(function (res) {
        if (!SX || SX.bg !== bg) return;
        parent.classList.remove("thinking");
        var have = {}; SX.items.forEach(function (x) { have[x.title.toLowerCase()] = 1; });
        res.subtasks.forEach(function (s) {
          if (have[s.title.toLowerCase()]) return;
          var pid = s.assignee ? X.People().find(s.assignee) : null;
          SX.items.push({ title: s.title, desc: s.description, src: "ai", on: true, p: { due: s.due, priority: s.priority, assignees: pid && db.person(pid) ? [pid] : [], newPeople: [], tags: [] } });
        });
        crack(); draw(base);
        if (res.note) info.textContent = res.note;
        b.innerHTML = ico("sparkles", 15) + "Jeszcze raz z AI"; b.disabled = false; SP.hydrateIcons(b);
      }, function (err) {
        if (!SX || SX.bg !== bg) return;
        parent.classList.remove("thinking"); b.disabled = false; b.innerHTML = ico("sparkles", 15) + "Spróbuj ponownie"; SP.hydrateIcons(b);
        SP.toast(err.message || "Błąd AI");
      });
    }
    bg.querySelector(".sx-add").addEventListener("submit", function (e) {
      e.preventDefault(); var inp = e.target.querySelector("input"), v = inp.value.trim(); if (!v) return;
      var p = SP.parseQuick(v); SX.items.push({ title: p.title || v, p: p, src: "manual", on: true }); inp.value = "";
      draw(SX.items.length - 1); cardsEl.lastElementChild.scrollIntoView({ block: "nearest" }); inp.focus();
    });
    bg.addEventListener("click", function (e) {
      var b;
      if (e.target.closest("[data-x]")) { closeSX(); return; }
      if (e.target.closest("[data-ai]")) { askAI(); return; }
      if (e.target.closest("[data-ai-set]")) { closeSX(); if (SP.closeTask) SP.closeTask(); location.hash = "#/settings"; setTimeout(function () { var a = document.getElementById("ai-sec"); if (a) a.scrollIntoView({ behavior: "smooth", block: "center" }); }, 150); return; }
      if ((b = e.target.closest(".pt-on"))) { var x = SX.items[+b.closest(".pt-card").dataset.i]; x.on = !x.on; b.setAttribute("aria-pressed", x.on); b.closest(".pt-card").classList.toggle("off", !x.on); upd(); return; }
      if (e.target.closest("[data-go]")) create();
    });
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) closeSX(); });
    document.addEventListener("keydown", onSXKey, true);

    function create() {
      var t0 = db.task(SX.id); if (!t0) { closeSX(); return; }
      var on = SX.items.filter(function (x) { return x.on && x.title.trim(); }); if (!on.length) return;
      var rmCl = !bg.querySelector(".sx-opt").hidden && bg.querySelector(".sx-opt input").checked;
      var target = document.querySelector(".tm .sub-list") || document.querySelector('.tm form[data-form="sub"]') || document.querySelector('#view [data-task="' + t0.id + '"]') || parent;
      var flights = reduce ? [] : on.slice(0, 16).map(function (x, i) {
        var c = cardsEl.querySelector('[data-i="' + SX.items.indexOf(x) + '"]'); if (!c) return Promise.resolve();
        var r = c.getBoundingClientRect(); c.style.visibility = "hidden";
        return SP.fly(r, target.getBoundingClientRect(), "<span>" + esc(x.title) + "</span>", { delay: i * 55, duration: 650, cls: "card", endScale: .5 });
      });
      bg.classList.add("leaving");
      Promise.all(flights).then(function () {
        var made = 0, clIds = {};
        on.forEach(function (x) {
          var p = Object.assign({ assignees: [], newPeople: [], tags: [] }, x.p || {}, { title: x.title.trim(), raw: x.title });
          var f = SP.applyQuick(p, { listId: t0.listId, parentId: t0.id, assignees: [] });
          if (x.desc) f.desc = "<p>" + esc(x.desc) + "</p>";
          db.createTask(f); made++;
          if (x.clId) clIds[x.clId] = 1;
        });
        var patch = rmCl ? { checklist: t0.checklist.filter(function (c) { return !clIds[c.id]; }) } : {};
        db.updateTask(t0.id, patch, "rozbił(a) zadanie na " + made + " " + plural(made, "podzadanie", "podzadania", "podzadań"));
        closeSX();
        SP.toast("Dodano " + made + " " + plural(made, "podzadanie", "podzadania", "podzadań") + " do " + db.taskKey(t0));
        setTimeout(function () { var sl = document.querySelector(".tm .sub-list"); if (sl && !reduce) Array.prototype.slice.call(sl.children, -made).forEach(function (r, i) { r.style.setProperty("--i", i); r.classList.add("sx-in"); }); }, 30);
      });
    }
  };
  function onSXKey(e) { if (e.key === "Escape" && SX && !document.querySelector(".popover")) { e.stopPropagation(); closeSX(); } }
  function closeSX() { if (!SX) return; SX.bg.remove(); SX = null; document.removeEventListener("keydown", onSXKey, true); }
})();
