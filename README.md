# Sprynt

Aplikacja do zarządzania pracą zespołu: zadania, listy, tablice Kanban, tabela, kalendarz, oś czasu, pulpit z wykresami, tablice online (whiteboard), cele, automatyzacje, czat, pola niestandardowe, szablony, przypomnienia, śledzenie czasu, dokumenty i chmura na pliki.

**AI (Claude):** po dodaniu własnego klucza API Anthropic w Ustawieniach zadania z dokumentów wyciąga model Claude – naprawdę czyta treść (także PDF-y, skany i zdjęcia notatek), sprawdza dokument i wskazuje problemy. Klucz zostaje w Twojej przeglądarce.

**Szybkie dodawanie:** wpisz „Wysłać ofertę jutro @Anna !pilne #klient” – Sprynt sam rozpozna termin, osobę, priorytet i tagi. Wklej kilka linii, a każda stanie się zadaniem; duże zadanie rozbijesz na podzadania jednym kliknięciem.

**D3vek:** mały niebieski pomocnik w rogu – porozmawiaj z nim, zaplanuje Ci dzień, a upuszczony na niego plik przekopie w poszukiwaniu zadań.

**Na start:** kreator pyta, kim jesteś (IT, kontroler finansowy, marketing…) i od razu tworzy przestrzeń, folder, listy i zaproszenia. Co tydzień – animowane podsumowanie tygodnia.

**Zaproszenia:** zaproś znajomych e-mailem, WhatsAppem, Telegramem, SMS-em albo linkiem – link otwiera Sprynt z udostępnionymi zadaniami.

**Zadania z pliku:** wgraj notatki, protokół, PDF albo arkusz Excel, a Sprynt wyciągnie z niego zadania dla zespołu – z osobami, terminami i priorytetami. Dla kontrolerów finansowych: checklisty zamknięcia miesiąca (terminy WD+n), niezapłacone faktury i odchylenia budżetu od wykonania.

**Strona:** https://techniktomek.github.io/sprynt/ · **Aplikacja:** https://techniktomek.github.io/sprynt/app.html · **Film:** [promo/sprynt-promo.mp4](promo/sprynt-promo.mp4)

## Chmura (Supabase)

Po uzupełnieniu `js/config.js` (instrukcja: [`supabase/README.md`](supabase/README.md)) Sprynt ma prawdziwe konta z potwierdzeniem e-maila i resetem hasła, a dane i pliki są w bazie Supabase, chronione regułami RLS – logowanie działa na każdym urządzeniu, także offline (synchronizacja po powrocie internetu). Bez konfiguracji działa tryb lokalny.

Sprynt można też zainstalować jako aplikację (PWA) na komputerze i telefonie.

## Jak to działa

- Czysty HTML, CSS i JavaScript – bez frameworków i bez budowania. Wystarczy otworzyć `index.html` (strona startowa) albo `app.html` (aplikacja).
- Konta i dane są zapisywane **lokalnie w przeglądarce** (localStorage + IndexedDB na pliki). Hasła są przechowywane jako skrót PBKDF2-SHA256, nigdy jawnie. Nie ma serwera – dane nie opuszczają Twojego komputera i nie synchronizują się między urządzeniami.
- Ikony pochodzą z [thesvg.org](https://thesvg.org) (zestaw UI, wygląd „glass”).

## Struktura

- `index.html`, `css/landing.css`, `js/landing.js` – strona startowa
- `app.html` – aplikacja (logowanie + wszystkie widoki), `css/app.css`, `css/auth.css`
- `js/` – logika: `data.js` (dane), `ui.js`, `task.js`, `views.js`, `insights.js`, `whiteboard.js`, `more.js`, `ai.js`, `extract.js`, `magic.js`, `recap.js`, `onboard.js`, `d3vek.js`, `invite.js`, `anim.js`, `app.js`
- `promo/` – film promocyjny i jego źródło (`promo.html`)
