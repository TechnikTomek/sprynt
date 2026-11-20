/* Sprynt – zapraszanie znajomych naprawdę: zaproszenie wychodzi e-mailem, WhatsAppem, Telegramem,
 * SMS-em albo przez systemowe „Udostępnij”. Link zawiera skompresowaną kopię wybranych przestrzeni
 * (#join=…): znajomy zakłada konto i od razu ma u siebie projekt z zadaniami. Ponowne zaproszenie
 * od tej samej osoby aktualizuje przestrzeń zamiast ją dublować. Bez serwera nie ma synchronizacji
 * na żywo – to uczciwie mówimy w oknie zaproszenia. */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico, views = SP.views;
  var PUBLIC_APP = "https://techniktomek.github.io/sprynt/app.html";
  var JOIN = "sprynt:join";

  /* ---- kodowanie zaproszenia: JSON → gzip → base64url ---- */
  function toB64url(u8) { var s = "", CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function fromB64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), u8 = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; }
  function encode(obj) {
    var bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (!window.CompressionStream) return Promise.resolve("j" + toB64url(bytes));
    return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer().then(function (b) { return "z" + toB64url(new Uint8Array(b)); });
  }
  function decode(code) {
    var kind = code.charAt(0), u8 = fromB64url(code.slice(1));
    if (kind === "j") return Promise.resolve(JSON.parse(new TextDecoder().decode(u8)));
    return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(JSON.parse);
  }
  SP.inviteCodec = { encode: encode, decode: decode };
  function appUrl() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : PUBLIC_APP; }

  /* =================== Okno zaproszenia =================== */
  SP.inviteDialog = function (pre) {
    pre = pre || {};
    var spaces = db.raw.spaces, curSpace = (/^#\/(?:space|list|folder)\/([^/]+)/.exec(location.hash) || [])[1];
    var cur = spaces.find(function (s) { return s.id === curSpace; }) || (db.list(curSpace) && db.space(db.list(curSpace).spaceId)) || spaces[0];
    var bg = SP.el('<div class="dlg-bg"><form class="dlg inv" role="dialog" aria-modal="true" aria-label="Zaproś znajomych">' +
      '<div class="kb-h"><h2>' + ico("users", 20) + 'Zaproś znajomych</h2><button type="button" class="ibtn" data-x>' + ico("x", 17) + "</button></div>" +
      '<div class="inv-step1"><div class="dlg-field"><label for="inv-mail">E-mail znajomego (możesz wpisać kilka po przecinku)</label><input class="input" id="inv-mail" name="mail" placeholder="ola@firma.pl, marek@gmail.com" autocomplete="off" value="' + esc(pre.email || "") + '" /></div>' +
      '<div class="dlg-field"><label for="inv-name">Imię (gdy wysyłasz WhatsAppem lub SMS-em, bez e-maila)</label><input class="input" id="inv-name" name="name" placeholder="np. Kasia" autocomplete="off" value="' + esc(pre.name || "") + '" /></div>' +
      '<div class="dlg-field"><label>Co udostępnić</label><div class="inv-spaces">' + spaces.map(function (s) {
        var n = db.tasksIn({ type: "space", id: s.id }, { subtasks: true }).length;
        return '<label class="inv-sp"><input type="checkbox" name="sp" value="' + s.id + '"' + (cur && s.id === cur.id ? " checked" : "") + " />" + SP.spaceIcon(s, "xs") + "<span>" + esc(s.name) + '</span><small class="muted">' + n + " zadań</small></label>";
      }).join("") + '</div><small class="muted">Bez zaznaczenia znajomy dołączy tylko do zespołu, bez zadań.</small></div>' +
      '<div class="dlg-field"><label for="inv-msg">Wiadomość</label><textarea class="input inv-msg" id="inv-msg" name="msg" rows="3">Cześć! Zapraszam Cię do mojego projektu w Sprynt – kliknij link, załóż konto i od razu zobaczysz nasze zadania.</textarea></div>' +
      '<div class="dlg-acts"><button type="button" class="btn ghost" data-x>Anuluj</button><button class="btn primary">' + ico("send-horizontal", 15) + "Utwórz zaproszenie</button></div></div>" +
      '<div class="inv-step2" hidden></div></form></div>');
    function close() { bg.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape" && !document.querySelector(".popover")) { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(); });
    bg.querySelectorAll("[data-x]").forEach(function (b) { b.onclick = close; });
    var form = bg.querySelector("form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var mails = form.mail.value.split(/[,;\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
      var bad = mails.filter(function (m) { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m); });
      if (bad.length) { SP.toast("To nie wygląda na e-mail: " + bad[0]); form.mail.focus(); return; }
      var name = form.name.value.trim();
      if (!mails.length && !name) { SP.toast("Wpisz e-mail albo imię znajomego"); form.mail.focus(); return; }
      var spIds = Array.prototype.slice.call(form.querySelectorAll('input[name="sp"]:checked')).map(function (i) { return i.value; });
      // osoby w zespole (zaproszone)
      var people = mails.map(function (m) { return db.raw.people.find(function (p) { return (p.email || "").toLowerCase() === m; }) || db.invite(m); });
      if (!mails.length && name) people.push(db.addPerson(name));
      if (name && mails.length === 1 && people[0] && people[0].invited) { people[0].name = name; db.changed("people"); }
      var msg = form.msg.value.trim();
      var payload = { v: 1, at: new Date().toISOString(), msg: msg, from: { name: SP.user.name, email: SP.user.email }, to: { email: mails[0] || "", name: name || (people[0] && people[0].name) || "" }, snapshot: spIds.length ? db.shareSnapshot(spIds) : { people: db.shareSnapshot([]).people } };
      encode(payload).then(function (code) {
        var link = appUrl() + "#join=" + code;
        step2(link, people.filter(Boolean), mails, msg, spIds);
      });
    });
    function step2(link, people, mails, msg, spIds) {
      var names = spIds.map(function (id) { return "„" + (db.space(id) || {}).name + "”"; }).join(", ");
      var subject = SP.user.name + " zaprasza Cię do Sprynt" + (names ? " – " + names : "");
      var body = msg + "\n\n" + link + "\n\n– " + SP.user.name;
      var s2 = bg.querySelector(".inv-step2");
      bg.querySelector(".inv-step1").hidden = true; s2.hidden = false;
      s2.innerHTML = '<p class="inv-ok">' + ico("check", 16) + "Zaproszenie gotowe" + (names ? " – udostępniasz " + esc(names) : "") + ". Wyślij je:</p>" +
        '<div class="inv-ch">' +
        (mails.length ? '<button type="button" class="inv-b" data-via="email">' + ico("mail", 20) + "<b>E-mail</b><small>" + esc(mails.join(", ")) + "</small></button>" : "") +
        '<button type="button" class="inv-b" data-via="whatsapp"><span class="inv-logo wa">WA</span><b>WhatsApp</b><small>wiadomość z linkiem</small></button>' +
        '<button type="button" class="inv-b" data-via="telegram"><span class="inv-logo tg">TG</span><b>Telegram</b><small>wiadomość z linkiem</small></button>' +
        '<button type="button" class="inv-b" data-via="sms">' + ico("message-square", 20) + "<b>SMS</b><small>na telefonie</small></button>" +
        (navigator.share ? '<button type="button" class="inv-b" data-via="share">' + ico("arrow-up-right", 20) + "<b>Udostępnij…</b><small>Messenger, AirDrop i inne</small></button>" : "") +
        '<button type="button" class="inv-b" data-via="file">' + ico("download", 20) + "<b>Plik zaproszenia</b><small>do wysłania jako załącznik</small></button>" +
        "</div>" +
        '<div class="inv-link"><input class="input sm" readonly value="' + esc(link) + '" /><button type="button" class="btn sm" data-via="copy">' + ico("copy", 14) + "Kopiuj link</button></div>" +
        '<p class="muted inv-note">' + ico("lock", 13) + "Link zawiera kopię udostępnionych zadań – kto go ma, może je zobaczyć, więc wysyłaj go tylko zaufanym osobom. Sprynt działa bez serwera, więc zmiany nie synchronizują się same: żeby przekazać nowszą wersję, wyślij zaproszenie jeszcze raz (u znajomego przestrzeń się zaktualizuje).</p>" +
        '<div class="dlg-acts"><button type="button" class="btn primary" data-x2>Gotowe</button></div>';
      SP.hydrateIcons(s2);
      s2.querySelector("[data-x2]").onclick = close;
      var mark = function (via) { people.forEach(function (p) { db.markInvited(p.id, via, link); }); };
      s2.addEventListener("click", function (e) {
        var b = e.target.closest("[data-via]"); if (!b) return;
        var via = b.dataset.via, text = msg + " " + link;
        if (via === "email") {
          if (link.length > 1800) SP.toast("Link jest długi – jeśli program pocztowy go utnie, użyj „Kopiuj link”.");
          location.href = "mailto:" + encodeURIComponent(mails.join(",")).replace(/%40/g, "@").replace(/%2C/g, ",") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        } else if (via === "whatsapp") window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
        else if (via === "telegram") window.open("https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(msg), "_blank", "noopener");
        else if (via === "sms") location.href = "sms:?&body=" + encodeURIComponent(text);
        else if (via === "share") { navigator.share({ title: subject, text: msg, url: link }).catch(function () {}); }
        else if (via === "copy") {
          var inp = s2.querySelector(".inv-link input"); inp.select();
          (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { SP.toast("Skopiowano link zaproszenia"); }, function () { document.execCommand("copy"); SP.toast("Skopiowano link zaproszenia"); });
        } else if (via === "file") {
          var html = '<!doctype html><meta charset="utf-8"><title>' + esc(subject) + '</title><meta http-equiv="refresh" content="0; url=' + esc(link) + '"><p style="font:16px system-ui;padding:24px">' + esc(msg) + '</p><p style="font:16px system-ui;padding:0 24px"><a href="' + esc(link) + '">Otwórz zaproszenie do Sprynt</a></p>';
          var url = URL.createObjectURL(new Blob([html], { type: "text/html" })), a = document.createElement("a");
          a.href = url; a.download = "Zaproszenie do Sprynt.html"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        }
        mark(via === "copy" ? "link" : via);
        b.classList.add("sent");
      });
    }
    document.body.appendChild(bg);
    form.mail.focus();
  };

  /* =================== Zespół =================== */
  var VIA = { email: "e-mailem", whatsapp: "WhatsAppem", telegram: "Telegramem", sms: "SMS-em", share: "przez Udostępnij", file: "plikiem", link: "linkiem" };
  views.team = {
    title: function () { return "Zespół"; },
    crumbs: function () { return [{ icon: "users", label: "Zespół" }]; },
    render: function (el) {
      var people = db.raw.people, shared = db.raw.spaces.filter(function (s) { return s.shared; });
      el.innerHTML = '<div class="page narrow team"><div class="page-h"><h1>Zespół</h1><button class="btn primary sm" data-inv>' + ico("plus", 15) + "Zaproś znajomych</button></div>" +
        '<div class="team-list">' + people.map(function (p) {
          var me = p.id === "me", last = (p.invites || [])[(p.invites || []).length - 1];
          var open = db.raw.tasks.filter(function (t) { return t.assignees.indexOf(p.id) >= 0 && !db.status(t.status).closed; }).length;
          var status = me ? '<span class="tm-st me">To Ty</span>' : last ? '<span class="tm-st inv">' + ico("send-horizontal", 12) + "Zaproszono " + (VIA[last.via] || "") + " · " + SP.ago(last.at) + "</span>" : p.invited ? '<span class="tm-st wait">Nie wysłano zaproszenia</span>' : '<span class="tm-st ok">W zespole</span>';
          return '<div class="tm-row" data-p="' + p.id + '">' + SP.avatar(p.id) + '<div class="tm-b"><b>' + esc(me ? SP.user.name : p.name) + '</b><small class="muted">' + esc(me ? SP.user.email : p.email || "bez e-maila") + " · " + open + " otwartych zadań</small></div>" + status +
            (me ? "" : '<button class="btn sm" data-re>' + ico("send-horizontal", 14) + (last ? "Wyślij ponownie" : "Zaproś") + '</button><button class="ibtn" data-rm title="Usuń z zespołu">' + ico("trash", 15) + "</button>") + "</div>";
        }).join("") + "</div>" +
        (shared.length ? '<h3 class="au-h">Przestrzenie udostępnione Tobie</h3><div class="team-list">' + shared.map(function (s) {
          return '<a class="tm-row" href="#/space/' + s.id + '">' + SP.spaceIcon(s) + '<div class="tm-b"><b>' + esc(s.name) + '</b><small class="muted">od ' + esc(s.shared.from || "znajomego") + " · aktualizacja " + SP.ago(s.shared.at) + "</small></div></a>";
        }).join("") + "</div>" : "") +
        '<div class="team-how"><h3>' + ico("sparkles", 15) + 'Jak to działa?</h3><ol><li>Wpisz e-mail albo imię znajomego i wybierz przestrzenie do udostępnienia.</li><li>Wyślij zaproszenie e-mailem, WhatsAppem, Telegramem, SMS-em albo skopiuj link.</li><li>Znajomy klika link, zakłada konto w Sprynt i od razu widzi wasze zadania – przypisane do niego trafią do jego „Moich zadań”.</li><li>Gdy coś zmienisz, wyślij zaproszenie ponownie – u znajomego przestrzeń się zaktualizuje.</li></ol></div></div>';
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-inv]")) { SP.inviteDialog(); return; }
        var row = e.target.closest("[data-p]"); if (!row) return;
        var p = db.person(row.dataset.p); if (!p) return;
        if (e.target.closest("[data-re]")) SP.inviteDialog({ email: p.email, name: p.name });
        if (e.target.closest("[data-rm]")) SP.confirm("Usunąć " + p.name + " z zespołu?", "Zniknie z przypisań w zadaniach. Zadania zostają.").then(function (ok) { if (ok) db.removePerson(p.id); });
      });
    },
  };

  /* =================== Dołączanie z zaproszenia =================== */
  var code = null; try { code = sessionStorage.getItem(JOIN); } catch (e) {}
  if (code) {
    try { sessionStorage.removeItem(JOIN); } catch (e) {}
    decode(code).then(function (inv) {
      var sp = (inv.snapshot && inv.snapshot.spaces) || [], n = (inv.snapshot && inv.snapshot.tasks || []).length;
      var from = (inv.from && (inv.from.name || inv.from.email)) || "Znajomy";
      var again = sp.some(function (s) { return db.raw.spaces.some(function (x) { return x.shared && x.shared.key === (inv.from.email || inv.from.name || "?") + "|" + s.id; }); });
      var what = sp.length ? "przestrzeń " + sp.map(function (s) { return "„" + s.name + "”"; }).join(", ") + " (" + n + " zadań)" : "swój zespół";
      setTimeout(function () {
        SP.confirm(from + " zaprasza Cię do Sprynt", (inv.msg ? "„" + inv.msg + "”\n\n" : "") + (again ? "Masz już tę przestrzeń – wczytać nowszą wersję? Twoje lokalne zmiany w niej zostaną zastąpione." : "Dołączysz do: " + what + "."), again ? "Zaktualizuj" : "Dołącz").then(function (ok) {
          if (!ok) return;
          var r = db.importShared(inv);
          SP.toast((r.updated ? "Zaktualizowano" : "Dołączono") + ": " + r.tasks + " zadań od " + from);
          if (r.spaceId) location.hash = "#/space/" + r.spaceId;
          if (SP.celebrate) SP.celebrate(innerWidth / 2, innerHeight / 3, 40);
        });
        // przycisk potwierdzenia ma być „pozytywny”, nie czerwony
        var yes = document.querySelector(".dlg-bg [data-yes]"); if (yes) { yes.classList.remove("danger"); yes.classList.add("primary"); }
      }, 300);
    }, function () { SP.toast("Link zaproszenia jest uszkodzony – poproś o nowy."); });
  }
})();
