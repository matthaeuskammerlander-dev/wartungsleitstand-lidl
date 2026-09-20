/* Verbindung zur Protokoll-Datenbank.
   Beide Werte stehen im Supabase-Projekt unter Settings -> API.
   Der anon-Key ist zur Veröffentlichung gedacht: er erlaubt für sich genommen
   nichts, die Rechte regeln die RLS-Policies aus supabase-setup.sql.

   Solange die Felder leer sind, läuft die App ohne gemeinsame Datenbank
   (Protokolle bleiben am Gerät). Innerhalb von Claude wird ohnehin immer
   die dortige Datenbank verwendet, unabhängig von diesen Werten. */
window.UKT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",

  /* Adresse, auf die der QR-Code zeigt. Leer lassen = die Adresse, unter der
     die Seite gerade aufgerufen wird. Für das spätere eigene Hosting hier
     die endgültige Adresse eintragen, z. B. "https://wartung.ukt.at/". */
  appUrl: ""
};
