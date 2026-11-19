// Buduje js/icons.js z plików icons/*.svg (pobranych z serwera MCP thesvg).
// Użycie: node scripts/build-icons.mjs
// Inline SVG (a nie <img>) jest potrzebne, żeby działało currentColor.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "icons");
const out = {};

for (const file of readdirSync(iconsDir).filter((f) => f.endsWith(".svg")).sort()) {
  const slug = file.replace(/\.svg$/, "");
  const src = readFileSync(join(iconsDir, file), "utf8").trim();
  const m = src.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);
  if (!m) throw new Error(`${file}: brak pojedynczego elementu <svg>`);
  const body = m[2].replace(/<title>[\s\S]*?<\/title>/g, "");
  if (/<script|\son\w+=|<foreignObject|href=/i.test(body)) throw new Error(`${file}: niebezpieczna treść`);

  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]);
  const prefixes = [...new Set(ids.map((id) => id.replace(/-[^-]+$/, "-").replace(/^(.*?-(?:glass|outline|duotone|fill|offset|depth|glass-outline)-).*$/, "$1")))];
  if (prefixes.length > 1) throw new Error(`${file}: różne prefiksy ID: ${prefixes.join(", ")}`);

  out[slug] = {
    prefix: prefixes[0] ?? "",
    // Ikony marek (np. github mono) nie mają fill – dziedziczą kolor przez currentColor.
    fill: !/currentColor/.test(body),
    body,
  };
}

const js = `/* WYGENEROWANE przez scripts/build-icons.mjs – nie edytuj ręcznie.
 * Źródło ikon: serwer MCP thesvg (thesvg.org). Lista i pochodzenie: icons/README.md */
(function () {
  "use strict";
  var SP = (window.SP = window.SP || {});
  SP.ICONS = ${JSON.stringify(out, null, 0)};

  var counter = 0;
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /** Zwraca znacznik <svg> ikony. ID masek/gradientów są unikalne dla każdej instancji. */
  SP.icon = function (name, opts) {
    opts = opts || {};
    var ic = SP.ICONS[name];
    if (!ic) { console.warn("[SP.icon] brak ikony:", name); return ""; }
    var size = opts.size || 20;
    var uid = "spi" + ++counter;
    var body = ic.prefix ? ic.body.split(ic.prefix).join(uid + "-") : ic.body;
    var a11y = opts.title
      ? 'role="img" aria-label="' + esc(opts.title) + '"'
      : 'aria-hidden="true"';
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" class="icon ' + (opts.className || "") + '"' +
      ' width="' + size + '" height="' + size + '" viewBox="0 0 24 24" overflow="visible"' +
      (ic.fill ? ' fill="currentColor"' : "") + ' focusable="false" ' + a11y + ">" +
      (opts.title ? "<title>" + esc(opts.title) + "</title>" : "") + body + "</svg>"
    );
  };

  /** Zamienia elementy <span data-icon="slug" data-size="20"> na inline SVG. */
  SP.hydrateIcons = function (root) {
    (root || document).querySelectorAll("[data-icon]:not([data-icon-ready])").forEach(function (el) {
      el.innerHTML = SP.icon(el.getAttribute("data-icon"), {
        size: el.getAttribute("data-size") || 20,
        title: el.getAttribute("data-title") || undefined,
      });
      el.setAttribute("data-icon-ready", "");
    });
  };
})();
`;
writeFileSync(join(root, "js", "icons.js"), js);
console.log(`js/icons.js: ${Object.keys(out).length} ikon`);
for (const [k, v] of Object.entries(out)) console.log(`  ${k}  prefix=${v.prefix || "-"}  fill=${v.fill}`);
