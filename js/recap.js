/* Sprynt – podsumowanie tygodnia w formie „historii” (jak relacje): 5 plansz, pasek postępu u góry,
 * odliczane liczby, rosnące słupki, podium zespołu, na koniec konfetti. Kliknięcie w prawą/lewą część = dalej/wstecz,
 * spacja/przytrzymanie = pauza, Esc zamyka. SP.weekRecap() – z palety, Strony głównej i Pulpitu. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, esc = SP.esc, ico = SP.ico;
  if (!db) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var D = SP.date, DUR = 6000;
  var plural = function (n, one, few, many) { return n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many; };
  var dayOf = function (iso) { return D.ymd(new Date(iso)); };

  /** Dane z ostatnich 7 dni (dziś włącznie) + porównanie z poprzednimi 7. */
  function stats() {
    var today = D.today(), from = D.add(today, -6), prevFrom = D.add(today, -13);
    var days = []; for (var i = 6; i >= 0; i--) days.push(D.add(today, -i));
    var tasks = db.raw.tasks, done = [], prev = 0, byDay = {}, people = {};
    tasks.forEach(function (t) {
      if (!t.doneAt || !db.status(t.status).closed) return;
      var d = dayOf(t.doneAt);
      if (d >= from && d <= today) { done.push(t); byDay[d] = (byDay[d] || 0) + 1; (t.assignees.length ? t.assignees : ["none"]).forEach(function (p) { people[p] = (people[p] || 0) + 1; }); }
      else if (d >= prevFrom && d < from) prev++;
    });
    var created = tasks.filter(function (t) { var d = dayOf(t.createdAt); return d >= from && d <= today; }).length;
    var time = 0, timeBy = {}, start = new Date(from + "T00:00:00").getTime();
    tasks.forEach(function (t) {
      (t.time || []).forEach(function (e) {
        var s = new Date(e.start).getTime(), en = e.end ? new Date(e.end).getTime() : Date.now();
        if (en < start) return; var ms = en - Math.max(s, start); if (ms <= 0) return;
        time += ms; timeBy[t.id] = (timeBy[t.id] || 0) + ms;
      });
    });
    var topTimeId = Object.keys(timeBy).sort(function (a, b) { return timeBy[b] - timeBy[a]; })[0];
    var comments = 0; tasks.forEach(function (t) { (t.comments || []).forEach(function (c) { if (c.at && dayOf(c.at) >= from) comments++; }); });
    var best = days.reduce(function (b, d) { return (byDay[d] || 0) > (byDay[b] || 0) ? d : b; }, days[days.length - 1]);
    var next = tasks.filter(function (t) { return t.due && !db.status(t.status).closed && t.due >= today && t.due <= D.add(today, 7) && !t.parentId; })
      .sort(function (a, b) { var r = { urgent: 0, high: 1, normal: 2, low: 3 }; return (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || (r[a.priority] == null ? 9 : r[a.priority]) - (r[b.priority] == null ? 9 : r[b.priority]); });
    var overdue = tasks.filter(function (t) { return t.due && t.due < today && !db.status(t.status).closed && !t.parentId; }).length;
    var team = Object.keys(people).filter(function (p) { return p !== "none" && db.person(p); }).sort(function (a, b) { return people[b] - people[a]; }).slice(0, 3);
    var hardest = done.slice().sort(function (a, b) { var r = { urgent: 0, high: 1, normal: 2, low: 3 }; return (r[a.priority] == null ? 9 : r[a.priority]) - (r[b.priority] == null ? 9 : r[b.priority]) || db.subtasks(b.id).length - db.subtasks(a.id).length; })[0];
    return { from: from, today: today, days: days, done: done, prev: prev, byDay: byDay, best: best, created: created, time: time, topTime: topTimeId && db.task(topTimeId), topTimeMs: topTimeId ? timeBy[topTimeId] : 0, comments: comments, next: next, overdue: overdue, team: team, people: people, hardest: hardest };
  }
  var fmtDay = function (d, o) { return new Date(d + "T00:00:00").toLocaleDateString("pl-PL", o); };

  function slides(s) {
    var n = s.done.length, delta = n - s.prev, max = Math.max.apply(null, s.days.map(function (d) { return s.byDay[d] || 0; }).concat([1]));
    var out = [];
    out.push({ cls: "r-intro", html: '<div class="rc-kick">' + ico("trophy", 18) + "Twój tydzień w Sprynt</div>" +
      '<div class="rc-range">' + fmtDay(s.from, { day: "numeric", month: "long" }) + " – " + fmtDay(s.today, { day: "numeric", month: "long" }) + "</div>" +
      '<div class="rc-big" data-count="' + n + '">' + n + "</div><div class=\"rc-sub\">" + plural(n, "ukończone zadanie", "ukończone zadania", "ukończonych zadań") + "</div>" +
      '<div class="rc-delta ' + (delta > 0 ? "up" : delta < 0 ? "down" : "") + '">' + (s.prev || n ? (delta > 0 ? "▲ " + delta + " więcej niż tydzień wcześniej" : delta < 0 ? "▼ " + -delta + " mniej niż tydzień wcześniej" : "tyle samo co tydzień wcześniej") : "Pierwszy tydzień – dobry start!") + "</div>" +
      '<div class="rc-mini"><span><b data-count="' + s.created + '">' + s.created + "</b> " + plural(s.created, "nowe zadanie", "nowe zadania", "nowych zadań") + "</span><span><b data-count=\"" + s.comments + '">' + s.comments + "</b> " + plural(s.comments, "komentarz", "komentarze", "komentarzy") + "</span></div>" });
    out.push({ cls: "r-days", html: '<div class="rc-kick">' + ico("chart-column", 18) + "Najlepszy dzień</div>" +
      "<h2>" + (s.byDay[s.best] ? cap(fmtDay(s.best, { weekday: "long" })) + " – " + s.byDay[s.best] + " " + plural(s.byDay[s.best], "zadanie", "zadania", "zadań") : "Ten tydzień dopiero się rozkręca") + "</h2>" +
      '<div class="rc-bars">' + s.days.map(function (d, i) {
        var v = s.byDay[d] || 0;
        return '<div class="rc-bar' + (d === s.best && v ? " best" : "") + '" style="--h:' + Math.max(4, v / max * 100) + "%;--i:" + i + '"><b>' + v + "</b><i></i><span>" + fmtDay(d, { weekday: "short" }) + "</span></div>";
      }).join("") + "</div>" });
    var h = Math.floor(s.time / 36e5), m = Math.round(s.time % 36e5 / 6e4);
    out.push({ cls: "r-time", html: '<div class="rc-kick">' + ico("clock", 18) + "Czas pracy</div>" +
      (s.time >= 6e4 ? '<div class="rc-big"><span data-count="' + h + '">' + h + '</span><small>h</small> <span data-count="' + m + '">' + m + "</span><small>min</small></div>" +
        '<div class="rc-sub">zarejestrowane stoperem i ręcznie</div>' + (s.topTime ? '<div class="rc-card">' + SP.statusDot(s.topTime.status) + "<span><small>Najwięcej czasu</small><b>" + esc(s.topTime.title) + "</b></span><em>" + db.fmtDuration(s.topTimeMs) + "</em></div>" : "")
        : '<div class="rc-big rc-zero">' + ico("play", 40) + '</div><div class="rc-sub">W tym tygodniu nie mierzyłeś(-aś) czasu.<br>Kliknij ▶ przy zadaniu albo włącz tryb skupienia – następne podsumowanie pokaże, na co idzie Twój czas.</div>') });
    out.push({ cls: "r-team", html: '<div class="rc-kick">' + ico("users", 18) + "Zespół tygodnia</div>" +
      (s.team.length ? '<div class="rc-podium">' + [1, 0, 2].map(function (k) {
        var p = s.team[k]; if (!p) return '<div class="rc-pod empty"></div>';
        return '<div class="rc-pod p' + (k + 1) + '" style="--i:' + k + '">' + SP.avatar(p, "lg") + "<b>" + esc(db.person(p).name.split(" ")[0]) + "</b><div class=\"rc-step\"><span>" + (k + 1) + "</span><small>" + s.people[p] + " " + plural(s.people[p], "zadanie", "zadania", "zadań") + "</small></div></div>";
      }).join("") + "</div>" : '<h2>Jeszcze nikt nie ukończył zadania w tym tygodniu</h2><p class="rc-sub">Zaproś zespół i przypisuj zadania – tu pojawi się podium.</p>') +
      (s.hardest ? '<div class="rc-card">' + SP.flag(s.hardest.priority) + "<span><small>Najważniejsze ukończone</small><b>" + esc(s.hardest.title) + "</b></span></div>" : "") });
    out.push({ cls: "r-next", html: '<div class="rc-kick">' + ico("rocket", 18) + "Następny tydzień</div>" +
      "<h2>" + (s.next.length ? s.next.length + " " + plural(s.next.length, "zadanie czeka", "zadania czekają", "zadań czeka") + " na Ciebie" : "Czysto! Nic nie ma terminu w najbliższym tygodniu") + "</h2>" +
      (s.overdue ? '<div class="rc-warn">' + s.overdue + " " + plural(s.overdue, "zaległe zadanie", "zaległe zadania", "zaległych zadań") + " – warto je przejrzeć</div>" : "") +
      '<div class="rc-list">' + s.next.slice(0, 4).map(function (t, i) { var d = SP.fmtDue(t.due); return '<button class="rc-row" data-open="' + t.id + '" style="--i:' + i + '">' + SP.statusDot(t.status) + "<span>" + esc(t.title) + '</span><em class="due ' + d.cls + '">' + d.label + "</em></button>"; }).join("") + "</div>" +
      '<div class="rc-acts"><a class="btn primary" href="#/my-tasks" data-close>' + ico("list-checks", 16) + 'Moje zadania</a><button class="btn" data-share>' + ico("copy", 16) + "Kopiuj podsumowanie</button></div>", final: true });
    return out;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function textSummary(s) {
    return ["Mój tydzień w Sprynt (" + fmtDay(s.from, { day: "numeric", month: "short" }) + " – " + fmtDay(s.today, { day: "numeric", month: "short" }) + "):",
      "✅ Ukończone: " + s.done.length + (s.prev ? " (tydzień wcześniej: " + s.prev + ")" : ""),
      "🆕 Nowe zadania: " + s.created,
      s.time >= 6e4 ? "⏱ Czas pracy: " + db.fmtDuration(s.time) : "",
      s.byDay[s.best] ? "📈 Najlepszy dzień: " + fmtDay(s.best, { weekday: "long" }) + " (" + s.byDay[s.best] + ")" : "",
      "📅 Na następny tydzień: " + s.next.length + (s.overdue ? ", zaległe: " + s.overdue : ""),
    ].concat(s.done.slice(0, 10).map(function (t) { return "  • " + t.title; })).filter(Boolean).join("\n");
  }

  var R = null;
  SP.weekRecap = function () {
    if (R) return;
    var s = stats(), list = slides(s);
    var bg = SP.el('<div class="rc-bg" role="dialog" aria-modal="true" aria-label="Podsumowanie tygodnia"><div class="rc">' +
      '<div class="rc-prog">' + list.map(function () { return "<i><b></b></i>"; }).join("") + "</div>" +
      '<button class="rc-x" data-close aria-label="Zamknij">' + ico("x", 20) + "</button>" +
      '<div class="rc-stage"></div><button class="rc-nav prev" data-nav="-1" aria-label="Wstecz"></button><button class="rc-nav next" data-nav="1" aria-label="Dalej"></button>' +
      '<div class="rc-hint">Kliknij, żeby przejść dalej · spacja = pauza</div></div></div>');
    R = { bg: bg, i: -1, list: list, s: s, t0: 0, paused: false, elapsed: 0, timer: null };
    document.body.appendChild(bg); SP.hydrateIcons(bg);
    bg.addEventListener("click", function (e) {
      var b;
      if (e.target.closest("[data-close]")) { close(); return; }
      if ((b = e.target.closest("[data-open]"))) { var id = b.dataset.open; close(); SP.openTask(id); return; }
      if (e.target.closest("[data-share]")) { var txt = textSummary(R.s); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { SP.toast("Skopiowano – wklej na czacie albo w mailu"); }, function () { SP.toast("Nie udało się skopiować"); }); return; }
      if ((b = e.target.closest("[data-nav]"))) go(R.i + Number(b.dataset.nav));
    });
    var hold = function () { if (!R) return; pause(); if (R.paused) R.held = true; };
    bg.querySelector(".rc-stage").addEventListener("pointerdown", function (e) { if (!e.target.closest("button,a")) hold(); });
    bg.addEventListener("pointerup", function () { if (R && R.held) { R.held = false; resume(); } });
    document.addEventListener("keydown", onKey, true);
    go(0);
  };
  function onKey(e) {
    if (!R) return;
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(R.i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(R.i - 1); }
    else if (e.key === " ") { e.preventDefault(); R.paused ? resume() : pause(); }
    else return;
    e.stopPropagation();
  }
  function close() { if (!R) return; clearTimeout(R.timer); R.bg.remove(); R = null; document.removeEventListener("keydown", onKey, true); }
  function bars() {
    R.bg.querySelectorAll(".rc-prog i").forEach(function (el, k) {
      var b = el.firstChild; b.getAnimations && b.getAnimations().forEach(function (a) { a.cancel(); });
      b.style.transform = k < R.i ? "scaleX(1)" : "scaleX(0)";
    });
  }
  function go(i) {
    if (!R) return;
    if (i < 0) i = 0;
    if (i >= R.list.length) { close(); return; }
    var dir = i >= R.i ? 1 : -1; R.i = i; R.elapsed = 0; R.paused = false; R.bg.classList.remove("paused");
    var sl = R.list[i], st = R.bg.querySelector(".rc-stage");
    R.bg.querySelector(".rc").className = "rc " + sl.cls;
    st.innerHTML = '<div class="rc-slide">' + sl.html + "</div>"; SP.hydrateIcons(st);
    var slide = st.firstChild;
    if (!reduce) {
      slide.animate([{ opacity: 0, transform: "translateX(" + 30 * dir + "px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
      slide.querySelectorAll("[data-count]").forEach(countUp);
    }
    if (sl.final && R.s.done.length && SP.celebrate) setTimeout(function () { if (R && R.i === i) SP.celebrate(innerWidth / 2, innerHeight / 3, 46); }, 450);
    if (i === 0 && R.s.done.length >= 5 && SP.celebrate && !reduce) setTimeout(function () { if (R && R.i === 0) SP.celebrate(innerWidth / 2, innerHeight / 2.4, 30); }, 900);
    bars(); run();
  }
  function run() {
    clearTimeout(R.timer);
    if (R.list[R.i].final) { var b0 = R.bg.querySelectorAll(".rc-prog i b")[R.i]; b0.style.transform = "scaleX(1)"; return; }
    var b = R.bg.querySelectorAll(".rc-prog i b")[R.i], left = DUR - R.elapsed;
    R.t0 = Date.now();
    if (!reduce && b.animate) R.anim = b.animate([{ transform: "scaleX(" + R.elapsed / DUR + ")" }, { transform: "scaleX(1)" }], { duration: left, easing: "linear", fill: "forwards" });
    else b.style.transform = "scaleX(1)";
    var me = R.i;
    R.timer = setTimeout(function () { if (R && R.i === me && !R.paused) go(me + 1); }, left);
  }
  function pause() { if (!R || R.paused || R.list[R.i].final) return; R.paused = true; R.elapsed += Date.now() - R.t0; clearTimeout(R.timer); if (R.anim) R.anim.pause(); R.bg.classList.add("paused"); }
  function resume() { if (!R || !R.paused) return; R.paused = false; R.bg.classList.remove("paused"); if (R.anim) R.anim.cancel(); run(); }
  function countUp(el) {
    var target = Number(el.dataset.count); if (!target) return;
    var t0 = performance.now(), dur = 1100;
    (function step() {
      var p = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.nodeValue = String(Math.round(target * e)) : el.textContent = String(Math.round(target * e));
      if (p < 1) setTimeout(step, 16);
    })();
  }
  SP._recapStats = stats;
})();
