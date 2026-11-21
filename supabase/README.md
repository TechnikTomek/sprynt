# Podłączenie Sprynt do chmury (Supabase) – 10 minut

Po tych krokach Sprynt ma prawdziwe konta (potwierdzenie e-maila, reset hasła), a zadania, dokumenty i pliki są zapisane na serwerze – zalogujesz się z każdego urządzenia.

## 1. Załóż projekt
1. Wejdź na https://supabase.com i zaloguj się (np. kontem GitHub).
2. **New project** → nazwa np. `sprynt`, region **Central EU (Frankfurt)**, ustaw hasło do bazy (zapisz je, ale nie wysyłaj nikomu).
3. Poczekaj ok. 2 minut, aż projekt się utworzy.

## 2. Utwórz tabele i zabezpieczenia
1. W projekcie: **SQL Editor** → **New query**.
2. Wklej całą zawartość pliku [`schema.sql`](schema.sql) i kliknij **Run**. Powinno pojawić się „Success. No rows returned”.

## 3. Ustaw adresy logowania
**Authentication → URL Configuration**:
- **Site URL:** `https://techniktomek.github.io/sprynt/app.html`
- **Redirect URLs:** dodaj `https://techniktomek.github.io/sprynt/app.html`

Dzięki temu linki z e-maili (potwierdzenie konta, reset hasła) otwierają Sprynt.

## 4. Przekaż dane projektu
**Project Settings → API** (albo **Data API / API Keys**) skopiuj:
- **Project URL** – np. `https://abcdefgh.supabase.co`
- klucz **anon** / **publishable** (publiczny – można go umieścić na stronie; dane chroni RLS z kroku 2)

**Nie kopiuj klucza `service_role` / `secret`** – ten musi zostać tajny.

Wpisz je w `js/config.js` (albo przekaż Claude):

```js
window.SPRYNT_CLOUD = window.SPRYNT_CLOUD || {
  url: "https://abcdefgh.supabase.co",
  anonKey: "eyJ…",
};
```

## Dobrze wiedzieć
- **E-maile:** darmowy Supabase wysyła tylko kilka e-maili na godzinę (potwierdzenia, reset hasła). Przy większej liczbie użytkowników podłącz własny serwer poczty: **Authentication → Emails → SMTP Settings** (np. Resend, Brevo).
- **Potwierdzanie e-maila jest wyłączone w Sprynt** – konto działa od razu po rejestracji, bez e-maila weryfikacyjnego. W panelu Supabase musi być wyłączone **Authentication → Sign In / Providers → Email → Confirm email** (inaczej Supabase nadal wyśle e-mail i aplikacja pokaże ekran „sprawdź skrzynkę”).
- **Darmowy plan** usypia projekt po tygodniu bez ruchu – wystarczy go obudzić w panelu Supabase.
- Kopię danych pobierzesz w Sprynt: **Ustawienia → Kopia zapasowa**.
