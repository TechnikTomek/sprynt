# Ikony Sprynt

Wszystkie ikony pochodzą z serwera MCP **thesvg** (`@thesvg/mcp-server`, thesvg.org), `kind: "ui"`, wygląd **`glass`**.

Jak to działa:
- Jedna ikona to jeden plik `icons/<slug>.svg`, pobrany spod adresu z `get_icon_url`.
- `node scripts/build-icons.mjs` buduje z nich `js/icons.js`.
- Użycie w HTML: `<span data-icon="slug" data-size="16">`. W JS: `SP.icon(slug, { size })` albo skrót `SP.ico(slug, size)`.
- Kolor ustawiasz przez CSS `color`, bo ikony używają `currentColor`.
- ID w SVG są unikalne dla każdej instancji.

Własnych ikon nie rysujemy i nie używamy bibliotek ikon.

**Wyjątki stylu:** kropki statusu, kółka awatarów i kwadraciki przestrzeni to kształty CSS (kolorowe znaczniki), nie ikony.

## Lista

| Ikona (slug) | Gdzie używamy | Kategoria MCP |
|---|---|---|
| `house` | Pasek boczny → Strona główna, paleta | Places |
| `inbox` | Pasek boczny → Skrzynka, puste stany Skrzynki | Communication |
| `list-checks` | Moje zadania, checklista w zadaniu, liczniki checklisty | Layout |
| `file-text` | Dokumenty, „ma opis” w wierszu, zmiana nazwy w menu | Files |
| `folder` | Foldery w drzewie, okruszkach, menu | Files |
| `list` | Listy, zakładka „Lista”, wybór listy | Layout |
| `kanban` | Zakładka „Tablica” | Layout |
| `calendar` | Zakładka „Kalendarz”, termin (pole i wybieraki) | Time |
| `chevron-right` / `chevron-down` / `chevron-left` | Zwijanie drzewa i grup, nawigacja kalendarza, rozwijane przyciski | Arrows |
| `plus` | Tworzenie (Nowe, Zadanie, dodawanie wierszy/list) | Interface |
| `ellipsis` | Menu „Więcej” przestrzeni/folderu/listy | Interface |
| `search` | Wyszukiwarka, paleta, filtr zadań | Tools |
| `users` | Zaproś, pole „Przypisani” | People |
| `user` | Puste przypisanie, filtr „Przypisane do mnie” | People |
| `eye` / `eye-off` | Ukryj/pokaż ukończone | Security |
| `flag` | Priorytet | Status |
| `tag` | Tagi w zadaniu | Commerce |
| `message-square` | Licznik komentarzy | Communication |
| `git-branch` | Podzadania (brak dedykowanej ikony „subtask” w thesvg) | **Dev** |
| `check` | Oznacz jako ukończone, zaznaczenia w menu, czyszczenie Skrzynki | Status |
| `x` | Zamykanie okien, usuwanie elementów | Status |
| `trash` | Usuwanie zadania/dokumentu | Interface |
| `copy` | Kopiuj ID zadania | Files |
| `star` | Ulubione | Nature |
| `bell` | Górny pasek → Skrzynka | Status |
| `send-horizontal` | Wyślij komentarz | Communication |
| `menu` | Otwieranie paska bocznego na telefonie | Layout |
| `layout-dashboard` | Grupowanie, „Przestrzeń” w menu Nowe | Layout |
| `log-out` | Menu konta → Wyloguj się | Arrows |
| `mail` | Pole e-mail na stronie logowania | Communication |
| `lock` | Pole hasła, informacja o lokalnych kontach, karta funkcji | Security |
| `user` (też) | Pole „Imię” w rejestracji | People |
| `sun` / `moon` / `monitor` | Przełącznik motywu, menu konta (Jasny / Ciemny / Systemowy) | Nature / Nature / Devices |
| `cloud` | Pasek boczny → Chmura, licznik miejsca, widok Chmura, paleta | Dev |
| `upload` / `download` | Wgrywanie i pobieranie plików, „Dodaj plik” w zadaniu | Files |
| `file-dropzone` | Pole upuszczania plików (Chmura, załączniki) | Files |
| `paperclip` | Sekcja „Załączniki” w zadaniu, licznik załączników w wierszu | Files |
| `file` / `file-image` / `file-code` / `film` / `archive-zip` | Kafelki typów plików (inne/arkusze, obrazy, kod, wideo, archiwa) | Files / Files / Files / Media / Files |
| `play` / `pause` | Stoper: w wierszu, w zadaniu, w górnym pasku | Media |
| `clock` | Czas w zadaniu, licznik czasu w wierszu, oś czasu w cenniku | Time |
| `calendar-clock` | Pole „Start” w zadaniu | Time |
| `repeat` | Powtarzanie zadania | Arrows |
| `spreadsheet` | Zakładka „Tabela” | Files |
| `timeline` | Zakładka „Oś czasu” | Time |
| `arrow-down-up` | Sortowanie listy | Arrows |
| `files` | Duplikowanie zadania (okno zadania, pasek akcji zbiorczych) | Files |
| `user-cog` | Ustawienia (pasek boczny, menu konta, paleta) | People |
| `keyboard` | Okno skrótów klawiszowych | Devices |
| `arrow-right` | Przyciski CTA na stronie startowej i logowania, link „Strona Sprynt” | Arrows |

