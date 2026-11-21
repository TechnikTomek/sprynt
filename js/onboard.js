/* Sprynt – kreator po założeniu konta: kim jesteś (IT, kontroler finansowy, marketing…), z kim pracujesz,
 * nazwa przestrzeni, pierwszego folderu i list, przykładowe zadania, zaproszenie zespołu do przestrzeni.
 * Na podglądzie po prawej pasek boczny buduje się na żywo; na koniec przestrzeń „składa się” element po elemencie.
 * Pokazujemy go raz – nowe, puste konto bez `db.raw.profile`. Ponownie: Ustawienia → „Kreator konfiguracji” (SP.onboarding()). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db, esc = SP.esc, ico = SP.ico;
  if (!db) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var D = SP.date;
  var wd = function (n) { return SP._extract ? SP._extract.workday(n) : D.add(D.today(), Math.max(1, n)); };

  /* Role: domyślne nazwy, listy, pola, tagi i zadania startowe (terminy względem dziś). */
  var ROLES = [
    { id: "it", icon: "file-code", color: "#0984e3", name: "IT / programista", desc: "sprinty, backlog, błędy, wdrożenia",
      space: "Dział IT", folder: "Sprint 1", lists: ["Backlog", "W tym sprincie", "Błędy"], tags: ["bug", "frontend", "backend"],
      tasks: [["Skonfigurować środowisko testowe", 1, "high", "Backlog"], ["Przegląd kodu: moduł logowania", 2, null, "W tym sprincie"], ["Naprawić błąd eksportu CSV", 1, "urgent", "Błędy", ["bug"]], ["Zaplanować wdrożenie wersji 1.1", 6, null, "Backlog"]] },
    { id: "finance", icon: "coins", color: "#1aae6f", name: "Kontroler finansowy", desc: "zamknięcie miesiąca, faktury, budżet",
      space: "Kontroling", folder: "Zamknięcie miesiąca", lists: ["Checklista WD", "Faktury do zapłaty", "Budżet vs wykonanie"], tags: ["zamknięcie", "faktury", "raport"],
      fields: [["Kwota", "money"], ["Kontrahent", "text"]],
      tasks: [["Uzgodnić salda rozrachunków", "WD1", "high", "Checklista WD", ["zamknięcie"]], ["Naliczyć rezerwy i rozliczenia międzyokresowe", "WD2", null, "Checklista WD", ["zamknięcie"]], ["Raport wyników dla zarządu", "WD4", "high", "Checklista WD", ["raport"]], ["Zapłacić faktury po terminie", 0, "urgent", "Faktury do zapłaty", ["faktury"]], ["Wyjaśnić odchylenia kosztów powyżej 10%", "WD3", null, "Budżet vs wykonanie"]] },
    { id: "marketing", icon: "presentation", color: "#e84393", name: "Marketing", desc: "kampanie, treści, social media",
      space: "Marketing", folder: "Kampanie", lists: ["Kampania Q1", "Treści", "Social media"], tags: ["kampania", "social", "blog"],
      tasks: [["Brief kampanii Q1", 2, "high", "Kampania Q1", ["kampania"]], ["Kalendarz publikacji na miesiąc", 4, null, "Social media", ["social"]], ["Artykuł na bloga: case study", 7, null, "Treści", ["blog"]]] },
    { id: "sales", icon: "target", color: "#f39c12", name: "Sprzedaż", desc: "lejek, oferty, klienci",
      space: "Sprzedaż", folder: "Lejek sprzedaży", lists: ["Leady", "Oferty", "Klienci"], tags: ["lead", "oferta"],
      fields: [["Wartość", "money"], ["Firma", "text"]],
      tasks: [["Zadzwonić do 5 nowych leadów", 1, "high", "Leady", ["lead"]], ["Przygotować ofertę dla klienta", 2, null, "Oferty", ["oferta"]], ["Spotkanie podsumowujące kwartał", 7, null, "Klienci"]] },
    { id: "pm", icon: "timeline", color: "#6c5ce7", name: "Kierownik projektu", desc: "harmonogram, kamienie milowe, ryzyka",
      space: "Projekty", folder: "Projekt 1", lists: ["Harmonogram", "Ryzyka", "Spotkania"], tags: ["milestone", "ryzyko"],
      tasks: [["Kick-off z zespołem", 1, "high", "Spotkania"], ["Harmonogram i kamienie milowe", 3, "high", "Harmonogram", ["milestone"]], ["Rejestr ryzyk", 5, null, "Ryzyka", ["ryzyko"]]] },
    { id: "hr", icon: "users", color: "#00a884", name: "HR / rekrutacja", desc: "rekrutacje, onboarding, szkolenia",
      space: "Kadry", folder: "Rekrutacje", lists: ["Kandydaci", "Onboarding", "Szkolenia"], tags: ["rekrutacja", "onboarding"],
      tasks: [["Opublikować ogłoszenie o pracę", 1, "high", "Kandydaci", ["rekrutacja"]], ["Plan wdrożenia nowej osoby", 4, null, "Onboarding", ["onboarding"]]] },
    { id: "design", icon: "pen-line", color: "#e5484d", name: "Projektant / kreatywny", desc: "projekty, poprawki, akceptacje",
      space: "Studio", folder: "Projekty klientów", lists: ["Do zaprojektowania", "Poprawki", "Akceptacje"], tags: ["ui", "branding"],
      tasks: [["Moodboard dla klienta", 2, null, "Do zaprojektowania", ["branding"]], ["Makiety ekranów aplikacji", 5, "high", "Do zaprojektowania", ["ui"]]] },
    { id: "edu", icon: "list-checks", color: "#2d3436", name: "Szkoła / nauka", desc: "przedmioty, prace domowe, egzaminy",
      space: "Nauka", folder: "Semestr", lists: ["Prace domowe", "Projekty", "Egzaminy"], tags: ["matematyka", "projekt"],
      tasks: [["Zadanie domowe z matematyki", 1, "high", "Prace domowe", ["matematyka"]], ["Przygotować prezentację", 6, null, "Projekty", ["projekt"]], ["Powtórka przed egzaminem", 10, null, "Egzaminy"]] },
    { id: "personal", icon: "house", color: "#8b7cf6", name: "Do użytku osobistego", desc: "dom, zakupy, cele, plany",
      space: "Osobiste", folder: "Dom i plany", lists: ["Do zrobienia", "Zakupy", "Cele"], tags: ["dom", "zakupy"],
      tasks: [["Zakupy na weekend", 1, null, "Zakupy", ["zakupy"]], ["Opłacić rachunki", 3, "high", "Do zrobienia", ["dom"]], ["Zaplanować urlop", 14, "low", "Cele"]] },
  ];
  SP.onboardRoles = {}; ROLES.forEach(function (r) { SP.onboardRoles[r.id] = r.name; });
  var TEAMS = [["solo", "Tylko ja", "user"], ["small", "Mały zespół (2–10)", "users"], ["big", "Firma (10+)", "layout-dashboard"]];

  var O = null;
  function shouldShow() {
    var join = null; try { join = sessionStorage.getItem("sprynt:join"); } catch (e) {}
    return !db.raw.profile && db.isEmpty() && !join && !/^#\/(wb|doc)\//.test(location.hash);
  }

  SP.onboarding = function (force) {
    if (O) return;
    var fresh = db.isEmpty();
    var first = db.raw.spaces[0];
    O = { step: 0, role: null, team: "solo", space: "", folder: "", lists: [], sample: fresh, emails: "", fresh: fresh, customSpace: first && first.name !== "Mój projekt" ? first.name : "" };
    var bg = SP.el('<div class="ob-bg"><div class="ob" role="dialog" aria-modal="true" aria-label="Konfiguracja Sprynt">' +
      '<section class="ob-main"><header class="ob-top"><img class="ob-logo" src="img/logo.svg" alt="" /><div class="ob-dots"></div><button class="link ob-skip" data-skip>Pomiń</button></header><div class="ob-step"></div><footer class="ob-f"></footer></section>' +
      '<aside class="ob-prev" aria-hidden="true"><div class="ob-prev-in"><div class="ob-prev-h"><img src="img/logo.svg" alt="" /><b>Sprynt</b></div><div class="ob-tree"></div></div></aside></div></div>');
    O.bg = bg; document.body.appendChild(bg);
    bg.addEventListener("click", onClick);
    bg.addEventListener("input", onInput);
    document.addEventListener("keydown", onKey, true);
    draw();
  };
  function role() { return ROLES.find(function (r) { return r.id === O.role; }); }
  function setRole(id) {
    O.role = id; var r = role();
    O.space = O.customSpace || r.space; O.folder = r.folder; O.lists = r.lists.map(function (n) { return { name: n, on: true }; });
  }
  var STEPS = ["Kim jesteś?", "Z kim pracujesz?", "Twoja przestrzeń", "Zaproś zespół"];
  function draw(dir) {
    var st = O.bg.querySelector(".ob-step"), f = O.bg.querySelector(".ob-f");
    O.bg.querySelector(".ob-dots").innerHTML = STEPS.map(function (s, i) { return '<i class="' + (i < O.step ? "done" : i === O.step ? "on" : "") + '" title="' + s + '"></i>'; }).join("");
    var h = "";
    if (O.step === 0) {
      h = "<h1>Cześć, " + esc(SP.user.name.split(" ")[0]) + "! Kim jesteś?</h1><p class=\"muted\">Dopasujemy przestrzeń, listy i przykładowe zadania do Twojej pracy. Wszystko zmienisz później.</p>" +
        '<div class="ob-roles">' + ROLES.map(function (r, i) {
          return '<button class="ob-role' + (O.role === r.id ? " on" : "") + '" data-role="' + r.id + '" style="--c:' + r.color + ";--i:" + i + '"><span class="ob-ri">' + ico(r.icon, 20) + "</span><b>" + esc(r.name) + "</b><small>" + esc(r.desc) + "</small></button>";
        }).join("") + "</div>";
    } else if (O.step === 1) {
      h = "<h1>Z kim pracujesz?</h1><p class=\"muted\">Od tego zależy, czy od razu zaproponujemy zaproszenie zespołu.</p>" +
        '<div class="ob-teams">' + TEAMS.map(function (t, i) { return '<button class="ob-team' + (O.team === t[0] ? " on" : "") + '" data-team="' + t[0] + '" style="--i:' + i + '">' + ico(t[2], 22) + "<b>" + t[1] + "</b></button>"; }).join("") + "</div>";
    } else if (O.step === 2) {
      var r = role();
      h = "<h1>Twoja przestrzeń</h1><p class=\"muted\">Przestrzeń to dział albo obszar pracy. W niej foldery, a w folderach listy zadań.</p>" +
        '<div class="ob-form"><label class="ob-fl">Nazwa przestrzeni<input class="input" data-f="space" value="' + esc(O.space) + '" maxlength="60" /></label>' +
        '<label class="ob-fl">Nazwa pierwszego folderu<input class="input" data-f="folder" value="' + esc(O.folder) + '" maxlength="60" /></label>' +
        '<div class="ob-fl">Listy w folderze<div class="ob-lists">' + O.lists.map(function (l, i) {
          return '<span class="ob-li' + (l.on ? "" : " off") + '"><button class="ob-lt" data-lt="' + i + '" aria-pressed="' + l.on + '" title="Włącz / wyłącz">' + ico("check", 11) + '</button><input data-ln="' + i + '" value="' + esc(l.name) + '" maxlength="40" style="width:' + Math.max(8, l.name.length + 1) + 'ch" /></span>';
        }).join("") + '<button class="ob-ladd" data-ladd>' + ico("plus", 13) + "Lista</button></div></div>" +
        (O.fresh ? '<label class="ob-check"><input type="checkbox" data-f="sample"' + (O.sample ? " checked" : "") + " /> Dodaj przykładowe zadania (" + r.tasks.length + ")" + (r.fields ? " i pola " + r.fields.map(function (x) { return "„" + x[0] + "”"; }).join(", ") : "") + "</label>" : "") + "</div>";
    } else {
      h = "<h1>Zaproś zespół do przestrzeni „" + esc(O.space) + "”</h1><p class=\"muted\">Wyślemy link z zaproszeniem – e-mailem, WhatsAppem, Telegramem albo SMS-em. Możesz to też zrobić później przyciskiem „Zaproś”.</p>" +
        '<div class="ob-form"><label class="ob-fl">E-maile (po przecinku)<textarea class="input" rows="3" data-f="emails" placeholder="ola@firma.pl, marek@firma.pl">' + esc(O.emails) + "</textarea></label>" +
        '<div class="ob-invite-art">' + ["#e84393", "#00a884", "#f39c12", "#0984e3"].map(function (c, i) { return '<span class="av" style="--c:' + c + ";--i:" + i + '">' + ["OL", "MK", "AN", "TZ"][i] + "</span>"; }).join("") + "</div></div>";
    }
    st.innerHTML = h; SP.hydrateIcons(st);
    if (!reduce && dir) st.animate([{ opacity: 0, transform: "translateX(" + (dir > 0 ? 28 : -28) + "px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
    var last = O.step === STEPS.length - 1;
    f.innerHTML = (O.step ? '<button class="btn ghost" data-back>' + ico("chevron-left", 15) + "Wstecz</button>" : "") + '<span class="grow"></span>' +
      (last ? '<button class="btn primary" data-go>' + ico("rocket", 16) + (O.emails.trim() ? "Utwórz i zaproś" : "Utwórz przestrzeń") + "</button>" : '<button class="btn primary" data-next' + (O.step === 0 && !O.role ? " disabled" : "") + ">Dalej" + ico("chevron-right", 15) + "</button>");
    SP.hydrateIcons(f);
    preview();
    var fi = st.querySelector("input.input, textarea"); if (fi && O.step >= 2) fi.focus();
  }
  /** Podgląd paska bocznego po prawej – buduje się w trakcie wpisywania. */
  function preview() {
    var r = role(), tree = O.bg.querySelector(".ob-tree");
    if (!r) { tree.innerHTML = '<div class="ob-ghost"></div><div class="ob-ghost s"></div><div class="ob-ghost"></div><div class="ob-ghost s"></div>'; return; }
    var key = [O.space, O.folder, O.lists.map(function (l) { return l.on ? l.name : ""; }).join("|"), O.step].join("/"), old = tree.dataset.k;
    tree.dataset.k = key;
    var lists = O.lists.filter(function (l) { return l.on && l.name.trim(); });
    var sampleN = O.fresh && O.sample ? r.tasks.length : 0;
    tree.innerHTML = '<div class="ob-t sp" style="--c:' + r.color + '"><span class="sp-ico sp-xs" style="--c:' + r.color + '">' + esc((O.space || "?")[0].toUpperCase()) + "</span>" + esc(O.space || "Przestrzeń") + "</div>" +
      '<div class="ob-t fo">' + ico("folder", 14) + esc(O.folder || "Folder") + "</div>" +
      lists.map(function (l, i) {
        var n = sampleN ? r.tasks.filter(function (t) { return t[3] === l.name; }).length : 0;
        return '<div class="ob-t li" style="--i:' + i + '"><span class="tr-dot"></span>' + esc(l.name) + (n ? '<span class="tr-c">' + n + "</span>" : "") + "</div>";
      }).join("") +
      (O.step >= 1 ? '<div class="ob-t team">' + ico(TEAMS.find(function (t) { return t[0] === O.team; })[2], 14) + TEAMS.find(function (t) { return t[0] === O.team; })[1] + "</div>" : "") +
      '<div class="ob-card"><span class="st-dot" style="--c:' + r.color + '"></span><span>' + esc((r.tasks[0] || [""])[0]) + "</span></div>";
    SP.hydrateIcons(tree);
    if (old !== key && !reduce) tree.querySelectorAll(".ob-t").forEach(function (e, i) { e.animate([{ opacity: .3, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: i * 25, easing: "ease-out" }); });
  }
  function onInput(e) {
    var t = e.target;
    if (t.dataset.f === "space") O.space = t.value;
    else if (t.dataset.f === "folder") O.folder = t.value;
    else if (t.dataset.f === "emails") { O.emails = t.value; var go = O.bg.querySelector("[data-go]"); if (go) { go.lastChild.textContent = O.emails.trim() ? "Utwórz i zaproś" : "Utwórz przestrzeń"; } return; }
    else if (t.dataset.f === "sample") O.sample = t.checked;
    else if (t.dataset.ln != null) { O.lists[+t.dataset.ln].name = t.value; t.style.width = Math.max(8, t.value.length + 1) + "ch"; }
    else return;
    preview();
  }
  function onClick(e) {
    var b;
    if ((b = e.target.closest("[data-role]"))) {
      setRole(b.dataset.role);
      O.bg.querySelectorAll(".ob-role").forEach(function (x) { x.classList.toggle("on", x === b); });
      if (!reduce) b.animate([{ transform: "scale(.96)" }, { transform: "scale(1.03)" }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.3,1.5,.6,1)" });
      var nx = O.bg.querySelector("[data-next]"); if (nx) nx.disabled = false;
      preview();
      setTimeout(function () { if (O && O.step === 0 && O.role === b.dataset.role) { O.step = 1; draw(1); } }, reduce ? 0 : 380);
      return;
    }
    if ((b = e.target.closest("[data-team]"))) { O.team = b.dataset.team; O.bg.querySelectorAll(".ob-team").forEach(function (x) { x.classList.toggle("on", x === b); }); preview(); setTimeout(function () { if (O && O.step === 1) { O.step = 2; draw(1); } }, reduce ? 0 : 300); return; }
    if ((b = e.target.closest("[data-lt]"))) { var l = O.lists[+b.dataset.lt]; l.on = !l.on; b.setAttribute("aria-pressed", l.on); b.parentNode.classList.toggle("off", !l.on); preview(); return; }
    if (e.target.closest("[data-ladd]")) { O.lists.push({ name: "Nowa lista", on: true }); draw(); var ins = O.bg.querySelectorAll("[data-ln]"); var li = ins[ins.length - 1]; li.focus(); li.select(); return; }
    if (e.target.closest("[data-next]")) { if (O.step === 0 && !O.role) return; O.step++; draw(1); return; }
    if (e.target.closest("[data-back]")) { O.step--; draw(-1); return; }
    if (e.target.closest("[data-skip]")) { db.raw.profile = { role: O.role, team: O.team, skipped: true, at: new Date().toISOString() }; db.changed("profile"); close(); return; }
    if (e.target.closest("[data-go]")) build();
  }
  function onKey(e) {
    if (!O) return;
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); }
    if (e.key === "Enter" && !e.shiftKey && O.step >= 2 && e.target.tagName === "INPUT") { e.preventDefault(); var b = O.bg.querySelector("[data-next],[data-go]"); if (b) b.click(); }
  }
  function close() { if (!O) return; O.bg.remove(); document.removeEventListener("keydown", onKey, true); O = null; }

  /** Tworzy przestrzeń, folder, listy, pola, tagi i zadania; animacja „składania”, potem lista i (opcjonalnie) zaproszenie. */
  function build() {
    var r = role(); if (!r) return;
    var spaceName = O.space.trim() || r.space, folderName = O.folder.trim() || r.folder;
    var lists = O.lists.filter(function (l) { return l.on && l.name.trim(); }).map(function (l) { return l.name.trim(); });
    if (!lists.length) lists = [r.lists[0]];
    var emails = O.emails.split(/[,;\s]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    // Pusty projekt z rejestracji (jedna przestrzeń, jedna pusta lista) przerabiamy, zamiast dokładać obok.
    var sp, reuse = O.fresh && db.raw.spaces.length === 1 && db.raw.lists.length === 1;
    if (reuse) { sp = db.raw.spaces[0]; sp.name = spaceName; sp.color = r.color; } else sp = db.createSpace(spaceName, r.color);
    var fo = db.createFolder(sp.id, folderName), made = {};
    lists.forEach(function (n, i) {
      if (i === 0 && reuse) { var l0 = db.raw.lists[0]; l0.name = n; l0.folderId = fo.id; l0.spaceId = sp.id; made[n] = l0; }
      else made[n] = db.createList(sp.id, fo.id, n);
    });
    var firstList = made[lists[0]];
    if (O.fresh && O.sample) {
      (r.fields || []).forEach(function (f) { Object.keys(made).forEach(function (n) { if (db.addField) db.addField(made[n].id, { name: f[0], type: f[1] }); }); });
      r.tags.forEach(function (t) { if (!db.tag(t)) db.createTag(t); });
      r.tasks.forEach(function (t) {
        var l = made[t[3]] || firstList, due = typeof t[1] === "string" ? wd(+t[1].slice(2)) : D.add(D.today(), t[1]);
        db.createTask({ listId: l.id, title: t[0], due: due, priority: t[2] || null, assignees: ["me"], tags: t[4] || [] });
      });
    }
    db.raw.profile = { role: r.id, team: O.team, at: new Date().toISOString() };
    db.raw.ui.expanded[sp.id] = true; db.raw.ui.expanded[fo.id] = true;
    db.changed("tree");
    var done = function () {
      close();
      location.hash = "#/list/" + firstList.id;
      SP.toast("Gotowe! Przestrzeń „" + spaceName + "” czeka na Ciebie");
      if (SP.celebrate) setTimeout(function () { SP.celebrate(innerWidth / 2, innerHeight / 3, 40); }, 200);
      if (emails.length && SP.inviteDialog) setTimeout(function () { SP.inviteDialog({ email: emails.join(", ") }); }, 900);
    };
    // Animacja „składania”: elementy podglądu dostają odhaczenia jeden po drugim
    var main = O.bg.querySelector(".ob-main");
    main.querySelector(".ob-step").innerHTML = '<div class="ob-build"><span class="ob-orb">' + ico("rocket", 30) + "</span><h1>Składamy Twoją przestrzeń…</h1><ul>" +
      [["layout-dashboard", "Przestrzeń „" + spaceName + "”"], ["folder", "Folder „" + folderName + "”"], ["list", lists.length + " " + (lists.length === 1 ? "lista" : lists.length < 5 ? "listy" : "list") + ": " + lists.join(", ")]]
        .concat(O.fresh && O.sample ? [["check", r.tasks.length + " przykładowych zadań"]] : []).concat(emails.length ? [["users", "Zaproszenie dla " + emails.length + " " + (emails.length === 1 ? "osoby" : "osób")]] : [])
        .map(function (x, i) { return '<li style="--i:' + i + '">' + ico(x[0], 16) + "<span>" + esc(x[1]) + '</span><i class="ob-tick">' + ico("check", 12) + "</i></li>"; }).join("") + "</ul></div>";
    O.bg.querySelector(".ob-f").innerHTML = ""; O.bg.querySelector(".ob-skip").hidden = true;
    SP.hydrateIcons(main);
    var items = main.querySelectorAll(".ob-build li");
    if (reduce) { done(); return; }
    items.forEach(function (li, i) { setTimeout(function () { li.classList.add("ok"); }, 350 + i * 380); });
    setTimeout(function () { O && O.bg.classList.add("leaving"); }, 450 + items.length * 380);
    setTimeout(done, 900 + items.length * 380);
  }

  setTimeout(function () { if (shouldShow()) SP.onboarding(); }, 300);
})();
