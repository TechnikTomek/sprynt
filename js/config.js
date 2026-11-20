/* Sprynt – konfiguracja chmury (Supabase).
 * url i anonKey to dane PUBLICZNE projektu (Project URL i klucz „publishable”).
 * Bezpieczeństwo danych zapewniają reguły RLS w bazie (supabase/schema.sql), nie ukrycie klucza.
 * Puste pola = tryb lokalny (konta i dane tylko w tej przeglądarce). */
window.SPRYNT_CLOUD = window.SPRYNT_CLOUD || {
  url: "https://inuvjvcifgihbxnrtqnv.supabase.co",
  anonKey: "sb_publishable_UPtBr66aDZDR9v6JKDNXxw_D2_WfRIW",
};
