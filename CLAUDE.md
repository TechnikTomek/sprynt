# Sprynt

Aplikacja do zarządzania pracą w stylu ClickUp. Ma własną nazwę i logo, a układ i funkcje są wzorowane na ClickUpie.
Nie używamy nazwy, logo ani grafik ClickUp.

## Zasady

- Komunikacja po polsku.
- **Stack:** czysty HTML + CSS + JS, bez frameworków i bundlera. `index.html` (strona startowa) i `app.html` (aplikacja) działają po otwarciu z dysku.
  - Skrypty klasyczne (`<script src>`) we wspólnej przestrzeni `window.SP`.
- **Ikony:** wyłącznie z serwera MCP thesvg (`kind: "ui"`, wygląd `glass`). Nie rysujemy własnych i nie dodajemy bibliotek ikon. Dodawanie nowej ikony jest opisane w `icons/README.md`.
- **Daty terminów:** zawsze jako `"RRRR-MM-DD"` w czasie lokalnym (`SP.date.ymd`). Nigdy przez `toISOString().slice(0,10)`, bo to UTC i przesuwa dzień.

## Konta (bez danych demo)

- Logowanie i rejestracja żyją w `app.html` (szablon `#authTpl` + `css/auth.css` + `js/login.js`): bez sesji `app.html` ładuje tylko ekran logowania (`#login` / `#register`), po zalogowaniu przeładowuje się (`#/home` albo poprzedni `#/…`). **Nie przekierowywać między plikami przy logowaniu** – Firefox potrafi trzymać osobny localStorage dla każdego pliku `file://`, co dawało pętlę login.html ⇄ app.html. `login.html` to tylko przekierowanie dla starych linków.
- `js/auth.js` → `SPAuth.register/login/logout/current`. Konta w `sprynt:accounts` (sól + PBKDF2-SHA256, 150k iteracji, bez jawnego hasła), sesja w `sprynt:session` (localStorage przy „Zapamiętaj mnie”, inaczej sessionStorage). Blokada 30 s po 5 nieudanych próbach.
- To konta **lokalne** – działają tylko w tej przeglądarce. Prawdziwe bezpieczeństwo i synchronizacja wymagają backendu.
- `app.html` bez sesji przekierowuje do logowania; `data.js` nie tworzy `SP.db` bez użytkownika (`SP.user` = zalogowany).
- Dane są osobne dla każdego konta: `sprynt:db:<userId>`. Nowe konto dostaje pusty projekt: jedna przestrzeń (nazwa z formularza, domyślnie „Mój projekt”) z pustą listą „Zadania”. Ekran „Strona główna” pokazuje wtedy „pierwsze kroki”.
- Zaproszenie (`SP.db.invite(email)`) dodaje osobę do zespołu lokalnie – e-maili jeszcze nie wysyłamy.

## Funkcje zadań (dodane 2026-11-19)

- **Widoki miejsca:** `list`, `board`, `table` (sortowanie kliknięciem w nagłówek: `f.tsort`), `calendar`, `timeline` (Gantt, 42 dni od `f.tl`). Na osi czasu pasek przeciągasz (zmiana start/termin) albo łapiesz za prawą krawędź (zmiana terminu).
- **Lista:** sortowanie (`f.sort`: manual/due/priority/title/created/updated) i zaznaczanie wielu zadań (`SP.selection`). Pasek akcji zbiorczych `#bulkBar` obsługuje status, osoby, termin, priorytet, przeniesienie, duplikowanie i usuwanie. `Esc` odznacza.
- **Zadanie:** `start` (data), `recur` (`daily`/`weekly`/`monthly`; ukończenie tworzy raz kolejne wystąpienie, zapamiętane w `recurNext`), `time[]` (wpisy `{start, end|null, manual}`).
  - Stoper: `db.startTimer/stopTimer` (jeden naraz) i `db.addTime(ms)`, a `db.parseDuration("1h 30m")` zamienia tekst na czas. Pastylka stopera w górnym pasku (`#timerPill`) i liczniki `[data-live-total]` odświeżają się co sekundę (`js/extras.js`).
  - Duplikowanie: `db.duplicateTask(id)` (z podzadaniami).
