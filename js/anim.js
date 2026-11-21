/* Sprynt – animacje: konfetti przy ukończeniu zadania, podświetlenie nowych zadań,
 * odliczanie liczb na pulpicie i w celach, obrót ikony motywu. CSS robi resztę (wejście widoku,
 * kolejne wiersze/karty, rosnące słupki) – patrz sekcja „Animacje” w css/app.css.
 * Wszystko wyłącza się przy prefers-reduced-motion. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { SP.celebrate = function () {}; return; } // bez SP.flipSnap – przerysowanie bez animacji

  /* ---- gdzie użytkownik ostatnio kliknął (punkt startu konfetti) ---- */
  var last = { x: innerWidth / 2, y: innerHeight / 2, t: 0 };
  document.addEventListener("pointerdown", function (e) { last = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
  document.addEventListener("drop", function (e) { last = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);

  /* ---- konfetti ---- */
  var COLORS = ["#8b7cf6", "#e84393", "#1aae6f", "#f5a623", "#0984e3", "#fde68a"];
  SP.celebrate = function (x, y, n) {
    if (Date.now() - last.t > 4000 && x == null) { x = innerWidth / 2; y = innerHeight / 3; }
    x = x == null ? last.x : x; y = y == null ? last.y : y; n = n || 22;
    var layer = document.createElement("div"); layer.className = "confetti"; document.body.appendChild(layer);
    var ring = document.createElement("i"); ring.className = "cf-ring"; ring.style.left = x + "px"; ring.style.top = y + "px"; layer.appendChild(ring);
    ring.animate([{ transform: "translate(-50%,-50%) scale(.2)", opacity: .9 }, { transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 }], { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" });
    var done = [];
    for (var i = 0; i < n; i++) {
      var p = document.createElement("i"); p.className = "cf-p" + (i % 3 === 0 ? " round" : "");
      p.style.left = x + "px"; p.style.top = y + "px"; p.style.background = COLORS[i % COLORS.length];
      layer.appendChild(p);
      var ang = (i / n) * Math.PI * 2 + Math.random() * .5, v = 60 + Math.random() * 90, dx = Math.cos(ang) * v, dy = Math.sin(ang) * v - 40, rot = (Math.random() * 720 - 360) | 0;
      done.push(p.animate([
        { transform: "translate(-50%,-50%) scale(.4) rotate(0deg)", opacity: 1 },
        { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px)) scale(1) rotate(" + rot / 2 + "deg)", opacity: 1, offset: .45 },
        { transform: "translate(calc(-50% + " + dx * 1.3 + "px), calc(-50% + " + (dy + 110) + "px)) scale(.7) rotate(" + rot + "deg)", opacity: 0 },
      ], { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.15,.7,.3,1)" }).finished);
    }
    Promise.all(done).then(function () { layer.remove(); }, function () { layer.remove(); });
  };

  /* ---- ukończenie zadania → konfetti + zielony błysk wiersza ---- */
  var doneFlash = new Set(), newFlash = new Set();
  function wrapClose(name) {
    var orig = db[name];
    db[name] = function () {
      var ids = name === "bulkUpdate" ? arguments[0] : [arguments[0]];
      var before = ids.map(function (id) { var t = db.task(id); return t && db.status(t.status).closed; });
      var r = orig.apply(db, arguments);
      var hit = ids.filter(function (id, i) { var t = db.task(id); return t && !before[i] && db.status(t.status).closed; });
      if (hit.length) { hit.forEach(function (id) { doneFlash.add(id); }); SP.celebrate(null, null, hit.length > 1 ? 34 : 22); }
      return r;
    };
  }
  wrapClose("updateTask"); wrapClose("bulkUpdate");
  var origCreate = db.createTask;
  db.createTask = function (fields) { var t = origCreate.apply(db, arguments); if (t && !(fields && fields.parentId)) newFlash.add(t.id); return t; };

  /* Po każdym przerysowaniu widoku: błyski dla nowych/ukończonych + liczniki przy wejściu. */
  function afterRender(host) {
    if (newFlash.size || doneFlash.size) {
      setTimeout(function () {
        newFlash.forEach(function (id) { document.querySelectorAll('#view [data-task="' + id + '"]').forEach(function (r) { r.classList.remove("xt-new"); void r.offsetWidth; r.classList.add("xt-new"); }); });
        doneFlash.forEach(function (id) { document.querySelectorAll('#view [data-task="' + id + '"]').forEach(function (r) { r.classList.add("just-done"); }); });
        newFlash.clear(); doneFlash.clear();
      }, 0);
    }
    if (host && host.classList.contains("enter")) countUp(host);
  }
  var view = document.getElementById("view");
  new MutationObserver(function (ms) {
    ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.classList && n.classList.contains("view-host")) afterRender(n); }); });
  }).observe(view, { childList: true });
  // okno zadania też pokazuje ukończenie (status w nagłówku)
  db.onChange(function () { if (doneFlash.size && document.querySelector(".tm-bg")) setTimeout(function () { var s = document.querySelector(".tm-status"); if (s) s.animate([{ transform: "scale(1.15)" }, { transform: "none" }], { duration: 400, easing: "cubic-bezier(.3,1.6,.6,1)" }); }, 0); });

  /* ---- odliczanie liczb (pulpit, cele) ---- */
  function countUp(root) {
    root.querySelectorAll(".kpi-v, .ring-v, .goals-sum, .xt-count").forEach(function (el) {
      var txt = el.textContent, m = /-?\d[\d\s]*(?:[.,]\d+)?/.exec(txt); if (!m) return;
      var target = parseFloat(m[0].replace(/\s/g, "").replace(",", ".")); if (!isFinite(target) || target === 0) return;
      var dec = (m[0].split(/[.,]/)[1] || "").length, pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length), t0 = performance.now(), dur = 900;
      (function step() {
        var p = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - p, 3), v = target * e;
        el.textContent = pre + v.toLocaleString("pl-PL", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post;
        if (p < 1) setTimeout(step, 16); else el.textContent = txt;
      })();
    });
  }

  /* ---- FLIP: zadania płynnie przelatują na nowe miejsce po przerysowaniu ----
   * SP.rerender (app.js) woła flipSnap() przed i flipPlay(snap) po przerysowaniu. Ten sam [data-task]
   * (n-te wystąpienie) w innym miejscu → animacja z różnicy położeń do zera. Po upuszczeniu karty
   * (SP.flipDrop = {id, x, y}) karta „ląduje” z punktu upuszczenia. Liczniki grup podskakują przy zmianie. */
  var MAX_FLIP = 350;
  function keyed(root) {
    var seen = {}, out = [];
    var els = root.querySelectorAll("[data-task]");
    for (var i = 0; i < els.length && out.length < MAX_FLIP; i++) {
      var el = els[i]; if (el.closest(".tm-bg,.popover")) continue;
      var id = el.dataset.task, n = seen[id] = (seen[id] || 0) + 1;
      out.push({ k: id + "#" + n, el: el });
    }
    return out;
  }
  function counters(root) {
    var m = {};
    root.querySelectorAll("[data-grp] .grp-n, .col[data-status] .grp-n").forEach(function (el) {
      var host = el.closest("[data-grp]") || el.closest("[data-status]"); m[host.dataset.grp || host.dataset.status] = el.textContent;
    });
    return m;
  }
  SP.flipSnap = function () {
    if (document.hidden) return null;
    var map = {}; keyed(view).forEach(function (x) { map[x.k] = x.el.getBoundingClientRect(); });
    return { rects: map, counts: counters(view) };
  };
  SP.flipPlay = function (snap) {
    var vh = innerHeight, drop = SP.flipDrop && Date.now() - SP.flipDrop.t < 1500 ? SP.flipDrop : null;
    SP.flipDrop = null;
    keyed(view).forEach(function (x) {
      var r = x.el.getBoundingClientRect(), id = x.k.split("#")[0];
      if (drop && drop.id === id && x.k.slice(-2) === "#1") {
        var ddx = drop.x - (r.left + r.width / 2), ddy = drop.y - (r.top + r.height / 2);
        x.el.animate([{ transform: "translate(" + ddx + "px," + ddy + "px) rotate(3deg) scale(1.05)", boxShadow: "0 18px 40px -12px rgba(0,0,0,.35)", zIndex: 5 },
          { transform: "translate(" + ddx * .05 + "px," + ddy * .05 + "px) rotate(-.6deg) scale(1.01)", offset: .75 }, { transform: "none", boxShadow: "none" }],
          { duration: 460, easing: "cubic-bezier(.2,.9,.3,1.15)" });
        return;
      }
      var o = snap.rects[x.k]; if (!o) return;
      var dx = o.left - r.left, dy = o.top - r.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      if ((o.bottom < 0 || o.top > vh) && (r.bottom < 0 || r.top > vh)) return; // poza ekranem przed i po
      x.el.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: Math.min(520, 260 + Math.hypot(dx, dy) * .35), easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    var now = counters(view);
    Object.keys(now).forEach(function (k) {
      if (snap.counts[k] == null || snap.counts[k] === now[k]) return;
      var host = view.querySelector('[data-grp="' + CSS.escape(k) + '"] .grp-n') || view.querySelector('.col[data-status="' + CSS.escape(k) + '"] .grp-n');
      if (host) host.animate([{ transform: "scale(1.5)", background: "var(--brand)", color: "#fff" }, { transform: "none" }], { duration: 480, easing: "cubic-bezier(.3,1.6,.6,1)" });
    });
  };

  /* ---- motyw: ikona robi obrót ---- */
  addEventListener("themechange", function () {
    var b = document.querySelector("#themeBtn svg"); if (b) b.animate([{ transform: "rotate(-120deg) scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 450, easing: "cubic-bezier(.3,1.5,.6,1)" });
  });
})();
