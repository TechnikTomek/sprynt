# Sprynt

Aplikacja do zarządzania pracą w stylu ClickUp. Ma własną nazwę i logo, a układ i funkcje są wzorowane na ClickUpie.
Nie używamy nazwy, logo ani grafik ClickUp.

## Zasady

- Komunikacja po polsku.
- **Stack:** czysty HTML + CSS + JS, bez frameworków i bundlera. `index.html` (strona startowa) i `app.html` (aplikacja) działają po otwarciu z dysku.
  - Skrypty klasyczne (`<script src>`) we wspólnej przestrzeni `window.SP`.
- **Ikony:** wyłącznie z serwera MCP thesvg (`kind: "ui"`, wygląd `glass`). Nie rysujemy własnych i nie dodajemy bibliotek ikon. Dodawanie nowej ikony jest opisane w `icons/README.md`.
- **Daty terminów:** zawsze jako `"RRRR-MM-DD"` w czasie lokalnym (`SP.date.ymd`). Nigdy przez `toISOString().slice(0,10)`, bo to UTC i przesuwa dzień.

## Chmura – Supabase (dodane 2026-11-20, `js/config.js`, `js/auth.js`, `js/cloud.js`, `supabase/`)

- **Włączanie:** `js/config.js` → `SPRYNT_CLOUD = {url, anonKey}` (publiczne dane projektu; bezpieczeństwo = RLS). Puste = tryb lokalny. Instrukcja dla właściciela: `supabase/README.md`, schemat: `supabase/schema.sql` (tabela `workspaces` z RLS, funkcje `save_workspace(p_data, p_base)` i `delete_my_account()`, prywatny bucket `files` z folderem `<user_id>/`).
- **Biblioteka:** `@supabase/supabase-js@2.119.0` (UMD z jsDelivr) dopisywana w `<head>` przez `document.write` tylko przy skonfigurowanej chmurze, przed `auth.js`. Klient: `storageKey: "sprynt-cloud-auth"`, własny `storage` (localStorage przy „Zapamiętaj mnie”, inaczej sessionStorage), `flowType: "implicit"` (linki z e-maila działają na dowolnym urządzeniu).
- **SPAuth (ten sam interfejs w obu trybach):** `current()` czyta sesję synchronicznie ze storage; `register` (może zwrócić `{pending, email}` = trzeba potwierdzić e-mail), `login` (`err.code === "email_not_confirmed"`), `logout()` → Promise, `resend`, `resetPassword`, `setNewPassword`, `updateProfile` (zmiana e-maila wymaga potwierdzenia), `verify`, `changePassword`, `deleteAccount(password, beforeDelete)`. Błędy Supabase mapowane po `error.code` na polski. `SPAuth.urlAuth` = `signup` | `recovery` | `error` gdy adres zawiera token z e-maila (recovery zawsze pokazuje ekran „Ustaw nowe hasło”).
- **Synchronizacja (`cloud.js`):** start z lokalnej kopii, `pull()` w tle; `db.save` → `SP.cloudDirty()` → po 1,2 s `save_workspace` z `p_base = rev`. Wynik ujemny = konflikt → `merge(local, server)` (po id, nowsze `updatedAt` wygrywa) → ponowny zapis. Offline: flaga `dirty` w `sprynt:sync:<uid>` (`db.syncMeta`), zapis po `online`. Powrót do karty → `pull`. Pierwsze logowanie: propozycja przeniesienia danych konta lokalnego z tym samym e-mailem (`db.legacyLocalData`). Znacznik `#syncPill` w górnym pasku. `SP.cloudLeaving = true` przed celowym wylogowaniem/usunięciem (pomija przeładowanie po SIGNED_OUT).
- **Pliki:** w trybie chmury `files.js` wysyła do bucketu `files` (`<uid>/<fileId>`), IndexedDB to pamięć podręczna (otwarcie z limitem 4 s); brak w cache → pobranie z chmury.
- **Testy:** `scratchpad/bidi/fake-supabase.js` – symulator Supabase wstrzykiwany przez `script.addPreloadScript` (stan „serwera” w `localStorage['fake-supa']`).

## PWA, skupienie, kalendarz (dodane 2026-11-20)

