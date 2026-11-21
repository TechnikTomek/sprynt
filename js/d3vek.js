/* Sprynt – D3vek: mały niebieski pomocnik w rogu aplikacji (ten sam przyjaciel co w aplikacji D3vek na Maca i Windows).
 *  - oczy patrzą za kursorem, mruga, oddycha, po najechaniu się cieszy (rumieńce + uśmiech), dwuklik = salto,
 *    po 2 min bez ruchu zasypia, przeciągnięciem można go przenieść (pozycja w db.raw.ui.d3);
 *  - kliknięcie otwiera rozmowę: polecenia po polsku („wyciągnij zadania z pliku”, „co mam dziś?”, „dodaj zadanie …”,
 *    „rozbij zadanie”, „podsumowanie tygodnia”…), bez AI działa na regułach, z kluczem AI odpowiada też na wolne pytania;
 *  - plik upuszczony na D3vka (albo wybrany w rozmowie): D3vek skacze na dokument, wchodzi do środka, przekopuje linie
 *    i wyrzuca znalezione zadania jako karty, wyskakuje z powrotem – potem otwiera się zwykły przegląd „Zadań z pliku”;
 *  - cieszy się z ukończonych zadań (owija SP.celebrate) i co jakiś czas podsuwa wskazówkę.
 * Wyłączenie: Ustawienia → D3vek (db.raw.ui.d3off). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, esc = SP.esc, ico = SP.ico;
  if (!db) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var X = SP._extract || {};
  var plural = function (n, one, few, many) { return n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many; };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var first = function () { return SP.user.name.split(" ")[0]; };

  var BODY = '<div class="d3-shadow"></div><div class="d3-body"><i class="d3-eye l"></i><i class="d3-eye r"></i><i class="d3-blush l"></i><i class="d3-blush r"></i><i class="d3-smile"></i></div>';
  var POKE = ["Hej! 👋", "Miło Cię widzieć!", "Hihi, łaskocze!", "Jestem D3vek!", "Bip bup! 🤖", "Dasz radę! 💪", "W czym pomóc? 💙"];
  var TIPS = [
    "Wpisz „jutro @Anna !pilne #klient” w nazwie zadania – sam rozpoznam termin, osobę i priorytet ✨",
    "Upuść na mnie plik – wejdę do środka i wygrzebię z niego zadania 📄",
    "Wklej kilka linii w pole „Dodaj zadanie” – każda zostanie osobnym zadaniem.",
    "Duże zadanie? Otwórz je i kliknij „Rozbij zadanie” 🪓",
    "Zajrzyj do podsumowania tygodnia – mam tam wykresy! 📈",
    "Pamiętaj o przerwie 👀", "Napij się wody 💧", "Świetnie Ci idzie!",
  ];

  var el, body, bubble, panel = null, state = { happy: false, sleep: false, busy: false, lastMove: Date.now(), hist: [] };
  function off() { return !!db.raw.ui.d3off; }

  /* =================== Postać =================== */
  function mount() {
    if (el || off()) return;
    if (document.querySelector(".ob-bg")) { setTimeout(mount, 800); return; } // najpierw kreator konfiguracji
    el = SP.el('<div class="d3" id="d3vek" role="button" tabindex="0" aria-label="D3vek – pomocnik. Kliknij, żeby porozmawiać. Upuść plik, żeby wyciągnąć zadania." title="D3vek – kliknij albo upuść plik">' + BODY + '<div class="d3-bubble" hidden></div><div class="d3-drop">' + ico("file-dropzone", 16) + "Upuść – wygrzebię zadania!</div></div>");
    body = el.querySelector(".d3-body"); bubble = el.querySelector(".d3-bubble");
    var pos = db.raw.ui.d3;
    if (pos && pos.r != null) { el.style.right = clamp(pos.r, 8, innerWidth - 90) + "px"; el.style.bottom = clamp(pos.b, 8, innerHeight - 70) + "px"; }
    document.body.appendChild(el);
    bind();
    if (!reduce) el.animate([{ transform: "translateY(80px) scale(.4)", opacity: 0 }, { transform: "translateY(-10px) scale(1.08)", opacity: 1, offset: .7 }, { transform: "none" }], { duration: 700, easing: "cubic-bezier(.2,.9,.3,1.2)" });
    setTimeout(function () { say(db.isEmpty() ? "Cześć, " + first() + "! Jestem D3vek 💙 Kliknij mnie, gdy będziesz potrzebować pomocy." : pick(["Cześć, " + first() + "! 💙", "Witaj z powrotem! 👋", "Do roboty? Pomogę! 💪"]), 4200); }, 900);
    blinkLoop(); lookLoop(); chatterLoop();
  }
  function unmount() { if (!el) return; el.remove(); el = null; closePanel(); }
  SP.d3vek = { show: function () { db.raw.ui.d3off = false; db.saveUi(); mount(); }, hide: function () { db.raw.ui.d3off = true; db.saveUi(); unmount(); }, say: function (t, ms) { say(t, ms); }, jump: function () { jump(); }, digFile: function (f, o) { digFile(f, o); } };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function say(text, ms) {
    if (!el) return;
    bubble.textContent = text; bubble.hidden = false;
    bubble.classList.remove("in"); void bubble.offsetWidth; bubble.classList.add("in");
    clearTimeout(say.t); say.t = setTimeout(function () { if (bubble) bubble.hidden = true; }, ms || 3200);
  }
  function setHappy(on) { state.happy = on; if (el) el.classList.toggle("happy", on); }
  function wake() { state.lastMove = Date.now(); if (state.sleep) { state.sleep = false; el && el.classList.remove("sleep"); } }
  function jump(big) {
    if (!el || reduce) return;
    var h = big ? 46 : 26;
    body.animate([{ transform: "none" }, { transform: "scale(1.12,.84)", offset: .15 }, { transform: "translateY(-" + h + "px) scale(.92,1.1)", offset: .45 }, { transform: "scale(1.1,.88)", offset: .8 }, { transform: "none" }], { duration: big ? 720 : 560, easing: "ease-out" });
  }
  function salto() {
    if (!el || reduce) return;
    body.animate([{ transform: "none" }, { transform: "scale(1.12,.84)", offset: .12 }, { transform: "translateY(-54px) rotate(-180deg)", offset: .5 }, { transform: "translateY(0) rotate(-360deg) scale(1.1,.88)", offset: .85 }, { transform: "rotate(-360deg)" }], { duration: 900, easing: "ease-in-out" });
  }
  function shake() { if (el && !reduce) body.animate([{ transform: "none" }, { transform: "translateX(-5px) rotate(-3deg)" }, { transform: "translateX(5px) rotate(3deg)" }, { transform: "translateX(-3px)" }, { transform: "none" }], { duration: 450 }); }

  function blinkLoop() {
    setTimeout(function () {
      if (!el) return;
      if (!state.sleep) { el.classList.add("blink"); setTimeout(function () { el && el.classList.remove("blink"); }, 140); if (Math.random() < .2) setTimeout(function () { if (el) { el.classList.add("blink"); setTimeout(function () { el && el.classList.remove("blink"); }, 120); } }, 260); }
      blinkLoop();
    }, 2200 + Math.random() * 3500);
  }
  var mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  document.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; wake(); }, { passive: true });
  document.addEventListener("keydown", wake, true);
  function lookLoop() {
    if (!el) return;
    var r = body.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = mouse.x - cx, dy = mouse.y - cy, d = Math.max(60, Math.hypot(dx, dy));
    var lx = state.sleep ? 0 : clamp(dx / d, -1, 1), ly = state.sleep ? 0 : clamp(dy / d, -1, 1);
    el.style.setProperty("--lx", (lx * 4.5).toFixed(2) + "px"); el.style.setProperty("--ly", (ly * 3.2).toFixed(2) + "px");
    if (!state.sleep && !state.busy && !panel && Date.now() - state.lastMove > 120000) { state.sleep = true; el.classList.add("sleep"); }
    setTimeout(lookLoop, 50);
  }
  function chatterLoop() {
    setTimeout(function () {
      if (!el) return;
      if (!state.sleep && !panel && !state.busy && !document.querySelector(".tm-bg,.dlg-bg,.xt-bg,.pt-bg,.sx-bg,.rc-bg,.ob-bg") && !document.hidden) { say(pick(TIPS), 6500); jump(); }
      chatterLoop();
    }, 150000 + Math.random() * 120000);
  }

  function bind() {
    var down = null, moved = false, clicks = [];
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || state.busy) return;
      down = { x: e.clientX, y: e.clientY, r: parseFloat(getComputedStyle(el).right), b: parseFloat(getComputedStyle(el).bottom) }; moved = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* zdarzenie syntetyczne */ }
    });
    el.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; el.classList.add("drag"); closePanel();
      el.style.right = clamp(down.r - dx, 4, innerWidth - 84) + "px"; el.style.bottom = clamp(down.b - dy, 4, innerHeight - 64) + "px";
    });
    el.addEventListener("pointerup", function () {
      if (!down) return; down = null; el.classList.remove("drag");
      if (moved) { db.raw.ui.d3 = { r: parseFloat(el.style.right), b: parseFloat(el.style.bottom) }; db.saveUi(); say("Tu mi dobrze 😊", 1800); return; }
      wake();
      var now = Date.now(); clicks = clicks.filter(function (t) { return now - t < 1500; }); clicks.push(now);
      if (clicks.length >= 6) { clicks = []; dizzy(); return; }
      if (clicks.length === 2 && now - clicks[0] < 350) { closePanel(); salto(); say(pick(["Hop! 🤸", "Wiiii!", "Salto! ✨"]), 1600); return; }
      setTimeout(function () { if (clicks.length === 1 && Date.now() - clicks[0] >= 330) { togglePanel(); } }, 340);
    });
    el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePanel(); } });
    el.addEventListener("pointerenter", function () { setHappy(true); });
    el.addEventListener("pointerleave", function () { if (!panel) setHappy(false); });
    // upuszczenie pliku na D3vka
    var isFile = function (e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0; };
    el.addEventListener("dragenter", function (e) { if (isFile(e)) { e.preventDefault(); el.classList.add("over"); setHappy(true); } });
    el.addEventListener("dragover", function (e) { if (isFile(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
    el.addEventListener("dragleave", function (e) { if (!el.contains(e.relatedTarget)) { el.classList.remove("over"); setHappy(false); } });
    el.addEventListener("drop", function (e) { if (!isFile(e)) return; e.preventDefault(); e.stopPropagation(); el.classList.remove("over"); var f = e.dataTransfer.files[0]; if (f) digFile(f); });
    // podczas przeciągania pliku nad oknem D3vek macha i pokazuje „upuść tutaj”
    var dragT;
    document.addEventListener("dragover", function (e) { if (!el || !isFile(e) || state.busy) return; el.classList.add("file-near"); clearTimeout(dragT); dragT = setTimeout(function () { el && el.classList.remove("file-near"); }, 400); });
  }
  function dizzy() { if (!el) return; el.classList.add("dizzy"); say("Kręci mi się w głowie… 😵‍💫", 2600); shake(); setTimeout(function () { el && el.classList.remove("dizzy"); }, 2600); }

  // Reakcje na zdarzenia w aplikacji
  setTimeout(function () {
    var orig = SP.celebrate;
    // anim.js woła SP.celebrate(null, null, n) przy ukończeniu zadania; inne wywołania podają współrzędne
    if (orig) SP.celebrate = function (x) { var r = orig.apply(this, arguments); if (x != null) { if (el && !state.busy) { jump(true); } return r; } if (el && !state.busy) { jump(true); setHappy(true); say(pick(["Brawo! 🎉", "Jedno mniej! ✅", "Super robota! 💪", "Tak trzymaj! ✨", "Hura! 🥳"]), 2400); setTimeout(function () { if (!panel) setHappy(false); }, 2400); } return r; };
  }, 0);

  /* =================== Rozmowa =================== */
  var CHIPS = [["file", "📄 Wygrzeb zadania z pliku"], ["today", "☀️ Co mam dziś?"], ["plan", "🗺️ Zaplanuj mój dzień"], ["overdue", "⏰ Zaległe"], ["add", "➕ Dodaj zadanie"], ["paste", "📋 Wiele zadań z listy"], ["split", "🪓 Rozbij zadanie"], ["recap", "🏆 Podsumowanie tygodnia"]];
  function togglePanel() { panel ? closePanel() : openPanel(); }
  function openPanel() {
    if (!el || panel) return;
    setHappy(true); jump();
    panel = SP.el('<div class="d3p" role="dialog" aria-label="Rozmowa z D3vkiem"><header class="d3p-h"><span class="d3 d3-mini happy">' + BODY + '</span><div><b>D3vek</b><small>' + (SP.ai && SP.ai.enabled() ? "pomocnik · AI włączone" : "pomocnik · polecenia po polsku") + '</small></div><button class="ibtn" data-x aria-label="Zamknij">' + ico("x", 16) + "</button></header>" +
      '<div class="d3p-msgs" aria-live="polite"></div><div class="d3p-chips">' + CHIPS.map(function (c) { return '<button class="d3p-chip" data-c="' + c[0] + '">' + c[1] + "</button>"; }).join("") + "</div>" +
      '<form class="d3p-in"><input placeholder="Napisz do D3vka… np. dodaj zadanie raport jutro !pilne" autocomplete="off" maxlength="500" /><button class="ibtn" type="submit" aria-label="Wyślij">' + ico("send-horizontal", 16) + "</button></form></div>");
    document.body.appendChild(panel); SP.hydrateIcons(panel);
    place();
    if (!state.hist.length) bot(greeting());
    else state.hist.forEach(function (m) { addMsg(m.who, m.html, true); });
    panel.querySelector("[data-x]").onclick = closePanel;
    panel.addEventListener("click", function (e) { var c = e.target.closest("[data-c]"); if (c) { userMsg(c.textContent); run(c.dataset.c, ""); } var t = e.target.closest("[data-open]"); if (t) { SP.openTask(t.dataset.open); } var a = e.target.closest("[data-act]"); if (a) act(a.dataset.act); });
    panel.querySelector("form").addEventListener("submit", function (e) { e.preventDefault(); var i = e.target.querySelector("input"), v = i.value.trim(); if (!v) return; i.value = ""; userMsg(esc(v)); understand(v); });
    document.addEventListener("keydown", panelKey, true);
    document.addEventListener("pointerdown", outside, true);
    setTimeout(function () { panel && panel.querySelector("input").focus(); }, 50);
  }
  function place() {
    if (!panel || !el) return;
    var r = el.getBoundingClientRect(), w = Math.min(360, innerWidth - 24);
    panel.style.width = w + "px";
    panel.style.left = clamp(r.right - w, 12, innerWidth - w - 12) + "px";
    var above = r.top > 420;
    panel.style.top = above ? "" : Math.min(r.bottom + 10, innerHeight - 200) + "px";
    panel.style.bottom = above ? (innerHeight - r.top + 12) + "px" : "";
  }
  function outside(e) { if (panel && !panel.contains(e.target) && !el.contains(e.target) && !e.target.closest(".popover,.dlg-bg,.tm-bg")) closePanel(); }
  function panelKey(e) { if (e.key === "Escape" && panel && !document.querySelector(".popover,.dlg-bg")) { e.stopPropagation(); closePanel(); } }
  function closePanel() { if (!panel) return; panel.remove(); panel = null; setHappy(false); document.removeEventListener("keydown", panelKey, true); document.removeEventListener("pointerdown", outside, true); }
  function addMsg(who, html, quiet) {
    if (!panel) return;
    var m = SP.el('<div class="d3m ' + who + '">' + html + "</div>"); panel.querySelector(".d3p-msgs").appendChild(m); SP.hydrateIcons(m);
    var box = panel.querySelector(".d3p-msgs"); box.scrollTop = box.scrollHeight;
    if (!quiet && !reduce) m.animate([{ opacity: 0, transform: "translateY(8px) scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.2)" });
  }
  function userMsg(html) { state.hist.push({ who: "me", html: html }); addMsg("me", html); }
  function bot(html) { state.hist.push({ who: "bot", html: html }); if (state.hist.length > 40) state.hist.splice(0, state.hist.length - 40); addMsg("bot", html); if (el) { jump(); } }
  function typing() { if (!panel) return null; var t = SP.el('<div class="d3m bot typing"><i></i><i></i><i></i></div>'); panel.querySelector(".d3p-msgs").appendChild(t); var box = panel.querySelector(".d3p-msgs"); box.scrollTop = box.scrollHeight; return t; }
  function greeting() {
    var h = new Date().getHours(), hi = h < 5 ? "Nie śpisz jeszcze" : h < 12 ? "Dzień dobry" : h < 18 ? "Cześć" : "Dobry wieczór";
    var mine = myOpen(), today = mine.filter(function (t) { return t.due && t.due <= SP.date.today(); }).length;
    return hi + ", " + esc(first()) + "! 💙 " + (today ? "Na dziś masz <b>" + today + "</b> " + plural(today, "zadanie", "zadania", "zadań") + ". " : "") + "Mogę wejść do pliku i wygrzebać z niego zadania, zaplanować Ci dzień albo dodać zadanie z jednego zdania. Wybierz coś poniżej albo napisz.";
  }
  function myOpen() { return db.raw.tasks.filter(function (t) { return t.assignees.indexOf(db.me || "me") >= 0 && !db.status(t.status).closed; }); }
  var PR = { urgent: 0, high: 1, normal: 2, low: 3 };
  function rank(t) { var d = t.due ? SP.date.diff(t.due) : 99; return (d < 0 ? -10 : Math.min(d, 14)) + (PR[t.priority] == null ? 2.5 : PR[t.priority]) * 1.5; }
  function taskList(ts) { return '<div class="d3m-list">' + ts.map(function (t) { var d = SP.fmtDue(t.due); return '<button data-open="' + t.id + '">' + SP.statusDot(t.status) + "<span>" + esc(t.title) + "</span>" + (t.due ? '<em class="due ' + d.cls + '">' + d.label + "</em>" : "") + "</button>"; }).join("") + "</div>"; }

  /** Rozpoznanie polecenia z tekstu (bez AI). */
  function understand(v) {
    var s = v.toLowerCase(), m;
    if ((m = /^(?:dodaj|utwórz|utworz|stwórz|stworz|zapisz|nowe)(?:\s+(?:mi|nowe))?\s+(?:zadanie|task)\s*[:\-–]?\s*(.+)$/i.exec(v)) || (m = /^(?:przypomnij mi|zapisz mi)\s*(?:o|żeby|zeby)?\s*(.+)$/i.exec(v))) return run("add", m[1]);
    if (/(plik|pdf|excel|word|docx|xlsx|dokument|notatk|protok|wyciąg|wyciag|wygrzeb|przeszukaj)/.test(s)) return run("file");
    if (/(wklej|z listy|wiele zadań|wiele zadan|kilka zadań|kilka zadan)/.test(s)) return run("paste");
    if (/(rozbij|podzada|podziel)/.test(s)) return run("split");
    if (/(podsumow|tydzień|tydzien|statyst|wrapped)/.test(s)) return run("recap");
    if (/(zaplanuj|plan dnia|od czego zacz|co najpierw|priorytet)/.test(s)) return run("plan");
    if (/(zaległ|zalegl|po terminie|spóźn|spozn)/.test(s)) return run("overdue");
    if (/(dziś|dzis|dzisiaj|na dziś|co mam|moje zadania)/.test(s)) return run("today");
    if (/(jutro)/.test(s) && /(co|jakie|mam)/.test(s)) return run("tomorrow");
    if (/(zaproś|zapros|dodaj osob|zespół|zespol)/.test(s)) return run("invite");
    if (/(ciemn|dark)/.test(s) && /(motyw|tryb|włącz|wlacz)/.test(s)) { SPTheme.set("dark"); return bot("Zgaszone 🌙"); }
    if (/(jasn|light)/.test(s) && /(motyw|tryb|włącz|wlacz)/.test(s)) { SPTheme.set("light"); return bot("Jasno jak w dzień ☀️"); }
    if (/(skupieni|pomodoro|focus)/.test(s)) return run("focus");
    if (/(salto|fikoł|fikol|skacz)/.test(s)) { salto(); return bot("Proszę bardzo! 🤸"); }
    if (/^(hej|cześć|czesc|siema|elo|witaj|hello|hi)\b/.test(s)) return bot(pick(["Hej hej! 👋", "Cześć! Co dziś robimy? 💙", "Siema! Gotowy do pomocy 💪"]));
    if (/(dzięk|dziek|super|świetnie|swietnie|kocham)/.test(s)) { salto(); return bot(pick(["Nie ma za co! 💙", "Zawsze do usług! 🤖", "Hihi 😊"])); }
    if (/(co umiesz|pomoc|help|jak działasz|jak dzialasz)/.test(s)) return bot("Umiem:<br>• 📄 <b>wejść do pliku</b> (Word, PDF, Excel) i wygrzebać zadania – upuść plik na mnie,<br>• ➕ <b>dodać zadanie</b>: „dodaj zadanie raport jutro @Anna !pilne”,<br>• ☀️ powiedzieć, <b>co masz dziś</b>, co jest <b>zaległe</b> i <b>zaplanować dzień</b>,<br>• 🪓 <b>rozbić zadanie</b> na kroki, 🏆 pokazać <b>podsumowanie tygodnia</b>." + (SP.ai && SP.ai.enabled() ? "<br>Z AI odpowiem też na inne pytania o Twoje zadania." : ""));
    // wygląda jak zadanie („wysłać ofertę jutro @Anna”)? – zaproponuj utworzenie
    var p = SP.parseQuick ? SP.parseQuick(v) : null;
    if (p && (p.due || p.assignees.length || p.priority) && v.length < 160 && !/\?$/.test(v)) { state.pendingAdd = v; return bot("Brzmi jak zadanie: <b>" + esc(p.title) + "</b>" + (p.due ? " · " + SP.fmtDue(p.due).label : "") + ". Dodać je? " + '<button class="d3m-btn" data-act="addPending">' + ico("plus", 13) + "Tak, dodaj</button>"); }
    if (SP.ai && SP.ai.enabled()) return askAI(v);
    bot("Hmm, nie do końca rozumiem 🤔 Spróbuj: „co mam dziś?”, „dodaj zadanie …”, „wyciągnij zadania z pliku” albo „podsumowanie tygodnia”. Z kluczem AI (Ustawienia → AI) pogadam o wszystkim. " + '<button class="d3m-btn" data-act="aiSet">' + ico("sparkles", 13) + "Włącz AI</button>");
  }
  function act(a) {
    if (a === "addPending" && state.pendingAdd) { var v = state.pendingAdd; state.pendingAdd = null; run("add", v); }
    else if (a === "aiSet") { closePanel(); location.hash = "#/settings"; setTimeout(function () { var s = document.getElementById("ai-sec"); if (s) s.scrollIntoView({ behavior: "smooth", block: "center" }); }, 150); }
    else if (a === "pickFile") pickFileThenDig();
    else if (a === "openList") { var l = curList(); if (l) location.hash = "#/list/" + l; }
  }
  function curList() {
    var m = /^#\/list\/([^/]+)/.exec(location.hash); if (m && db.list(m[1])) return m[1];
    var r = db.raw.recents.find(function (x) { return x.type === "list" && db.list(x.id); }); return r ? r.id : (db.raw.lists[0] || {}).id;
  }
  function run(cmd, arg) {
    var mine = myOpen(), today = SP.date.today();
    if (cmd === "file") { bot("Daj mi plik – Word, PDF, Excel, CSV albo notatki. Wejdę do środka i wygrzebię zadania! 🕳️📄 " + '<button class="d3m-btn" data-act="pickFile">' + ico("upload", 13) + "Wybierz plik</button><br><small>Możesz też po prostu upuścić plik na mnie.</small>"); return; }
    if (cmd === "today") {
      var t = mine.filter(function (x) { return x.due && x.due <= today; }).sort(function (a, b) { return rank(a) - rank(b); });
      bot(t.length ? "Na dziś (z zaległymi) masz " + t.length + " " + plural(t.length, "zadanie", "zadania", "zadań") + ":" + taskList(t.slice(0, 7)) : "Na dziś nic nie ma terminu 🎉 " + (mine.length ? "Masz " + mine.length + " otwartych zadań bez pilnych terminów – może „zaplanuj mój dzień”?" : "Dodaj coś: „dodaj zadanie …”."));
      return;
    }
    if (cmd === "tomorrow") { var tm = mine.filter(function (x) { return x.due === SP.date.add(today, 1); }); bot(tm.length ? "Jutro:" + taskList(tm) : "Na jutro nic nie zaplanowane 😌"); return; }
    if (cmd === "overdue") { var o = db.raw.tasks.filter(function (x) { return x.due && x.due < today && !db.status(x.status).closed && !x.parentId; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; }); bot(o.length ? "⏰ Po terminie jest " + o.length + " " + plural(o.length, "zadanie", "zadania", "zadań") + ":" + taskList(o.slice(0, 7)) : "Zero zaległości! Jestem z Ciebie dumny 🥹"); if (!o.length) salto(); return; }
    if (cmd === "plan") {
      var top = mine.filter(function (x) { return !db.isBlocked || !db.isBlocked(x); }).sort(function (a, b) { return rank(a) - rank(b); }).slice(0, 3);
      if (!top.length) { bot("Nie masz otwartych zadań – czas na kawę ☕ albo dodaj nowe."); return; }
      bot("Mój plan na dziś 🗺️ – po kolei:" + taskList(top) + "<small>Zaczynam od zaległych i pilnych. Kliknij zadanie, a potem ▶ albo „Skupienie”, żeby mierzyć czas.</small>");
      return;
    }
    if (cmd === "add") {
      if (!arg) { bot("Napisz, co dodać – np. <i>„dodaj zadanie wysłać raport jutro @Anna !pilne #klient”</i>. Termin, osobę, priorytet i tagi rozpoznam sam ✨"); var inp = panel && panel.querySelector("input"); if (inp) { inp.value = "dodaj zadanie "; inp.focus(); } return; }
      var listId = curList(); if (!listId) { bot("Najpierw potrzebuję jakiejś listy 🙈"); return; }
      var p = SP.parseQuick(arg), f = SP.applyQuick(p, { listId: listId, assignees: ["me"] });
      throwCard(f.title, listId, function () {
        var nt = db.createTask(f);
        bot("Dodane: <b>" + esc(nt.title) + "</b> (" + db.taskKey(nt) + ") w liście „" + esc(db.list(listId).name) + "”" + (nt.due ? ", termin " + SP.fmtDue(nt.due).label.toLowerCase() : "") + (nt.priority ? ", " + db.priority(nt.priority).name.toLowerCase() : "") + " ✅" + taskList([nt]));
      });
      return;
    }
    if (cmd === "paste") { closePanel(); SP.pasteFromClipboard ? SP.pasteFromClipboard() : null; return; }
    if (cmd === "split") {
      var cur = SP.currentTaskId && SP.currentTaskId();
      if (cur && db.task(cur) && !db.task(cur).parentId) { closePanel(); salto(); SP.splitTask(cur); return; }
      var big = mine.filter(function (x) { return !x.parentId; }).sort(function (a, b) { return (b.checklist.length + (b.desc || "").length / 200) - (a.checklist.length + (a.desc || "").length / 200); }).slice(0, 4);
      bot("Które zadanie rozbić? Otwórz je i kliknij „Rozbij zadanie” albo wybierz tutaj, a potem napisz „rozbij” jeszcze raz:" + (big.length ? taskList(big) : " (nie masz otwartych zadań)"));
      return;
    }
    if (cmd === "recap") { closePanel(); salto(); setTimeout(function () { SP.weekRecap && SP.weekRecap(); }, reduce ? 0 : 500); return; }
    if (cmd === "invite") { closePanel(); SP.inviteDialog && SP.inviteDialog(); return; }
    if (cmd === "focus") { var tf = mine.sort(function (a, b) { return rank(a) - rank(b); })[0]; if (tf && SP.focus) { SP.focus.start(tf.id); bot("Tryb skupienia: <b>" + esc(tf.title) + "</b> – 25 minut. Trzymam kciuki! 🍅"); } else bot("Nie mam zadania do skupienia – dodaj jakieś."); return; }
  }
  function askAI(v) {
    var tp = typing();
    var ctx = db.raw.tasks.filter(function (t) { return !t.parentId; }).slice(-150).map(function (t) {
      return "- " + db.taskKey(t) + " „" + t.title + "” · " + db.status(t.status).name + (t.due ? " · termin " + t.due : "") + (t.priority ? " · " + db.priority(t.priority).name : "") + (t.assignees.length ? " · " + t.assignees.map(function (id) { return (db.person(id) || {}).name; }).join(", ") : "") + " · lista " + ((db.pathOf(t).list || {}).name || "");
    }).join("\n") || "(brak zadań)";
    var hist = state.hist.slice(-10).map(function (m) { var d = document.createElement("div"); d.innerHTML = m.html; return { role: m.who === "me" ? "user" : "assistant", content: (d.textContent || "").slice(0, 1500) || "…" }; });
    while (hist.length && hist[0].role !== "user") hist.shift();
    if (!hist.length || hist[hist.length - 1].role !== "user") hist.push({ role: "user", content: v });
    el && el.classList.add("think");
    SP.ai.chat(hist, ctx).then(function (txt) {
      tp && tp.remove(); el && el.classList.remove("think");
      bot(esc(txt || "…").replace(/\n/g, "<br>").replace(/\b(SP-\d+)\b/g, function (k) { var t = db.raw.tasks.find(function (x) { return db.taskKey(x) === k; }); return t ? '<button class="d3m-link" data-open="' + t.id + '">' + k + "</button>" : k; }));
    }, function (err) { tp && tp.remove(); el && el.classList.remove("think"); bot("Ups, AI nie odpowiada: " + esc(err.message || "błąd") + " 😕"); shake(); });
  }
  /** D3vek „rzuca” kartę zadania do listy w pasku bocznym. */
  function throwCard(title, listId, done) {
    var from = (panel && panel.querySelector(".d3p-in")) || el;
    var target = document.querySelector('.tree-row.list[href="#/list/' + listId + '"]') || document.querySelector("#view .rows") || document.querySelector(".side-nav");
    if (reduce || !SP.fly || !from || !target) { done(); return; }
    jump(); SP.fly(from.getBoundingClientRect(), target.getBoundingClientRect(), "<span>" + esc(title) + "</span>", { cls: "card", duration: 700, arc: -120, rot: -14 }).then(function () { target.classList.remove("xt-pulse"); void target.offsetWidth; target.classList.add("xt-pulse"); done(); });
  }

  /* =================== Scena: D3vek wchodzi do pliku i wygrzebuje zadania =================== */
  function pickFileThenDig() {
    var i = document.createElement("input"); i.type = "file";
    i.accept = ".txt,.md,.markdown,.csv,.tsv,.docx,.odt,.pdf,.html,.htm,.xlsx,.xlsm,.xls,.ods" + (SP.ai && SP.ai.enabled() ? ",.png,.jpg,.jpeg,.webp,.gif" : "");
    i.onchange = function () { if (i.files[0]) digFile(i.files[0]); };
    i.click();
  }
  function digFile(file, opts) {
    opts = opts || {};
    if (state.busy) return;
    if (SP.canExtract && !SP.canExtract(file)) { mount(); say("Tego formatu nie umiem przekopać 😕 Daj mi DOCX, PDF, XLSX, CSV albo TXT.", 4500); shake(); return; }
    closePanel(); state.busy = true; wake();
    var listId = opts.listId || curList();
    var open = function () { state.busy = false; SP.extractSkipScan = true; SP.extractTasks({ file: file, listId: listId }); setTimeout(function () { SP.extractSkipScan = false; }, 8000); };
    var read = X.readSource ? X.readSource(file).catch(function () { return null; }) : Promise.resolve(null);
    if (reduce || !el) { read.then(open); return; }
    var origin = el.getBoundingClientRect();
    var bg = SP.el('<div class="d3s" aria-hidden="true"><div class="d3s-stage"><div class="d3s-doc"><div class="d3s-doc-h">' + (SP.fileTile ? SP.fileTile(file) : "") + "<b>" + esc(file.name) + '</b></div><div class="d3s-lines"></div><div class="d3s-hole"></div></div>' +
      '<div class="d3s-out"><div class="d3s-out-h">' + ico("sparkles", 14) + 'Wygrzebane <b class="d3s-n">0</b></div><div class="d3s-cards"></div></div></div>' +
      '<div class="d3 d3-big happy">' + BODY + '<div class="d3-bubble" hidden></div></div><div class="d3s-peek"><i></i><i></i></div></div>');
    document.body.appendChild(bg); SP.hydrateIcons(bg);
    el.style.visibility = "hidden";
    var big = bg.querySelector(".d3-big"), bigBody = big.querySelector(".d3-body"), bb = big.querySelector(".d3-bubble");
    var doc = bg.querySelector(".d3s-doc"), linesEl = bg.querySelector(".d3s-lines"), peek = bg.querySelector(".d3s-peek");
    var sayBig = function (t) { bb.textContent = t; bb.hidden = false; bb.classList.remove("in"); void bb.offsetWidth; bb.classList.add("in"); };
    var T = function (fn, ms) { return setTimeout(fn, ms); };
    // D3vek startuje z rogu
    var bw = 120, bh = 79;
    function at(x, y) { big.style.left = x + "px"; big.style.top = y + "px"; }
    at(origin.left + origin.width / 2 - bw / 2, origin.top + origin.height - bh);
    read.then(function (src) {
      var lines = [], found = [];
      if (src && src.kind === "text") lines = src.lines.filter(function (l) { return l.text; }).slice(0, 18).map(function (l) { return l.text; });
      else if (src && src.kind === "sheet") src.sheets.forEach(function (sh) { sh.rows.forEach(function (r) { if (lines.length < 18 && r.some(function (c) { return c && c.s; })) lines.push(r.map(function (c) { return (c && (c.d || c.s)) || ""; }).filter(Boolean).join(" · ")); }); });
      if (src && src.kind !== "image" && X.extract) { try { found = X.extract(src).tasks.map(function (t) { return t.title; }); } catch (e) { found = []; } }
      if (!lines.length) lines = ["…", "……", "…"];
      linesEl.innerHTML = lines.map(function (l, i) { return '<div class="d3s-l" style="--i:' + i + '">' + esc(l.length > 90 ? l.slice(0, 88) + "…" : l) + "</div>"; }).join("");
      var dr = doc.getBoundingClientRect();
      // 1) skok z rogu na krawędź dokumentu
      var tx = dr.left + dr.width / 2 - bw / 2, ty = dr.top - bh + 6;
      var sx = parseFloat(big.style.left), sy = parseFloat(big.style.top);
      sayBig("Wchodzę! 🕳️");
      big.animate([{ transform: "translate(0,0) scale(.6)" }, { transform: "translate(" + (tx - sx) * .5 + "px," + (Math.min(ty, sy) - sy - 160) + "px) scale(1) rotate(-12deg)", offset: .5 }, { transform: "translate(" + (tx - sx) + "px," + (ty - sy) + "px) scale(1)" }], { duration: 900, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" }).finished.then(function () {
        at(tx, ty); big.getAnimations().forEach(function (a) { a.cancel(); });
        bigBody.animate([{ transform: "none" }, { transform: "scale(1.2,.75)" }, { transform: "none" }], { duration: 300 });
        // 2) nurkuje do środka (za krawędź dokumentu)
        T(function () {
          bb.hidden = true; big.classList.add("dive");
          big.animate([{ transform: "none" }, { transform: "translateY(-22px) scale(.92,1.1)", offset: .35 }, { transform: "translateY(" + (bh + 30) + "px) scale(.8,1.15)" }], { duration: 650, easing: "cubic-bezier(.5,0,.6,1)", fill: "forwards" });
          doc.animate([{ transform: "none" }, { transform: "scale(1.02,.97) translateY(4px)", offset: .7 }, { transform: "none" }], { duration: 650, delay: 300 });
        }, 350);
        // 3) kopie: oczy D3vka wędrują po liniach, trafienia wylatują jako karty
        T(function () { dig(found, lines.length); }, 1100);
      });
    });
    function dig(found, nLines) {
      var lineEls = linesEl.querySelectorAll(".d3s-l"), out = bg.querySelector(".d3s-cards"), nEl = bg.querySelector(".d3s-n");
      peek.classList.add("on");
      var shown = Math.min(found.length, 8), steps = Math.max(nLines, shown), k = 0, every = shown ? Math.max(1, Math.floor(steps / shown)) : 999;
      var i = 0;
      function step() {
        if (i < lineEls.length) {
          var le = lineEls[i], r = le.getBoundingClientRect();
          peek.style.left = (r.left + 10 + Math.random() * Math.max(10, r.width - 60)) + "px"; peek.style.top = (r.top + r.height / 2 - 7) + "px";
          le.classList.add("dug");
          doc.animate([{ transform: "translateX(-2px) rotate(-.3deg)" }, { transform: "translateX(2px) rotate(.3deg)" }, { transform: "none" }], { duration: 160 });
          dust(r.left + r.width / 2, r.top + r.height / 2);
        }
        if (k < shown && (i % every === every - 1 || i >= lineEls.length - 1)) {
          var title = found[k++], src = i < lineEls.length ? lineEls[i] : linesEl;
          src.classList && src.classList.add("hit");
          out.insertAdjacentHTML("beforeend", '<div class="d3s-card">' + ico("check", 12) + "<span>" + esc(title) + "</span></div>");
          var card = out.lastElementChild, rr = src.getBoundingClientRect();
          card.style.visibility = "hidden";
          SP.fly({ left: rr.left + 20, top: rr.top, width: Math.min(rr.width, 300), height: rr.height }, card.getBoundingClientRect(), "<span>" + esc(title) + "</span>", { cls: "card", arc: -90, endScale: 1, fade: false, duration: 560, rot: 8 }).then(function () { card.style.visibility = ""; card.classList.add("in"); });
          nEl.textContent = k;
        }
        i++;
        if (i < Math.max(lineEls.length, every * shown) && i < 40) setTimeout(step, 150);
        else setTimeout(emerge, 500);
      }
      function emerge() {
        peek.classList.remove("on"); big.classList.remove("dive");
        big.getAnimations().forEach(function (a) { a.cancel(); });
        var n = found.length;
        big.animate([{ transform: "translateY(" + (bh + 30) + "px)" }, { transform: "translateY(-60px) rotate(-200deg)", offset: .55 }, { transform: "translateY(0) rotate(-360deg) scale(1.15,.85)", offset: .85 }, { transform: "rotate(-360deg)" }], { duration: 950, easing: "cubic-bezier(.3,.8,.4,1)" });
        setTimeout(function () {
          sayBig(n ? "Wygrzebałem " + n + " " + plural(n, "zadanie", "zadania", "zadań") + "! 🎉" : SP.ai && SP.ai.enabled() ? "Oddaję to AI – przeczyta dokładniej 🧠" : "Hmm, nic tu nie widzę 🤔");
          if (n && SP.celebrate) SP.celebrate(parseFloat(big.style.left) + bw / 2, parseFloat(big.style.top) + 10, 28);
        }, 750);
        setTimeout(function () {
          // 4) D3vek wraca do rogu, scena znika, otwiera się przegląd zadań
          var tr = el.getBoundingClientRect(), cx = parseFloat(big.style.left), cy = parseFloat(big.style.top);
          bg.classList.add("leaving"); bb.hidden = true;
          big.animate([{ transform: "none" }, { transform: "translate(" + (tr.left - cx) * .5 + "px," + (Math.min(tr.top, cy) - cy - 120) + "px) rotate(10deg)", offset: .5 }, { transform: "translate(" + (tr.left + tr.width / 2 - bw / 2 - cx) + "px," + (tr.bottom - bh - cy) + "px) scale(.6)" }], { duration: 800, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" }).finished.then(function () {
            bg.remove(); el.style.visibility = ""; jump();
            if (n || (SP.ai && SP.ai.enabled())) open(); else { state.busy = false; say("W tym pliku nie znalazłem zadań. Spróbuj notatek z punktami albo włącz AI ✨", 5000); }
          });
        }, 2300);
      }
      step();
    }
    function dust(x, y) {
      for (var j = 0; j < 3; j++) {
        var p = document.createElement("i"); p.className = "d3s-dust"; p.style.left = x + (Math.random() * 60 - 30) + "px"; p.style.top = y + "px"; bg.appendChild(p);
        p.animate([{ transform: "translate(0,0) scale(1)", opacity: .9 }, { transform: "translate(" + (Math.random() * 40 - 20) + "px," + (-20 - Math.random() * 30) + "px) scale(.2)", opacity: 0 }], { duration: 600, easing: "ease-out" }).finished.then(function () { this.remove(); }.bind(p));
      }
    }
  }

  if (!off()) setTimeout(mount, 600);
  addEventListener("resize", function () { place(); if (el) { var r = parseFloat(el.style.right) || 20, b = parseFloat(el.style.bottom) || 20; el.style.right = clamp(r, 4, innerWidth - 84) + "px"; el.style.bottom = clamp(b, 4, innerHeight - 64) + "px"; } });
})();
