/* Sprynt – logotypy marek (serwer MCP thesvg, thesvg.org, kind "brand") i wysyłanie tekstu do innych aplikacji.
 * Logotypy to pliki img/logos/<slug>.svg wstawiane jako <img> (zachowują oryginalne kolory marek, nie da się
 * w nich wykonać skryptu). Ikony interfejsu nadal tylko z js/icons.js (thesvg UI, glass). Lista: icons/README.md. */
(function () {
  "use strict";
  var SP = (window.SP = window.SP || {});
  var NAMES = {
    claude: "Claude", "microsoft-excel": "Microsoft Excel", "microsoft-word": "Microsoft Word", pdf: "PDF", libreoffice: "LibreOffice",
    "google-calendar": "Google Calendar", "microsoft-outlook": "Microsoft Outlook", apple: "Apple", whatsapp: "WhatsApp", telegram: "Telegram", gmail: "Gmail",
    "google-docs": "Google Docs", "google-sheets": "Google Sheets", notion: "Notion", obsidian: "Obsidian", markdown: "Markdown", "microsoft-teams": "Microsoft Teams",
    slack: "Slack", github: "GitHub", anthropic: "Anthropic", chrome: "Chrome", firefox: "Firefox", safari: "Safari", edge: "Edge", windows: "Windows", android: "Android", linux: "Linux",
  };
  /** Marki z osobną wersją na jasne i ciemne tło (pliki <slug>-light.svg / <slug>-dark.svg). */
  var THEMED = { apple: 1, github: 1, anthropic: 1, markdown: 1, notion: 1 };
  SP.BRANDS = NAMES;
  var PUBLIC_APP = "https://techniktomek.github.io/sprynt/app.html";

  /** <img> z logo marki. Apple ma dwie wersje (czarną i białą) – CSS pokazuje właściwą dla motywu. */
  SP.logo = function (slug, size, o) {
    o = o || {};
    size = size || 20;
    var alt = o.alt != null ? o.alt : NAMES[slug] || slug, cls = "brand-logo" + (o.cls ? " " + o.cls : "");
    var img = function (file, extra) { return '<img class="' + cls + (extra || "") + '" src="img/logos/' + file + '.svg" width="' + size + '" height="' + size + '" alt="' + alt + '" decoding="async" />'; };
    return THEMED[slug] ? img(slug + "-light", " logo-on-light") + img(slug + "-dark", " logo-on-dark") : img(slug);
  };
  /** Logo programu dla pliku (Word, Excel, PDF, LibreOffice) albo null. */
  SP.logoSlugFor = function (name) {
    var ext = ((name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
    if (/^(docx?|rtf)$/.test(ext)) return "microsoft-word";
    if (/^(xlsx?|xlsm|csv)$/.test(ext)) return "microsoft-excel";
    if (ext === "pdf") return "pdf";
    if (/^(odt|ods|odp)$/.test(ext)) return "libreoffice";
    if (/^(md|markdown)$/.test(ext)) return "markdown";
    return null;
  };

  /** Adresy „napisz wiadomość” w innych aplikacjach. Długi tekst skracamy – adresy URL mają limity. */
  function cut(text, max) { return text.length > max ? text.slice(0, max - 40).replace(/\s+\S*$/, "") + "\n…\n(pełna wersja w Sprynt)" : text; }
  var TARGETS = [
    ["whatsapp", "WhatsApp", function (s) { return "https://wa.me/?text=" + encodeURIComponent(cut(s.text, 1800)); }],
    ["telegram", "Telegram", function (s) { return "https://t.me/share/url?url=" + encodeURIComponent(s.url || PUBLIC_APP) + "&text=" + encodeURIComponent(cut(s.text, 1800)); }],
    ["gmail", "Gmail", function (s) { return "https://mail.google.com/mail/?view=cm&fs=1&su=" + encodeURIComponent(s.subject || "") + "&body=" + encodeURIComponent(cut(s.text, 1800)); }],
    ["microsoft-teams", "Microsoft Teams", function (s) { return "https://teams.microsoft.com/share?href=" + encodeURIComponent(s.url || PUBLIC_APP) + "&msgText=" + encodeURIComponent(cut(s.text, 1500)); }],
    ["microsoft-outlook", "Outlook", function (s) { return "https://outlook.office.com/mail/deeplink/compose?subject=" + encodeURIComponent(s.subject || "") + "&body=" + encodeURIComponent(cut(s.text, 1800)); }],
  ];
  /** Menu „Wyślij przez…”: WhatsApp, Telegram, Gmail, Outlook, e-mail, udostępnianie systemowe, kopiowanie. s = {subject, text, url?} */
  SP.shareText = function (anchor, s, opts) {
    if (!SP.menu) return;
    var items = [{ header: "Wyślij przez" }].concat(TARGETS.map(function (t) {
      return { html: '<span class="pm-logo">' + SP.logo(t[0], 16, { alt: "" }) + "</span><span>" + t[1] + "</span>", run: function () { window.open(t[2](s), "_blank", "noopener"); } };
    }), [
      { label: "E-mail (program pocztowy)", icon: "mail", run: function () { location.href = "mailto:?subject=" + encodeURIComponent(s.subject || "") + "&body=" + encodeURIComponent(cut(s.text, 1800)); } },
      navigator.share ? { label: "Udostępnij…", icon: "arrow-up-right", run: function () { navigator.share({ title: s.subject, text: s.text }).catch(function () {}); } } : null,
      "-",
      { html: SP.ico ? SP.ico("copy", 16) + '<span>Kopiuj tekst</span><span class="pm-logos">' + ["slack", "notion", "github"].map(function (b) { return SP.logo(b, 13, { alt: "" }); }).join("") + "</span>" : "<span>Kopiuj tekst</span>", run: function () {
        (navigator.clipboard ? navigator.clipboard.writeText(s.text) : Promise.reject()).then(function () { SP.toast && SP.toast("Skopiowano"); }, function () { SP.toast && SP.toast("Nie udało się skopiować"); });
      } },
    ]).filter(Boolean);
    SP.menu(anchor, items, opts);
  };

  /** Jak zainstalować Sprynt jako aplikację (PWA) – z logotypami przeglądarek; bieżąca przeglądarka na górze. */
  SP.installHelp = function () {
    if (!SP.el) return;
    var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
    var cur = /Edg\//.test(ua) ? "edge" : /Firefox\//.test(ua) ? "firefox" : /Chrome\//.test(ua) && !/OPR\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "";
    var rows = [
      ["chrome", "Chrome", "Na komputerze: ikona instalacji na końcu paska adresu albo menu ⋮ → „Zainstaluj Sprynt…”. Na Androidzie: menu ⋮ → „Dodaj do ekranu głównego”.", ["windows", "apple", "linux", "android"]],
      ["edge", "Edge", "Menu … → Aplikacje → „Zainstaluj tę witrynę jako aplikację”.", ["windows", "apple"]],
      ["safari", "Safari", ios ? "Przycisk Udostępnij → „Do ekranu początkowego”." : "Na Macu: Plik → „Dodaj do Docka”. Na iPhonie i iPadzie: Udostępnij → „Do ekranu początkowego”.", ["apple"]],
      ["firefox", "Firefox", android ? "Menu ⋮ → „Zainstaluj”." : "Na komputerze Firefox nie instaluje aplikacji – dodaj Sprynt do zakładek albo użyj Chrome/Edge. Na Androidzie: menu ⋮ → „Zainstaluj”.", ["android"]],
    ].sort(function (a, b) { return (b[0] === cur) - (a[0] === cur); });
    var bg = SP.el('<div class="dlg-bg"><div class="dlg inst-help" role="dialog" aria-modal="true" aria-label="Zainstaluj Sprynt"><h2>Zainstaluj Sprynt jako aplikację</h2>' +
      '<p class="muted">Po instalacji Sprynt otwiera się w osobnym oknie, ma ikonę jak zwykły program i działa także bez internetu.</p><div class="ics-list">' +
      rows.map(function (r) {
        return '<div class="ics-i' + (r[0] === cur ? " cur" : "") + '"><span class="ics-logo">' + SP.logo(r[0], 28) + "</span><div><b>" + r[1] + (r[0] === cur ? ' <span class="inst-cur">Twoja przeglądarka</span>' : "") + '</b><small class="muted">' + r[2] + '</small></div><span class="inst-os">' + r[3].map(function (o) { return SP.logo(o, 14); }).join("") + "</span></div>";
      }).join("") + '</div><div class="dlg-acts"><button class="btn primary" data-ok>Rozumiem</button></div></div></div>');
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.querySelector("[data-ok]").onclick = close;
    document.body.appendChild(bg); bg.querySelector("[data-ok]").focus();
  };
})();
