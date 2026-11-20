# Sprynt

Aplikacja do zarządzania pracą zespołu: zadania, listy, tablice Kanban, tabela, kalendarz, oś czasu, pulpit z wykresami, tablice online (whiteboard), cele, automatyzacje, czat, pola niestandardowe, szablony, przypomnienia, śledzenie czasu, dokumenty i chmura na pliki.

**Zadania z pliku:** wgraj notatki, protokół, PDF albo arkusz Excel, a Sprynt wyciągnie z niego zadania dla zespołu – z osobami, terminami i priorytetami. Dla kontrolerów finansowych: checklisty zamknięcia miesiąca (terminy WD+n), niezapłacone faktury i odchylenia budżetu od wykonania.

**Strona:** https://techniktomek.github.io/sprynt/ · **Aplikacja:** https://techniktomek.github.io/sprynt/app.html · **Film:** [promo/sprynt-promo.mp4](promo/sprynt-promo.mp4)

## Jak to działa

- Czysty HTML, CSS i JavaScript – bez frameworków i bez budowania. Wystarczy otworzyć `index.html` (strona startowa) albo `app.html` (aplikacja).
- Konta i dane są zapisywane **lokalnie w przeglądarce** (localStorage + IndexedDB na pliki). Hasła są przechowywane jako skrót PBKDF2-SHA256, nigdy jawnie. Nie ma serwera – dane nie opuszczają Twojego komputera i nie synchronizują się między urządzeniami.
- Ikony pochodzą z [thesvg.org](https://thesvg.org) (zestaw UI, wygląd „glass”).

## Struktura

- `index.html`, `css/landing.css`, `js/landing.js` – strona startowa
- `app.html` – aplikacja (logowanie + wszystkie widoki), `css/app.css`, `css/auth.css`
- `js/` – logika: `data.js` (dane), `ui.js`, `task.js`, `views.js`, `insights.js`, `whiteboard.js`, `more.js`, `extract.js`, `app.js`
- `promo/` – film promocyjny i jego źródło (`promo.html`)
