/* =========================================================
   DayFlow — settings for accounts (Supabase)
   Paste your project's values from Supabase: Project Settings → API.
   The anon key is meant to be public: row-level security in
   supabase/schema.sql is what keeps each person's data private.
   NEVER put the service_role key here.
   Leave both empty to run without accounts (tasks stay on the device).
   ========================================================= */

const CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  // The live website, e.g. "https://dayflow.netlify.app/". Links in sign-up and password emails sent
  // from the phone app open here. The website itself uses its own address automatically.
  siteUrl: "",
};
