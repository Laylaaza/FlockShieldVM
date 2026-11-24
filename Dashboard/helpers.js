// accu onder dit percentage is "accu laag"
const LOW_BATTERY_LIMIT = 20;

// zoveel seconden zonder contact is "offline"
const OFFLINE_AFTER_SECONDS = 30;

const REFRESH_SECONDS = 5;

const STATUS_TEXT = {
  "calm": "Rustig",
  "active": "Actief",
  "low-battery": "Accu laag",
  "offline": "Offline"
};

// tijd van de laatste goede data, voor de melding bij geen verbinding
let lastDataTime = null;

// de volgorde telt: offline gaat voor accu laag, accu laag gaat voor actief
function getModuleStatus(module, serverTime) {
  // we rekenen met de tijd van de server, niet met de klok van de computer
  const secondsSinceContact = (new Date(serverTime) - new Date(module.lastContact)) / 1000;

  if (secondsSinceContact > OFFLINE_AFTER_SECONDS) {
    return "offline";
  }
  if (module.battery < LOW_BATTERY_LIMIT) {
    return "low-battery";
  }
  if (module.isActive) {
    return "active";
  }
  return "calm";
}

function formatTime(isoString, withSeconds) {
  const options = { hour: "2-digit", minute: "2-digit" };
  if (withSeconds) {
    options.second = "2-digit";
  }
  return new Date(isoString).toLocaleTimeString("nl-NL", options);
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" });
}

function isSameDay(isoA, isoB) {
  return new Date(isoA).toDateString() === new Date(isoB).toDateString();
}

// textContent en nooit innerHTML, zodat tekst van de server nooit als HTML wordt gelezen
function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function addElement(parent, tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function getNewestContact(modules) {
  let newest = null;
  for (const module of modules) {
    if (newest === null || new Date(module.lastContact) > new Date(newest)) {
      newest = module.lastContact;
    }
  }
  return newest;
}

function updateConnectionStatus(modulesData) {
  const connection = document.getElementById("connection-status");
  connection.classList.remove("connection-lost");

  const newest = getNewestContact(modulesData.modules);
  if (newest === null) {
    connection.textContent = "Verbonden · nog geen data van modules";
  } else {
    lastDataTime = newest;
    connection.textContent = "Verbonden · laatste data " + formatTime(newest, true);
  }
}

// de oude gegevens blijven op het scherm staan
function showNoConnection() {
  const connection = document.getElementById("connection-status");
  connection.classList.add("connection-lost");

  if (lastDataTime === null) {
    connection.textContent = "■ Geen verbinding";
  } else {
    connection.textContent = "■ Geen verbinding, laatste gegevens van " + formatTime(lastDataTime, true);
  }
}

function describeEvent(event) {
  // een onbekend soort laten we gewoon zo zien
  let title = event.type;
  let detail = "";

  if (event.type === "detection") {
    title = "Detectie";
    detail = "zone " + event.zone;
    // zekerheid en modules tonen we alleen als de API ze meestuurt
    if (event.confidence !== undefined) {
      detail = detail + ", zekerheid " + event.confidence + "%";
    }
    if (event.actionTaken === false) {
      detail = detail + ", geen actie";
    }
  } else if (event.type === "deterrent_started") {
    title = "Verjaging gestart";
    detail = "zone " + event.zone;
    if (event.moduleIds !== undefined) {
      detail = detail + ", module " + event.moduleIds.join(", ");
    }
    if (event.responseTimeMs !== undefined) {
      // de API geeft milliseconden, wij laten seconden zien
      detail = detail + ", reactietijd " + (event.responseTimeMs / 1000) + " s";
    }
  } else if (event.type === "module_offline") {
    title = "Module " + event.moduleId + " offline";
    detail = "geen verbinding meer";
  } else if (event.type === "action_failed") {
    title = "Actie mislukt";
    detail = "zone " + event.zone;
  }

  return { title: title, detail: detail };
}

function addEventItem(list, event, withDate) {
  const description = describeEvent(event);
  const item = addElement(list, "li", "event-item", "");

  let timeText = formatTime(event.time, true);
  if (withDate) {
    timeText = formatDate(event.time) + " " + timeText;
  }
  addElement(item, "span", "event-time", timeText);

  const text = addElement(item, "div", "", "");
  addElement(text, "span", "event-title", description.title);
  addElement(text, "span", "event-detail", " " + description.detail);
}