- **PWA:** `manifest.webmanifest`, `sw.js` (własne pliki: najpierw sieć, offline z cache; CDN: cache + odświeżanie w tle; Supabase/Anthropic zawsze sieć), `js/pwa.js` (rejestracja tylko przez https, `SPInstall.available/prompt/howTo/standalone`), ikony `img/icon-192.png`, `icon-512.png`, `icon-maskable.png`. **Po dodaniu nowego pliku JS dopisz go do `SHELL` w `sw.js` i podnieś `CACHE`.**
- **Tryb skupienia (Pomodoro):** `SP.focus.start(taskId, min=25)` włącza stoper zadania i widget `.focus-w`; koniec → `db.stopTimer`, dźwięk (WebAudio), powiadomienie, przerwa 5 min. W oknie zadania pole „Skupienie”.
- **Kalendarz:** `SP.exportICS(type, id)` – otwarte zadania z terminem jako wydarzenia całodniowe (RFC 5545, CRLF, escapowanie, zawijanie linii, alarm dla pilnych/wysokich). Menu przestrzeni/folderu/listy.

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

## Zadania z pliku (dodane 2026-11-20, `js/extract.js`)

- `SP.extractTasks({file|cloudId|text, listId})` – okno: wgraj plik → animacja (plik się rozkłada, skaner przesuwa się po tekście, trafione linie wylatują jako karty) → przegląd i edycja kart → „Utwórz N zadań” (karty odlatują do listy w pasku bocznym, nowe wiersze migają klasą `xt-new`). Wejścia: pasek boczny „Zadania z pliku”, menu „Nowe”, paleta, przycisk „Z pliku” w widoku listy, ikona przy pliku w Chmurze (`SP.extractFromCloud`).
- **Formaty:** TXT/MD/LOG/HTML, CSV/TSV, DOCX/ODT/XLSX bez bibliotek (własny czytnik ZIP + `DecompressionStream("deflate-raw")`), PDF przez pdf.js 3.11.174, XLS/ODS przez SheetJS 0.18.5 – oba z cdnjs, ładowane dopiero przy takim pliku (worker pdf.js jako Blob).
- **Tekst** (`fromText`): wypunktowania, `[ ]`/`[x]`, TODO/Zadanie:, czasowniki (lista + bezokoliczniki na „ć”), `Imię:`/`@Imię`/„Anna zrobi…”, nagłówki z imieniem lub „Ustalenia/Zadania”, pod-punkty → checklista, terminy (`parseDue`: daty, „do piątku”, „jutro”, „za tydzień”, „do końca miesiąca”, `WD+3`), priorytety (`parsePriority`), `#tagi`. Imiona z odmianą (`forms`: Marek → Marka/Markowi/Markiem). Nieznane imiona → „Dodaj do zespołu” (`db.addPerson`).
- **Arkusze** (`fromSheet`, tryb na arkusz, do zmiany w podglądzie): `tasks` (kolumny Zadanie/Osoba/Termin/Priorytet/Status), `invoices` (niezapłacone faktury; po terminie = pilne), `variance` (plan vs wykonanie powyżej progu %, domyślnie 10), `rows`. Wiersze „Suma/Razem” pomijane. Kwoty/kontrahenci → pola listy „Kwota” (money) i „Kontrahent” (text). `WD±n` = n-ty dzień roboczy po/przed końcem miesiąca (bez weekendów i stałych świąt PL).
- Przykłady: notatki ze spotkania (imiona z zespołu) i skoroszyt kontrolera (`SP.sampleWorkbook()` – prawdziwy XLSX zapisany w przeglądarce, do pobrania). Testy parsera: `SP._extract`.

## AI – Claude (`js/ai.js`, dodane 2026-11-20)

- „Zadania z pliku” z włączonym AI: model Claude (domyślnie `claude-opus-5-5`, do wyboru Sonnet 5.5 / Haiku 5.5, effort domyślnie `high`) czyta dokument i zwraca JSON wg schematu (`output_config.format` – `json_schema`): `summary`, `warnings` (problemy w dokumencie), `new_people`, `tasks[]` (tytuł, opis, osoba, termin, priorytet, checklista, kwota, kontrahent, `source_line`/`source_sheet`/`source_quote`, `reason`). Streaming (`messages.stream(...).finalMessage()`) – na żywo pokazujemy znalezione tytuły. Dla Opus/Sonnet `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`. Obsługa `refusal` i `max_tokens`, błędy przez typowane klasy SDK.
- SDK: oficjalne `@anthropic-ai/sdk@1.5.0` jako ESM z jsDelivr (`import()` przy pierwszym użyciu), `dangerouslyAllowBrowser: true` – klucz podaje użytkownik (BYO key). SDK 1.x wysyła klucz jako `Authorization: Bearer` i `anthropic-version: 2026-10-21` – to zamierzone.
- Klucz i ustawienia: `db.aiSettings()/saveAiSettings()` → osobny klucz localStorage `sprynt:ai:<userId>` (poza `exportData`, usuwany przy `db.wipe`). Ustawienia → sekcja „AI (Claude)” (`#ai-sec`), test klucza przez Models API (bez kosztu).
- PDF trafia do modelu jako blok `document` (skany też), zdjęcia (PNG/JPG/WebP/GIF) jako `image` – tylko z AI. Tekst/arkusze jako numerowane linie `[N]`. Treść dokumentu to dane – prompt systemowy zakazuje wykonywania poleceń z dokumentu.
- Bez klucza działa tryb podstawowy (reguły z `fromText/fromSheet`); w stopce okna można przełączać „Bez AI” / „Przeanalizuj z AI”.

