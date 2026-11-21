/* Sprynt – wspólne elementy UI: formatowanie, awatary, popovery, wybieraki, okna, toast. */
(function () {
  "use strict";
  var SP = window.SP;
  var db = SP.db;

  var esc = (SP.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  });
  SP.ico = function (name, size, cls) { return SP.icon(name, { size: size || 16, className: cls || "" }); };
  SP.el = function (html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  /* ---- Daty ------------------------------------------------------------ */
  // Daty jako "RRRR-MM-DD" w czasie lokalnym (nie przez toISOString – to UTC i przesuwa dzień).
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function todayStr() { return ymd(new Date()); }
  function addDays(s, n) { var d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDays(s) { return Math.round((new Date(s + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 864e5); }
  SP.date = { today: todayStr, add: addDays, diff: diffDays, ymd: ymd };
  /** Termin → { label, cls } (cls: overdue / today / soon / ""). */
  SP.fmtDue = function (s, closed) {
    if (!s) return { label: "", cls: "" };
    var d = diffDays(s), cls = closed ? "" : d < 0 ? "overdue" : d === 0 ? "today" : d <= 2 ? "soon" : "";
    var label = d === 0 ? "Dziś" : d === 1 ? "Jutro" : d === -1 ? "Wczoraj"
      : new Date(s + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: Math.abs(d) > 300 ? "numeric" : undefined });
    return { label: label, cls: cls };
  };
  SP.ago = function (iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "przed chwilą";
    if (m < 60) return m + " min temu";
    var h = Math.round(m / 60); if (h < 24) return h + " godz. temu";
    var d = Math.round(h / 24); return d === 1 ? "wczoraj" : d + " dni temu";
  };
  SP.initials = function (name) {
    var w = String(name || "?").trim().split(/\s+/);
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
  };

  /* ---- Małe elementy --------------------------------------------------- */
  SP.avatar = function (id, size) {
    var p = db.person(id); if (!p) return "";
    return '<span class="av' + (size ? " av-" + size : "") + '" style="--c:' + p.color + '" title="' + esc(p.name) + '">' + esc(SP.initials(p.name)) + "</span>";
  };
  SP.avatars = function (ids, size, max) {
    max = max || 3;
    if (!ids || !ids.length) return '<span class="av av-empty' + (size ? " av-" + size : "") + '" title="Nieprzypisane">' + SP.ico("user", 13) + "</span>";
    var h = ids.slice(0, max).map(function (id) { return SP.avatar(id, size); }).join("");
    if (ids.length > max) h += '<span class="av av-more' + (size ? " av-" + size : "") + '">+' + (ids.length - max) + "</span>";
    return '<span class="av-stack">' + h + "</span>";
  };
  SP.statusPill = function (id) { var s = db.status(id); return '<span class="st-pill" style="--c:' + s.color + '">' + esc(s.name) + "</span>"; };
  SP.statusDot = function (id) { var s = db.status(id); return '<span class="st-dot' + (s.closed ? " closed" : "") + '" style="--c:' + s.color + '"></span>'; };
  SP.flag = function (id, withLabel) {
    var p = db.priority(id);
    if (!p) return '<span class="prio prio-none" title="Brak priorytetu">' + SP.ico("flag", 15) + (withLabel ? "<span>Brak</span>" : "") + "</span>";
    return '<span class="prio" style="--c:' + p.color + '" title="Priorytet: ' + p.name + '">' + SP.ico("flag", 15) + (withLabel ? "<span>" + p.name + "</span>" : "") + "</span>";
  };
  SP.tagChip = function (name) { var t = db.tag(name) || { color: "#87909e" }; return '<span class="tag" style="--c:' + t.color + '">' + esc(name) + "</span>"; };
  SP.spaceIcon = function (s, size) { return '<span class="sp-ico' + (size ? " sp-" + size : "") + '" style="--c:' + s.color + '">' + esc((s.name || "?")[0].toUpperCase()) + "</span>"; };

  /* ---- Toast ------------------------------------------------------------ */
  var toastT;
  SP.toast = function (msg) {
    var t = document.getElementById("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600);
  };

  /* ---- Popover (jeden naraz) -------------------------------------------- */
  var current = null;
  SP.closePopover = function () { if (current) { current.el.remove(); var c = current; current = null; c.onClose && c.onClose(); } };
  /** Otwiera popover przy anchor. content: HTML albo element. Zwraca element popovera. */
  SP.popover = function (anchor, content, opts) {
    opts = opts || {};
    SP.closePopover();
    var el = document.createElement("div");
    el.className = "popover " + (opts.cls || "");
    if (typeof content === "string") el.innerHTML = content; else el.appendChild(content);
    document.body.appendChild(el);
    SP.hydrateIcons(el);
    var r = anchor.getBoundingClientRect(), pr = el.getBoundingClientRect();
    var left = opts.align === "right" ? r.right - pr.width : r.left;
    left = Math.max(8, Math.min(left, innerWidth - pr.width - 8));
    var top = r.bottom + 6;
    if (top + pr.height > innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
    el.style.left = left + "px"; el.style.top = top + "px";
    current = { el: el, anchor: anchor, onClose: opts.onClose };
    var f = el.querySelector("input"); if (f) setTimeout(function () { f.focus(); }, 0);
    return el;
  };
  document.addEventListener("pointerdown", function (e) {
    if (current && !current.el.contains(e.target) && !current.anchor.contains(e.target)) SP.closePopover();
  }, true);
  addEventListener("resize", SP.closePopover);

  /** Menu akcji: items = [{label, icon, danger, run}] lub "-" */
  SP.menu = function (anchor, items, opts) {
    var el = document.createElement("div");
    items.forEach(function (it) {
      if (it === "-") { el.appendChild(SP.el('<div class="pm-sep"></div>')); return; }
      if (it.header) { el.appendChild(SP.el('<div class="pm-head">' + esc(it.header) + "</div>")); return; }
      var b = SP.el('<button class="pm-item' + (it.danger ? " danger" : "") + (it.active ? " active" : "") + '">' + (it.icon ? SP.ico(it.icon, 16) : "") + (it.html || "<span>" + esc(it.label) + "</span>") + (it.active ? '<span class="pm-check">' + SP.ico("check", 14) + "</span>" : "") + "</button>");
      b.addEventListener("click", function () { if (!it.keepOpen) SP.closePopover(); it.run && it.run(); });
      el.appendChild(b);
    });
    return SP.popover(anchor, el, Object.assign({ cls: "pm" }, opts));
  };

  /* ---- Wybieraki --------------------------------------------------------- */
  SP.pickStatus = function (anchor, cur, cb) {
    SP.menu(anchor, [{ header: "Status" }].concat(db.STATUSES.map(function (s) {
      return { html: SP.statusDot(s.id) + "<span>" + esc(s.name) + "</span>", active: s.id === cur, run: function () { cb(s.id); } };
    })));
  };
  SP.pickPriority = function (anchor, cur, cb) {
    SP.menu(anchor, [{ header: "Priorytet" }].concat(db.PRIORITIES.map(function (p) {
      return { html: SP.flag(p.id) + "<span>" + p.name + "</span>", active: p.id === cur, run: function () { cb(p.id); } };
    }), ["-", { label: "Wyczyść", icon: "x", run: function () { cb(null); } }]));
  };
  SP.pickAssignees = function (anchor, cur, cb) {
    var sel = new Set(cur || []);
    var wrap = SP.el('<div><div class="pm-search"><input placeholder="Szukaj osób…" /></div><div class="pm-list"></div></div>');
    var list = wrap.querySelector(".pm-list"), input = wrap.querySelector("input");
    function draw() {
      var q = input.value.trim().toLowerCase();
      list.innerHTML = "";
      db.raw.people.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; }).forEach(function (p) {
        var b = SP.el('<button class="pm-item' + (sel.has(p.id) ? " active" : "") + '">' + SP.avatar(p.id, "sm") + "<span>" + esc(p.name) + (p.id === "me" ? ' <small class="muted">(ja)</small>' : "") + "</span>" +
          (sel.has(p.id) ? '<span class="pm-check">' + SP.ico("check", 14) + "</span>" : "") + "</button>");
        b.addEventListener("click", function () { sel.has(p.id) ? sel.delete(p.id) : sel.add(p.id); cb(Array.from(sel)); draw(); });
        list.appendChild(b);
      });
      SP.hydrateIcons(list);
    }
    input.addEventListener("input", draw);
    draw();
    SP.popover(anchor, wrap, { cls: "pm" });
  };
  SP.pickDate = function (anchor, cur, cb) {
    var t = SP.date.today();
    var quick = [["Dziś", t], ["Jutro", SP.date.add(t, 1)], ["Za 2 dni", SP.date.add(t, 2)], ["Za tydzień", SP.date.add(t, 7)], ["Za 2 tygodnie", SP.date.add(t, 14)]];
    var wrap = SP.el('<div class="datepick"><div class="dp-quick"></div><div class="dp-cal"></div></div>');
    var q = wrap.querySelector(".dp-quick");
    quick.forEach(function (x) {
      var b = SP.el('<button class="pm-item"><span>' + x[0] + '</span><small class="muted">' + new Date(x[1] + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" }) + "</small></button>");
      b.onclick = function () { SP.closePopover(); cb(x[1]); };
      q.appendChild(b);
    });
    if (cur) { var c = SP.el('<button class="pm-item danger"><span>Usuń termin</span></button>'); c.onclick = function () { SP.closePopover(); cb(null); }; q.appendChild(c); }
    var cal = wrap.querySelector(".dp-cal");
    var month = new Date((cur || t) + "T00:00:00"); month.setDate(1);
    function draw() {
      var y = month.getFullYear(), m = month.getMonth();
      var start = new Date(y, m, 1), offset = (start.getDay() + 6) % 7;
      var h = '<div class="dp-head"><button data-nav="-1">' + SP.ico("chevron-left", 14) + "</button><b>" + start.toLocaleDateString("pl-PL", { month: "long", year: "numeric" }) +
        '</b><button data-nav="1">' + SP.ico("chevron-right", 14) + '</button></div><div class="dp-grid">' +
        ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map(function (d) { return "<span class='dp-dow'>" + d + "</span>"; }).join("");
      for (var i = 0; i < offset; i++) h += "<span></span>";
      var days = new Date(y, m + 1, 0).getDate();
      for (var dd = 1; dd <= days; dd++) {
        var s = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
        h += '<button class="dp-day' + (s === t ? " today" : "") + (s === cur ? " sel" : "") + '" data-d="' + s + '">' + dd + "</button>";
      }
      cal.innerHTML = h + "</div>";
    }
    cal.addEventListener("click", function (e) {
      var n = e.target.closest("[data-nav]"); if (n) { month.setMonth(month.getMonth() + Number(n.dataset.nav)); draw(); return; }
      var d = e.target.closest("[data-d]"); if (d) { SP.closePopover(); cb(d.dataset.d); }
    });
    draw();
    SP.popover(anchor, wrap, { cls: "pm pm-wide" });
  };
  SP.pickTags = function (anchor, cur, cb) {
    var sel = new Set(cur || []);
    var wrap = SP.el('<div><div class="pm-search"><input placeholder="Szukaj lub utwórz tag…" /></div><div class="pm-list"></div></div>');
    var list = wrap.querySelector(".pm-list"), input = wrap.querySelector("input");
    function draw() {
      var q = input.value.trim().toLowerCase();
      list.innerHTML = "";
      db.raw.tags.filter(function (t) { return !q || t.name.indexOf(q) >= 0; }).forEach(function (t) {
        var b = SP.el('<button class="pm-item' + (sel.has(t.name) ? " active" : "") + '">' + SP.tagChip(t.name) + (sel.has(t.name) ? '<span class="pm-check">' + SP.ico("check", 14) + "</span>" : "") + "</button>");
        b.onclick = function () { sel.has(t.name) ? sel.delete(t.name) : sel.add(t.name); cb(Array.from(sel)); draw(); };
        list.appendChild(b);
      });
      if (q && !db.tag(q)) {
        var c = SP.el('<button class="pm-item">' + SP.ico("plus", 14) + "<span>Utwórz tag „" + esc(q) + "”</span></button>");
        c.onclick = function () { db.createTag(q); sel.add(q); input.value = ""; cb(Array.from(sel)); draw(); };
        list.appendChild(c);
      }
      SP.hydrateIcons(list);
    }
    input.addEventListener("input", draw);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = list.querySelector(".pm-item"); if (b) b.click(); } });
    draw();
    SP.popover(anchor, wrap, { cls: "pm" });
  };
  SP.pickList = function (anchor, cur, cb) {
    var items = [];
    db.raw.spaces.forEach(function (s) {
      items.push({ header: s.name });
      db.raw.lists.filter(function (l) { return l.spaceId === s.id; }).forEach(function (l) {
        var f = l.folderId ? db.folder(l.folderId) : null;
        items.push({ html: SP.ico("list", 15) + "<span>" + (f ? '<small class="muted">' + esc(f.name) + " / </small>" : "") + esc(l.name) + "</span>", active: l.id === cur, run: function () { cb(l.id); } });
      });
    });
    SP.menu(anchor, items, { cls: "pm pm-scroll" });
  };

  /* ---- Okna dialogowe -------------------------------------------------- */
  /** Prosty formularz w oknie. fields: [{name,label,type:'text'|'textarea'|'select'|'color',value,options:[[v,l]]}] */
  SP.form = function (o) {
    return new Promise(function (resolve) {
      var bg = SP.el('<div class="dlg-bg"><form class="dlg" role="dialog" aria-modal="true"><h2></h2><div class="dlg-fields"></div><div class="dlg-acts"><button type="button" class="btn ghost" data-cancel>Anuluj</button><button type="submit" class="btn primary"></button></div></form></div>');
      bg.querySelector("h2").textContent = o.title;
      bg.querySelector("[type=submit]").textContent = o.submit || "Zapisz";
      var fields = bg.querySelector(".dlg-fields");
      o.fields.forEach(function (f) {
        var id = "f_" + f.name, ctl;
        if (f.type === "select") ctl = '<select class="input" id="' + id + '" name="' + f.name + '">' + f.options.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (op[0] === f.value ? " selected" : "") + ">" + esc(op[1]) + "</option>"; }).join("") + "</select>";
        else if (f.type === "color") ctl = '<div class="swatches" id="' + id + '">' + f.options.map(function (c, i) { return '<label><input type="radio" name="' + f.name + '" value="' + c + '"' + ((f.value ? c === f.value : i === 0) ? " checked" : "") + '><span style="background:' + c + '"></span></label>'; }).join("") + "</div>";
        else if (f.type === "textarea") ctl = '<textarea class="input" rows="7" id="' + id + '" name="' + f.name + '" placeholder="' + esc(f.placeholder || "") + '" ' + (f.required ? "required" : "") + ">" + esc(f.value || "") + "</textarea>";
        else ctl = '<input class="input" id="' + id + '" name="' + f.name + '" value="' + esc(f.value || "") + '" placeholder="' + esc(f.placeholder || "") + '" ' + (f.required ? "required" : "") + ' autocomplete="off" />';
        fields.appendChild(SP.el('<div class="dlg-field"><label for="' + id + '">' + esc(f.label) + "</label>" + ctl + "</div>"));
      });
      function close(v) { bg.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); }
      function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(null); } }
      document.addEventListener("keydown", onKey, true);
      bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(null); });
      bg.querySelector("[data-cancel]").onclick = function () { close(null); };
      bg.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        var out = {}; new FormData(e.target).forEach(function (v, k) { out[k] = typeof v === "string" ? v.trim() : v; });
        close(out);
      });
      document.body.appendChild(bg);
      var first = bg.querySelector("input.input,select,textarea"); if (first) first.focus();
    });
  };
  SP.confirm = function (title, text, okLabel) {
    return new Promise(function (resolve) {
      var bg = SP.el('<div class="dlg-bg"><div class="dlg" role="alertdialog" aria-modal="true"><h2></h2><p class="muted"></p><div class="dlg-acts"><button class="btn ghost" data-no>Anuluj</button><button class="btn danger" data-yes></button></div></div></div>');
      bg.querySelector("h2").textContent = title; bg.querySelector("p").textContent = text; bg.querySelector("[data-yes]").textContent = okLabel || "Usuń";
      function close(v) { bg.remove(); resolve(v); }
      bg.querySelector("[data-no]").onclick = function () { close(false); };
      bg.querySelector("[data-yes]").onclick = function () { close(true); };
      bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(false); });
      document.body.appendChild(bg); bg.querySelector("[data-yes]").focus();
    });
  };
  SP.SPACE_COLORS = ["#6c5ce7", "#00a884", "#e84393", "#f39c12", "#0984e3", "#e5484d", "#2d3436"];
})();
