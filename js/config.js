/* Sprynt – konfiguracja chmury (Supabase).
 * WYŁĄCZONA (2026-11-21): Supabase wysyła e-mail weryfikacyjny przy każdej rejestracji, a tego nie da się
 * zablokować z poziomu strony – dlatego Sprynt działa na kontach lokalnych (bez e-maili, dane w przeglądarce).
 * Żeby wrócić do chmury: wyłącz w Supabase „Confirm email” (Authentication → Sign In / Providers → Email)
 * i odkomentuj dane poniżej. url i anonKey to dane PUBLICZNE projektu; bezpieczeństwo zapewnia RLS. */
window.SPRYNT_CLOUD = window.SPRYNT_CLOUD || {
  url: "",     // "https://inuvjvcifgihbxnrtqnv.supabase.co"
  anonKey: "", // "sb_publishable_UPtBr66aDZDR9v6JKDNXxw_D2_WfRIW"
};