## Zaproszenia (`js/invite.js`, dodane 2026-11-20)

- `SP.inviteDialog({email, name})`: e-maile/imię + wybór przestrzeni + wiadomość → link `app.html#join=<kod>` (JSON → gzip `CompressionStream` → base64url; z `file://` link prowadzi na publiczny adres GitHub Pages). Kanały: `mailto:`, WhatsApp (`wa.me`), Telegram (`t.me/share`), `sms:`, `navigator.share`, plik HTML z linkiem, kopiowanie. `db.markInvited` zapisuje kanał i datę.
- Kod zawiera `db.shareSnapshot(spaceIds)` (przestrzenie, foldery, listy, zadania bez historii/czasu/plików, pola, dokumenty, osoby). Kto ma link, widzi te dane.
- Dołączanie: `#join=` w `<head>` app.html → `sessionStorage["sprynt:join"]` (przetrwa rejestrację), zmiana hash na `#join=` przeładowuje stronę. Bez sesji: ekran rejestracji z banerem i wpisanym e-mailem (`login.js`). Po zalogowaniu: potwierdzenie → `db.importShared(inv)` (nowe ID, adresat zaproszenia = „me”, ponowne zaproszenie od tej samej osoby/przestrzeni = aktualizacja, `space.shared`).
- Brak serwera = brak synchronizacji na żywo; mówimy o tym w oknie zaproszenia. Strona `#/team`: członkowie, status zaproszeń, przestrzenie udostępnione mi.

## Animacje (`js/anim.js` + sekcja „Animacje” w `css/app.css`)

- Wejście widoku: `render(true)` przy zmianie trasy dodaje `.view-host.enter` (tylko wtedy – zwykłe przerysowanie po zmianie danych nie animuje). Elementy list/kart/KPI wchodzą kolejno (`--i` z `:nth-child`), słupki wykresów rosną, paski i pierścienie celów się wypełniają, liczby KPI się odliczają.
- Ukończenie zadania: `db.updateTask`/`db.bulkUpdate` są owinięte – przejście do statusu zamkniętego → `SP.celebrate(x, y)` (konfetti z miejsca ostatniego kliknięcia) i `.just-done` na wierszu. Nowe zadanie (`db.createTask`) → `.xt-new` po przerysowaniu.
- Strona startowa: sekcja `#z-pliku` – zapętlona scena CSS (dokument → skaner → karty zadań), pauza poza ekranem (`.xdemo:not(.in)`).
- Wszystko wyłączone przy `prefers-reduced-motion` (CSS + wczesny `return` w `anim.js`).

## Magia, kreator, podsumowanie, D3vek (dodane 2026-11-21)

- **`js/magic.js`** – `SP.parseQuick(text)` (wspólny parser z `extract.js` przez `SP._extract`): „Wysłać ofertę jutro @Anna !pilne #klient” → tytuł, termin, osoby (`@Imię`, także odmiana; nieznane → nowa osoba), priorytet (`!pilne`/`!2`/`!!!`/słowa), tagi. `SP.smartInput(input, {chips, target, onChange})` podświetla fragmenty w polu (nakładka `.smart-hl` pod przezroczystym inputem) i wysyła „duszka” frazy do chipa (`SP.fly`). Włączane przy pierwszym fokusie pól `.add-row`, `.col-add`, podzadań i w `SP.quickTask`; zapis przez `SP.smartFields(input, base)`. **Uwaga:** przeniesienie pola w DOM zdejmuje fokus – `smartInput` go przywraca (flaga `_smartInit` chroni przed rekurencją focusin).
  - Wklejenie ≥2 linii w te pola → `SP.pasteTasks(text, base)`: skaner po liniach, karty wylatują, wcięte punkty = checklista, `[x]` = ukończone, nagłówki z „:” pomijane.
  - `SP.splitTask(id)` – rozbijanie na podzadania: lista kontrolna → punkty opisu → tytuł („X i Y”), albo AI (`SP.ai.breakdown`). Przycisk „Rozbij zadanie” w sekcji Podzadania i w menu ⋯.
