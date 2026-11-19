/* Sprynt – logowanie i rejestracja. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var ico = function (n, s) { return SP.icon(n, { size: s || 17 }); };
  SP.hydrateIcons();

  // Ekran logowania żyje w app.html: po zalogowaniu wystarczy przeładować ten sam plik
  // (ta sama pamięć przeglądarki – bez przekierowań między stronami).
  function enterApp() { history.replaceState(null, "", location.pathname + (/^#\//.test(location.hash) ? location.hash : "#/home")); location.reload(); }
  if (SPAuth.current()) { enterApp(); return; }

  /* ---- Motyw ---- */
  function drawTheme() { var d = SPTheme.current() === "dark"; $("#themeBtn").innerHTML = ico(d ? "sun" : "moon", 20); $("#themeBtn").title = d ? "Jasny motyw" : "Ciemny motyw"; }
  $("#themeBtn").onclick = function () { SPTheme.toggle(); };
  addEventListener("themechange", drawTheme); drawTheme();

  /* ---- Tryb: logowanie / rejestracja ---- */
  var mode = "login";
  function setMode(m, focus) {
    mode = m;
    var reg = m === "register";
    $("#tabs").classList.toggle("reg", reg);
    $("#tabLogin").setAttribute("aria-selected", String(!reg));
    $("#tabRegister").setAttribute("aria-selected", String(reg));
    document.querySelectorAll(".reg-only").forEach(function (el) { el.hidden = !reg; });
    $("#h").textContent = reg ? "Załóż konto" : "Witaj ponownie";
    $("#sub").textContent = reg ? "Minuta i masz własny, pusty projekt gotowy do pracy." : "Zaloguj się, żeby wrócić do swoich projektów.";
    $("#submitLbl").textContent = reg ? "Utwórz konto" : "Zaloguj się";
    $("#switchTxt").textContent = reg ? "Masz już konto?" : "Nie masz konta?";
    $("#switchLink").textContent = reg ? "Zaloguj się" : "Załóż je za darmo";
    $("#switchLink").setAttribute("href", reg ? "#login" : "#register");
    $("#password").autocomplete = reg ? "new-password" : "current-password";
    document.title = (reg ? "Załóż konto" : "Zaloguj się") + " · Sprynt";
    showErr("");
    if (focus) (reg ? $("#name") : $("#email")).focus();
  }
  $("#tabLogin").onclick = function () { history.replaceState(null, "", "#login"); setMode("login", true); };
  $("#tabRegister").onclick = function () { history.replaceState(null, "", "#register"); setMode("register", true); };
  addEventListener("hashchange", function () { if (/^#(login|register)$/.test(location.hash)) setMode(location.hash === "#register" ? "register" : "login", true); });
  setMode(location.hash === "#register" ? "register" : "login", true);

  /* ---- Pokaż/ukryj hasło + siła hasła ---- */
  var pw = $("#password"), eye = $("#eye");
  function drawEye() { var shown = pw.type === "text"; eye.innerHTML = ico(shown ? "eye-off" : "eye", 17); eye.setAttribute("aria-label", shown ? "Ukryj hasło" : "Pokaż hasło"); }
  eye.onclick = function () { pw.type = pw.type === "password" ? "text" : "password"; drawEye(); pw.focus(); };
  drawEye();
  pw.addEventListener("input", function () {
    var v = pw.value, score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[A-ZĄĆĘŁŃÓŚŹŻ]/.test(v) && /[a-ząćęłńóśźż]/.test(v)) score++;
    if (/\d/.test(v) && /[^\w\s]/.test(v)) score++;
    var m = $("#meter");
    m.style.width = (v ? Math.max(15, score * 25) : 0) + "%";
    m.style.background = score <= 1 ? "var(--danger)" : score === 2 ? "#f0a020" : "var(--ok)";
  });

  /* ---- Wysyłka ---- */
  function showErr(msg, field) {
    document.querySelectorAll("input.bad").forEach(function (i) { i.classList.remove("bad"); });
    $("#err").textContent = msg; $("#err").hidden = !msg;
    if (field) { var f = document.getElementById(field); if (f) { void f.offsetWidth; f.classList.add("bad"); f.focus(); } }
  }
  document.querySelectorAll("input").forEach(function (i) { i.addEventListener("input", function () { i.classList.remove("bad"); }); });
  $("#form").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#submit");
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add("busy");
    var data = { name: $("#name").value, email: $("#email").value, password: pw.value, project: $("#project").value, remember: $("#remember").checked };
    (mode === "register" ? SPAuth.register(data) : SPAuth.login(data)).then(function () {
      pw.value = "";
      enterApp();
    }, function (err) {
      showErr(err.message || "Coś poszło nie tak.", err.field);
      btn.disabled = false; btn.classList.remove("busy");
    });
  });
})();