Pobrane, ale na razie nieużywane: `circle-plus`, `funnel`, `settings`, `zap`, `sparkles`, `log-in`, `square`, `square-check`.
| `chart-column` | Pulpit (pasek boczny, okruszki, paleta) | Data |
| `chart-line` | Cel cząstkowy typu „liczba” | Data |
| `target` | Cele | Shapes |
| `presentation` | Tablice online | General |
| `mouse-pointer` / `hand` / `sticky-note` / `type` / `circle` / `pen-line` | Narzędzia tablicy: zaznacz, przesuń, karteczka, tekst, elipsa, rysik (`square` = prostokąt) | Interface / People / Files / Shapes / Tools |
| `minus` / `fullscreen` | Zoom tablicy (oddal, pokaż wszystko), mniejszy tekst | Interface |
| `undo` / `bring-to-front` | Cofnij, na wierzch (tablica) | Arrows / Layout |
| `arrow-up-right` | „Otwórz zadanie” z karty na tablicy | Arrows |
| `pencil` | „Edytuj” / „Zmień nazwę” (cele, tablice) | Tools |
| `hash` / `coins` / `link` | Typy pól: liczba, kwota, link; `hash` też jako kanał czatu | Interface / Commerce |
| `at-sign` | Wzmianka w czacie | Communication |
| `alarm-clock` | Przypomnienia | Time |
| `gauge` | Sprinty (pasek boczny, okruszki, pole „Sprint” w zadaniu) | Data |
| `countdown` | Arkusz czasu | Time |

## Logotypy marek (`img/logos/`, `js/brands.js`)

Logotypy pochodzą z tego samego serwera MCP **thesvg**, ale `kind: "brand"` (wariant `default`, Apple: `light` i `dark`), pobrane spod adresów z `get_icon_url` (`cdn.jsdelivr.net/gh/glincker/thesvg@v0.6.0`). To nie są ikony interfejsu – zachowują kolory marek, więc wstawiamy je jako `<img>` (`SP.logo(slug, size)`), a nie przez `js/icons.js`. Przed dodaniem pliku sprawdź, że nie ma `<script>`, `on…=`, `href=` ani `foreignObject`.

| Plik | Gdzie używamy |
|---|---|
| `claude.svg` | Ustawienia → AI, strona startowa (Sprinty, Integracje) |
| `microsoft-word.svg`, `microsoft-excel.svg`, `pdf.svg`, `libreoffice.svg` | Zadania z pliku, kafelki plików w Chmurze (`SP.logoSlugFor`), strona startowa |
| `google-calendar.svg`, `microsoft-outlook.svg`, `apple-light.svg` / `apple-dark.svg` | Okno „Dodaj terminy do kalendarza” (`SP.icsHelp`), menu eksportu, strona startowa |
| `gmail.svg`, `microsoft-outlook.svg`, `whatsapp.svg`, `telegram.svg`, `microsoft-teams.svg` | Zaproszenia, menu „Wyślij przez…” (`SP.shareText`, Teams przez `teams.microsoft.com/share`), strona startowa |
| `google-docs.svg`, `google-sheets.svg`, `notion-light/dark.svg`, `obsidian.svg`, `markdown-light/dark.svg` | „Zadania z pliku” (z podpowiedzią, jak wyeksportować), pliki `.md` w Chmurze, notatki wydania, strona startowa |
| `slack.svg`, `github-light/dark.svg` | „Kopiuj tekst” w menu wysyłania, notatki wydania (Markdown), strona startowa, stopka (link do repozytorium) |
| `trello.svg`, `jira.svg`, `asana.svg`, `linear.svg`, `todoist.svg` (+ `github`) | Import z innych narzędzi (`SP.importTasks`, menu Nowe, Ustawienia, paleta), strona startowa (grupa „Przeprowadzka”) |
| `anthropic-light/dark.svg` | Ustawienia → AI (link do konsoli), strona startowa |
| `chrome.svg`, `edge.svg`, `safari.svg`, `firefox.svg`, `windows.svg`, `android.svg`, `linux.svg` (+ `apple`) | Okno „Zainstaluj Sprynt jako aplikację” (`SP.installHelp`), pasek „Działa wszędzie” na stronie startowej |

Marki z wersją na jasne i ciemne tło (`THEMED` w `js/brands.js`): `apple`, `github`, `anthropic`, `markdown`, `notion` – pliki `<slug>-light.svg` (ciemny znak) i `<slug>-dark.svg` (jasny znak). Notion: `-light` to wariant `mono`, `-dark` to `default` (biała kostka).

Nazwy i logotypy należą do właścicieli – używamy ich tylko do wskazania zgodności (napis pod sekcją Integracje). Nie dodajemy logo ClickUp.