- **FLIP** (`anim.js`): `SP.rerender` woła `SP.flipSnap()`/`SP.flipPlay()` – zadania przelatują na nowe miejsce; `SP.flipDrop = {id,x,y,t}` po upuszczeniu na tablicy/kalendarzu = „lądowanie”.
- **`js/recap.js`** – `SP.weekRecap()`: 5 plansz (ukończone, najlepszy dzień, czas, podium zespołu, następny tydzień), auto-przewijanie 6 s, spacja = pauza, kopiowanie podsumowania. Wejścia: Strona główna, Pulpit, paleta.
- **`js/onboard.js`** – kreator po założeniu konta (puste konto bez `db.raw.profile`, nie przy `#join`): rola (IT, kontroler finansowy, marketing, sprzedaż, PM, HR, projektant, szkoła, osobiste), zespół, nazwa przestrzeni/folderu/list, przykładowe zadania i pola, zaproszenie (`SP.inviteDialog`). Przerabia pusty projekt z rejestracji. `db.raw.profile = {role, team}`. Ponownie: Ustawienia → „Kreator konfiguracji” (`SP.onboarding()`).
- **`js/d3vek.js`** – D3vek (niebieski przyjaciel z aplikacji D3vek na Mac/Windows, #00A0FF, proporcje 200×132): oczy za kursorem, mruganie, sen po 2 min, dwuklik = salto, przeciąganie (`db.raw.ui.d3`, zapis `db.saveUi()`), wyłączenie `db.raw.ui.d3off` (Ustawienia). Rozmowa: polecenia po polsku na regułach, z kluczem AI wolne pytania (`SP.ai.chat`). Plik upuszczony na D3vka → scena: skok na dokument, nurkowanie, kopanie po liniach, karty zadań wylatują, powrót → `SP.extractTasks({file})` z `SP.extractSkipScan` (bez drugiego skanowania).
- **Ikony dodane:** `split`, `trophy`, `wand-sparkles`, `rocket` (thesvg, glass).
- **Testy:** `app.html` ma podłączone Supabase – testy rób na kopii z `window.SPRYNT_CLOUD = null` po `config.js` (inaczej rejestracja trafi do prawdziwej chmury). Kopię usuń po teście.

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

- `js/data.js`: stan (`SP.db`) zalogowanego użytkownika, zapis do localStorage (`sprynt:db:<userId>`, w chmurze to lokalna kopia). Poza `auth.js`, `theme.js` i `data.js` localStorage dotykają tylko klient Supabase (sesja) i `cloud.js` przez `db.syncMeta`. `sessionStorage` używa też zaproszenie (`sprynt:join`).
  - Zmiany zawsze przez metody `SP.db.*`. One wywołują `changed()`, a powłoka przerysowuje widok.
- `js/ui.js`: formatowanie, awatary, statusy, popovery i wybieraki (status, priorytet, osoby, termin, tagi, lista), okna `SP.form`/`SP.confirm`, toast.
- `js/task.js`: okno szczegółów zadania (`SP.openTask(id)`).
- `js/views.js`: widoki: `home`, `inbox`, `my-tasks`, `cloud`, `docs`, `doc`, `space`/`folder`/`list` (warianty Lista, Tablica, Tabela, Kalendarz, Oś czasu).
- `js/insights.js`: `dashboard`, `goals`, `automations`. `js/whiteboard.js`: `whiteboards`, `wb`. `js/more.js`: `chat`, `templates`, `trash` + dodatki okna zadania (`SP.taskProps/taskFields/taskDeps/bindTaskExtras/taskMoreMenu`). `js/extract.js`: zadania z pliku.
- `js/app.js`: powłoka: routing hash, drzewo w pasku bocznym, menu „Nowe”, szybkie tworzenie zadania (`SP.quickTask`), paleta Cmd/Ctrl+K, skróty (T/N nowe zadanie, / szukaj).

## Routing

- **Strony:** `#/home`, `#/inbox`, `#/my-tasks`, `#/docs`, `#/doc/<id>`, `#/cloud`, `#/settings`, `#/dashboard`, `#/goals`, `#/automations`, `#/whiteboards`, `#/wb/<id>`, `#/chat[/<spaceId>]`, `#/templates`, `#/trash`, `#/team`.
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
