/* Sprynt – strona startowa: animacje, makieta aplikacji, cennik, FAQ. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ico = function (n, s) { return SP.icon(n, { size: s || 16 }); };
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  SP.hydrateIcons();

  /* ---- Motyw ---- */
  function drawTheme() { var dark = SPTheme.current() === "dark"; $("#themeBtn").innerHTML = ico(dark ? "sun" : "moon", 20); $("#themeBtn").title = dark ? "Jasny motyw" : "Ciemny motyw"; }
  $("#themeBtn").addEventListener("click", function () { SPTheme.toggle(); });
  addEventListener("themechange", drawTheme);
  drawTheme();

  /* ---- Zalogowany? Przyciski prowadzą prosto do aplikacji ---- */
  var me = window.SPAuth && SPAuth.current();
  if (me) {
    $$('[data-auth="login"]').forEach(function (a) { a.href = "app.html"; a.textContent = "Otwórz aplikację"; });
    $$('[data-auth="cta"]').forEach(function (a) { a.href = "app.html"; });
    var navLogin = $('.nav-acts [data-auth="login"]'); if (navLogin) navLogin.hidden = true;
    var navCta = $('.nav-acts [data-auth="cta"]'); if (navCta) navCta.textContent = "Otwórz aplikację";
  }

  /* ---- Nawigacja: tło po przewinięciu + aktywna sekcja ---- */
  var nav = $("#nav");
  function onScroll() {
    nav.classList.toggle("scrolled", scrollY > 8);
    tiltByScroll();
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  var links = $$(".nav-links a");
  var secObs = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id); });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ["funkcje", "widoki", "cennik", "faq"].forEach(function (id) { secObs.observe(document.getElementById(id)); });

  /* ---- Nagłówek: słowa wjeżdżają po kolei ---- */
  var h = $(".hero-h");
  $$(".w", h).forEach(function (w, i) { w.style.setProperty("--wd", (0.08 + i * 0.07) + "s"); });
  setTimeout(function () { h.classList.add("in"); }, 80); // timer, nie rAF – rAF w tle się spóźnia

  /* ---- Odsłanianie przy przewijaniu ---- */
  var revObs = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); revObs.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
  function observeReveals(root) { $$(".reveal", root).forEach(function (el) { revObs.observe(el); }); }

  /* ---- Pasek funkcji (marquee) ---- */
  var chips = [["sparkles", "Asystent AI"], ["gauge", "Sprinty"], ["users", "Daily stand-up"], ["trophy", "Retrospektywa"], ["countdown", "Arkusz czasu"], ["sparkles", "Zadania z pliku"], ["spreadsheet", "Excel dla kontrolingu"], ["list", "Listy"], ["kanban", "Tablice Kanban"], ["spreadsheet", "Tabela"], ["calendar", "Kalendarz"], ["timeline", "Oś czasu"], ["clock", "Śledzenie czasu"], ["chart-column", "Pulpit z wykresami"], ["presentation", "Tablice online"], ["target", "Cele"], ["zap", "Automatyzacje"], ["message-square", "Czat zespołu"], ["spreadsheet", "Pola niestandardowe"], ["alarm-clock", "Przypomnienia"], ["lock", "Zależności"], ["repeat", "Zadania cykliczne"], ["git-branch", "Podzadania"], ["list-checks", "Checklisty"],
    ["file-text", "Dokumenty"], ["cloud", "Chmura na pliki"], ["paperclip", "Załączniki"], ["message-square", "Komentarze"], ["search", "Paleta Cmd+K"], ["inbox", "Skrzynka"], ["flag", "Priorytety"],
    ["tag", "Tagi"], ["star", "Ulubione"], ["moon", "Ciemny motyw"], ["users", "Praca zespołowa"]];
  var chipHTML = chips.map(function (c) { return '<span class="chip">' + ico(c[0], 18) + c[1] + "</span>"; }).join("");
  $("#marquee").innerHTML = chipHTML + chipHTML; // dwa razy – płynna pętla

  /* ---- Funkcje ---- */
  var feats = [
    ["list", "#6c5ce7", "Listy, które się nie gubią", "Przestrzenie, foldery i listy porządkują pracę każdego działu. Grupuj zadania po statusie, priorytecie albo osobie."],
    ["kanban", "#00a884", "Tablica Kanban", "Przeciągnij kartę do „W toku” albo „Ukończone”. Status zmienia się od razu, w każdym widoku."],
    ["calendar", "#0984e3", "Kalendarz terminów", "Zobacz cały miesiąc i przesuwaj terminy przeciągnięciem. Dwuklik w dzień tworzy zadanie."],
    ["git-branch", "#e84393", "Podzadania i checklisty", "Duże zadanie rozbijesz na podzadania z własnymi osobami i terminami, a drobiazgi odhaczysz na liście."],
    ["search", "#f39c12", "Paleta Cmd+K", "Znajdź zadanie, listę albo dokument w sekundę. Działa nawet bez polskich znaków."],
    ["file-text", "#14b8a6", "Dokumenty obok zadań", "Specyfikacje, notatki ze spotkań i briefy z formatowaniem – w tej samej przestrzeni co praca."],
    ["gauge", "#5b6cf9", "Sprinty z prognozą", "Wykres spalania pokazuje, czy zdążycie, zanim będzie za późno. Pojemność zespołu, obciążenie każdej osoby i zmiany zakresu w jednym widoku."],
    ["users", "#e5484d", "Stand-up w minutę", "Kto co skończył wczoraj, nad czym pracuje dziś i co go blokuje – gotowe do wklejenia na czat zespołu."],
    ["sparkles", "#a855f7", "Asystent sprintu (AI)", "Claude szacuje punkty, układa sprint z backlogu, odpowiada na pytania o postęp i przygotowuje retrospektywę z działaniami."],
  ];
  $("#features").innerHTML = feats.map(function (f, i) {
    return '<article class="feat reveal" style="--c:' + f[1] + ";--d:" + (i % 3) * 0.1 + 's"><div class="feat-ico">' + ico(f[0], 26) + "</div><h3>" + f[2] + "</h3><p>" + f[3] + "</p></article>";
  }).join("");
  $$(".feat").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    });
  });

  /* ================= Makieta aplikacji ================= */
  var ST = { todo: ["Do zrobienia", "#87909e"], progress: ["W toku", "#5b6cf9"], review: ["Do przeglądu", "#f0a020"], done: ["Ukończone", "#1aae6f"] };
  var PPL = { TY: "#6c5ce7", AK: "#e84393", MZ: "#00a884", PN: "#0984e3", JW: "#f39c12" };
  var av = function (i) { return '<span class="av" style="--c:' + PPL[i] + '">' + i + "</span>"; };
  var TASKS = [
    { t: "Edytor zadań: opis z formatowaniem", s: "progress", a: "TY", d: "Dziś", red: true, tag: ["frontend", "#6c5ce7"] },
    { t: "API: paginacja kursorowa dla /tasks", s: "progress", a: "PN", d: "21 lis", tag: ["backend", "#00a884"] },
    { t: "Powiadomienia e-mail o przypisaniu", s: "todo", a: "MZ", d: "23 lis" },
    { t: "Widok tablicy: przeciąganie kart", s: "review", a: "MZ", d: "Jutro", tag: ["frontend", "#6c5ce7"] },
    { t: "Paleta Cmd+K: polskie znaki", s: "todo", a: "JW", d: "24 lis", tag: ["bug", "#e5484d"] },
    { t: "Migracja bazy do PostgreSQL 16", s: "done", a: "PN", d: "16 lis" },
  ];
  function sceneList(body) {
    var groups = ["progress", "todo", "review"], n = 0;
    body.innerHTML = '<div class="scene">' + groups.map(function (g) {
      var items = TASKS.filter(function (x) { return x.s === g; });
      return '<div class="m-grp"><span class="m-pill" style="--c:' + ST[g][1] + '">' + ST[g][0] + '</span><div class="m-rows">' + items.map(function (x) {
        return '<div class="m-row" style="--d:' + (n++ * 0.08) + 's" data-t="' + TASKS.indexOf(x) + '"><span class="dot" style="--c:' + ST[x.s][1] + '"></span><span class="m-title">' + x.t +
          (x.tag ? ' <span class="m-tag" style="--c:' + x.tag[1] + '">' + x.tag[0] + "</span>" : "") + '</span><span class="m-due' + (x.red ? " red" : "") + '">' + x.d + "</span><span>" + av(x.a) + "</span></div>";
      }).join("") + "</div></div>";
    }).join("") + "</div>";
  }
  function cardHTML(x, i, d) {
    return '<div class="m-card" style="--d:' + d + 's" data-t="' + i + '"><b>' + x.t + '</b><div class="m-foot">' + av(x.a) + (x.tag ? '<span class="m-tag" style="--c:' + x.tag[1] + '">' + x.tag[0] + "</span>" : "") +
      '<span class="m-due' + (x.red ? " red" : "") + '" style="margin-left:auto">' + x.d + "</span></div></div>";
  }
  function sceneBoard(body) {
    var n = 0;
    body.innerHTML = '<div class="scene"><div class="m-board">' + ["todo", "progress", "review", "done"].map(function (s) {
      return '<div class="m-col" data-s="' + s + '" style="--c:' + ST[s][1] + '"><span class="m-pill" style="--c:' + ST[s][1] + '">' + ST[s][0] + "</span>" +
        TASKS.map(function (x, i) { return x.s === s ? cardHTML(x, i, n++ * 0.07) : ""; }).join("") + "</div>";
    }).join("") + "</div></div>";
  }
  function sceneCalendar(body) {
    var dow = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
    var ev = { 3: [["Sprint planning", "#5b6cf9"]], 4: [["Edytor zadań", "#5b6cf9"], ["Paleta Cmd+K", "#87909e"]], 5: [["Widok tablicy", "#f0a020"]],
      7: [["API: paginacja", "#5b6cf9"]], 9: [["Powiadomienia", "#87909e"]], 10: [["Newsletter", "#e84393"]], 12: [["Demo dla klienta", "#00a884"]], 15: [["Retro", "#6c5ce7"]], 17: [["Premiera v2", "#e5484d"]] };
    var h = dow.map(function (d) { return '<div class="m-dow">' + d + "</div>"; }).join(""), k = 0;
    for (var i = 0; i < 21; i++) {
      var day = 16 + i, label = day > 30 ? day - 30 : day;
      h += '<div class="m-day' + (i === 3 ? " today" : "") + '"><span class="n">' + label + "</span>" +
        (ev[i] || []).map(function (e) { return '<div class="m-ev" style="--c:' + e[1] + ";--d:" + (0.15 + k++ * 0.09) + 's">' + e[0] + "</div>"; }).join("") + "</div>";
    }
    body.innerHTML = '<div class="scene"><div class="m-cal" style="grid-template-rows:auto repeat(3,1fr)">' + h + "</div></div>";
  }
  function sceneDoc(body) {
    body.innerHTML = '<div class="scene"><div class="m-doc"><h4>Specyfikacja: role i uprawnienia</h4><div class="meta">Ty · zmieniono przed chwilą</div>' +
      "<p>Każda przestrzeń ma trzy role: <b>admin</b>, <b>członek</b> i <b>gość</b>.</p><h5>Założenia</h5><ul><li>Gość widzi tylko udostępnione listy</li><li>Członek tworzy i edytuje zadania</li><li class=\"typing\">Admin zarządza przestrzenią i zaproszeniami</li></ul></div></div>";
  }
  var SCENES = { list: sceneList, board: sceneBoard, calendar: sceneCalendar, doc: sceneDoc };

  /* ---- Hero: scenariusz animacji ---- */
  var mock = $("#mock"), body = $("#mockBody"), cursor = $("#cursor"), ink = $("#mtabInk"), stage = $("#stage");
  var tabs = $$(".mtab", mock);
  function setTab(name) {
    tabs.forEach(function (t) { t.classList.toggle("on", t.dataset.scene === name); });
    var on = tabs.find(function (t) { return t.dataset.scene === name; });
    ink.style.left = on.offsetLeft + "px"; ink.style.width = on.offsetWidth + "px";
    SCENES[name](body);
  }
  function moveCursorTo(el, dx, dy) {
    var m = mock.getBoundingClientRect(), r = el.getBoundingClientRect();
    cursor.style.left = (r.left - m.left + (dx == null ? r.width / 2 : dx)) + "px";
    cursor.style.top = (r.top - m.top + (dy == null ? r.height / 2 : dy)) + "px";
  }
  async function click() { cursor.classList.add("click"); await sleep(160); cursor.classList.remove("click"); }
  var visible = true;
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0.15 }).observe(stage);
  async function whenVisible() { while (!visible || document.hidden) await sleep(400); }
  function showFloat(id, on) { $(id).classList.toggle("show", on); }

  async function heroLoop() {
    setTab("list");
    if (reduced) { showFloat("#floatComment", true); showFloat("#floatDone", true); cursor.style.display = "none"; return; }
    await sleep(900);
    for (;;) {
      await whenVisible();
      // 1. Lista: odhacz zadanie
      setTab("list");
      await sleep(1300);
      var row = body.querySelector('.m-row[data-t="3"]') || body.querySelector(".m-row");
      moveCursorTo(row.querySelector(".dot"));
      await sleep(1050); await click();
      var dot = row.querySelector(".dot"); dot.style.setProperty("--c", ST.done[1]); dot.classList.add("fill"); row.classList.add("done", "hl");
      showFloat("#floatDone", true);
      await sleep(1600); showFloat("#floatDone", false);
      // 2. Tablica: przenieś kartę
      await whenVisible();
      moveCursorTo(tabs[1]); await sleep(1000); await click(); setTab("board");
      await sleep(1100);
      var card = body.querySelector('.m-card[data-t="2"]'), target = body.querySelector('.m-col[data-s="progress"]');
      if (card && target) {
        moveCursorTo(card, 40, 18); await sleep(1000); await click();
        card.classList.add("lift"); await sleep(250);
        var b = body.getBoundingClientRect(), cr = card.getBoundingClientRect(), tr = target.getBoundingClientRect();
        var last = target.lastElementChild.getBoundingClientRect();
        card.style.width = cr.width + "px";
        card.style.left = (cr.left - b.left) + "px"; card.style.top = (cr.top - b.top) + "px";
        body.appendChild(card); card.classList.add("flying");
        await sleep(30);
        var nx = tr.left - b.left + 8, ny = last.bottom - b.top + 8;
        card.style.left = nx + "px"; card.style.top = ny + "px";
        cursor.style.left = (nx + 40 + (b.left - mock.getBoundingClientRect().left)) + "px";
        cursor.style.top = (ny + 18 + (b.top - mock.getBoundingClientRect().top)) + "px";
        await sleep(950);
        card.classList.remove("lift", "flying"); card.removeAttribute("style"); card.style.animation = "none"; card.style.opacity = 1; card.style.transform = "none";
        target.appendChild(card);
        showFloat("#floatComment", true);
      }
      await sleep(1900); showFloat("#floatComment", false);
      // 3. Kalendarz
      await whenVisible();
      moveCursorTo(tabs[2]); await sleep(1000); await click(); setTab("calendar");
      await sleep(900);
      var today = body.querySelector(".m-day.today");
      if (today) { moveCursorTo(today, 50, 40); }
      await sleep(2600);
      moveCursorTo(tabs[0]); await sleep(1000); await click();
    }
  }
  // Pochylenie makiety: prostuje się podczas przewijania, lekko reaguje na kursor.
  var tiltX = 0, tiltY = 0;
  function tiltByScroll() {
    if (reduced || !stage) return;
    var r = stage.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.9)));
    tiltX = 10 * (1 - p);
    mock.style.setProperty("--rx", (tiltX + tiltY) + "deg");
  }
  stage.addEventListener("pointermove", function (e) {
    if (reduced) return;
    var r = stage.getBoundingClientRect();
    tiltY = ((e.clientY - r.top) / r.height - 0.5) * -3;
    mock.style.setProperty("--ry", ((e.clientX - r.left) / r.width - 0.5) * 4 + "deg");
    mock.style.setProperty("--rx", (tiltX + tiltY) + "deg");
  });
  stage.addEventListener("pointerleave", function () { tiltY = 0; mock.style.setProperty("--ry", "0deg"); tiltByScroll(); });

  /* ---- Widoki: scena zmienia się z przewijaniem ---- */
  var body2 = $("#mockBody2"), current2 = null;
  var stepObs = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      $$("#steps li").forEach(function (li) { li.classList.toggle("on", li === e.target); });
      var s = e.target.dataset.scene;
      if (s !== current2) { current2 = s; SCENES[s](body2); }
    });
  }, { rootMargin: "-45% 0px -45% 0px" });
  $$("#steps li").forEach(function (li) { stepObs.observe(li); });
  SCENES.list(body2); current2 = "list";

  /* ---- Jak zacząć: linia postępu ---- */
  var howObs = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { $("#howLine").classList.add("in"); howObs.disconnect(); } }, { threshold: 0.5 });
  howObs.observe($(".how"));

  /* ---- Cennik: przełącznik + animowane liczby ---- */
  var bill = $(".billing"), billInk = $(".billing-ink", bill);
  function placeInk() { var on = $('[aria-pressed="true"]', bill); billInk.style.left = on.offsetLeft + "px"; billInk.style.width = on.offsetWidth + "px"; }
  function countTo(el, to) {
    var from = Number(el.textContent) || 0;
    if (reduced || from === to) { el.textContent = to; return; }
    var t0 = performance.now(), dur = 500;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  $$("[data-bill]", bill).forEach(function (b) {
    b.addEventListener("click", function () {
      $$("[data-bill]", bill).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      placeInk();
      $$(".amt").forEach(function (a) { countTo(a, Number(a.dataset[b.dataset.bill])); });
    });
  });
  addEventListener("resize", placeInk);
  setTimeout(placeInk, 50);

  /* ---- FAQ ---- */
  var faq = [
    ["Czy Sprynt jest naprawdę darmowy?", "Tak. Plan Free nie ma limitu zadań ani czasu. Płatne plany dodają funkcje dla większych zespołów."],
    window.SPRYNT_CLOUD && SPRYNT_CLOUD.url
      ? ["Gdzie są przechowywane moje dane?", "W chmurze, w bazie w Unii Europejskiej. Logujesz się na każdym urządzeniu tym samym e-mailem i hasłem, a Twoje zadania, dokumenty i pliki widzisz tylko Ty (dostęp chronią reguły bezpieczeństwa w bazie). Kopię danych możesz w każdej chwili pobrać w Ustawieniach."]
      : ["Gdzie są przechowywane moje dane?", "Na razie konto i wszystkie dane są zapisywane lokalnie w Twojej przeglądarce. Synchronizacja z serwerem i między urządzeniami pojawi się w kolejnej wersji."],
    ["Czy mogę przenieść zadania z innego narzędzia?", "Import z CSV i z popularnych narzędzi do zarządzania projektami jest na naszej liście. Na razie zadania tworzysz ręcznie albo skrótem T."],
    ["Czy Sprynt działa na telefonie?", "Tak – aplikacja dopasowuje się do szerokości ekranu, a pasek boczny chowa się pod przyciskiem menu."],
    ["Jak działa asystent AI w sprintach?", "Po dodaniu własnego klucza API Anthropic (Ustawienia → AI) model Claude szacuje punkty zadań, proponuje skład sprintu w granicach pojemności zespołu, podsumowuje stand-up, odpowiada na pytania o postęp i przygotowuje retrospektywę. Klucz zostaje w Twojej przeglądarce. Bez klucza prognoza, pojemność, stand-up i retrospektywa działają normalnie – tylko bez podpowiedzi AI."],
    ["Czy jest ciemny motyw?", "Jest. Przełączysz go ikoną słońca/księżyca w górnym pasku albo zostawisz „Systemowy”, żeby dopasował się do ustawień urządzenia."],
  ];
  $("#faqList").innerHTML = faq.map(function (q, i) {
    return '<div class="qa reveal" style="--d:' + i * 0.05 + 's"><button aria-expanded="false" aria-controls="ans' + i + '">' + q[0] + '<span class="pm" aria-hidden="true"></span></button><div class="ans" id="ans' + i + '"><div><p>' + q[1] + "</p></div></div></div>";
  }).join("");
  $$(".qa button").forEach(function (b) {
    b.addEventListener("click", function () {
      var qa = b.parentElement, open = !qa.classList.contains("open");
      qa.classList.toggle("open", open); b.setAttribute("aria-expanded", String(open));
    });
  });

  SP.hydrateIcons();
  observeReveals(document);
  heroLoop();
  if (window.SPRYNT_CLOUD && SPRYNT_CLOUD.url) { var pn = document.querySelector(".plans-note"); if (pn) pn.textContent = "Ceny netto. Funkcje planów Pro i Zespół są w przygotowaniu. Konto i dane są bezpiecznie zapisywane w chmurze – dostępne na każdym urządzeniu."; }
})();
