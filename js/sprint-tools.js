/* Sprynt – narzędzia sprintu: planning poker, raport do druku/PDF, notatki wydania (z AI), widżet na stronie głównej,
 * przypomnienia o końcu sprintu w Skrzynce i skróty klawiszowe w widoku sprintu. Korzysta z SP._spr (js/sprints.js). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, X = SP._spr;
  if (!db || !X) return;
  var esc = SP.esc, ico = SP.ico, D = SP.date, pl = X.pl, closed = X.closed;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =================== Planning poker =================== */
  var DECK = [1, 2, 3, 5, 8, 13, 21, "?", "☕"];
  /** Zespół szacuje zadania kartami: każdy wybiera zakrytą kartę, potem wszystkie się odwracają. */
  SP.planningPoker = function (sp, tasksOpt) {
    var queue = tasksOpt || db.sprintTasks(sp.id).filter(function (t) { return !closed(t) && t.points == null; });
    if (!queue.length && !tasksOpt) queue = X.backlogOf(sp.spaceId).filter(function (t) { return t.points == null; });
    if (!queue.length && !tasksOpt) queue = db.sprintTasks(sp.id).filter(function (t) { return !closed(t); });
    queue = queue.slice().sort(X.byImportance).slice(0, 40);
    if (!queue.length) { SP.toast("Nie ma zadań do oszacowania"); return; }
    var people = db.raw.people.slice(0, 8), ai = X.aiOn();
    var P = { i: 0, votes: {}, revealed: false, active: people[0].id, aiVote: null, aiBusy: false, saved: [] };
    var S = X.aiShell("Planning poker · " + sp.name, "Każdy wybiera kartę w tajemnicy – potem odkrywacie wszystkie naraz i rozmawiacie o różnicach.", "kanban-card", { noGo: true, cls: "pk" });
    S.info.remove();
    function task() { return queue[P.i]; }
    function seatsHTML() {
      var seats = people.map(function (p) { return { id: p.id, name: X.personName(p.id), av: SP.avatar(p.id, "sm"), v: P.votes[p.id] }; });
      if (ai && (P.aiVote || P.aiBusy)) seats.push({ id: "_ai", name: "Claude", av: '<span class="pk-ai-av">' + SP.logo("claude", 18, { alt: "" }) + "</span>", v: P.aiVote ? P.aiVote.points : undefined, busy: P.aiBusy });
      return seats.map(function (s, k) {
        var has = s.v !== undefined;
        return '<button class="pk-seat' + (P.active === s.id && !P.revealed ? " on" : "") + (has ? " voted" : "") + '" data-seat="' + s.id + '" style="--k:' + k + '">' +
          '<span class="pk-card' + (has ? " in" : "") + (P.revealed && has ? " flip" : "") + '" style="--d:' + k * 90 + 'ms"><i class="pk-back"></i><i class="pk-face">' + (has ? esc(String(s.v)) : "") + "</i></span>" +
          '<span class="pk-who">' + s.av + "<span>" + esc(s.name.split(" ")[0]) + "</span></span>" + (s.busy ? '<small class="muted">myśli…</small>' : "") + "</button>";
      }).join("");
    }
    function stats() {
      var nums = Object.keys(P.votes).map(function (k) { return P.votes[k]; }).filter(function (v) { return typeof v === "number"; });
      if (P.aiVote) nums.push(P.aiVote.points);
      if (!nums.length) return null;
      nums.sort(function (a, b) { return a - b; });
      var avg = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length, med = nums.length % 2 ? nums[(nums.length - 1) / 2] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2;
      return { avg: Math.round(avg * 10) / 10, med: med, min: nums[0], max: nums[nums.length - 1], same: nums[0] === nums[nums.length - 1] && nums.length > 1, pick: X.snapPts(med), n: nums.length };
    }
    function draw() {
      if (P.i >= queue.length) return done();
      var t = task(), cl = t.checklist || [], tmp = document.createElement("div"); tmp.innerHTML = t.desc || "";
      var desc = (tmp.textContent || "").replace(/\s+/g, " ").trim(), voted = Object.keys(P.votes).length, st = P.revealed ? stats() : null;
      S.body.innerHTML =
        '<div class="pk-top"><span class="muted">Zadanie ' + (P.i + 1) + " z " + queue.length + '</span><span class="pk-dots">' + queue.map(function (q, k) { return '<i class="' + (k < P.i ? "d" : k === P.i ? "c" : "") + '"></i>'; }).join("") + "</span></div>" +
        '<article class="pk-task"><div class="pk-task-h"><span class="ct-key">' + db.taskKey(t) + "</span>" + (t.priority ? SP.flag(t.priority, true) : "") + SP.avatars(t.assignees, "xs") + (t.points != null ? '<span class="muted">teraz ' + t.points + " pkt</span>" : "") + "</div>" +
        "<h3>" + esc(t.title) + "</h3>" + (desc ? '<p class="muted">' + esc(desc.slice(0, 260)) + (desc.length > 260 ? "…" : "") + "</p>" : "") +
        (cl.length ? '<small class="muted">' + ico("list-checks", 12) + " Lista kontrolna: " + cl.length + " " + (cl.length === 1 ? "punkt" : "punktów") + "</small>" : "") + "</article>" +
        '<div class="pk-table">' + seatsHTML() + "</div>" +
        (P.revealed ? (st ? '<div class="pk-stats' + (st.same ? " same" : "") + '"><b>' + (st.same ? "Zgoda! 🎉 " + st.min + " pkt" : "Rozrzut " + st.min + "–" + st.max + " pkt") + "</b><span>średnio " + st.avg.toLocaleString("pl-PL") + " · mediana " + st.med + "</span>" +
          (!st.same && st.max >= st.min * 2 ? '<span class="pk-hint">Duża różnica – niech osoba z najniższą i najwyższą kartą powie, co widzi.</span>' : "") +
          (P.aiVote ? '<span class="pk-why">' + SP.logo("claude", 14, { alt: "" }) + "Claude: " + esc(P.aiVote.reason) + "</span>" : "") + "</div>"
          : '<div class="pk-stats"><b>Same „?” i „☕”</b><span>Doprecyzujcie zadanie albo zróbcie przerwę.</span></div>') +
          '<div class="pk-final"><span class="muted">Ustal punkty:</span>' + X.POINTS.map(function (n) { return '<button class="pk-pick' + (st && st.pick === n ? " on" : "") + '" data-pick="' + n + '">' + n + "</button>"; }).join("") + "</div>"
          : '<div class="pk-deck" role="group" aria-label="Karty">' + DECK.map(function (v, k) { return '<button class="pk-dcard' + (P.votes[P.active] === v ? " on" : "") + '" data-card="' + k + '" title="Klawisz ' + (k + 1) + '"><span>' + v + "</span></button>"; }).join("") + "</div>" +
            '<p class="muted pk-turn">Głosuje: <b>' + esc(X.personName(P.active)) + "</b> · kliknij osobę, żeby zmienić · klawisze 1–9 · Enter = odkryj</p>");
      S.acts.innerHTML = P.revealed
        ? '<button class="btn sm" data-again>' + ico("repeat", 14) + 'Jeszcze raz</button><button class="btn sm" data-skip>Pomiń</button><button class="btn primary sm" data-save' + (st ? "" : " disabled") + ">" + ico("check", 14) + "<span>Zapisz " + (st ? st.pick : "") + " pkt</span></button>"
        : (ai ? '<button class="btn sm magic" data-ai' + (P.aiVote || P.aiBusy ? " disabled" : "") + ">" + SP.logo("claude", 14, { alt: "" }) + (P.aiVote ? "Claude zagłosował" : P.aiBusy ? "Claude myśli…" : "Zagra Claude") + "</button>" : "") +
          '<button class="btn sm" data-skip>Pomiń</button><button class="btn primary sm" data-reveal' + (voted || P.aiVote ? "" : " disabled") + ">" + ico("eye", 14) + "Odkryj karty (" + (voted + (P.aiVote ? 1 : 0)) + ")</button>";
      S.meta.textContent = P.saved.length ? "Oszacowano " + pl(P.saved.length, "zadanie", "zadania", "zadań") + " · " + P.saved.reduce(function (a, b) { return a + b; }, 0) + " pkt" : "";
      SP.hydrateIcons(S.bg);
      if (P.revealed && st && st.same && SP.celebrate && !P.cheered) { P.cheered = true; var r = S.body.querySelector(".pk-stats").getBoundingClientRect(); SP.celebrate(r.left + r.width / 2, r.top); }
    }
    function nextVoter() {
      var ids = people.map(function (p) { return p.id; }), k = ids.indexOf(P.active);
      for (var j = 1; j <= ids.length; j++) { var c = ids[(k + j) % ids.length]; if (P.votes[c] === undefined) { P.active = c; return; } }
    }
    function vote(k) { if (P.revealed || P.active === "_ai") return; P.votes[P.active] = DECK[k]; nextVoter(); draw(); }
    function reset() { P.votes = {}; P.revealed = false; P.aiVote = null; P.aiBusy = false; P.cheered = false; P.active = people[0].id; }
    function next() { P.i++; reset(); draw(); }
    function askAI() {
      if (P.aiBusy || P.aiVote) return;
      var t = task(); P.aiBusy = true; draw();
      SP.ai.estimate([t], X.spaceOfTask(t)).then(function (res) {
        if (!S.open || task() !== t) return;
        var e = res.estimates[0]; P.aiBusy = false; P.aiVote = e ? { points: X.snapPts(e.points), reason: e.reason } : null; draw();
      }, function (err) { P.aiBusy = false; if (S.open) { draw(); SP.toast(err.message || "Błąd AI"); } });
    }
    function done() {
      var sum = P.saved.reduce(function (a, b) { return a + b; }, 0);
      S.body.innerHTML = '<div class="pk-done">' + ico("trophy", 44) + "<h3>" + (P.saved.length ? "Oszacowano " + pl(P.saved.length, "zadanie", "zadania", "zadań") : "Koniec kolejki") + "</h3><p class=\"muted\">" + (P.saved.length ? "Razem " + sum + " pkt. Wartości są już w zadaniach i w wykresie spalania." : "Żadne zadanie nie dostało punktów.") + "</p></div>";
      S.acts.innerHTML = ""; S.meta.textContent = ""; SP.hydrateIcons(S.body);
      if (P.saved.length && SP.celebrate) SP.celebrate(innerWidth / 2, innerHeight / 2.4);
    }
    S.bg.addEventListener("click", function (e) {
      var b;
      if ((b = e.target.closest("[data-seat]"))) { if (!P.revealed && b.dataset.seat !== "_ai") { P.active = b.dataset.seat; draw(); } return; }
      if ((b = e.target.closest("[data-card]"))) { vote(+b.dataset.card); return; }
      if (e.target.closest("[data-reveal]")) { P.revealed = true; draw(); return; }
      if (e.target.closest("[data-ai]")) { askAI(); return; }
      if (e.target.closest("[data-again]")) { reset(); draw(); return; }
      if (e.target.closest("[data-skip]")) { next(); return; }
      if ((b = e.target.closest("[data-pick]"))) {
        S.body.querySelectorAll(".pk-pick").forEach(function (x) { x.classList.toggle("on", x === b); });
        var sv = S.acts.querySelector("[data-save]"); sv.disabled = false; sv.querySelector("span").textContent = "Zapisz " + b.dataset.pick + " pkt"; sv.dataset.v = b.dataset.pick; return;
      }
      if ((b = e.target.closest("[data-save]"))) {
        var st = stats(), v = Number(b.dataset.v || (st && st.pick)); if (!v) return;
        db.updateTask(task().id, { points: v }, "ustawił(a) punkty w planning pokerze: " + v); P.saved.push(v); next();
      }
    });
    function onKey(e) {
      if (!S.open) { document.removeEventListener("keydown", onKey, true); return; }
      if (document.querySelector(".popover") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!P.revealed && /^[1-9]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); vote(+e.key - 1); }
      else if (e.key === "Enter" && !P.revealed && (Object.keys(P.votes).length || P.aiVote)) { e.preventDefault(); e.stopPropagation(); P.revealed = true; draw(); }
    }
    document.addEventListener("keydown", onKey, true);
    draw();
  };

  /* =================== Raport sprintu do druku / PDF =================== */
  var REPORT_CSS = "*{box-sizing:border-box}body{margin:0;font:14px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#1d2230;background:#fff}main{max-width:900px;margin:0 auto;padding:36px 40px 60px}" +
    "header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #6c5ce7;padding-bottom:16px;margin-bottom:20px}header img{width:40px;height:40px}h1{margin:0;font-size:26px;letter-spacing:-.02em}h2{font-size:16px;margin:28px 0 10px;color:#6c5ce7}" +
    ".meta{color:#5d6370}.goal{margin:6px 0 0;font-weight:600}.pill{display:inline-block;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:800;color:#fff;text-transform:uppercase;margin-left:6px;vertical-align:3px}" +
    ".kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpi{border:1px solid #e3e5ea;border-radius:12px;padding:10px 12px}.kpi small{display:block;color:#5d6370}.kpi b{font-size:22px}" +
    "table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eceef2;vertical-align:top}th{color:#5d6370;font-weight:600;font-size:12px}td.n,th.n{text-align:right;white-space:nowrap}" +
    ".ok{color:#1aae6f;font-weight:600}.open{color:#5b6cf9}.muted{color:#8a90a0}.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.cols div{border:1px solid #e3e5ea;border-radius:12px;padding:10px 12px}.cols h3{margin:0 0 6px;font-size:13px}.cols ul{margin:0;padding-left:18px}" +
    ".ai{background:#f4f2ff;border-radius:12px;padding:10px 14px}" +
    ".ch{width:100%;height:auto}.ch-grid{stroke:#eceef2}.ch-base{stroke:#c9ccd4}.ch-ax{fill:#8a90a0;font-size:11px}.ch-hit{fill:transparent}.bd-ideal{stroke:#b8bcc6;stroke-width:2;stroke-dasharray:5 5}.bd-line{fill:none;stroke:#6c5ce7;stroke-width:2.5}.bd-dot{fill:#fff;stroke:#6c5ce7;stroke-width:2}.bd-fc{stroke:#f0a020;stroke-width:2;stroke-dasharray:2 5}.bd-today{stroke:#e84393;stroke-dasharray:2 3}.ch-tip{display:none}" +
    ".bd-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#5d6370;margin-top:6px}.bd-legend span{display:inline-flex;align-items:center;gap:6px}.bd-k{width:18px;border-top:2.5px solid #6c5ce7}.bd-k.ideal{border-top:2px dashed #b8bcc6}.bd-k.fc{border-top:2.5px dotted #f0a020}.bd-note{flex-basis:100%}" +
    ".bar{display:inline-block;width:120px;height:8px;border-radius:4px;background:#eceef2;overflow:hidden;vertical-align:middle;margin-right:8px}.bar i{display:block;height:100%;background:#1aae6f}" +
    ".print{position:fixed;top:16px;right:16px;padding:10px 16px;border:0;border-radius:10px;background:#6c5ce7;color:#fff;font:600 14px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px -8px #6c5ce7}" +
    "footer{margin-top:36px;color:#8a90a0;font-size:12px;border-top:1px solid #eceef2;padding-top:10px}@media print{.print{display:none}main{padding:0}h2{break-after:avoid}tr,.cols div{break-inside:avoid}}";
  SP.sprintReport = function (sp) {
    var tasks = db.sprintTasks(sp.id), st = sp.state === "done" && sp.result ? sp.result : db.sprintStats(sp.id), bd = X.burnData(sp, tasks), r = X.retroOf(sp), sc = db.sprintScope(sp.id);
    var h = X.healthOf(sp, bd), st8 = { planned: ["Zaplanowany", "#87909e"], active: ["Trwa", "#5b6cf9"], done: ["Zakończony", "#1aae6f"] }[sp.state] || ["", "#888"];
    var abs = function (p) { return new URL(p, location.href).href; };
    var who = function (t) { return t.assignees.map(X.personName).join(", ") || "—"; };
    var load = {};
    tasks.forEach(function (t) { (t.assignees.length ? t.assignees : ["_none"]).forEach(function (id) { var w = load[id] = load[id] || { n: 0, d: 0, p: 0, pd: 0 }; w.n++; w.p += Number(t.points) || 0; if (closed(t)) { w.d++; w.pd += Number(t.points) || 0; } }); });
    var rows = tasks.slice().sort(function (a, b) { return (closed(b) ? 1 : 0) - (closed(a) ? 1 : 0) || X.byImportance(a, b); });
    var list = function (a) { return a.length ? "<ul>" + a.map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("") + "</ul>" : '<p class="muted">—</p>'; };
    var html = '<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Raport – ' + esc(sp.name) + "</title><style>" + REPORT_CSS + "</style></head><body>" +
      '<button class="print" onclick="print()">Drukuj / zapisz PDF</button><main>' +
      '<header><img src="' + abs("img/logo.svg") + '" alt=""><div><h1>' + esc(sp.name) + '<span class="pill" style="background:' + st8[1] + '">' + st8[0] + "</span>" + (h ? '<span class="pill" style="background:' + X.HEALTH[h][1] + '">' + X.HEALTH[h][0] + "</span>" : "") + "</h1>" +
      '<div class="meta">' + esc((db.space(sp.spaceId) || {}).name || "") + " · " + X.range(sp.start, sp.end) + "</div>" + (sp.goal ? '<p class="goal">Cel: ' + esc(sp.goal) + "</p>" : "") + "</div></header>" +
      '<div class="kpis"><div class="kpi"><small>Punkty</small><b>' + st.pointsDone + " / " + st.points + '</b></div><div class="kpi"><small>Zadania</small><b>' + st.done + " / " + st.tasks + "</b></div>" +
      '<div class="kpi"><small>Plan na starcie</small><b>' + (sp.plan ? sp.plan.points + " pkt" : "—") + '</b></div><div class="kpi"><small>Dodane w trakcie</small><b>' + (sc.tasks ? "+" + sc.points + " pkt" : "0") + "</b></div></div>" +
      "<h2>Wykres spalania</h2>" + X.burndown(sp, bd) +
      "<h2>Obciążenie zespołu</h2><table><tr><th>Osoba</th><th>Postęp</th><th class=n>Zadania</th><th class=n>Punkty</th></tr>" + Object.keys(load).map(function (id) {
        var w = load[id]; return "<tr><td>" + esc(id === "_none" ? "Bez osoby" : X.personName(id)) + '</td><td><span class="bar"><i style="width:' + (w.p ? w.pd / w.p * 100 : w.n ? w.d / w.n * 100 : 0) + '%"></i></span></td><td class=n>' + w.d + " / " + w.n + "</td><td class=n>" + w.pd + " / " + w.p + "</td></tr>";
      }).join("") + "</table>" +
      "<h2>Zadania</h2><table><tr><th>Klucz</th><th>Zadanie</th><th>Status</th><th>Osoby</th><th class=n>Pkt</th><th class=n>Ukończone</th></tr>" + rows.map(function (t) {
        return "<tr><td class=muted>" + db.taskKey(t) + "</td><td>" + esc(t.title) + (sc.ids.indexOf(t.id) >= 0 ? ' <span class="muted">(dodane w trakcie)</span>' : "") + '</td><td class="' + (closed(t) ? "ok" : "open") + '">' + esc(db.status(t.status).name) + "</td><td>" + esc(who(t)) + "</td><td class=n>" + (t.points != null ? t.points : "—") + "</td><td class=n>" + (closed(t) && t.doneAt ? X.shortDate(D.ymd(new Date(t.doneAt))) : "") + "</td></tr>";
      }).join("") + "</table>" +
      (r.summary || r.good.length || r.bad.length || r.actions.length ? "<h2>" + (sp.state === "done" ? "Retrospektywa" : "Przegląd sprintu") + "</h2>" + (r.summary ? '<p class="ai">' + esc(r.summary) + "</p>" : "") +
        '<div class="cols"><div><h3>Co poszło dobrze</h3>' + list(r.good) + "</div><div><h3>Do poprawy</h3>" + list(r.bad) + "</div><div><h3>Działania</h3>" + list(r.actions) + "</div></div>" : "") +
      "<footer>Wygenerowano w Sprynt · " + new Date().toLocaleString("pl-PL") + " · " + esc(SP.user.name) + "</footer></main></body></html>";
    var w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })), "_blank");
    if (!w) SP.toast("Przeglądarka zablokowała nowe okno – zezwól na wyskakujące okna dla Sprynt");
  };

  /* =================== Notatki wydania =================== */
  function notesLocal(sp, done) {
    var by = {};
    done.forEach(function (t) { var k = (db.pathOf(t).list || {}).name || "Inne"; (by[k] = by[k] || []).push(t); });
    return { title: "Co nowego – " + sp.name, intro: "Ukończone w sprincie " + sp.name + " (" + X.range(sp.start, sp.end) + "): " + pl(done.length, "zmiana", "zmiany", "zmian") + ".",
      sections: Object.keys(by).map(function (k) { return { heading: k, items: by[k].map(function (t) { return t.title + " (" + db.taskKey(t) + ")"; }) }; }), highlights: [], local: true };
  }
  function notesMarkdown(n) {
    return ["# " + n.title, "", n.intro].concat(n.highlights.length ? ["", "**Najważniejsze:**"].concat(n.highlights.map(function (h) { return "- " + h; })) : [])
      .concat(n.sections.reduce(function (a, s) { return a.concat(["", "## " + s.heading]).concat(s.items.map(function (i) { return "- " + i; })); }, [])).join("\n");
  }
  function notesHTML(n) {
    return "<h1>" + esc(n.title) + "</h1><p>" + esc(n.intro) + "</p>" + (n.highlights.length ? "<p><b>Najważniejsze:</b></p><ul>" + n.highlights.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ul>" : "") +
      n.sections.map(function (s) { return "<h2>" + esc(s.heading) + "</h2><ul>" + s.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>"; }).join("");
  }
  SP.releaseNotes = function (sp, withAI) {
    var done = db.sprintTasks(sp.id).filter(closed);
    if (!done.length) { SP.toast("W sprincie nie ma jeszcze ukończonych zadań"); return; }
    var S = X.aiShell("Notatki wydania · " + sp.name, "Changelog z " + pl(done.length, "ukończonego zadania", "ukończonych zadań", "ukończonych zadań") + " – do wysłania zespołowi albo klientom.", "megaphone", { noGo: true, cls: "rn" });
    var N = notesLocal(sp, done), aud = "team";
    S.info.innerHTML = '<div class="seg" role="group" aria-label="Odbiorca"><button data-aud="team" aria-pressed="true">Dla zespołu</button><button data-aud="client" aria-pressed="false">Dla klienta</button></div><span class="rn-st muted">Wersja podstawowa – pogrupowana po listach.</span>';
    function draw() { S.body.innerHTML = '<article class="rn-doc">' + notesHTML(N) + '</article><p class="muted rn-md">' + SP.logo("markdown", 16, { alt: "" }) + "„Kopiuj” daje Markdown – wkleisz go do: " + ["github", "notion", "obsidian", "slack"].map(function (b) { return '<span class="rn-b">' + SP.logo(b, 14, { alt: "" }) + SP.BRANDS[b] + "</span>"; }).join("") + "</p>"; S.meta.textContent = N.local ? "" : "AI · " + X.modelLabel(N.model); }
    S.acts.innerHTML = '<button class="btn sm" data-doc>' + ico("file-text", 14) + 'Zapisz w Dokumentach</button><button class="btn sm" data-copy>' + ico("copy", 14) + 'Kopiuj</button><button class="btn sm" data-send>' + ico("send-horizontal", 14) + "Wyślij</button>" +
      '<button class="btn sm magic" data-ai>' + ico("sparkles", 14) + "<span>" + (X.aiOn() ? "Napisz z AI" : "Włącz AI") + "</span></button>";
    SP.hydrateIcons(S.bg);
    function askAI() {
      if (!X.aiOn()) { S.close(); X.goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby AI napisało notatki"); return; }
      var b = S.acts.querySelector("[data-ai]"); if (b.disabled) return;
      b.disabled = true; b.querySelector("span").textContent = "AI pisze…"; S.info.querySelector(".rn-st").innerHTML = X.spin("Claude czyta ukończone zadania…");
      SP.ai.releaseNotes({ sprint: sp, done: done, audience: aud }, function (snap) {
        var m = snap.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (m && S.open) S.info.querySelector(".rn-st").innerHTML = X.spin("Piszę: " + m[1].slice(0, 60));
      }).then(function (res) {
        if (!S.open) return; N = res; draw();
        S.info.querySelector(".rn-st").textContent = aud === "client" ? "Wersja AI dla klienta – bez żargonu i kluczy zadań." : "Wersja AI dla zespołu.";
        b.disabled = false; b.querySelector("span").textContent = "Jeszcze raz";
      }, function (err) {
        if (!S.open) return; b.disabled = false; b.querySelector("span").textContent = "Spróbuj ponownie";
        S.info.querySelector(".rn-st").innerHTML = '<span class="spr-err">' + esc(err.message || "Błąd AI") + "</span>";
      });
    }
    S.bg.addEventListener("click", function (e) {
      var b;
      if ((b = e.target.closest("[data-aud]"))) { aud = b.dataset.aud; S.info.querySelectorAll("[data-aud]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); if (!N.local) askAI(); else S.info.querySelector(".rn-st").textContent = aud === "client" ? "Dla klienta najlepiej napisze AI – kliknij „Napisz z AI”." : "Wersja podstawowa – pogrupowana po listach."; return; }
      if (e.target.closest("[data-ai]")) { askAI(); return; }
      if (e.target.closest("[data-copy]")) { (navigator.clipboard ? navigator.clipboard.writeText(notesMarkdown(N)) : Promise.reject()).then(function () { SP.toast("Skopiowano (Markdown)"); }, function () { SP.toast("Nie udało się skopiować"); }); return; }
      if ((b = e.target.closest("[data-send]"))) { SP.shareText(b, { subject: N.title, text: notesMarkdown(N).replace(/^#+ /gm, "").replace(/\*\*/g, "") }); return; }
      if (e.target.closest("[data-doc]")) {
        var d = db.createDoc(sp.spaceId, N.title); db.updateDoc(d.id, { body: notesHTML(N).replace(/^<h1>.*?<\/h1>/, "") });
        S.close(); location.hash = "#/doc/" + d.id; SP.toast("Zapisano notatki w Dokumentach");
      }
    });
    draw();
    if (withAI) askAI();
  };

  /* =================== Widżet na stronie głównej =================== */
  function spark(sp, bd) {
    if (!bd || !bd.total) return "";
    var W = 200, H = 54, x = function (i) { return 2 + i / bd.n * (W - 4); }, y = function (v) { return 4 + (1 - v / bd.total) * (H - 8); };
    var pts = bd.remaining.map(function (r, i) { return r == null ? null : x(i).toFixed(1) + "," + y(r).toFixed(1); }).filter(Boolean).join(" ");
    var last = bd.remaining.reduce(function (a, r, i) { return r == null ? a : i; }, 0);
    return '<svg class="hs-spark" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><line class="hs-ideal" x1="' + x(0) + '" y1="' + y(bd.total) + '" x2="' + x(bd.n) + '" y2="' + y(0) + '"/>' +
      (pts ? '<polyline class="hs-line" points="' + pts + '"/><circle class="hs-dot" cx="' + x(last) + '" cy="' + y(bd.remaining[last]) + '" r="3"/>' : "") + "</svg>";
  }
  function homeCard() {
    var act = db.raw.sprints.filter(function (x) { return x.state === "active"; }).slice(0, 3);
    var next = db.raw.sprints.filter(function (x) { return x.state === "planned"; }).sort(function (a, b) { return (a.start || "") < (b.start || "") ? -1 : 1; })[0];
    if (!act.length && !next) return "";
    return '<section class="card home-spr"><div class="card-h"><h2>' + (act.length ? "Trwające sprinty" : "Następny sprint") + '</h2><a class="card-link" href="#/sprints">Wszystkie</a></div><div class="card-b">' +
      act.map(function (sp) {
        var ts = db.sprintTasks(sp.id), st = db.sprintStats(sp.id), bd = X.burnData(sp, ts), h = X.healthOf(sp, bd), left = X.isDay(sp.end) ? X.daysBetween(D.today(), sp.end) : null;
        var p = st.points ? st.pointsDone / st.points : st.tasks ? st.done / st.tasks : 0;
        return '<div class="hs"><a class="hs-main" href="#/sprint/' + sp.id + '"><b>' + esc(sp.name) + "</b>" + (h ? X.healthPill(h) : "") + '<small class="muted">' + esc((db.space(sp.spaceId) || {}).name || "") + (left != null ? " · " + (left < 0 ? "po terminie" : left === 0 ? "kończy się dziś" : "zostało " + pl(left, "dzień", "dni", "dni")) : "") + "</small>" +
          (sp.goal ? '<small class="hs-goal">' + ico("target", 12) + esc(sp.goal) + "</small>" : "") + "</a>" + spark(sp, bd) +
          '<div class="hs-foot"><span class="spr-bar"><i style="width:' + Math.round(p * 100) + '%"></i></span><small>' + (st.points ? st.pointsDone + " / " + st.points + " pkt" : st.done + " / " + st.tasks + " zad.") + '</small><button class="chip-btn sm" data-hs-su="' + sp.id + '">' + ico("users", 12) + "Stand-up</button></div></div>";
      }).join("") +
      (!act.length && next ? '<a class="hs hs-next" href="#/sprint/' + next.id + '"><b>' + esc(next.name) + "</b>" + X.statePill(next) + '<small class="muted">' + X.range(next.start, next.end) + " · " + pl(db.sprintTasks(next.id).length, "zadanie", "zadania", "zadań") + "</small></a>" : "") +
      "</div></section>";
  }
  var baseHome = SP.views.home && SP.views.home.render;
  if (baseHome) SP.views.home.render = function (el) {
    baseHome.apply(this, arguments);
    var html = homeCard(), grid = el.querySelector(".home-grid"); if (!html || !grid) return;
    var card = SP.el(html), ref = grid.children[2] || null; grid.insertBefore(card, ref); SP.hydrateIcons(card);
    card.addEventListener("click", function (e) { var b = e.target.closest("[data-hs-su]"); if (b) { e.preventDefault(); SP.sprintStandup(b.dataset.hsSu); } });
  };

  /* =================== Przypomnienia w Skrzynce =================== */
  function alerts() {
    var today = D.today();
    db.raw.sprints.forEach(function (sp) {
      if (sp.state !== "active" || !X.isDay(sp.end)) return;
      var n = sp.notified || {}, left = X.daysBetween(today, sp.end), open = db.sprintTasks(sp.id).filter(function (t) { return !closed(t); }), add = {};
      var href = "#/sprint/" + sp.id;
      if (left === 1 && !n.d1) { add.d1 = 1; db.notify("„" + sp.name + "” kończy się jutro – " + pl(open.length, "otwarte zadanie", "otwarte zadania", "otwartych zadań") + ". Dobry moment na stand-up i decyzję, co przenieść.", { href: href }); }
      if (left <= 0 && !n.end) { add.end = 1; db.notify("„" + sp.name + "” " + (left === 0 ? "kończy się dziś" : "jest po terminie") + " – zakończ sprint i zróbcie retrospektywę.", { href: href }); }
      if (left > 1 && !n.risk) {
        var bd = X.burnData(sp, db.sprintTasks(sp.id));
        if (X.healthOf(sp, bd) === "off_track" && bd.ti >= 2 && bd.fc) { add.risk = 1; db.notify("„" + sp.name + "” jest opóźniony – w obecnym tempie na koniec zostanie ok. " + Math.round(bd.fc.end) + (bd.usePts ? " pkt" : " zad.") + ". Rozważ zmniejszenie zakresu.", { href: href }); }
      }
      if (Object.keys(add).length) db.updateSprint(sp.id, { notified: Object.assign({}, n, add) });
    });
  }
  setTimeout(alerts, 2500);
  setInterval(alerts, 10 * 60 * 1000);

  /* =================== Skróty w widoku sprintu =================== */
  var lastKey = { k: "", t: 0 };
  document.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase(), prev = lastKey; lastKey = { k: k, t: Date.now() };
    var m = /^#\/sprint\/([^/]+)/.exec(location.hash); if (!m) return;
    var a = document.activeElement, typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".popover,.dlg-bg,.sx-bg,.tm-bg,.pal-bg:not([hidden])")) return;
    if (prev.k === "g" && Date.now() - prev.t < 1200) return; // „G, R” = przejście do Sprintów (app.js)
    var sp = db.sprint(m[1]); if (!sp) return;
    var run = { s: function () { if (sp.state === "active") X.standupDialog(sp); else SP.toast("Stand-up jest dla trwającego sprintu"); },
      a: function () { if (sp.state !== "done") X.addTasksDialog(sp); }, p: function () { SP.planningPoker(sp); }, r: function () { SP.sprintReport(sp); },
      w: function () { SP.releaseNotes(sp); }, i: function () { if (X.aiOn()) X.askDialog(sp); else { X.goAiSettings(); SP.toast("Dodaj klucz API Claude, żeby pytać AI"); } } }[k];
    if (run) { e.preventDefault(); run(); }
  });
})();
