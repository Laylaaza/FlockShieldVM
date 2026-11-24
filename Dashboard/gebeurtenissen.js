// de laatst opgehaalde gebeurtenissen, het filter werkt hierop
let currentEvents = [];

// zelfde vorm als de datumkiezer: 2026-11-24
function getLocalDate(isoString) {
  const date = new Date(isoString);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function showEvents() {
  // een lege waarde betekent niet filteren
  const zoneFilter = document.getElementById("zone-filter").value;
  const dateFilter = document.getElementById("date-filter").value;

  const list = document.getElementById("events-list");
  list.textContent = "";
  let count = 0;

  for (const event of currentEvents) {
    if (zoneFilter !== "" && event.zone !== zoneFilter) {
      continue;
    }
    if (dateFilter !== "" && getLocalDate(event.time) !== dateFilter) {
      continue;
    }
    addEventItem(list, event, true);
    count++;
  }

  if (count === 0) {
    setText("events-count", "Geen gebeurtenissen gevonden");
  } else {
    setText("events-count", count + " gebeurtenissen");
  }
}

async function loadEvents() {
  let modulesData;
  let eventsData;

  // de modules halen we op voor de verbindingstekst bovenin
  try {
    modulesData = await getModules();
    eventsData = await getEvents(500);
  } catch (error) {
    console.error(error);
    showNoConnection();
    return;
  }

  updateConnectionStatus(modulesData);
  currentEvents = eventsData.events;
  showEvents();
}

document.getElementById("zone-filter").addEventListener("change", showEvents);
document.getElementById("date-filter").addEventListener("change", showEvents);

document.getElementById("reset-filters").addEventListener("click", function () {
  document.getElementById("zone-filter").value = "";
  document.getElementById("date-filter").value = "";
  showEvents();
});

// meteen laden en daarna elke 5 seconden opnieuw
loadEvents();
setInterval(loadEvents, REFRESH_SECONDS * 1000);