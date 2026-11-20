/* Sprynt – „Zadania z pliku”: wgraj notatki, dokument, PDF albo arkusz Excel, a Sprynt wyciągnie z nich
 * zadania dla zespołu (osoby, terminy, priorytety, kwoty). Wszystko dzieje się w przeglądarce.
 * Tekst: TXT/MD/CSV/HTML bez bibliotek, DOCX/ODT/XLSX – własne rozpakowanie ZIP (DecompressionStream),
 * PDF – pdf.js, XLS/ODS – SheetJS (oba ładowane z cdnjs dopiero, gdy są potrzebne). */
(function () {
  "use strict";
  var SP = window.SP, db = SP.db;
  if (!db) return;
  var esc = SP.esc, ico = SP.ico, D = SP.date;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =================================================================== *
   *  1. ODCZYT PLIKÓW                                                     *
   * =================================================================== */
  var SUPPORTED = /\.(txt|md|markdown|csv|tsv|log|docx|odt|pdf|html?|xlsx|xlsm|xls|ods)$/i;
  var IMG = /\.(png|jpe?g|webp|gif)$/i;
  var aiOn = function () { return !!(SP.ai && SP.ai.enabled()); };
  SP.canExtract = function (f) { var n = (f && f.name) || ""; return SUPPORTED.test(n) || (IMG.test(n) && aiOn()); };
  var dec = function (u8) { return new TextDecoder("utf-8").decode(u8); };
  var xmlText = function (s) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, "&"); };

  /** Minimalny czytnik ZIP: zwraca funkcję (nazwa) → Promise<string|null>. */
  function zip(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), i;
    for (i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65600); i--) if (dv.getUint32(i, true) === 0x06054b50) break;
    if (i < 0 || dv.getUint32(i, true) !== 0x06054b50) throw new Error("To nie jest poprawny plik (uszkodzone archiwum).");
    var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), entries = {};
    for (var k = 0; k < n; k++) {
      var nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      entries[dec(u8.subarray(p + 46, p + 46 + nlen))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nlen + elen + clen;
    }
    return {
      names: Object.keys(entries),
      read: function (name) {
        var e = entries[name]; if (!e) return Promise.resolve(null);
        var start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true), data = u8.slice(start, start + e.size);
        if (e.method === 0) return Promise.resolve(dec(data));
        if (!window.DecompressionStream) return Promise.reject(new Error("Ta przeglądarka nie umie rozpakować pliku – zaktualizuj ją."));
        return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
      },
    };
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error("Nie udało się pobrać czytnika plików – sprawdź połączenie z internetem.")); };
      document.head.appendChild(s);
    });
  }

  /* ---- dokumenty tekstowe → linie {text, indent, heading} ---- */
  function linesFrom(text) {
    return text.replace(/\r\n?/g, "\n").split("\n").map(function (l) {
      var ws = /^[ \t]*/.exec(l)[0], ind = ws.replace(/\t/g, "    ").length;
      return { text: l.trim(), indent: ind };
    });
  }
  function docxLines(xml) {
    return xml.split(/<w:p[\s>]/).slice(1).map(function (seg) {
      seg = seg.split("</w:p>")[0];
      var lvl = /<w:ilvl w:val="(\d+)"/.exec(seg), list = /<w:numPr>/.test(seg), head = /<w:pStyle w:val="(Heading|Nag[^"]*|Title|Tytu)[^"]*"/i.test(seg);
      var txt = "", m, re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
      while ((m = re.exec(seg))) txt += m[1] != null ? xmlText(m[1]) : m[0] === "<w:tab/>" ? " " : " ";
      var ind = lvl ? +lvl[1] * 4 : 0;
      return { text: (list ? "- " : "") + txt.trim(), indent: ind, heading: head };
    });
  }
  function odtLines(xml) {
    var out = [], depth = 0, itemStart = false, cur = null, m, re = /<(\/?)(text:list-item|text:list|text:p|text:h|text:tab|text:line-break|text:s)\b[^>]*?(\/?)>|([^<]+)/g;
    while ((m = re.exec(xml))) {
      if (m[4] != null) { if (cur) cur.text += xmlText(m[4]); continue; }
      var close = m[1] === "/", tag = m[2], self = m[3] === "/";
      if (tag === "text:list") depth += close ? -1 : self ? 0 : 1;
      else if (tag === "text:list-item" && !close) itemStart = true;
      else if ((tag === "text:p" || tag === "text:h") && !close) { cur = { text: depth && itemStart ? "- " : "", indent: Math.max(0, depth - 1) * 4, heading: tag === "text:h" }; itemStart = false; if (self) { out.push(cur); cur = null; } }
      else if ((tag === "text:p" || tag === "text:h") && close && cur) { cur.text = cur.text.trim(); out.push(cur); cur = null; }
      else if (cur && (tag === "text:tab" || tag === "text:s" || tag === "text:line-break")) cur.text += " ";
    }
    return out;
  }
  function htmlLines(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style").forEach(function (e) { e.remove(); });
    doc.querySelectorAll("li").forEach(function (li) { li.insertBefore(doc.createTextNode("\n- "), li.firstChild); });
    doc.querySelectorAll("p,div,h1,h2,h3,h4,br,tr").forEach(function (e) { e.appendChild(doc.createTextNode("\n")); });
    return linesFrom(doc.body.textContent || "");
  }
  function pdfLines(buf) {
    var V = "3.11.174", base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + V + "/";
    return (window.pdfjsLib ? Promise.resolve() : loadScript(base + "pdf.min.js")).then(function () {
      // Worker z innej domeny jest blokowany – ładujemy go jako Blob.
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        return fetch(base + "pdf.worker.min.js").then(function (r) { return r.text(); }).then(function (code) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        });
      }
    }).then(function () { return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (pdf) {
      var pages = []; for (var i = 1; i <= Math.min(pdf.numPages, 60); i++) pages.push(i);
      return pages.reduce(function (p, n) {
        return p.then(function (acc) {
          return pdf.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            var rows = {};
            tc.items.forEach(function (it) { if (!it.str) return; var y = Math.round(it.transform[5] / 3) * 3; (rows[y] = rows[y] || []).push(it); });
            Object.keys(rows).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
              var items = rows[y].sort(function (a, b) { return a.transform[4] - b.transform[4]; });
              var x0 = items[0].transform[4];
              acc.push({ text: items.map(function (it) { return it.str; }).join(" ").replace(/\s+/g, " ").trim(), indent: Math.max(0, Math.round((x0 - 50) / 12)) });
            });
            acc.push({ text: "", indent: 0 });
            return acc;
          });
        });
      }, Promise.resolve([]));
    });
  }

  /* ---- arkusze → [{name, rows: [[{s, n, d}]]}] ---- */
  var DATE_FMT_IDS = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 45: 1, 46: 1, 47: 1 };
  function serialToYmd(n) { var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 864e5)); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  function colIndex(ref) { var s = /^[A-Z]+/.exec(ref)[0], n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }
  function fmtNum(n) { return Number(n).toLocaleString("pl-PL", { maximumFractionDigits: 2 }); }
  function cell(v) {
    if (v == null || v === "") return { s: "" };
    if (v instanceof Date) { var y = D.ymd(v); return { s: y, d: y }; }
    if (typeof v === "number") return { s: fmtNum(v), n: v };
    if (typeof v === "boolean") return { s: v ? "TAK" : "NIE", b: v };
    return { s: String(v).trim() };
  }
  function xlsxSheets(z) {
    var read = z.read;
    return Promise.all([read("xl/workbook.xml"), read("xl/_rels/workbook.xml.rels"), read("xl/sharedStrings.xml"), read("xl/styles.xml")]).then(function (r) {
      var wb = r[0] || "", rels = r[1] || "", ss = r[2] || "", st = r[3] || "";
      var shared = (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map(function (si) { return xmlText((si.match(/<t[^>]*>([^<]*)<\/t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ""); }).join("")); });
      var custom = {}; (st.match(/<numFmt [^>]*>/g) || []).forEach(function (f) { var id = /numFmtId="(\d+)"/.exec(f), code = /formatCode="([^"]*)"/.exec(f); if (id && code) custom[id[1]] = xmlText(code[1]); });
      var xfs = ((/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st) || [])[1] || "").match(/<xf\b[^>]*?\/?>/g) || [];
      var isDate = xfs.map(function (x) {
        var id = +((/numFmtId="(\d+)"/.exec(x) || [])[1] || 0);
        if (DATE_FMT_IDS[id]) return true;
        var c = custom[id]; return !!c && /[dmy]/i.test(c.replace(/"[^"]*"|\[[^\]]*\]/g, "")) && !/0[.,]0|#/.test(c);
      });
      var relMap = {}; (rels.match(/<Relationship [^>]*>/g) || []).forEach(function (x) { var id = /Id="([^"]+)"/.exec(x), t = /Target="([^"]+)"/.exec(x); if (id && t) relMap[id[1]] = t[1].replace(/^\/?xl\//, "").replace(/^\//, ""); });
      var sheets = (wb.match(/<sheet [^>]*>/g) || []).map(function (x) {
        var name = xmlText((/name="([^"]*)"/.exec(x) || [])[1] || "Arkusz"), rid = (/r:id="([^"]+)"/.exec(x) || /id="([^"]+)"/.exec(x) || [])[1];
        return { name: name, path: "xl/" + (relMap[rid] || "worksheets/sheet1.xml") };
      });
      if (!sheets.length) sheets = [{ name: "Arkusz1", path: "xl/worksheets/sheet1.xml" }];
      return Promise.all(sheets.map(function (sh) { return read(sh.path).then(function (xml) {
        var rows = [];
        (xml || "").replace(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, function (m, inner) {
          var rIdx = +((/\br="(\d+)"/.exec(m) || [])[1] || rows.length + 1) - 1, row = [];
          (inner || "").replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function (cm, attrs, body) {
            var ref = (/r="([A-Z]+)\d+"/.exec(attrs) || [])[1], t = (/t="(\w+)"/.exec(attrs) || [])[1], s = +((/s="(\d+)"/.exec(attrs) || [])[1] || 0);
            var v = (/<v>([\s\S]*?)<\/v>/.exec(body || "") || [])[1], out;
            if (t === "s") out = cell(shared[+v]);
            else if (t === "inlineStr") out = cell(xmlText(((body || "").match(/<t[^>]*>([^<]*)<\/t>/g) || []).map(function (q) { return q.replace(/<[^>]+>/g, ""); }).join("")));
            else if (t === "str" || t === "e") out = cell(v == null ? "" : xmlText(v));
            else if (t === "b") out = cell(v === "1");
            else if (v == null) out = { s: "" };
            else if (isDate[s]) { var y = serialToYmd(+v); out = { s: y, d: y }; }
            else out = cell(+v);
            row[ref ? colIndex(ref + "1") : row.length] = out;
          });
          for (var i = 0; i < row.length; i++) if (!row[i]) row[i] = { s: "" };
          rows[rIdx] = row;
        });
        for (var i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
        return { name: sh.name, rows: rows };
      }); }));
    });
  }
  function sheetjsSheets(buf) {
    return (window.XLSX ? Promise.resolve() : loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js")).then(function () {
      var wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      return wb.SheetNames.map(function (n) { return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }).map(function (r) { return r.map(cell); }) }; });
    });
  }
  function csvSheet(text, name) {
    var first = text.split("\n").slice(0, 5).join("\n"), cnt = function (c) { return (first.match(new RegExp(c === "\t" ? "\t" : "\\" + c, "g")) || []).length; };
    var sep = [";", "\t", ","].sort(function (a, b) { return cnt(b) - cnt(a); })[0];
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return [{ name: name, rows: rows.map(function (r) { return r.map(function (c) { c = c.trim(); var n = parseAmount(c); return n != null && /^[-+]?[\d\s .,]+(zł|pln)?$/i.test(c) ? { s: c, n: n } : { s: c }; }); }) }];
  }

  /** Plik → źródło {name, size, kind: "text"|"sheet", lines | sheets}. */
  function readSource(file) {
    var n = (file.name || "").toLowerCase();
    if (file.size > db.MAX_FILE) return Promise.reject(new Error("Plik jest za duży – limit to " + SP.fmtSize(db.MAX_FILE) + "."));
    if (IMG.test(n) && !aiOn()) return Promise.reject(new Error("Zdjęcia i skany odczytuje tylko AI – włącz je w Ustawieniach → AI (Claude)."));
    if (!SUPPORTED.test(n) && !IMG.test(n)) return Promise.reject(new Error("Tego formatu nie umiem przeczytać. Wgraj TXT, MD, DOCX, ODT, PDF, HTML, CSV, arkusz XLSX/XLS/ODS" + (aiOn() ? " albo zdjęcie (JPG, PNG)." : ".")));
    var src = { name: file.name, size: file.size, file: file };
    if (IMG.test(n)) return file.arrayBuffer().then(function (buf) {
      src.kind = "image"; src.imgBuf = buf; src.lines = []; src.url = URL.createObjectURL(file);
      src.imgType = /^image\/(png|jpeg|webp|gif)$/.test(file.type) ? file.type : "image/" + n.match(/\.(\w+)$/)[1].replace("jpg", "jpeg");
      return src;
    });
    if (/\.(csv|tsv)$/.test(n)) return file.text().then(function (t) { src.kind = "sheet"; src.sheets = csvSheet(t.replace(/^﻿/, ""), file.name.replace(/\.\w+$/, "")); return src; });
    if (/\.(txt|md|markdown|log)$/.test(n)) return file.text().then(function (t) { src.kind = "text"; src.lines = linesFrom(t.replace(/^﻿/, "")); return src; });
    if (/\.html?$/.test(n)) return file.text().then(function (t) { src.kind = "text"; src.lines = htmlLines(t); return src; });
    return file.arrayBuffer().then(function (buf) {
      if (/\.pdf$/.test(n)) {
        src.pdfBuf = buf.slice(0); // pdf.js może przejąć (odłączyć) bufor – kopia dla AI
        return pdfLines(buf).catch(function (e) { if (aiOn()) return []; throw e; }).then(function (l) { src.kind = "text"; src.lines = l; return src; });
      }
      if (/\.(xls|ods)$/.test(n)) return sheetjsSheets(buf).then(function (s) { src.kind = "sheet"; src.sheets = s; return src; });
      var z = zip(buf);
      if (/\.(xlsx|xlsm)$/.test(n)) return xlsxSheets(z).then(function (s) { src.kind = "sheet"; src.sheets = s; return src; });
      if (/\.docx$/.test(n)) return z.read("word/document.xml").then(function (x) { if (!x) throw new Error("W pliku DOCX nie ma treści dokumentu."); src.kind = "text"; src.lines = docxLines(x); return src; });
      if (/\.odt$/.test(n)) return z.read("content.xml").then(function (x) { src.kind = "text"; src.lines = odtLines(x || ""); return src; });
      throw new Error("Nieobsługiwany format.");
    });
  }

  /* =================================================================== *
   *  2. ROZPOZNAWANIE: osoby, terminy, priorytety, kwoty                  *
   * =================================================================== */
  var B = "(?<![\\p{L}\\d])", E = "(?![\\p{L}\\d])";
  var R = function (s) { return new RegExp(s, "iu"); };
  var MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  var WEEKDAYS = [["niedziel", 0], ["poniedział", 1], ["wtor", 2], ["środ", 3], ["czwart", 4], ["piąt", 5], ["sobot", 6]];
  var KW = "(?:do|przed|na|termin:?|deadline:?|due:?|dnia|najpóźniej)";
  // stałe święta w Polsce (dni wolne przy liczeniu dni roboczych)
  var HOLI = { "01-01": 1, "01-06": 1, "05-01": 1, "05-03": 1, "08-15": 1, "11-01": 1, "11-11": 1, "12-24": 1, "12-25": 1, "12-26": 1 };
  function isWork(d) { var w = d.getDay(); return w !== 0 && w !== 6 && !HOLI[String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")]; }
  /** Notacja kontrolingu: WD+3 = 3. dzień roboczy po końcu miesiąca, WD-2 = 2 dni robocze przed. */
  function workday(n) {
    var now = new Date(), end = now.getDate() <= 12 ? new Date(now.getFullYear(), now.getMonth(), 0) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    var d = new Date(end), step = n >= 0 ? 1 : -1, k = Math.abs(n);
    if (n === 0) { while (!isWork(d)) d.setDate(d.getDate() - 1); return D.ymd(d); }
    if (n < 0) d.setDate(d.getDate() + 1);
    while (k > 0) { d.setDate(d.getDate() + step); if (isWork(d)) k--; }
    return D.ymd(d);
  }
  function nextWeekday(w, strictlyAfter) { var d = new Date(); d.setHours(0, 0, 0, 0); var diff = (w - d.getDay() + 7) % 7; if (diff === 0 && strictlyAfter) diff = 7; d.setDate(d.getDate() + diff); return D.ymd(d); }
  function mkDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    var today = D.today(), yy = y ? (y < 100 ? 2000 + y : y) : +today.slice(0, 4);
    var s = yy + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    if (!y && s < D.add(today, -60)) s = (yy + 1) + s.slice(4);
    return s;
  }
  /** Szuka terminu w tekście. Zwraca {due, phrase} albo null. loose = komórka arkusza (data bez słowa „do”). */
  function parseDue(t, loose) {
    var m, today = D.today();
    if ((m = R("(?:" + KW + "\\s*)?" + B + "(?:WD|BD|DR|D)\\s*([+-]?)\\s*(\\d{1,2})" + E).exec(t))) return { due: workday((m[1] === "-" ? -1 : 1) * +m[2]), phrase: m[0] };
    if ((m = R("(?:" + KW + "\\s*)?(\\d{4})-(\\d{1,2})-(\\d{1,2})").exec(t))) { var iso = mkDate(+m[1], +m[2], +m[3]); if (iso) return { due: iso, phrase: m[0] }; }
    if ((m = R("(?:" + KW + "\\s*)?" + B + "(\\d{1,2})\\s+(" + MONTHS.join("|") + ")(?:\\s+(\\d{4}))?" + E).exec(t))) return { due: mkDate(m[3] ? +m[3] : 0, MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]), phrase: m[0] };
    var dm = R((loose ? "(?:" + KW + "\\s*)?" : KW + "\\s*") + "(?<![\\d.,])(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?(?![\\d.,]\\d)").exec(t)
      || R("(?<![\\d.,])(\\d{1,2})[./](\\d{1,2})[./](\\d{4})(?![\\d])").exec(t);
    if (dm) { var dd = mkDate(dm[3] ? +dm[3] : 0, +dm[2], +dm[1]); if (dd) return { due: dd, phrase: dm[0] }; }
    if ((m = R(B + "(?:do|w|we|na|przed|od)\\s+(poniedział\\p{L}*|wtor\\p{L}*|środ\\p{L}*|czwart\\p{L}*|piąt\\p{L}*|sobot\\p{L}*|niedziel\\p{L}*)" + E).exec(t))) {
      var w = WEEKDAYS.find(function (x) { return m[1].toLowerCase().indexOf(x[0]) === 0; }); if (w) return { due: nextWeekday(w[1], false), phrase: m[0] };
    }
    var rel = [["(?:na\\s+)?dzi(?:ś|s|siaj)", 0], ["(?:na\\s+)?jutro", 1], ["(?:na\\s+)?pojutrze", 2], ["asap", 0], ["za\\s+tydzień", 7], ["za\\s+tydzien", 7]];
    for (var i = 0; i < rel.length; i++) if ((m = R(B + rel[i][0] + E).exec(t))) return { due: D.add(today, rel[i][1]), phrase: m[0] };
    if ((m = R(B + "za\\s+(\\d{1,2})\\s+(dni|dzień|tygodnie|tygodni)" + E).exec(t))) return { due: D.add(today, +m[1] * (/tyg/.test(m[2]) ? 7 : 1)), phrase: m[0] };
    if ((m = R(B + "(?:w\\s+tym\\s+tygodniu|do\\s+końca\\s+tygodnia)" + E).exec(t))) return { due: nextWeekday(5, false), phrase: m[0] };
    if ((m = R(B + "(?:w\\s+(?:przyszłym|następnym)\\s+tygodniu)" + E).exec(t))) return { due: D.add(nextWeekday(1, true), 4), phrase: m[0] };
    if ((m = R(B + "(?:do|na)\\s+ko(?:ń|n|nie)c\\p{L}*\\s+miesi(?:ą|a)ca" + E).exec(t))) { var n = new Date(); return { due: D.ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0)), phrase: m[0] }; }
    return null;
  }
  function parsePriority(t) {
    var m;
    if ((m = R("\\(?" + B + "(?:pilne|pilnie|asap|krytyczn\\p{L}*|natychmiast|na wczoraj|urgent)" + E + "\\)?!*|!!!+").exec(t))) return { p: "urgent", phrase: m[0] };
    if ((m = R("\\(?" + B + "(?:niski priorytet|kiedyś|kiedys|opcjonalnie|nice to have|jak będzie czas|low)" + E + "\\)?").exec(t))) return { p: "low", phrase: m[0] };
    if ((m = R("\\(?" + B + "(?:ważne|wazne|bardzo ważne|wysoki priorytet|priorytet(?:owe)?|high|important)" + E + "\\)?!*|!!").exec(t))) return { p: "high", phrase: m[0] };
    return null;
  }
  function prioFromCell(s) {
    s = String(s || "").toLowerCase();
    if (/pil|urgent|kryt|1\b|asap/.test(s)) return "urgent";
    if (/wys|high|waż|waz|2\b/.test(s)) return "high";
    if (/nis|low|4\b/.test(s)) return "low";
    if (/norm|śred|sred|medium|3\b/.test(s)) return "normal";
    return null;
  }
  /** "12 300,50 zł", "1,234.56", "-500" → liczba albo null. */
  function parseAmount(s) {
    if (typeof s === "number") return s;
    s = String(s || "").replace(/ /g, " ").replace(/\s*(zł|pln|eur|usd|€|\$)\s*/gi, "").trim();
    if (!/^[-+(]?[\d\s.,]+\)?$/.test(s) || !/\d/.test(s)) return null;
    var neg = /^\(|^-/.test(s); s = s.replace(/[()+\-\s]/g, "");
    var lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc > -1) s = s.length - lc === 4 && s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
    else if (ld > -1 && s.split(".").length > 2) s = s.replace(/\./g, "");
    var n = parseFloat(s); return isNaN(n) ? null : neg ? -n : n;
  }
  var money = function (n) { return Number(n).toLocaleString("pl-PL", { style: "currency", currency: "PLN" }); };

  /* ---- osoby: zespół + nowe imiona z pliku, z odmianą (Marek → Marka, Markowi…) ---- */
  function forms(first) {
    var f = first.toLowerCase(), out = [f];
    if (/a$/.test(f)) { var s = f.slice(0, -1); out.push(s + "y", s + "i", s + "ie", s + "ę", s + "ą", s + "o"); if (/[kg]a$/.test(f)) out.push(s.slice(0, -1) + (f.slice(-2, -1) === "k" ? "ce" : "dze")); }
    else if (/ek$/.test(f)) { var k = f.slice(0, -2) + "k"; out.push(k + "a", k + "owi", k + "iem", k + "u"); }
    else out.push(f + "a", f + "owi", f + "em", f + "ie", f + "u");
    return out;
  }
  function People(extra) {
    var list = db.raw.people.map(function (p) { return { key: p.id, name: p.name }; });
    (extra || []).forEach(function (n) { if (!list.some(function (x) { return x.name.toLowerCase() === n.toLowerCase() || x.name.split(" ")[0].toLowerCase() === n.split(" ")[0].toLowerCase(); })) list.push({ key: "new:" + n, name: n }); });
    var map = {};
    list.forEach(function (p) { var first = p.name.split(/\s+/)[0]; forms(first).forEach(function (f) { if (!map[f]) map[f] = p.key; }); map[p.name.toLowerCase()] = p.key; });
    return {
      list: list,
      add: function (n) { var k = this.find(n); if (k) return k; var p = { key: "new:" + n, name: n }; list.push(p); forms(n.split(/\s+/)[0]).forEach(function (f) { if (!map[f]) map[f] = p.key; }); return p.key; },
      find: function (word) { return map[String(word || "").toLowerCase().replace(/^@/, "").trim()] || map[String(word || "").toLowerCase().split(/\s+/)[0]] || null; },
      inText: function (t) { var ws = t.match(/@?[\p{L}]{2,}/gu) || []; for (var i = 0; i < ws.length; i++) { if (!/^@?\p{Lu}/u.test(ws[i])) continue; var k = map[ws[i].toLowerCase().replace(/^@/, "")]; if (k) return { key: k, word: ws[i] }; } return null; },
      name: function (key) { var p = list.find(function (x) { return x.key === key; }); return p ? p.name : "?"; },
    };
  }

  /* =================================================================== *
   *  3. WYCIĄGANIE ZADAŃ                                                  *
   * =================================================================== */
  var VERBS = "przygotuj zrób zrob napisz wyślij wyslij sprawdź sprawdz zaktualizuj popraw dodaj ustal zamów zamow skontaktuj zadzwoń zadzwon umów umow stwórz stworz zaprojektuj opublikuj przetestuj wdróż wdroz zbierz omów omow przejrzyj zorganizuj uzupełnij uzupelnij zaplanuj potwierdź potwierdz prześlij przeslij odpisz odpowiedz napraw zbadaj przeanalizuj opracuj zgłoś zglos zarezerwuj kup podpisz rozlicz zapłać zaplac zaksięguj zaksieguj uzgodnij wyjaśnij wyjasnij zweryfikuj przelej wystaw zamknij otwórz otworz wyeksportuj zaimportuj przekaż przekaz przypomnij monitoruj usuń usun zmień zmien ogarnij dokończ dokoncz rozpisz policz oblicz porównaj porownaj prepare send fix update review write create call check schedule add design test deploy follow book pay reconcile".split(" ");
  var VERBSET = {}; VERBS.forEach(function (v) { VERBSET[v] = 1; });
  var TASK_HEADS = R("^(?:#+\\s*)?(zadania|do zrobienia|todo|to do|ustalenia|action items?|akcje|kolejne kroki|następne kroki|next steps|plan|lista zadań|checklista|czynności)\\b");
  var META = R("^(data|godzina|miejsce|temat|obecni|uczestnicy|nieobecni|zespół|agenda|cel|notatki|status|projekt|klient|prowadzący|protokół|dot\\.?|od|do|data spotkania|attendees|participants|date|subject|location)\\s*[:\\-–]");
  var STOP_NAMES = { Uwaga: 1, Notatki: 1, Termin: 1, Cel: 1, Temat: 1, Agenda: 1, Ustalenia: 1, Status: 1, Priorytet: 1, Zadanie: 1, Zadania: 1, Todo: 1, Kiedyś: 1, Następne: 1, Data: 1, Wniosek: 1, Wnioski: 1, Pytanie: 1, Pytania: 1, Decyzja: 1, Info: 1, Ryzyko: 1, Plan: 1, Note: 1, Action: 1 };
  var BULLET = /^(?:[-*•–·▪◦○●➢►→✓✔]|\d{1,2}[.)]|[a-z][.)])\s+/u;

  function cleanTitle(t, strip) {
    strip.forEach(function (p) { if (p) t = t.replace(p, " "); });
    t = t.replace(/#[\p{L}\d_-]{2,30}/gu, " ").replace(/\(\s*\)/g, " ").replace(/\s+[-–—,:;]+\s*$/, "").replace(/^[\s\-–—,:;]+/, "").replace(/[\s,;:–—-]+$/, "").replace(/\s{2,}/g, " ").trim();
    t = t.replace(/[!]+$/, "").trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function isVerbish(w) { w = (w || "").toLowerCase().replace(/[^\p{L}]/gu, ""); return !!VERBSET[w] || (w.length >= 5 && /ć$/.test(w)) || /^(trzeba|należy|nalezy|musimy|musi|proszę|prosze|prosimy|pamiętać|pamietac)$/.test(w); }

  /** Dokument tekstowy → zadania. */
  function fromText(lines) {
    var roster = [];
    lines.forEach(function (l) {
      var m = R("^(?:obecni|uczestnicy|zespół|zespol|osoby|attendees|participants)\\s*[:\\-–]\\s*(.+)$").exec(l.text);
      if (m) m[1].split(/[,;]|\s+i\s+|\s+oraz\s+|\s+and\s+/).forEach(function (n) { n = n.replace(/\(.*?\)/g, "").trim(); if (/^\p{Lu}\p{Ll}{1,20}(?:\s\p{Lu}\p{Ll}+)?$/u.test(n)) roster.push(n); });
    });
    var P = People(roster), tasks = [], ctxPerson = null, ctxTasks = false, last = null;
    lines.forEach(function (l, i) {
      var t = l.text; if (!t) return;
      var bullet = BULLET.exec(t), body = bullet ? t.slice(bullet[0].length) : t;
      var box = /^\[( |x|X|✓|✔)\]\s*/.exec(body); if (box) body = body.slice(box[0].length);
      var done = !!box && box[1] !== " ";
      var todo = /^(TODO|To do|Zadanie|Do zrobienia|Action|AI)\s*[:\-–]\s*/i.exec(body); if (todo) body = body.slice(todo[0].length);
      var isHead = !bullet && !box && (l.heading || /^#{1,6}\s/.test(t) || (/:$/.test(t) && t.length < 60));
      if (isHead) {
        var h = t.replace(/^#+\s*/, "").replace(/:$/, "").trim();
        ctxTasks = TASK_HEADS.test(h); ctxPerson = P.find(h) || (/^\p{Lu}\p{Ll}{2,}$/u.test(h) && !STOP_NAMES[h] && !ctxTasks && roster.indexOf(h) >= 0 ? P.add(h) : null);
        return;
      }
      if (!bullet && !box && !todo && META.test(t)) return;
      // pod-punkt poprzedniego zadania → checklista
      if (last && bullet && l.indent > last.indent && i - last.lastLine <= 2) { last.checklist.push(cleanTitle(body, [])); last.lastLine = i; return; }
      var person = null, m;
      if ((m = /^@?(\p{Lu}\p{Ll}+(?:\s\p{Lu}\p{Ll}+)?)\s*[:–—]\s+(.+)$/u.exec(body)) && !STOP_NAMES[m[1].split(" ")[0]]) {
        person = P.find(m[1]) || (isVerbish(m[2].split(/\s+/)[0]) || bullet ? P.add(m[1]) : null);
        if (person) body = m[2];
      }
      if (!person && (m = /^(\p{Lu}\p{Ll}+)\s+(\p{Ll}\S*)\s+(.+)$/u.exec(body)) && P.find(m[1]) && /(?:uje|ije|ie|i|y|e|ą)$/u.test(m[2])) { person = P.find(m[1]); body = m[2] + " " + m[3]; }
      var first = body.split(/\s+/)[0], verb = isVerbish(first);
      var due = parseDue(body), prio = parsePriority(body), mention = person ? null : P.inText(body);
      var gerund = /^\p{L}{4,}(?:anie|enie|cie)$/iu.test(first);
      var isTask = done || box || todo || verb || (bullet && (ctxTasks || person || mention || due || prio || gerund || ctxPerson));
      if (!isTask || body.length < 3 || (/\?$/.test(body) && !verb)) { if (!bullet) last = null; return; }
      var strip = [due && due.phrase, prio && prio.phrase];
      if (mention && /^@/.test(mention.word)) strip.push(mention.word);
      var title = cleanTitle(body, strip), desc = "";
      if (title.length > 140) { desc = title; title = title.slice(0, 137).replace(/\s+\S*$/, "") + "…"; }
      var who = person || (mention && mention.key) || ctxPerson;
      var tk = { key: "l" + i, at: i, title: title, desc: desc, assignees: who ? [who] : [], due: due ? due.due : null, priority: prio ? prio.p : null,
        tags: (body.match(/#[\p{L}\d_-]{2,30}/gu) || []).map(function (x) { return x.slice(1).toLowerCase(); }), checklist: [], done: done, indent: l.indent, lastLine: i };
      if (title) { tasks.push(tk); last = tk; }
    });
    return { tasks: tasks, people: P };
  }

  /* ---- arkusze ---- */
  var COLS = {
    title: /zadani|czynno|task|action|krok|do zrobienia|aktywno|activity/i,
    title2: /opis|temat|nazwa|tytu|pozycj|item|kategori|konto|description/i,
    person: /osob|odpowiedz|właści|wlasci|owner|assignee|^kto|wykonawc|przypisan|responsible|kontroler/i,
    due: /termin|deadline|due|do kiedy|płatno|platno|wymagaln|data płat|data plat|data wykon/i,
    date: /data|date/i,
    prio: /priorytet|priority|ważno|waznosc/i,
    status: /status|stan|zrobione|wykonane|done|zapłac|zaplac|opłac|oplac|rozlicz/i,
    amount: /kwota|wartość|wartosc|brutto|netto|amount|saldo|suma|do zapłaty|do zaplaty/i,
    plan: /plan|budżet|budzet|budget|prognoz|forecast|zakład|zaklad/i,
    actual: /wykonani|rzeczywist|actual|realizac|wynik|koszt rzecz/i,
    party: /kontrahent|dostawc|klient|vendor|supplier|odbiorc|firma|nabywc/i,
    doc: /faktur|^nr|numer|dokument|invoice|document|nr dok/i,
    acct: /mpk|konto|cost cent|centrum koszt|projekt|dział|dzial|segment/i,
  };
  var DONE_RX = /^(tak|yes|y|x|✓|✔|done|ok|zrobione|wykonane|zamknięte|zamkniete|zakończone|zakonczone|zapłacono|zaplacono|zapłacona|zaplacona|opłacona|oplacona|opłacono|oplacono|paid|rozliczone|true|1)$/i;
  var MODES = { tasks: "Lista zadań", invoices: "Faktury do zapłaty", variance: "Odchylenia od budżetu", rows: "Każdy wiersz = zadanie" };
  function mapColumns(rows) {
    var best = 0, bestScore = -1;
    for (var r = 0; r < Math.min(rows.length, 12); r++) {
      var cells = rows[r] || [], score = 0, texts = 0;
      cells.forEach(function (c) { if (c.s && c.n == null && !c.d) { texts++; for (var k in COLS) if (COLS[k].test(c.s)) { score += 2; break; } } });
      score += texts >= 2 ? 1 : 0;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    var head = rows[best] || [], col = {};
    head.forEach(function (c, i) {
      var h = (c.s || "").trim(); if (!h) return;
      var order = ["status", "prio", "person", "due", "amount", "actual", "plan", "party", "doc", "title", "acct", "title2", "date"];
      for (var j = 0; j < order.length; j++) { var k = order[j]; if (col[k] == null && COLS[k].test(h)) { col[k] = i; return; } }
    });
    if (col.due == null && col.date != null) col.due = col.date;
    return { header: best, col: col, head: head.map(function (c) { return c.s; }) };
  }
  function sheetModes(map, rows) {
    var c = map.col, m = [], num = function (i) { return rows.slice(map.header + 1).some(function (r) { return r[i] && r[i].n != null; }); };
    if (c.due != null && (c.amount != null || c.doc != null) && (c.party != null || c.doc != null)) m.push("invoices");
    if (c.plan != null && c.actual != null && num(c.plan) && num(c.actual)) m.push("variance");
    if (c.title != null || c.title2 != null) m.push("tasks");
    m.push("rows");
    return m;
  }
  function fromSheet(sh, si, mode, opts, P) {
    var rows = sh.rows, map = mapColumns(rows), c = map.col, tasks = [];
    var modes = sheetModes(map, rows); mode = mode && modes.indexOf(mode) >= 0 ? mode : modes[0];
    var get = function (r, k) { return c[k] != null ? (r[c[k]] || { s: "" }) : { s: "" }; };
    var firstText = function (r) { for (var i = 0; i < r.length; i++) if (r[i] && r[i].s && r[i].n == null && !r[i].d && i !== c.person && i !== c.status) return r[i].s; return ""; };
    var dueOf = function (r) { var v = get(r, "due"); if (v.d) return v.d; if (v.n != null && v.n > 20000 && v.n < 80000) return serialToYmd(v.n); var p = v.s ? parseDue(v.s, true) : null; return p ? p.due : null; };
    var extra = function (r, skip) {
      return map.head.map(function (h, i) { return h && skip.indexOf(i) < 0 && r[i] && r[i].s ? h + ": " + r[i].s : ""; }).filter(Boolean).join("\n");
    };
    var thr = (opts.threshold == null ? 10 : opts.threshold) / 100, today = D.today();
    rows.forEach(function (r, ri) {
      if (ri <= map.header || !r.some(function (x) { return x && x.s; })) return;
      var label = (get(r, "title").s || get(r, "title2").s || firstText(r)).trim();
      if (/^(suma|razem|total|ogółem|ogolem|sum|subtotal)\b/i.test(label)) return;
      var who = get(r, "person").s, key = who ? (P.find(who) || P.add(who.split(/[,;/]/)[0].trim())) : null;
      var st = get(r, "status"), closed = st.b === true || DONE_RX.test((st.s || "").trim());
      var t = { key: "s" + si + "r" + ri, at: ri, sheet: si, assignees: key ? [key] : [], tags: [], checklist: [], done: false, priority: prioFromCell(get(r, "prio").s), due: null, desc: "", cf: {} };
      if (mode === "invoices") {
        if (closed) return;
        var amt = c.amount != null ? (r[c.amount].n != null ? r[c.amount].n : parseAmount(r[c.amount].s)) : null, party = get(r, "party").s, docNo = get(r, "doc").s;
        t.due = dueOf(r);
        t.title = "Zapłacić fakturę" + (docNo ? " " + docNo : "") + (party ? " – " + party : "") + (amt != null ? " (" + money(amt) + ")" : "");
        if (t.due && t.due < today) t.priority = "urgent"; else if (t.due && D.diff(t.due) <= 3) t.priority = t.priority || "high";
        t.amount = amt; t.party = party;
        t.desc = extra(r, [c.status]);
        if (t.due && t.due < today) t.desc = "⚠ Po terminie płatności (" + t.due + ")\n" + t.desc;
      } else if (mode === "variance") {
        var plan = r[c.plan] ? (r[c.plan].n != null ? r[c.plan].n : parseAmount(r[c.plan].s)) : null, act = r[c.actual] ? (r[c.actual].n != null ? r[c.actual].n : parseAmount(r[c.actual].s)) : null;
        if (plan == null || act == null) return;
        var diff = act - plan, pct = plan ? diff / Math.abs(plan) : (diff ? 1 : 0);
        if (Math.abs(pct) < thr || Math.abs(diff) < (opts.minAmount || 0)) return;
        var acct = get(r, "acct").s;
        t.title = "Wyjaśnić odchylenie: " + (label || "wiersz " + (ri + 1)) + (acct && acct !== label ? " (" + acct + ")" : "") + " " + (diff > 0 ? "+" : "−") + Math.abs(pct * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + "%";
        t.priority = Math.abs(pct) >= .5 ? "urgent" : Math.abs(pct) >= .25 ? "high" : "normal";
        t.due = dueOf(r) || D.add(today, 5);
        t.amount = diff;
        t.desc = "Plan: " + money(plan) + "\nWykonanie: " + money(act) + "\nOdchylenie: " + (diff > 0 ? "+" : "") + money(diff) + " (" + (diff > 0 ? "+" : "") + (pct * 100).toFixed(1).replace(".", ",") + "%)" + (acct ? "\n" + map.head[c.acct] + ": " + acct : "");
      } else {
        if (!label) return;
        var dueTxt = parseDue(label);
        t.title = cleanTitle(label, [dueTxt && c.due == null ? dueTxt.phrase : null]);
        t.due = dueOf(r) || (c.due == null && dueTxt ? dueTxt.due : null);
        t.done = closed;
        if (c.amount != null && r[c.amount]) t.amount = r[c.amount].n != null ? r[c.amount].n : parseAmount(r[c.amount].s);
        t.party = get(r, "party").s || "";
        t.desc = extra(r, [c.title != null ? c.title : c.title2, c.person, c.due, c.prio, c.status]);
      }
      if (t.title.length > 140) { t.desc = t.title + (t.desc ? "\n" + t.desc : ""); t.title = t.title.slice(0, 137) + "…"; }
      tasks.push(t);
    });
    return { tasks: tasks, mode: mode, modes: modes, map: map };
  }

  /** Źródło → wynik ekstrakcji (zadania + osoby). */
  function extract(src, state) {
    if (src.kind === "text") { var r = fromText(src.lines); return { tasks: r.tasks, people: r.people }; }
    var P = People(), all = [];
    state.sheetRes = src.sheets.map(function (sh, si) {
      var res = fromSheet(sh, si, (state.modes || {})[si], state, P);
      all = all.concat(res.tasks); return res;
    });
    return { tasks: all, people: P };
  }

  /* =================================================================== *
   *  4. PRZYKŁADY (notatki ze spotkania + skoroszyt kontrolera)           *
   * =================================================================== */
  function teamNames() {
    var me = (SP.user.name || "Ola").split(/\s+/)[0];
    var others = db.raw.people.slice(1).map(function (p) { return p.name.split(/\s+/)[0]; });
    ["Marek", "Anna", "Tomasz", "Ewa"].forEach(function (n) { if (others.length < 4 && others.indexOf(n) < 0 && n !== me) others.push(n); });
    return [me].concat(others);
  }
  function sampleNotes() {
    var n = teamNames();
    return ["Notatki ze spotkania – premiera wersji 2.0", "Data: " + D.today(), "Obecni: " + n.slice(0, 4).join(", "), "",
      "Ustalenia:",
      "- " + n[1] + ": przygotować migrację bazy danych do piątku",
      "- " + n[2] + " zaprojektuje nowe ikony w pasku bocznym (ważne)",
      "- Poprawić walidację formularza logowania – pilne!",
      "    - komunikaty błędów",
      "    - test na telefonie",
      "- [ ] Wysłać newsletter do beta-testerów do " + D.add(D.today(), 8).slice(8) + "." + D.add(D.today(), 8).slice(5, 7) + " @" + n[0],
      "- " + n[3] + ": sprawdzić limity API przed wdrożeniem #backend",
      "- Umówić sesję zdjęciową do kampanii w przyszłym tygodniu",
      "- [x] Zarezerwować salę na webinar", "",
      "Finanse:",
      "- Rozliczyć fakturę za hosting do końca miesiąca",
      "- Uzgodnić budżet marketingu z " + forms(n[1])[3 < forms(n[1]).length ? 3 : 0].replace(/^./, function (c) { return c.toUpperCase(); }) + " jutro", "",
      "Pytanie: czy przesuwamy premierę?",
      "Kiedyś: przemyśleć tryb offline (niski priorytet)",
      "Następne spotkanie: poniedziałek 10:00"].join("\n");
  }
  function sampleBook() {
    var n = teamNames(), T = D.today(), f = function (k) { return D.add(T, k); };
    return [
      { name: "Zamknięcie miesiąca", rows: [["Czynność", "Odpowiedzialny", "Termin", "Priorytet", "Status"],
        ["Uzgodnić salda rozrachunków z kontrahentami", n[1], "WD+1", "Wysoki", ""],
        ["Naliczyć rezerwy na premie", n[2], "WD+2", "", ""],
        ["Zaksięgować amortyzację środków trwałych", n[3], "WD+2", "Normalny", "Zrobione"],
        ["Rozliczyć RMK i koszty przyszłych okresów", n[1], "WD+3", "", ""],
        ["Przygotować raport odchyleń dla zarządu", n[0], "WD+4", "Pilny", ""],
        ["Wysłać pakiet sprawozdawczy do grupy", n[0], "WD+5", "Wysoki", ""]] },
      { name: "Faktury", rows: [["Nr faktury", "Kontrahent", "Kwota brutto", "Termin płatności", "Status", "Osoba"],
        ["FV/2026/11/0412", "Hosting Polska Sp. z o.o.", 4920, f(-2), "", n[3]],
        ["FV/2026/11/0418", "Agencja Kreatywna Mak", 18450, f(2), "", n[2]],
        ["FV/2026/11/0431", "Biuro Rachunkowe Sigma", 6150, f(9), "zapłacona", n[1]],
        ["FA-88231", "Drukarnia Express", 2337.5, f(14), "", n[2]]] },
      { name: "Budżet vs wykonanie", rows: [["Pozycja", "MPK", "Plan", "Wykonanie", "Właściciel"],
        ["Marketing online", "MKT-01", 40000, 52300, n[2]],
        ["Wynagrodzenia", "HR-01", 310000, 314500, n[1]],
        ["Licencje oprogramowania", "IT-02", 12000, 9100, n[3]],
        ["Podróże służbowe", "ADM-03", 8000, 13600, n[0]],
        ["Szkolenia", "HR-02", 15000, 15400, n[1]],
        ["Razem", "", 385000, 404900, ""]] },
    ];
  }
  /* ---- zapis XLSX (do pobrania przykładu): ZIP bez kompresji + CRC32 ---- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xffffffff; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(new Uint8Array(h.buffer), name, data); central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var cs = central.reduce(function (s, x) { return s + x.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  function bookToXlsx(book) {
    var X = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
    var col = function (i) { var s = ""; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    var serial = function (ymd) { var p = ymd.split("-"); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 864e5); };
    var files = [
      ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        book.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>"],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        book.map(function (s, i) { return '<sheet name="' + X(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + "</sheets></workbook>"],
      ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        book.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
        '<Relationship Id="rId' + (book.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00 &quot;zł&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>'],
    ];
    book.forEach(function (s, i) {
      files.push(["xl/worksheets/sheet" + (i + 1) + ".xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="44" customWidth="1"/><col min="2" max="8" width="20" customWidth="1"/></cols><sheetData>' +
        s.rows.map(function (r, ri) {
          return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
            var ref = col(ci) + (ri + 1);
            if (v === "" || v == null) return "";
            if (typeof v === "number") return '<c r="' + ref + '" s="3"><v>' + v + "</v></c>";
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return '<c r="' + ref + '" s="2"><v>' + serial(v) + "</v></c>";
            return '<c r="' + ref + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : "") + "><is><t>" + X(v) + "</t></is></c>";
          }).join("") + "</row>";
        }).join("") + "</sheetData></worksheet>"]);
    });
    return makeZip(files);
  }
  SP.sampleWorkbook = function () { return new File([bookToXlsx(sampleBook())], "Kontroling – zamknięcie miesiąca.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); };

  /* =================================================================== *
   *  5. INTERFEJS + ANIMACJE                                              *
   * =================================================================== */
  var S = null; // stan otwartego okna

  SP.extractTasks = function (opts) {
    opts = opts || {};
    if (S) close();
    var bg = SP.el('<div class="xt-bg"><div class="xt" role="dialog" aria-modal="true" aria-label="Zadania z pliku">' +
      '<header class="xt-h"><span class="xt-hi">' + ico("sparkles", 18) + '</span><div><h2>Zadania z pliku</h2><p class="muted">Wgraj notatki, dokument albo arkusz Excel – Sprynt wyciągnie z niego zadania dla zespołu.</p></div><button class="ibtn" data-x title="Zamknij (Esc)">' + ico("x", 18) + "</button></header>" +
      '<div class="xt-body"></div><footer class="xt-f" hidden></footer></div></div>');
    S = { bg: bg, body: bg.querySelector(".xt-body"), foot: bg.querySelector(".xt-f"), listId: opts.listId || defaultList(), threshold: 10, modes: {}, busy: false, timers: [] };
    bg.querySelector("[data-x]").onclick = function () { close(); };
    bg.addEventListener("mousedown", function (e) { if (e.target === bg && !S.busy) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(bg);
    bg.querySelector(".xt").animate && !reduce && bg.querySelector(".xt").animate([{ transform: "translateY(16px) scale(.98)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
    if (opts.file) start(opts.file, null, opts.from);
    else if (opts.cloudId) fromCloud(opts.cloudId);
    else if (opts.text) startText(opts.text, opts.name || "Wklejony tekst");
    else pickScreen();
  };
  SP.extractFromCloud = function (id) { SP.extractTasks({ cloudId: id }); };
  function onKey(e) { if (e.key === "Escape" && S && !document.querySelector(".popover") && !document.querySelector(".dlg-bg")) { e.stopPropagation(); if (!S.busy) close(); } }
  function close() {
    if (!S) return;
    S.timers.forEach(clearTimeout);
    S.bg.remove(); document.removeEventListener("keydown", onKey, true);
    document.querySelectorAll(".xt-ghost").forEach(function (g) { g.remove(); });
    S = null;
  }
  function defaultList() {
    var m = /^#\/list\/([^/]+)/.exec(location.hash); if (m && db.list(m[1])) return m[1];
    var r = db.raw.recents.find(function (x) { return x.type === "list" && db.list(x.id); });
    return r ? r.id : (db.raw.lists[0] || {}).id;
  }
  function later(fn, ms) { var t = setTimeout(fn, ms); if (S) S.timers.push(t); return t; }

  /* ---- ekran wyboru pliku ---- */
  function pickScreen() {
    S.foot.hidden = true;
    var docs = db.raw.files.filter(SP.canExtract).slice(0, 6);
    S.body.innerHTML = '<div class="xt-pick">' +
      '<label class="xt-drop" tabindex="0"><input type="file" hidden accept=".txt,.md,.markdown,.csv,.tsv,.docx,.odt,.pdf,.html,.htm,.xlsx,.xlsm,.xls,.ods' + (aiOn() ? ",.png,.jpg,.jpeg,.webp,.gif" : "") + '" />' +
      '<span class="xt-drop-ico">' + ico("file-dropzone", 40) + '</span><b>Upuść plik albo kliknij, żeby wybrać</b>' +
      '<span class="muted">Notatki ze spotkania, brief, specyfikacja, protokół, checklista zamknięcia miesiąca, lista faktur, budżet…</span>' +
      '<span class="xt-fmts">' + ["DOCX", "PDF", "XLSX", "XLS", "CSV", "TXT", "MD", "ODT", "ODS"].concat(aiOn() ? ["JPG", "PNG"] : []).map(function (x) { return "<i>" + x + "</i>"; }).join("") + "</span></label>" +
      '<div class="xt-side">' +
      (aiOn() ? '<div class="xt-ai-on">' + ico("sparkles", 16) + "<div><b>AI: " + esc(SP.ai.modelName()) + '</b><small>czyta treść dokumentów, skany i zdjęcia notatek, sprawdza je i wyciąga zadania</small></div><button class="link" data-ai-set>zmień</button></div>'
        : '<div class="xt-ai-off">' + ico("sparkles", 16) + '<div><b>Tryb podstawowy (reguły)</b><small>Włącz AI (Claude), żeby zadania wyciągał model, który naprawdę rozumie tekst – także skany i zdjęcia.</small></div><button class="btn sm primary" data-ai-set>Włącz AI</button></div>') +
      '<div class="xt-try"><h3>' + ico("sparkles", 15) + 'Wypróbuj na przykładzie</h3>' +
      '<button class="xt-sample" data-sample="notes"><span class="ftile" style="--c:#3b82f6">' + ico("file-text", 16) + '</span><span><b>Notatki ze spotkania</b><small class="muted">osoby, terminy, priorytety, checklisty</small></span></button>' +
      '<button class="xt-sample" data-sample="book"><span class="ftile" style="--c:#1aae6f">' + ico("spreadsheet", 16) + '</span><span><b>Skoroszyt kontrolera (Excel)</b><small class="muted">zamknięcie miesiąca, faktury, budżet vs wykonanie</small></span></button>' +
      '<button class="link xt-dl-sample" data-dl-sample>' + ico("download", 13) + "Pobierz przykładowy plik Excel</button></div>" +
      '<button class="btn sm xt-paste" data-paste>' + ico("file-text", 15) + "Wklej tekst zamiast pliku</button>" +
      (docs.length ? '<div class="xt-cloud"><h3>' + ico("cloud", 15) + 'Z chmury</h3>' + docs.map(function (f) { return '<button class="xt-cf" data-cloud="' + f.id + '">' + SP.fileTile(f) + "<span>" + esc(f.name) + '</span><small class="muted">' + SP.fmtSize(f.size) + "</small></button>"; }).join("") + "</div>" : "") +
      "</div></div>";
    SP.hydrateIcons(S.body);
    S.body.querySelector("[data-ai-set]").onclick = function () { close(); location.hash = "#/settings"; setTimeout(function () { var a = document.getElementById("ai-sec"); if (a) a.scrollIntoView({ behavior: "smooth", block: "center" }); }, 150); };
    var drop = S.body.querySelector(".xt-drop"), inp = drop.querySelector("input");
    inp.onchange = function () { if (inp.files[0]) start(inp.files[0], null, drop); };
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); var f = e.dataTransfer.files[0]; if (f) start(f, null, drop, { x: e.clientX, y: e.clientY }); });
    S.body.querySelectorAll("[data-sample]").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.sample === "notes") startText(sampleNotes(), "Notatki ze spotkania.txt", b);
        else start(SP.sampleWorkbook(), null, b, null, true);
      };
    });
    S.body.querySelector("[data-dl-sample]").onclick = function () {
      var f = SP.sampleWorkbook(), url = URL.createObjectURL(f), a = document.createElement("a");
      a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    };
    S.body.querySelector("[data-paste]").onclick = function () {
      S.body.innerHTML = '<div class="xt-pastebox"><textarea class="input" placeholder="Wklej notatki, maila albo listę zadań…"></textarea><div class="xt-paste-a"><button class="btn ghost sm" data-back>Wróć</button><button class="btn primary sm" data-go>' + ico("sparkles", 15) + "Wyciągnij zadania</button></div></div>";
      SP.hydrateIcons(S.body);
      var ta = S.body.querySelector("textarea"); ta.focus();
      S.body.querySelector("[data-back]").onclick = pickScreen;
      S.body.querySelector("[data-go]").onclick = function () { if (ta.value.trim()) startText(ta.value, "Wklejony tekst", ta); };
    };
    S.body.querySelectorAll("[data-cloud]").forEach(function (b) { b.onclick = function () { fromCloud(b.dataset.cloud, b); }; });
  }
  function fromCloud(id, from) {
    var meta = db.file(id); if (!meta) return;
    SP.fileBlob(id).then(function (blob) {
      if (!blob) { SP.toast("Nie znaleziono zawartości pliku na tym urządzeniu."); return; }
      start(new File([blob], meta.name, { type: meta.type }), id, from);
    });
  }
  function startText(text, name, from) { run({ name: name, size: new Blob([text]).size, kind: "text", lines: linesFrom(text), pasted: true }, from); }
  function start(file, cloudId, from, point, sample) {
    if (!S) return;
    S.body.innerHTML = '<div class="xt-loading">' + SP.fileTile(file, "lg") + "<b>" + esc(file.name) + '</b><span class="muted">Czytam plik…</span><span class="xt-spin"></span></div>';
    SP.hydrateIcons(S.body);
    readSource(file).then(function (src) { src.cloudId = cloudId; src.sample = !!sample; if (!S) return; run(src, from, point); }, function (err) {
      if (!S) return;
      S.body.innerHTML = '<div class="xt-loading err">' + ico("x", 28) + "<b>" + esc(err.message || "Nie udało się odczytać pliku.") + '</b><button class="btn sm" data-back>Wybierz inny plik</button></div>';
      SP.hydrateIcons(S.body); S.body.querySelector("[data-back]").onclick = pickScreen;
    });
  }

  /* ---- wynik: dokument po lewej, zadania po prawej ---- */
  var MAX_LINES = 500;
  function docHTML(src) {
    if (src.kind === "image") return '<div class="xl xt-imgwrap" data-k="img"><img class="xt-img" src="' + src.url + '" alt="" /></div>';
    if (src.kind === "text" && !src.lines.some(function (l) { return l.text; }) && src.pdfBuf) return '<div class="xl xt-scanned" data-k="img">' + ico("file-image", 34) + "<b>PDF bez warstwy tekstu (skan)</b><span class=\"muted\">AI przeczyta strony jak obrazy.</span></div>";
    if (src.kind === "text") {
      var shown = src.lines.slice(0, MAX_LINES);
      return shown.map(function (l, i) { return '<div class="xl' + (l.text ? "" : " empty") + '" data-k="l' + i + '" style="padding-left:' + (14 + Math.min(l.indent, 16) * 5) + 'px">' + (esc(l.text) || "&nbsp;") + "</div>"; }).join("") +
        (src.lines.length > MAX_LINES ? '<div class="xl more muted">… i jeszcze ' + (src.lines.length - MAX_LINES) + " linii</div>" : "");
    }
    return src.sheets.map(function (sh, si) {
      var res = S.aiMode ? null : S.sheetRes[si], cols = Math.min(8, Math.max.apply(null, sh.rows.map(function (r) { return r.length; }).concat([1])));
      var hdr = res ? res.map.header : mapColumns(sh.rows).header;
      var modes = res ? res.modes.map(function (m) { return '<option value="' + m + '"' + (m === res.mode ? " selected" : "") + ">" + MODES[m] + "</option>"; }).join("") : "";
      return '<div class="xs-h"><span class="xs-tab">' + ico("spreadsheet", 14) + esc(sh.name) + "</span>" + (res ? '<select class="input sm xs-mode" data-sheet="' + si + '" title="Jak czytać ten arkusz">' + modes + "</select>" : '<span class="xs-ai">' + ico("sparkles", 12) + "czyta AI</span>") +
        (res && res.mode === "variance" ? '<label class="xs-thr">próg <input class="input sm" type="number" min="0" max="500" value="' + S.threshold + '" data-thr />%</label>' : "") + "</div>" +
        '<div class="xs-grid" style="--cols:' + cols + '">' + sh.rows.slice(0, MAX_LINES).map(function (r, ri) {
          if (!r.some(function (c) { return c && c.s; })) return "";
          var cells = []; for (var ci = 0; ci < cols; ci++) { var c = r[ci] || { s: "" }; cells.push('<span class="' + (c.n != null ? "num" : "") + '">' + esc(c.s) + "</span>"); }
          return '<div class="xl xr' + (ri === hdr ? " hdr" : "") + '" data-k="s' + si + "r" + ri + '"><i>' + (ri + 1) + "</i>" + cells.join("") + "</div>";
        }).join("") + "</div>";
    }).join("");
  }
  function run(src, from, point) {
    if (!S) return;
    S.src = src; S.busy = true;
    S.aiMode = aiOn() && !S.noAI; S.ai = null;
    if (!S.aiMode && (src.kind === "image" || (src.pdfBuf && !src.lines.some(function (l) { return l.text; })))) {
      S.busy = false; S.body.innerHTML = '<div class="xt-loading err">' + ico("file-image", 28) + "<b>Ten plik to obraz albo skan – tekst odczyta tylko AI.</b>" + (SP.ai ? '<button class="btn sm primary" data-ai-on>Włącz AI w Ustawieniach</button>' : "") + "</div>";
      SP.hydrateIcons(S.body); var bb = S.body.querySelector("[data-ai-on]"); if (bb) bb.onclick = function () { close(); location.hash = "#/settings"; };
      return;
    }
    var res = S.aiMode ? { tasks: [], people: People() } : extract(src, S);
    S.tasks = res.tasks.map(function (t) { t.on = true; return t; }); S.people = res.people;
    S.body.innerHTML = '<div class="xt-run">' +
      '<section class="xt-doc"><div class="xt-doc-h">' + (src.file ? SP.fileTile(src.file, "") : '<span class="ftile" style="--c:#3b82f6">' + ico("file-text", 16) + "</span>") + "<b>" + esc(src.name) + '</b><span class="muted">' + (src.kind === "image" ? "zdjęcie" : src.kind === "sheet" ? src.sheets.length + " " + (src.sheets.length === 1 ? "arkusz" : "arkusze") : src.lines.filter(function (l) { return l.text; }).length + " linii") + " · " + SP.fmtSize(src.size || 0) + '</span></div>' +
      '<div class="xt-scroll"><div class="xt-lines">' + docHTML(src) + '<div class="xt-scan"></div></div></div></section>' +
      '<section class="xt-res"><div class="xt-res-h"><h3>Znalezione zadania</h3><span class="xt-count">0</span><span class="muted xt-sum"></span></div><div class="xt-cards"></div></section></div>';
    SP.hydrateIcons(S.body);
    bindDoc();
    var cards = S.body.querySelector(".xt-cards");
    S.tasks.forEach(function (t) { var c = SP.el(cardHTML(t)); c.style.visibility = "hidden"; cards.appendChild(c); });
    SP.hydrateIcons(cards); bindCards();
    if (reduce || SP.extractInstant) { if (S.aiMode) think(true); else reveal(true); return; }
    // 1) plik „rozkłada się” w dokument
    var doc = S.body.querySelector(".xt-doc"), res2 = S.body.querySelector(".xt-res");
    var a1 = doc.animate([{ clipPath: "inset(0 0 100% 0 round 14px)", transform: "translateY(10px)" }, { clipPath: "inset(0 0 0% 0 round 14px)", transform: "none" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
    res2.animate([{ opacity: 0, transform: "translateX(30px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: 200, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    var tile = S.body.querySelector(".xt-doc-h .ftile");
    if (tile && (from || point)) {
      var r0 = point ? { left: point.x - 30, top: point.y - 30, width: 60, height: 60 } : from.getBoundingClientRect();
      var r1 = tile.getBoundingClientRect(), g = tile.cloneNode(true);
      g.className += " xt-ghost xt-ghost-file"; st(g, r1); document.body.appendChild(g);
      g.animate([{ transform: "translate(" + (r0.left + r0.width / 2 - r1.left - r1.width / 2) + "px," + (r0.top + r0.height / 2 - r1.top - r1.height / 2) + "px) scale(2.6) rotate(-10deg)", opacity: 0 },
        { transform: "translate(" + (r0.left - r1.left) * .4 + "px," + ((r0.top - r1.top) * .4 - 60) + "px) scale(2.2) rotate(6deg)", opacity: 1, offset: .5 }, { transform: "none", opacity: 1 }], { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" }).finished.then(function () { g.remove(); });
    }
    a1.finished.then(function () { if (S) (S.aiMode ? think() : scan()); });
  }

  /* =================== AI: model czyta dokument =================== */
  function think(instant) {
    var bar = S.body.querySelector(".xt-scan"), cards = S.body.querySelector(".xt-cards"), count = S.body.querySelector(".xt-count");
    if (bar && !instant) { bar.style.display = "block"; bar.classList.add("thinking"); }
    S.body.querySelector(".xt-sum").textContent = "";
    cards.innerHTML = '<div class="xt-think"><div class="xt-orb"><i></i><i></i><i></i>' + ico("sparkles", 22) + '</div><b>' + esc(SP.ai.modelName()) + ' czyta dokument…</b><span class="muted xt-tick">Analizuję treść, osoby, terminy i ryzyka</span><div class="xt-found"></div></div>';
    SP.hydrateIcons(cards);
    var seen = 0, tick = cards.querySelector(".xt-tick"), found = cards.querySelector(".xt-found"), t0 = Date.now();
    var timer = setInterval(function () { if (!S || !tick.isConnected) { clearInterval(timer); return; } if (!seen) tick.textContent = "Analizuję treść, osoby, terminy i ryzyka · " + Math.round((Date.now() - t0) / 1000) + " s"; }, 1000);
    S.timers.push(timer);
    SP.ai.extract(S.src, function (snap) {
      if (!S) return;
      var titles = [], m, re = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      while ((m = re.exec(snap))) titles.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\u([0-9a-f]{4})/gi, function (x, h) { return String.fromCharCode(parseInt(h, 16)); }));
      // ostatni tytuł może być jeszcze niedokończony – pokazujemy tylko domknięte
      var done = titles.length && /"title"\s*:\s*"(?:[^"\\]|\\.)*"\s*,/.test(snap.slice(snap.lastIndexOf('"title"'))) ? titles.length : titles.length - 1;
      while (seen < done) {
        var chip = document.createElement("span"); chip.className = "xt-fchip"; chip.textContent = titles[seen]; found.appendChild(chip);
        if (!reduce) chip.animate([{ opacity: 0, transform: "translateY(8px) scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.3,1.4,.5,1)" });
        seen++; count.textContent = String(seen); tick.textContent = "Znaleziono " + seen + " " + plural(seen) + "…";
      }
    }).then(function (data) {
      clearInterval(timer);
      if (!S) return;
      if (bar) { bar.classList.remove("thinking"); bar.style.display = "none"; }
      S.ai = data; mapAI(data);
      cards.innerHTML = "";
      S.tasks.forEach(function (t) { var c = SP.el(cardHTML(t)); c.style.visibility = "hidden"; cards.appendChild(c); });
      SP.hydrateIcons(cards); bindCards();
      count.textContent = "0";
      if (instant || reduce) reveal(true); else scan();
    }, function (err) {
      clearInterval(timer);
      if (!S) return;
      if (bar) { bar.classList.remove("thinking"); bar.style.display = "none"; }
      S.busy = false;
      cards.innerHTML = '<div class="xt-aierr">' + ico("x", 26) + "<b>AI nie przeczytało dokumentu</b><p></p>" +
        '<div><button class="btn sm primary" data-retry>' + ico("sparkles", 14) + 'Spróbuj ponownie</button><button class="btn sm" data-noai>Użyj trybu bez AI</button><button class="btn sm ghost" data-aiset>Ustawienia AI</button></div></div>';
      cards.querySelector("p").textContent = err.message; SP.hydrateIcons(cards);
      cards.querySelector("[data-retry]").onclick = function () { run(S.src); };
      cards.querySelector("[data-noai]").onclick = function () { S.noAI = true; run(S.src); };
      cards.querySelector("[data-aiset]").onclick = function () { close(); location.hash = "#/settings"; };
    });
  }
  /** Odpowiedź AI → karty (osoby z zespołu, linia źródłowa do animacji). */
  function mapAI(data) {
    var P = People(data.new_people || []), src = S.src;
    var norm = function (x) { return String(x || "").toLowerCase().replace(/\s+/g, " ").trim(); };
    function keyFor(t) {
      if (src.kind === "image") return { key: "img", at: 0 };
      if (src.kind === "sheet") {
        var si = src.sheets.findIndex(function (sh) { return sh.name === t.source_sheet; }); if (si < 0) si = src.sheets.length === 1 ? 0 : -1;
        var row = t.source_line ? t.source_line - 1 : -1;
        if (si >= 0 && row >= 0 && src.sheets[si].rows[row]) return { key: "s" + si + "r" + row, at: row, sheet: si };
        var q = norm(t.source_quote).slice(0, 40);
        for (var a = 0; q && a < src.sheets.length; a++) for (var r = 0; r < src.sheets[a].rows.length; r++) if (norm(src.sheets[a].rows[r].map(function (c) { return c.s; }).join(" ")).indexOf(q) >= 0) return { key: "s" + a + "r" + r, at: r, sheet: a };
        return { key: "none", at: 0 };
      }
      var li = t.source_line ? t.source_line - 1 : -1;
      if (li >= 0 && src.lines[li] && src.lines[li].text) return { key: "l" + li, at: li };
      var qq = norm(t.source_quote).slice(0, 40);
      for (var i = 0; qq && i < src.lines.length; i++) if (norm(src.lines[i].text).indexOf(qq) >= 0) return { key: "l" + i, at: i };
      return { key: src.pdfBuf && !src.lines.some(function (l) { return l.text; }) ? "img" : "none", at: 0 };
    }
    S.tasks = (data.tasks || []).map(function (t) {
      var who = t.assignee ? (P.find(t.assignee) || P.add(t.assignee)) : null, k = keyFor(t);
      return { key: k.key, at: k.at, sheet: k.sheet, on: true, title: String(t.title || "").slice(0, 200), desc: t.description || "", reason: t.reason || "",
        assignees: who ? [who] : [], due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : null, priority: t.priority || null,
        tags: (t.tags || []).map(function (x) { return String(x).replace(/^#/, "").toLowerCase(); }).filter(Boolean).slice(0, 5), checklist: (t.checklist || []).slice(0, 30), done: !!t.done,
        amount: typeof t.amount === "number" ? t.amount : null, party: t.counterparty || "" };
    });
    S.people = P;
  }
  function st(el, r) { el.style.position = "fixed"; el.style.left = r.left + "px"; el.style.top = r.top + "px"; el.style.width = r.width + "px"; el.style.height = r.height + "px"; el.style.margin = "0"; }

  /* 2) skaner przesuwa się po dokumencie, znalezione linie „wylatują” jako karty */
  function scan() {
    var scroller = S.body.querySelector(".xt-scroll"), lines = S.body.querySelector(".xt-lines"), bar = S.body.querySelector(".xt-scan");
    var els = Array.prototype.slice.call(lines.querySelectorAll(".xl[data-k]"));
    var byKey = {}; S.tasks.forEach(function (t, i) { (byKey[t.key] = byKey[t.key] || []).push(i); });
    var H = lines.scrollHeight, dur = Math.max(1400, Math.min(5200, els.length * 55 + S.tasks.length * 140)), t0 = performance.now(), idx = 0, flown = 0, pending = [];
    bar.style.display = "block";
    (function tick() {
      if (!S) return;
      var p = Math.min(1, (performance.now() - t0) / dur), y = p * H;
      bar.style.transform = "translateY(" + y + "px)";
      scroller.scrollTop = Math.max(0, y - scroller.clientHeight * .45);
      while (idx < els.length && els[idx].offsetTop <= y) {
        var e = els[idx++]; e.classList.add("seen");
        (byKey[e.dataset.k] || []).forEach(function (ti) { pending.push([e, ti]); });
      }
      if (pending.length) { var nx = pending.shift(); e = nx[0]; e.classList.add("hit"); flyOut(e, nx[1], flown++); }
      if (p < 1 || pending.length) later(tick, 16);
      else { bar.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished.then(function () { bar.style.display = "none"; }); later(function () { reveal(false); }, 700); }
    })();
  }
  function flyOut(lineEl, ti, n) {
    var card = S.body.querySelector('.xc[data-i="' + ti + '"]'); if (!card) return;
    var list = S.body.querySelector(".xt-cards");
    // karta przewija się do widoku, żeby lądowanie było widać
    if (card.offsetTop + card.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = card.offsetTop + card.offsetHeight - list.clientHeight + 8;
    var a = lineEl.getBoundingClientRect(), b = card.getBoundingClientRect();
    var g = document.createElement("div"); g.className = "xt-ghost"; g.innerHTML = "<span>" + esc(S.tasks[ti].title) + "</span>"; st(g, b); document.body.appendChild(g);
    var dx = a.left - b.left, dy = a.top - b.top, sx = Math.max(.3, a.width / b.width), sy = Math.max(.2, a.height / b.height);
    g.animate([
      { transform: "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")", opacity: .25, filter: "brightness(1.6)" },
      { transform: "translate(" + dx * .5 + "px," + (dy * .5 - 70) + "px) scale(" + (sx + 1) / 2 * 1.06 + ",1.06) rotate(-5deg)", opacity: 1, offset: .5 },
      { transform: "none", opacity: 1, filter: "none" },
    ], { duration: 720, easing: "cubic-bezier(.25,.8,.25,1)" }).finished.then(function () {
      g.remove(); if (!S) return;
      card.style.visibility = "";
      card.animate([{ transform: "scale(.94)", boxShadow: "0 0 0 3px var(--brand)" }, { transform: "scale(1.02)", offset: .6 }, { transform: "none", boxShadow: "0 0 0 0 transparent" }], { duration: 420, easing: "ease-out" });
      var c = S.body.querySelector(".xt-count"); c.textContent = String(n + 1);
      c.animate([{ transform: "scale(1.5)" }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.3,1.6,.6,1)" });
    });
  }
  function reveal(instant) {
    if (!S) return;
    S.busy = false;
    S.body.querySelectorAll(".xc").forEach(function (c) { c.style.visibility = ""; });
    S.body.querySelectorAll(".xl[data-k]").forEach(function (e) { if (S.tasks.some(function (t) { return t.key === e.dataset.k; })) e.classList.add("hit", "seen"); });
    S.body.querySelector(".xt-count").textContent = S.tasks.length;
    drawSummary(); drawFoot();
    if (S.aiMode && S.ai) {
      var cards = S.body.querySelector(".xt-cards"), old = cards.querySelector(".xt-aibox"); if (old) old.remove();
      var u = S.ai.usage || {}, w = S.ai.warnings || [];
      var box = SP.el('<div class="xt-aibox"><div class="xt-aih">' + ico("sparkles", 15) + "<b>Analiza AI</b><small>" + esc(SP.ai.modelName()) + (u.input_tokens ? " · " + (u.input_tokens + (u.output_tokens || 0)).toLocaleString("pl-PL") + " tokenów" : "") + "</small></div>" +
        (S.ai.summary ? '<p class="xt-ais"></p>' : "") + (w.length ? '<div class="xt-aiw"><b>' + ico("flag", 13) + "Uwagi do dokumentu (" + w.length + ')</b><ul></ul></div>' : '<div class="xt-aiok">' + ico("check", 13) + "Nie znalazłem problemów w dokumencie.</div>") +
        (S.ai.note ? '<p class="muted xt-ain"></p>' : "") + "</div>");
      if (S.ai.summary) box.querySelector(".xt-ais").textContent = S.ai.summary;
      w.forEach(function (x) { var li = document.createElement("li"); li.textContent = x; box.querySelector("ul").appendChild(li); });
      if (S.ai.note) box.querySelector(".xt-ain").textContent = S.ai.note;
      cards.insertBefore(box, cards.firstChild); SP.hydrateIcons(box); cards.scrollTop = 0;
      if (!instant && !reduce) box.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 400, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    if (!instant && !reduce) S.foot.animate([{ transform: "translateY(100%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
    if (!S.tasks.length) S.body.querySelector(".xt-cards").insertAdjacentHTML("beforeend", S.aiMode ? '<div class="empty-b">' + ico("search", 34) + "<h3>AI nie znalazło zadań w tym dokumencie</h3><p class='muted'>Dokument nie zawiera rzeczy do zrobienia – albo spróbuj innego pliku.</p></div>" : '<div class="empty-b">' + ico("search", 34) + "<h3>Nie znalazłem zadań</h3><p class='muted'>Zadania rozpoznaję po wypunktowaniach, polach [ ], słowach „TODO”, czasownikach („przygotować”, „wyślij”) i kolumnach arkusza (Zadanie, Osoba, Termin…).</p></div>");
  }
  function drawSummary() {
    var on = S.tasks.filter(function (t) { return t.on; }), who = {};
    on.forEach(function (t) { t.assignees.forEach(function (a) { who[a] = 1; }); });
    var amt = on.reduce(function (s, t) { return s + (t.amount && S.src.kind === "sheet" ? Math.abs(t.amount) : 0); }, 0);
    S.body.querySelector(".xt-sum").textContent = Object.keys(who).length + " " + (Object.keys(who).length === 1 ? "osoba" : "osób") + (on.filter(function (t) { return t.due; }).length ? " · " + on.filter(function (t) { return t.due; }).length + " z terminem" : "") + (amt ? " · " + money(amt) : "");
  }

  /* ---- karty zadań ---- */
  function avatarFor(key) {
    if (key.indexOf("new:") === 0) { var n = key.slice(4); return '<span class="av av-xs av-new" title="Nowa osoba: ' + esc(n) + '">' + esc(SP.initials(n)) + "</span>"; }
    return SP.avatar(key, "xs");
  }
  function cardHTML(t) {
    var i = S.tasks.indexOf(t), d = t.due ? SP.fmtDue(t.due, t.done) : null;
    var who = t.assignees.map(function (a) { return avatarFor(a) + '<span class="xc-n">' + esc(S.people.name(a)) + "</span>"; }).join("");
    return '<div class="xc' + (t.on ? "" : " off") + (t.done ? " done" : "") + '" data-i="' + i + '">' +
      '<button class="xc-on" data-c="on" aria-pressed="' + t.on + '" title="Uwzględnij">' + ico("check", 12) + "</button>" +
      '<div class="xc-b"><input class="xc-t" value="' + esc(t.title) + '" aria-label="Nazwa zadania" />' +
      (t.reason ? '<div class="xc-why" title="Dlaczego AI uznało to za zadanie">' + ico("sparkles", 11) + esc(t.reason) + "</div>" : "") +
      '<div class="xc-chips"><button class="xc-chip" data-c="who">' + (who || ico("user", 13) + '<span class="muted">Przypisz</span>') + "</button>" +
      '<button class="xc-chip" data-c="due">' + (d ? '<span class="due ' + d.cls + '">' + ico("calendar", 13) + d.label + "</span>" : ico("calendar", 13) + '<span class="muted">Termin</span>') + "</button>" +
      '<button class="xc-chip" data-c="prio">' + (t.priority ? SP.flag(t.priority, true) : ico("flag", 13) + '<span class="muted">Priorytet</span>') + "</button>" +
      (t.amount != null && !isNaN(t.amount) ? '<span class="xc-chip static amt">' + ico("coins", 13) + money(t.amount) + "</span>" : "") +
      (t.checklist.length ? '<span class="xc-chip static">' + ico("list-checks", 13) + t.checklist.length + " punkty</span>" : "") +
      (t.done ? '<span class="xc-chip static ok">' + ico("check", 13) + "zrobione</span>" : "") +
      t.tags.map(function (x) { return '<span class="xc-chip static">#' + esc(x) + "</span>"; }).join("") +
      "</div></div>" + '<button class="xc-src" data-c="src" title="Pokaż w pliku">' + (t.sheet != null ? "w." : "l.") + " " + (t.at + 1) + "</button></div>";
  }
  function redrawCard(i) {
    var old = S.body.querySelector('.xc[data-i="' + i + '"]'); if (!old) return;
    var n = SP.el(cardHTML(S.tasks[i])); old.replaceWith(n); SP.hydrateIcons(n); drawSummary(); drawFoot();
  }
  function bindCards() {
    var cards = S.body.querySelector(".xt-cards");
    if (cards._b) return; cards._b = true;
    cards.addEventListener("input", function (e) { var c = e.target.closest(".xc"); if (c && e.target.classList.contains("xc-t")) S.tasks[+c.dataset.i].title = e.target.value; });
    cards.addEventListener("click", function (e) {
      var c = e.target.closest(".xc"), b = e.target.closest("[data-c]"); if (!c || !b) return;
      var i = +c.dataset.i, t = S.tasks[i], k = b.dataset.c;
      if (k === "on") { t.on = !t.on; redrawCard(i); }
      else if (k === "due") SP.pickDate(b, t.due, function (v) { t.due = v; redrawCard(i); });
      else if (k === "prio") SP.pickPriority(b, t.priority, function (v) { t.priority = v; redrawCard(i); });
      else if (k === "who") {
        var existing = t.assignees.filter(function (a) { return a.indexOf("new:") !== 0; });
        SP.pickAssignees(b, existing, function (v) { t.assignees = v.length ? v : t.assignees.filter(function (a) { return a.indexOf("new:") === 0; }); redrawCard(i); });
      } else if (k === "src") {
        var line = S.body.querySelector('.xl[data-k="' + t.key + '"]'); if (!line) return;
        var sc = S.body.querySelector(".xt-scroll"); sc.scrollTop = line.offsetTop - sc.clientHeight / 3;
        line.animate([{ background: "var(--brand)" }, { background: "" }], { duration: 900 });
      }
    });
  }
  function bindDoc() {
    S.body.querySelectorAll(".xs-mode").forEach(function (sel) {
      sel.onchange = function () { S.modes[+sel.dataset.sheet] = sel.value; rebuild(); };
    });
    var thr = S.body.querySelector("[data-thr]");
    if (thr) thr.onchange = function () { var v = parseFloat(thr.value); if (!isNaN(v) && v >= 0) { S.threshold = v; rebuild(); } };
  }
  /** Ponowne odczytanie arkusza (inny tryb / próg) – szybko, bez skanowania. */
  function rebuild() {
    var res = extract(S.src, S);
    S.tasks = res.tasks.map(function (t) { t.on = true; return t; }); S.people = res.people;
    S.body.querySelector(".xt-lines").innerHTML = docHTML(S.src) + '<div class="xt-scan"></div>';
    SP.hydrateIcons(S.body.querySelector(".xt-lines")); bindDoc();
    var cards = S.body.querySelector(".xt-cards"); cards.innerHTML = "";
    S.tasks.forEach(function (t, i) { var c = SP.el(cardHTML(t)); cards.appendChild(c); if (!reduce) c.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: Math.min(i, 12) * 30, fill: "backwards" }); });
    SP.hydrateIcons(cards); reveal(true);
  }

  /* ---- stopka: lista docelowa, nowe osoby, rozdzielanie, tworzenie ---- */
  function drawFoot() {
    var on = S.tasks.filter(function (t) { return t.on; }), l = db.list(S.listId) || db.raw.lists[0];
    if (l) S.listId = l.id;
    var newPeople = {}; on.forEach(function (t) { t.assignees.forEach(function (a) { if (a.indexOf("new:") === 0) newPeople[a.slice(4)] = 1; }); });
    var np = Object.keys(newPeople), un = on.filter(function (t) { return !t.assignees.length; }).length;
    var hasAmt = S.src.kind === "sheet" && on.some(function (t) { return t.amount != null && !isNaN(t.amount); });
    if (S.addPeople == null) S.addPeople = true; if (S.addFields == null) S.addFields = true; if (S.saveFile == null) S.saveFile = !S.src.cloudId && !S.src.pasted && !S.src.sample;
    S.foot.hidden = false;
    var aiBtn = !SP.ai ? "" : S.aiMode ? '<button class="xc-chip" data-f="noai" title="Pokaż wynik trybu podstawowego (reguły)">' + ico("x", 12) + "Bez AI</button>" : aiOn() ? '<button class="xc-chip xt-aichip" data-f="ai">' + ico("sparkles", 13) + "Przeanalizuj z AI</button>" : '<button class="xc-chip xt-aichip" data-f="aiset">' + ico("sparkles", 13) + "Włącz AI</button>";
    S.foot.innerHTML = '<div class="xt-f-opts">' + aiBtn +
      '<button class="xc-chip xt-list" data-f="list">' + ico("list", 14) + "Do listy: <b>" + (l ? esc((db.space(l.spaceId) || {}).name + " / " + l.name) : "—") + "</b>" + ico("chevron-down", 12) + "</button>" +
      (np.length ? '<label class="xt-opt"><input type="checkbox" data-f="people"' + (S.addPeople ? " checked" : "") + " />Dodaj do zespołu: <b>" + np.map(esc).join(", ") + "</b></label>" : "") +
      (hasAmt ? '<label class="xt-opt"><input type="checkbox" data-f="fields"' + (S.addFields ? " checked" : "") + " />Kwoty i kontrahentów zapisz w polach listy</label>" : "") +
      (!S.src.cloudId && !S.src.pasted && S.src.file ? '<label class="xt-opt"><input type="checkbox" data-f="save"' + (S.saveFile ? " checked" : "") + " />Zapisz plik w chmurze</label>" : "") +
      "</div>" +
      (un && db.raw.people.length + np.length > 1 ? '<button class="btn sm" data-f="split">' + ico("users", 15) + "Rozdziel " + un + " nieprzypisanych</button>" : "") +
      '<button class="btn primary" data-f="create"' + (on.length ? "" : " disabled") + ">" + ico("plus", 16) + "Utwórz " + on.length + " " + plural(on.length) + "</button>";
    SP.hydrateIcons(S.foot);
    if (!S.foot._b) {
      S.foot._b = true;
      S.foot.addEventListener("change", function (e) { var f = e.target.dataset.f; if (f === "people") S.addPeople = e.target.checked; if (f === "fields") S.addFields = e.target.checked; if (f === "save") S.saveFile = e.target.checked; });
      S.foot.addEventListener("click", function (e) {
        var b = e.target.closest("[data-f]"); if (!b || b.tagName === "INPUT") return;
        if (b.dataset.f === "list") SP.pickList(b, S.listId, function (v) { S.listId = v; drawFoot(); });
        else if (b.dataset.f === "split") split();
        else if (b.dataset.f === "create") create();
        else if (b.dataset.f === "noai") { S.noAI = true; run(S.src); }
        else if (b.dataset.f === "ai") { S.noAI = false; run(S.src); }
        else if (b.dataset.f === "aiset") { close(); location.hash = "#/settings"; }
      });
    }
  }
  function plural(n) { return n === 1 ? "zadanie" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "zadania" : "zadań"; }
  /** Nieprzypisane zadania → po kolei do osób z najmniejszą liczbą otwartych zadań. */
  function split() {
    var load = {};
    S.people.list.forEach(function (p) { load[p.key] = p.key.indexOf("new:") === 0 ? 0 : db.raw.tasks.filter(function (t) { return !db.status(t.status).closed && t.assignees.indexOf(p.key) >= 0; }).length; });
    S.tasks.forEach(function (t) { if (t.on) t.assignees.forEach(function (a) { load[a] = (load[a] || 0) + 1; }); });
    var keys = Object.keys(load);
    S.tasks.forEach(function (t, i) {
      if (!t.on || t.assignees.length) return;
      keys.sort(function (a, b) { return load[a] - load[b]; });
      t.assignees = [keys[0]]; load[keys[0]]++;
      redrawCard(i);
      var c = S.body.querySelector('.xc[data-i="' + i + '"] .xc-chip[data-c="who"]');
      if (c && !reduce) c.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.15)", offset: .6 }, { transform: "none", opacity: 1 }], { duration: 380, delay: i * 40, fill: "backwards" });
    });
    SP.toast("Rozdzielono zadania w zespole");
  }

  /* ---- tworzenie: karty odlatują do listy w pasku bocznym ---- */
  function ensureField(listId, name, type) {
    var f = db.fieldsFor(listId).find(function (x) { return x.name === name && x.type === type; });
    return f || db.addField(listId, { name: name, type: type });
  }
  function create() {
    var on = S.tasks.filter(function (t) { return t.on && t.title.trim(); }); if (!on.length || !db.list(S.listId)) return;
    S.busy = true;
    var src = S.src, listId = S.listId, mapP = {};
    on.forEach(function (t) { t.assignees.forEach(function (a) { if (a.indexOf("new:") === 0 && !(a in mapP)) mapP[a] = S.addPeople ? db.addPerson(a.slice(4)).id : null; }); });
    var fAmt = null, fParty = null;
    if (S.addFields && src.kind === "sheet" && on.some(function (t) { return t.amount != null && !isNaN(t.amount); })) {
      fAmt = ensureField(listId, "Kwota", "money");
      if (on.some(function (t) { return t.party; })) fParty = ensureField(listId, "Kontrahent", "text");
    }
    var created = on.map(function (t) {
      var cf = {}; if (fAmt && t.amount != null && !isNaN(t.amount)) cf[fAmt.id] = Math.round(t.amount * 100) / 100; if (fParty && t.party) cf[fParty.id] = t.party;
      var desc = (t.desc ? "<p>" + esc(t.desc).replace(/\n/g, "<br>") + "</p>" : "") + (t.reason ? '<p class="muted">✦ AI: ' + esc(t.reason) + "</p>" : "") + '<p class="muted">Źródło: „' + esc(src.name) + "”" + (t.sheet != null ? ", arkusz „" + esc(src.sheets[t.sheet].name) + "”, wiersz " + (t.at + 1) : ", linia " + (t.at + 1)) + "</p>";
      var task = db.createTask({ listId: listId, title: t.title.trim(), assignees: t.assignees.map(function (a) { return a in mapP ? mapP[a] : a; }).filter(Boolean),
        due: t.due, priority: t.priority, tags: t.tags, status: t.done ? "done" : "todo", desc: desc, cf: cf,
        checklist: t.checklist.map(function (x) { return { id: Math.random().toString(36).slice(2, 8), text: x, done: false }; }) });
      task.activity.push({ by: "me", text: "utworzył(a) z pliku „" + src.name + "”" + (S.aiMode ? " (analiza AI: " + SP.ai.modelName() + ")" : ""), at: new Date().toISOString() });
      return task;
    });
    db.changed("tasks");
    if (S.saveFile && src.file && !src.cloudId && !src.pasted) SP.uploadFiles([src.file]);
    var target = document.querySelector('.tree-row.list[href="#/list/' + listId + '"]') || document.querySelector(".side-nav") || document.body;
    var tr = target.getBoundingClientRect(), cards = Array.prototype.slice.call(S.body.querySelectorAll(".xc:not(.off)"));
    var finish = function () {
      if (!S) return;
      var n = created.length; close();
      SP.flashTasks = created.map(function (t) { return t.id; });
      location.hash = "#/list/" + listId + "/list";
      setTimeout(flash, 150); setTimeout(flash, 600);
      SP.toast("Utworzono " + n + " " + plural(n) + " z pliku „" + src.name + "”");
    };
    if (reduce || SP.extractInstant || !cards.length) { finish(); return; }
    S.bg.classList.add("leaving");
    var anims = cards.slice(0, 24).map(function (c, i) {
      var r = c.getBoundingClientRect(), g = document.createElement("div");
      g.className = "xt-ghost"; g.innerHTML = "<span>" + esc(c.querySelector(".xc-t").value) + "</span>"; st(g, r); document.body.appendChild(g);
      c.style.visibility = "hidden";
      var dx = tr.left + 20 - r.left, dy = tr.top + tr.height / 2 - r.top - r.height / 2;
      return g.animate([{ transform: "none", opacity: 1 }, { transform: "translate(" + dx * .35 + "px," + (dy * .35 - 80) + "px) scale(.7) rotate(-8deg)", opacity: 1, offset: .45 },
        { transform: "translate(" + dx + "px," + dy + "px) scale(.08)", opacity: .2 }], { duration: 800, delay: i * 55, easing: "cubic-bezier(.5,0,.3,1)", fill: "both" }).finished.then(function () { g.remove(); });
    });
    Promise.all(anims).then(function () {
      target.classList.add("xt-pulse"); setTimeout(function () { target.classList.remove("xt-pulse"); }, 900);
      setTimeout(finish, 250);
    });
  }
  function flash() {
    (SP.flashTasks || []).forEach(function (id) { document.querySelectorAll('[data-task="' + id + '"]').forEach(function (r) { r.classList.remove("xt-new"); void r.offsetWidth; r.classList.add("xt-new"); }); });
  }

  /* Dostęp do parsera (testy). */
  SP._extract = { readSource: readSource, fromText: fromText, fromSheet: fromSheet, parseDue: parseDue, parseAmount: parseAmount, workday: workday, sampleNotes: sampleNotes, sampleBook: sampleBook, linesFrom: linesFrom };
})();