- **Ustawienia** (`#/settings`, `js/extras.js`): profil (`SPAuth.updateProfile`), hasło (`SPAuth.changePassword`), motyw, kopia JSON (`db.exportData/importData`, bez zawartości plików), usunięcie konta (`SPAuth.deleteAccount` + `SP.wipeFiles` + `db.wipe`).
- **Skróty:** `?` (pomoc, `SP.showShortcuts`), `G` + H/I/M/C/S/D (przejście do widoku), `T`/`N` (nowe zadanie), `/` i Cmd/Ctrl+K (szukaj).

## Pulpit, Cele, Automatyzacje, Tablice online (dodane 2026-11-19, druga partia)

- **Logo:** `img/logo.svg` (własny znak: pochylone „S” z liniami prędkości na gradiencie marki). Używane jako `<img class="logo-mark|ws-logo|wl-logo">` i favikona. To znak marki, nie ikona UI – ikony nadal tylko z thesvg.
- **Pulpit** `#/dashboard` (`js/insights.js`): KPI (otwarte, ukończone w 7 dni z porównaniem, po terminie, czas pracy), wykres kolumnowy ukończeń (14 dni, z `t.doneAt`), czas pracy (7 dni), poziome słupki statusów/obciążenia/priorytetów (nazwa i liczba przy każdym słupku – kolor tylko pomocniczo), najbliższe terminy. Zakres: wszystkie przestrzenie albo jedna. Wykresy to ręczne SVG/HTML (`colChart`, `hBars`), podpowiedź po najechaniu.
- **`t.doneAt`** ustawiane przy przejściu do statusu zamkniętego (`afterChange` w `data.js`), czyszczone przy ponownym otwarciu.
- **Cele** `#/goals`: `db.raw.goals[]` = `{name, color, due, targets[]}`. Cel cząstkowy: `tasks` (ukończone/wszystkie w `locType`+`locId`), `number` (`start/target/current/unit`), `check` (`done`). `db.targetProgress(tg)`, `db.goalProgress(g)`.
- **Automatyzacje** `#/automations`: `db.raw.automations[]` = `{name, on, spaceId|null, trigger:{type,value}, action:{type,value}, runs, lastRun}`. Wyzwalacze: `created`, `status`, `priority`, `assigned`. Akcje: `status`, `priority`, `assign`, `tag`, `due` (za N dni), `move`, `comment`. Silnik `runAutomations` w `data.js` (wołany z `createTask`, `updateTask`, `bulkUpdate`), łańcuch maks. 3 poziomy, wpis „⚡ automatyzacja …” w aktywności. 4 szablony w widoku.
- **Tablice online** `#/whiteboards` (lista z miniaturami) i `#/wb/<id>` (`js/whiteboard.js`). `db.raw.whiteboards[]` = `{spaceId, title, items[], view:{x,y,z}}`. Elementy: `note`, `text`, `rect`, `ellipse`, `path` (punkty względem `x,y`), `task` (karta połączona z zadaniem). Narzędzia V/H/N/T/R/O/P, spacja = przesuwanie, Ctrl/⌘+kółko = zoom, Ctrl/⌘+Z cofnij, Ctrl/⌘+D duplikuj, Delete. Karteczkę można „Zamienić w zadanie” (pierwsza linia = tytuł). Zapis przez `db.saveWhiteboard` **bez** `changed()` (tablica rysuje się sama; przerysowanie widoku zgubiłoby stan). Skróty tablicy są łapane w fazie capture, przed globalnymi T/N.
  - Edycja tekstu: zapis na bieżąco (`input`) + `finishEdit()` – **nie polegaj na `blur`**, Firefox nie zawsze go wysyła po `element.blur()`.
- **Skróty G:** P pulpit, O cele, A automatyzacje, W tablice.

## Pola, zależności, przypomnienia, szablony, kosz, czat, CSV (dodane 2026-11-19, trzecia partia, `js/more.js`)

