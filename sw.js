/* Hintergrund-Helfer der App – NUR für Push-Benachrichtigungen.
   Bewusst ohne Zwischenspeicher (kein fetch-Handler): die App lädt wie bisher
   immer frisch vom Server, eine neue Version ist sofort da. */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function(e){
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch(x){ d = { titel: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titel || "Wartungsleitstand", {
    body: d.text || "",
    tag: d.tag || undefined,
    icon: "icon-180.png",
    badge: "favicon-32.png",
    data: { ziel: d.ziel || "" }
  }));
});

/* Der Browser hat das Abo dieses Geräts erneuert oder beendet: die Datenbank
   kennt die neue Adresse noch nicht. Eintragen kann sie nur die angemeldete
   App – einer offenen Bescheid geben; sonst gleicht sie beim nächsten Start
   von selbst ab (pushAbgleich). */
self.addEventListener("pushsubscriptionchange", function(e){
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(liste){
    liste.forEach(function(c){ c.postMessage({ pushAbo: true }); });
  }));
});

/* Antippen: offene App nach vorne holen und dorthin springen, sonst öffnen */
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var ziel = (e.notification.data && e.notification.data.ziel) || "";
  var url = new URL("index.html" + (ziel ? "#push=" + encodeURIComponent(ziel) : ""), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(liste){
    for (var i = 0; i < liste.length; i++) {
      var c = liste[i];
      if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) {
        c.postMessage({ pushZiel: ziel });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
