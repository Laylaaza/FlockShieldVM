// Nepdata in dezelfde vorm als de echte API (afspraak met Casper).
// Dit bestand is alleen om te testen. Als de API er is, kan het weg.

// Geeft een tijd terug van "zoveel seconden geleden", in het formaat van de API.
// Zo lijkt de nepdata live: de tijden lopen steeds mee met de klok.
function secondsAgo(seconds) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

// Doet alsof dit het antwoord is van /api/modules
function getMockModules() {
  return {
    // De tijd van de server. Daarmee rekent het dashboard uit of een module offline is.
    serverTime: new Date().toISOString(),
    modules: [
      // Elke module heeft: nummer, zone, accu in procent, laatste contact en of hij actief is
      { id: 1, zone: "A", battery: 76, lastContact: secondsAgo(4), isActive: false },
      { id: 2, zone: "B", battery: 81, lastContact: secondsAgo(3), isActive: false },
      { id: 3, zone: "C", battery: 64, lastContact: secondsAgo(2), isActive: true },
      // Module 4 heeft een lage accu (onder de 20%)
      { id: 4, zone: "C", battery: 18, lastContact: secondsAgo(4), isActive: true },
      // Module 5 had 51 minuten geleden (3060 seconden) het laatste contact: die is dus offline
      { id: 5, zone: "D", battery: 52, lastContact: secondsAgo(3060), isActive: false },
      { id: 6, zone: "D", battery: 70, lastContact: secondsAgo(3), isActive: false }
    ]
  };
}

// Doet alsof dit het antwoord is van /api/events. De nieuwste gebeurtenis staat bovenaan.
function getMockEvents() {
  return {
    events: [
      // Een verjaging: welke modules draaien en hoe snel het systeem reageerde
      { id: 12, time: secondsAgo(8), type: "deterrent_started", zone: "C", moduleIds: [3, 4], responseTimeMs: 2000 },
      // Een detectie: hoe zeker de AI is en of er een actie op volgde
      { id: 11, time: secondsAgo(10), type: "detection", zone: "C", moduleId: 3, confidence: 91, actionTaken: true },
      // Een detectie waar het systeem niets mee deed (actionTaken is false)
      { id: 10, time: secondsAgo(2040), type: "detection", zone: "D", moduleId: 6, confidence: 54, actionTaken: false },
      // Module 5 is offline gegaan
      { id: 9, time: secondsAgo(3060), type: "module_offline", moduleId: 5 },
      { id: 8, time: secondsAgo(3300), type: "deterrent_started", zone: "B", moduleIds: [2], responseTimeMs: 3000 },
      { id: 7, time: secondsAgo(3303), type: "detection", zone: "B", moduleId: 2, confidence: 88, actionTaken: true }
    ]
  };
}