- **Pola niestandardowe** na listę: `db.raw.fields[]` = `{id, listId, name, type, options[]}`, typy `db.FIELD_TYPES` (text, number, money, select, checkbox, date, url). Wartości w `t.cf[fieldId]` (`db.setFieldValue`). Zarządzanie: menu listy → „Pola niestandardowe…” (`SP.manageFields`). W zadaniu sekcja „Pola”, w widoku Tabela listy dodatkowe kolumny (sortowalne, `data-q="cf:<id>"` → `SP.editField`).
- **Zależności:** `t.deps[]` = zadania, na które to czeka. `db.addDep` (blokuje pętle), `db.removeDep`, `db.waitingOn`, `db.blocking`, `db.isBlocked`. W zadaniu sekcja „Zależności”, w wierszu chip „Zablokowane”.
- **Przypomnienia:** `t.remind` (ISO), `t.reminded`. `db.setReminder`, `db.fireReminders()` (co 10 s, `js/more.js`) → powiadomienie w Skrzynce + toast + `Notification` (jeśli zgoda).
- **Szablony zadań:** `db.raw.templates[]`, `db.saveTemplate(taskId, name)`, `db.fromTemplate(tplId, listId, extra)` (checklista, podzadania, tagi, pola). Zapis z menu ⋯ w zadaniu, użycie w szybkim tworzeniu („Z szablonu”) i na `#/templates`.
- **Kosz** `#/trash`: `db.raw.trash[]` = `{kind, label, at, payload}`; usuwanie zadań, list, folderów, przestrzeni, dokumentów i tablic odkłada kopię. `db.restore(id)` przywraca (sieroty trafiają do pierwszej listy/przestrzeni), `db.purge`, `db.emptyTrash`. Wpisy starsze niż 30 dni znikają przy wczytaniu.
- **Czat** `#/chat/<spaceId>`: kanał na przestrzeń, `db.raw.chat[]`. Wzmianki `@Imię` (podpowiedzi), `SP-12` → link do zadania, reakcje, edycja/usuwanie, „Utwórz zadanie z wiadomości”. `SP.richText` formatuje też komentarze w zadaniach.
- **Eksport CSV:** menu przestrzeni/folderu/listy → „Eksportuj zadania (CSV)” (`SP.exportCSV`): UTF-8 z BOM, separator `;` (Excel PL), razem z polami niestandardowymi.
- **Skróty G:** K czat, B kosz.

## Chmura (pliki)

- `js/files.js`: zawartość plików w IndexedDB (baza `sprynt-files`, magazyn `blobs`, klucz `<userId>:<fileId>`). Metadane (`name, size, type, uploadedAt, taskId`) w `SP.db.raw.files`.
- API: `SP.uploadFiles(files, {taskId})`, `SP.pickFiles(opts)`, `SP.previewFile(id)` (obraz/wideo w oknie, reszta się pobiera), `SP.downloadFile(id)`, `SP.deleteFile(id)`.
- Limity: `db.QUOTA` = 100 MB (plan Free), `db.MAX_FILE` = 25 MB na plik.
- Widok `#/cloud`: zajęte miejsce z podziałem na typy, upuszczanie plików, filtry, lista. W pasku bocznym jest licznik miejsca. W zadaniu jest sekcja „Załączniki” (także upuszczenie pliku na okno zadania).
- Usunięcie zadania nie kasuje plików, tylko zdejmuje powiązanie.
- Na razie pliki są tylko na tym urządzeniu. Prawdziwa chmura wymaga serwera.

## Wydajność

- Nie animuj dużych elementów z `filter: blur()` (Firefox szarpie i miga). Miękkie tła rób z `radial-gradient` i animuj tylko `transform`.

## Strony

- `index.html` – strona startowa (reklamowa) Sprynt: `css/landing.css`, `js/landing.js`. Animacje: słowa nagłówka (keyframes), scena z makietą aplikacji w hero (kursor przełącza Lista/Tablica/Kalendarz, karta przelatuje między kolumnami), odsłanianie sekcji (IntersectionObserver), widoki zmieniające się z przewijaniem, licznik cen, FAQ. Respektuje `prefers-reduced-motion`.
- `app.html` – aplikacja (wymaga zalogowania).
- `login.html` – przekierowanie do `app.html#login` (stare linki).
- Motyw: `js/theme.js` (ładowany w `<head>` obu stron) – `SPTheme.set("light"|"dark"|"system")`, klucz `sprynt:theme`, atrybut `data-theme` na `<html>`. Kolory wyłącznie przez zmienne CSS (`:root` i `:root[data-theme="dark"]`).

