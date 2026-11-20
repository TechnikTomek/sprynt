/* Sprynt – logowanie i rejestracja. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var ico = function (n, s) { return SP.icon(n, { size: s || 17 }); };
  SP.hydrateIcons();

  // Ekran logowania żyje w app.html: po zalogowaniu wystarczy przeładować ten sam plik
  // (ta sama pamięć przeglądarki – bez przekierowań między stronami).
  function enterApp() { history.replaceState(null, "", location.pathname + (/^#\//.test(location.hash) ? location.hash : "#/home")); location.reload(); }
  if (SPAuth.current() && SPAuth.urlAuth !== "recovery") { enterApp(); return; }

  /* ---- Zaproszenie (#join=…): baner i wpisany e-mail ---- */
  var joinCode = null; try { joinCode = sessionStorage.getItem("sprynt:join"); } catch (e) {}
  if (joinCode && window.DecompressionStream) {
    (function () {
      var s = joinCode.slice(1).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
      var b = atob(s), u8 = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
      var txt = joinCode.charAt(0) === "j" ? Promise.resolve(new TextDecoder().decode(u8)) : new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      txt.then(JSON.parse).then(function (inv) {
        var from = (inv.from && (inv.from.name || inv.from.email)) || "Znajomy", sp = (inv.snapshot && inv.snapshot.spaces || []).map(function (x) { return "„" + x.name + "”"; }).join(", ");
        var ban = document.createElement("div"); ban.className = "join-ban";
        ban.innerHTML = ico("users", 18) + "<div><b></b><span></span></div>";
        ban.querySelector("b").textContent = from + " zaprasza Cię do Sprynt";
        ban.querySelector("span").textContent = sp ? "Załóż konto (albo zaloguj się), a od razu zobaczysz: " + sp + "." : "Załóż konto, żeby dołączyć do zespołu.";
        var card = $("#card"); card.insertBefore(ban, card.querySelector(".tabs"));
        if (inv.to && inv.to.email && !$("#email").value) $("#email").value = inv.to.email;
        if (inv.to && inv.to.name && !$("#name").value) $("#name").value = inv.to.name;
      }).catch(function () {});
    })();
  }

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
    (mode === "register" ? SPAuth.register(data) : SPAuth.login(data)).then(function (res) {
      pw.value = "";
      if (res && res.pending) { btn.disabled = false; btn.classList.remove("busy"); showPending(res.email); return; }
      enterApp();
    }, function (err) {
      showErr(err.message || "Coś poszło nie tak.", err.field);
      if (err.code === "email_not_confirmed") addResend($("#email").value);
      btn.disabled = false; btn.classList.remove("busy");
    });
  });

  /* ================= Tryb chmury: e-mail z potwierdzeniem, reset hasła ================= */
  if (SPAuth.cloud) {
    var note = document.querySelector(".note");
    if (note) note.innerHTML = ico("lock", 14) + "Konto i dane są bezpiecznie zapisywane w chmurze – zalogujesz się na każdym urządzeniu. Hasło jest szyfrowane, a Twoje dane widzisz tylko Ty.";
    var forgot = document.createElement("button"); forgot.type = "button"; forgot.className = "forgot"; forgot.textContent = "Nie pamiętasz hasła?";
    $("#password").closest(".field").appendChild(forgot);
    var syncForgot = function () { forgot.hidden = mode === "register"; };
    syncForgot(); addEventListener("hashchange", syncForgot); $("#tabLogin").addEventListener("click", syncForgot); $("#tabRegister").addEventListener("click", syncForgot);
    forgot.onclick = function () { panel("reset"); };
  }
  /** Zastępuje formularz panelem informacyjnym (sprawdź skrzynkę, reset hasła, nowe hasło). */
  function panel(kind, email) {
    var card = $("#card"), box = document.createElement("div"); box.className = "auth-panel";
    card.querySelectorAll(".tabs, #form, .switch, #err").forEach(function (e) { e.hidden = true; });
    var old = card.querySelector(".auth-panel"); if (old) old.remove();
    var back = '<button type="button" class="link back">← Wróć do logowania</button>';
    if (kind === "pending") {
      $("#h").textContent = "Sprawdź skrzynkę"; $("#sub").textContent = "";
      box.innerHTML = '<div class="ap-ico">' + ico("mail", 28) + '</div><p>Wysłaliśmy link potwierdzający na <b></b>. Kliknij go, a od razu wejdziesz do Sprynt.</p><p class="muted small">Nie widzisz e-maila? Zajrzyj do spamu albo wyślij go ponownie.</p><button type="button" class="submit" data-resend>Wyślij link ponownie</button>' + back;
      box.querySelector("b").textContent = email;
    } else if (kind === "reset") {
      $("#h").textContent = "Reset hasła"; $("#sub").textContent = "Wyślemy Ci link do ustawienia nowego hasła.";
      box.innerHTML = '<div class="field"><label for="rmail">E-mail</label><div class="input-ico">' + ico("mail", 17) + '<input id="rmail" type="email" autocomplete="email" placeholder="ty@firma.pl" /></div></div><div class="error" data-e hidden></div><button type="button" class="submit" data-send>Wyślij link</button>' + back;
      box.querySelector("#rmail").value = $("#email").value;
    } else if (kind === "sent") {
      $("#h").textContent = "Sprawdź skrzynkę"; $("#sub").textContent = "";
      box.innerHTML = '<div class="ap-ico">' + ico("mail", 28) + '</div><p>Jeśli konto <b></b> istnieje, wysłaliśmy na nie link do ustawienia nowego hasła.</p>' + back;
      box.querySelector("b").textContent = email;
    } else if (kind === "newpass") {
      $("#h").textContent = "Ustaw nowe hasło"; $("#sub").textContent = "Co najmniej 8 znaków.";
      box.innerHTML = '<div class="field"><label for="npw">Nowe hasło</label><div class="input-ico">' + ico("lock", 17) + '<input id="npw" type="password" autocomplete="new-password" /></div></div><div class="error" data-e hidden></div><button type="button" class="submit" data-set>Zapisz hasło i wejdź</button>';
    } else if (kind === "wait") {
      $("#h").textContent = "Potwierdzam…"; $("#sub").textContent = "";
      box.innerHTML = '<div class="ap-ico spin">' + ico("lock", 26) + "</div><p>Sprawdzam link z e-maila.</p>";
    } else if (kind === "linkerr") {
      $("#h").textContent = "Link nie działa"; $("#sub").textContent = "";
      box.innerHTML = '<div class="ap-ico bad">' + ico("x", 26) + '</div><p></p><p class="muted small">Linki z e-maila działają raz i wygasają po pewnym czasie. Zaloguj się albo wyślij nowy link.</p>' + back;
      box.querySelector("p").textContent = email || "Link wygasł albo został już użyty.";
    }
    card.insertBefore(box, card.querySelector(".note"));
    var b;
    if ((b = box.querySelector(".back"))) b.onclick = function () { box.remove(); card.querySelectorAll(".tabs, #form, .switch").forEach(function (e) { e.hidden = false; }); history.replaceState(null, "", location.pathname + "#login"); setMode("login", true); };
    if ((b = box.querySelector("[data-resend]"))) b.onclick = function () { var bb = this; bb.disabled = true; SPAuth.resend(email).then(function () { bb.textContent = "Wysłano ✓"; }, function (e) { bb.disabled = false; bb.textContent = e.message; }); };
    if ((b = box.querySelector("[data-send]"))) b.onclick = function () {
      var bb = this, m = box.querySelector("#rmail").value, er = box.querySelector("[data-e]"); bb.disabled = true;
      SPAuth.resetPassword(m).then(function () { panel("sent", m.trim().toLowerCase()); }, function (e) { er.textContent = e.message; er.hidden = false; bb.disabled = false; });
    };
    if ((b = box.querySelector("[data-set]"))) b.onclick = function () {
      var bb = this, er = box.querySelector("[data-e]"); bb.disabled = true;
      SPAuth.setNewPassword(box.querySelector("#npw").value).then(function () { enterApp(); }, function (e) { er.textContent = e.message; er.hidden = false; bb.disabled = false; });
    };
    var f = box.querySelector("input"); if (f) f.focus();
  }
  function showPending(email) { panel("pending", email); }
  function addResend(email) {
    var er = $("#err"); if (!er || er.querySelector("button")) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = " Wyślij link ponownie";
    b.onclick = function () { b.disabled = true; SPAuth.resend(email).then(function () { b.textContent = " Wysłano ✓"; }, function (e) { b.textContent = " " + e.message; }); };
    er.appendChild(b);
  }
  // Link z e-maila: potwierdzenie konta albo reset hasła (supabase-js odczytuje token z adresu).
  if (SPAuth.cloud && SPAuth.urlAuth) {
    if (SPAuth.urlAuth === "error") panel("linkerr", SPAuth.urlError);
    else {
      panel("wait");
      var t0 = Date.now();
      (function waitSession() {
        if (SPAuth.current()) { if (SPAuth.urlAuth === "recovery") panel("newpass"); else enterApp(); return; }
        if (Date.now() - t0 > 12000) { panel("linkerr", "Nie udało się potwierdzić linku."); return; }
        setTimeout(waitSession, 200);
      })();
    }
  }
})();
