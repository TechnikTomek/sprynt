/* Sprynt – logotypy marek (serwer MCP thesvg, thesvg.org, kind "brand") i wysyłanie tekstu do innych aplikacji.
 * Logotypy to pliki img/logos/<slug>.svg wstawiane jako <img> (zachowują oryginalne kolory marek, nie da się
 * w nich wykonać skryptu). Ikony interfejsu nadal tylko z js/icons.js (thesvg UI, glass). Lista: icons/README.md. */
(function () {
  "use strict";
  var SP = (window.SP = window.SP || {});
  var NAMES = {
    claude: "Claude", "microsoft-excel": "Microsoft Excel", "microsoft-word": "Microsoft Word", pdf: "PDF", libreoffice: "LibreOffice",
    "google-calendar": "Google Calendar", "microsoft-outlook": "Microsoft Outlook", apple: "Apple", whatsapp: "WhatsApp", telegram: "Telegram", gmail: "Gmail",
  };
  SP.BRANDS = NAMES;
  var PUBLIC_APP = "https://techniktomek.github.io/sprynt/app.html";

  /** <img> z logo marki. Apple ma dwie wersje (czarną i białą) – CSS pokazuje właściwą dla motywu. */
  SP.logo = function (slug, size, o) {
    o = o || {};
    size = size || 20;
    var alt = o.alt != null ? o.alt : NAMES[slug] || slug, cls = "brand-logo" + (o.cls ? " " + o.cls : "");
    var img = function (file, extra) { return '<img class="' + cls + (extra || "") + '" src="img/logos/' + file + '.svg" width="' + size + '" height="' + size + '" alt="' + alt + '" decoding="async" />'; };
    return slug === "apple" ? img("apple-light", " logo-on-light") + img("apple-dark", " logo-on-dark") : img(slug);
  };
  /** Logo programu dla pliku (Word, Excel, PDF, LibreOffice) albo null. */
  SP.logoSlugFor = function (name) {
    var ext = ((name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
    if (/^(docx?|rtf)$/.test(ext)) return "microsoft-word";
    if (/^(xlsx?|xlsm|csv)$/.test(ext)) return "microsoft-excel";
    if (ext === "pdf") return "pdf";
    if (/^(odt|ods|odp)$/.test(ext)) return "libreoffice";
    return null;
  };

  /** Adresy „napisz wiadomość” w innych aplikacjach. Długi tekst skracamy – adresy URL mają limity. */
  function cut(text, max) { return text.length > max ? text.slice(0, max - 40).replace(/\s+\S*$/, "") + "\n…\n(pełna wersja w Sprynt)" : text; }
  var TARGETS = [
    ["whatsapp", "WhatsApp", function (s) { return "https://wa.me/?text=" + encodeURIComponent(cut(s.text, 1800)); }],
    ["telegram", "Telegram", function (s) { return "https://t.me/share/url?url=" + encodeURIComponent(s.url || PUBLIC_APP) + "&text=" + encodeURIComponent(cut(s.text, 1800)); }],
    ["gmail", "Gmail", function (s) { return "https://mail.google.com/mail/?view=cm&fs=1&su=" + encodeURIComponent(s.subject || "") + "&body=" + encodeURIComponent(cut(s.text, 1800)); }],
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
      { label: "Kopiuj tekst", icon: "copy", run: function () {
        (navigator.clipboard ? navigator.clipboard.writeText(s.text) : Promise.reject()).then(function () { SP.toast && SP.toast("Skopiowano"); }, function () { SP.toast && SP.toast("Nie udało się skopiować"); });
      } },
    ]).filter(Boolean);
    SP.menu(anchor, items, opts);
  };
})();