## Pliki

- `js/data.js`: stan (`SP.db`) zalogowanego użytkownika, zapis do localStorage (`sprynt:db:<userId>`). Poza `auth.js` i `theme.js` tylko ten plik dotyka localStorage.
  - Zmiany zawsze przez metody `SP.db.*`. One wywołują `changed()`, a powłoka przerysowuje widok.
- `js/ui.js`: formatowanie, awatary, statusy, popovery i wybieraki (status, priorytet, osoby, termin, tagi, lista), okna `SP.form`/`SP.confirm`, toast.
- `js/task.js`: okno szczegółów zadania (`SP.openTask(id)`).
- `js/views.js`: widoki: `home`, `inbox`, `my-tasks`, `cloud`, `docs`, `doc`, `space`/`folder`/`list` (warianty Lista, Tablica, Tabela, Kalendarz, Oś czasu).
- `js/insights.js`: `dashboard`, `goals`, `automations`. `js/whiteboard.js`: `whiteboards`, `wb`. `js/more.js`: `chat`, `templates`, `trash` + dodatki okna zadania (`SP.taskProps/taskFields/taskDeps/bindTaskExtras/taskMoreMenu`).
- `js/app.js`: powłoka: routing hash, drzewo w pasku bocznym, menu „Nowe”, szybkie tworzenie zadania (`SP.quickTask`), paleta Cmd/Ctrl+K, skróty (T/N nowe zadanie, / szukaj).

## Routing

- **Strony:** `#/home`, `#/inbox`, `#/my-tasks`, `#/docs`, `#/doc/<id>`, `#/cloud`, `#/settings`, `#/dashboard`, `#/goals`, `#/automations`, `#/whiteboards`, `#/wb/<id>`, `#/chat[/<spaceId>]`, `#/templates`, `#/trash`.
- **Miejsca:** `#/space/<id>[/list|board|calendar]`, `#/folder/<id>[/…]`, `#/list/<id>[/…]`.

## Model danych

- **Struktura:** Przestrzeń → (Folder) → Lista → Zadanie → Podzadania (`parentId`).
- **Statusy:** Do zrobienia, W toku, Do przeglądu, Ukończone (zamknięty).
- **Priorytety:** Pilny, Wysoki, Normalny, Niski.
- **Zadanie** ma: `assignees[]`, `due`, `tags[]`, `desc` (HTML), `checklist[]`, `comments[]`, `activity[]`.

## Testowanie

- **Składnia:** `node --check js/*.js`.
- **Domyślna przeglądarka użytkownika to Firefox.** Testuj też w nim, przez WebDriver BiDi: `firefox --headless --remote-debugging-port N --profile <dir>`, potem WebSocket `ws://127.0.0.1:N/session`.
- **Zrzuty ekranu:** headless Chrome `--screenshot` z `--virtual-time-budget`.
- **Test interakcji:** tymczasowa kopia `app.html` (albo `index.html`) z dodatkowym skryptem testowym, potem `--dump-dom`. Kopię usuń po teście.
- **Uwaga:** w trybie headless z `--virtual-time-budget` (i w kartach w tle) nie ma klatek, więc `requestAnimationFrame`, IntersectionObserver i zdarzenia scroll nie odpalają.
  - Dlatego przerysowanie po zmianie danych idzie przez `setTimeout`.
  - Stronę startową sprawdzaj zrzutami przez Chrome DevTools Protocol (Chrome z `--remote-debugging-port`, prawdziwy czas).

## Film promocyjny (`promo/`)

- `promo/promo.html` – animacja 1920×1080, ~46 s. Cały stan liczony z czasu (`render(t)`), bez `?capture` odtwarza się na żywo w pętli.
- `promo/shots/*.png` – zrzuty prawdziwej aplikacji (konto demo, ciemny motyw, 1600×1000 @2x), `promo/rects.js` – pozycje elementów (kursor, przeciągana karta).
- `promo/sprynt-promo.mp4` – gotowy film (H.264, 30 kl./s). Nagrywanie: headless Chrome + CDP (`render(i/30)` → `Page.captureScreenshot` JPEG), składanie przez AVFoundation (`AVAssetWriter`, skrypt Swift) – ffmpeg nie jest zainstalowany.
