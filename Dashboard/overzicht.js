// de zones en maten moeten kloppen met de svg in index.html
const ZONES = ["A", "B", "C", "D"];
const FIELD_WIDTH = 400;
const FIELD_HEIGHT = 300;

// svg-onderdelen maak je met deze naamruimte, anders tekent de browser ze niet
const SVG_NS = "http://www.w3.org/2000/svg";

function updateTiles(modulesData, eventsData) {
  const modules = modulesData.modules;
  const serverTime = modulesData.serverTime;

  // zonder modules is er niets uit te rekenen
  if (modules.length === 0) {
    setText("online-modules-value", "0 / 0");
    setText("online-modules-note", "Nog geen modules aangemeld");
    setText("lowest-battery-value", "-");
    setText("lowest-battery-note", "Geen modules");
    setText("detections-value", "-");
    setText("detections-note", "Geen modules");
    setText("last-detection-value", "-");
    setText("last-detection-note", "Geen modules");
    return;
  }

  // modules online
  const offlineNumbers = [];
  for (const module of modules) {
    if (getModuleStatus(module, serverTime) === "offline") {
      offlineNumbers.push(module.id);
    }
  }
  setText("online-modules-value", (modules.length - offlineNumbers.length) + " / " + modules.length);
  if (offlineNumbers.length === 0) {
    setText("online-modules-note", "Alle modules online");
  } else {
    setText("online-modules-note", offlineNumbers.length + " offline: module " + offlineNumbers.join(", "));
  }

  // laagste accu
  let lowest = modules[0];
  for (const module of modules) {
    if (module.battery < lowest.battery) {
      lowest = module;
    }
  }
  setText("lowest-battery-value", lowest.battery + "%");
  if (lowest.battery < LOW_BATTERY_LIMIT) {
    setText("lowest-battery-note", "Module " + lowest.id + ", onder de grens van " + LOW_BATTERY_LIMIT + "%");
  } else {
    setText("lowest-battery-note", "Module " + lowest.id + ", boven de grens van " + LOW_BATTERY_LIMIT + "%");
  }

  // detecties vandaag, "vandaag" is dezelfde dag als de servertijd
  let detections = 0;
  let deterrents = 0;
  let noAction = 0;
  for (const event of eventsData.events) {
    if (isSameDay(event.time, serverTime)) {
      if (event.type === "detection") {
        detections++;
        if (event.actionTaken === false) {
          noAction++;
        }
      }
      if (event.type === "deterrent_started") {
        deterrents++;
      }
    }
  }
  setText("detections-value", detections);
  setText("detections-note", deterrents + " verjagingen, " + noAction + " geen actie");

  // laatste detectie, de lijst is nieuwste eerst dus de eerste detectie is de laatste
  let lastDetection = null;
  for (const event of eventsData.events) {
    if (event.type === "detection") {
      lastDetection = event;
      break;
    }
  }
  if (lastDetection === null) {
    setText("last-detection-value", "-");
    setText("last-detection-note", "Nog geen detecties");
  } else {
    setText("last-detection-value", formatTime(lastDetection.time, false));
    setText("last-detection-note", "Zone " + lastDetection.zone + ", zekerheid " + lastDetection.confidence + "%");
  }
}

function updateSituation(modulesData, alertCount) {
  // een offline module telt niet mee: we weten niet of die nog actief is
  const activeZones = [];
  let onlineCount = 0;
  for (const zone of ZONES) {
    for (const module of modulesData.modules) {
      const status = getModuleStatus(module, modulesData.serverTime);
      if (module.zone === zone && module.isActive && status !== "offline") {
        activeZones.push(zone);
        break;
      }
    }
  }
  for (const module of modulesData.modules) {
    if (getModuleStatus(module, modulesData.serverTime) !== "offline") {
      onlineCount++;
    }
  }

  const bar = document.getElementById("situation-bar");
  if (modulesData.modules.length === 0) {
    bar.className = "situation";
    setText("situation-text", "Nog geen modules verbonden");
  } else if (onlineCount === 0) {
    bar.className = "situation";
    setText("situation-text", "■ Alle modules zijn offline");
  } else if (activeZones.length > 0) {
    bar.className = "situation situation-active";
    setText("situation-text", "▲ Verjaging actief in zone " + activeZones.join(", "));
  } else {
    bar.className = "situation";
    setText("situation-text", "Alles rustig");
  }

  if (alertCount === 0) {
    setText("situation-alerts", "Geen meldingen");
  } else if (alertCount === 1) {
    setText("situation-alerts", "1 melding");
  } else {
    setText("situation-alerts", alertCount + " meldingen");
  }
}

function addAlert(list, kind, symbol, title, detail) {
  const item = addElement(list, "li", "alert-item", "");

  // schermlezers lezen de titel, het symbool niet
  const icon = addElement(item, "span", "alert-icon alert-icon-" + kind, symbol);
  icon.setAttribute("aria-hidden", "true");

  const text = addElement(item, "div", "", "");
  addElement(text, "div", "alert-title", title);
  addElement(text, "div", "alert-detail", detail);
}

// geeft het aantal meldingen terug
function updateAlerts(modulesData) {
  const list = document.getElementById("alerts-list");
  // leegmaken, anders komen de meldingen er elke 5 seconden bij
  list.textContent = "";
  let count = 0;

  for (const module of modulesData.modules) {
    if (getModuleStatus(module, modulesData.serverTime) === "offline") {
      addAlert(list, "offline", "■", "Module " + module.id + " is offline",
        "Geen data sinds " + formatTime(module.lastContact, false));
      count++;
    }
  }

  for (const module of modulesData.modules) {
    if (getModuleStatus(module, modulesData.serverTime) === "low-battery") {
      addAlert(list, "low-battery", "▼", "Accu van module " + module.id + " is " + module.battery + "%",
        "Onder de grens van " + LOW_BATTERY_LIMIT + "%");
      count++;
    }
  }

  if (count === 0) {
    addElement(list, "li", "events-empty", "Geen meldingen");
  }

  return count;
}

function updateEvents(eventsData) {
  const list = document.getElementById("events-list");
  list.textContent = "";

  for (let i = 0; i < eventsData.events.length && i < 5; i++) {
    addEventItem(list, eventsData.events[i], false);
  }

  if (eventsData.events.length === 0) {
    addElement(list, "li", "events-empty", "Nog geen gebeurtenissen");
  }
}

function createSvgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  for (const key in attributes) {
    element.setAttribute(key, attributes[key]);
  }
  return element;
}

// elke status heeft een eigen vorm, zodat kleur niet het enige verschil is
// x en y zijn het midden van de vorm
function createShape(status, x, y) {
  if (status === "active") {
    return createSvgElement("polygon", {
      class: "module-shape",
      points: x + "," + (y - 11) + " " + (x + 10) + "," + (y + 7) + " " + (x - 10) + "," + (y + 7)
    });
  }
  if (status === "low-battery") {
    return createSvgElement("polygon", {
      class: "module-shape",
      points: (x - 10) + "," + (y - 8) + " " + (x + 10) + "," + (y - 8) + " " + x + "," + (y + 10)
    });
  }
  if (status === "offline") {
    return createSvgElement("rect", { class: "module-shape", x: x - 8, y: y - 8, width: 16, height: 16 });
  }
  return createSvgElement("circle", { class: "module-shape", cx: x, cy: y, r: 9 });
}

// de modules van een zone staan verdeeld langs de rand van het veld
// bij 2 modules op 1/3 en 2/3 van de rand
function getModulePosition(zone, index, count) {
  const fraction = (index + 1) / (count + 1);
  if (zone === "A") {
    return { x: 0, y: Math.round(FIELD_HEIGHT * fraction) };
  }
  if (zone === "B") {
    return { x: Math.round(FIELD_WIDTH * fraction), y: 0 };
  }
  if (zone === "C") {
    return { x: FIELD_WIDTH, y: Math.round(FIELD_HEIGHT * fraction) };
  }
  return { x: Math.round(FIELD_WIDTH * fraction), y: FIELD_HEIGHT };
}

// de tekst staat buiten het veld, anchor bepaalt aan welke kant van het punt de tekst begint
function getLabelPosition(zone, x, y) {
  if (zone === "A") {
    return { x: x - 16, nameY: y - 4, statusY: y + 11, anchor: "end" };
  }
  if (zone === "B") {
    return { x: x, nameY: y - 30, statusY: y - 16, anchor: "middle" };
  }
  if (zone === "C") {
    return { x: x + 16, nameY: y - 4, statusY: y + 11, anchor: "start" };
  }
  return { x: x, nameY: y + 26, statusY: y + 41, anchor: "middle" };
}

function createModule(module, status, zone, position) {
  const label = getLabelPosition(zone, position.x, position.y);

  // de klasse bepaalt de kleur, bijvoorbeeld module-offline is rood
  const group = createSvgElement("g", { class: "module module-" + status, id: "module-" + module.id });
  group.appendChild(createShape(status, position.x, position.y));

  const name = createSvgElement("text", { class: "module-name", x: label.x, y: label.nameY, "text-anchor": label.anchor });
  name.textContent = "Module " + module.id;
  group.appendChild(name);

  let statusWord = STATUS_TEXT[status];
  if (status === "low-battery") {
    statusWord = statusWord + " " + module.battery + "%";
  }
  const statusText = createSvgElement("text", { class: "module-status", x: label.x, y: label.statusY, "text-anchor": label.anchor });
  statusText.textContent = statusWord;
  group.appendChild(statusText);

  return group;
}

function drawMap(modulesData) {
  // de oude modules weghalen, anders komen ze er elke 5 seconden bij
  const layer = document.getElementById("modules-layer");
  layer.textContent = "";

  const descriptions = [];
  const activeZones = [];

  for (const zone of ZONES) {
    const zoneModules = [];
    let zoneIsActive = false;
    for (const module of modulesData.modules) {
      if (module.zone === zone) {
        zoneModules.push(module);
        // een offline module telt niet mee als actief
        if (module.isActive && getModuleStatus(module, modulesData.serverTime) !== "offline") {
          zoneIsActive = true;
        }
      }
    }

    const zoneElement = document.getElementById("zone-" + zone.toLowerCase());
    if (zoneIsActive) {
      zoneElement.classList.add("zone-active");
      activeZones.push(zone);
    } else {
      zoneElement.classList.remove("zone-active");
    }

    for (let i = 0; i < zoneModules.length; i++) {
      const module = zoneModules[i];
      const status = getModuleStatus(module, modulesData.serverTime);
      const position = getModulePosition(zone, i, zoneModules.length);
      layer.appendChild(createModule(module, status, zone, position));
      descriptions.push("module " + module.id + " " + STATUS_TEXT[status].toLowerCase());
    }
  }

  // schermlezers lezen de tekst in de tekening niet, daarom een samenvatting in aria-label
  let activeText = "geen";
  if (activeZones.length > 0) {
    activeText = activeZones.join(", ");
  }
  document.getElementById("field-map").setAttribute(
    "aria-label",
    "Veldkaart. Actieve zones: " + activeText + ". " + descriptions.join(", ") + "."
  );
}

async function loadOverview() {
  let modulesData;
  let eventsData;

  // mislukt het ophalen, dan blijft de oude data staan
  try {
    modulesData = await getModules();
    eventsData = await getEvents(100);
  } catch (error) {
    console.error(error);
    showNoConnection();
    return;
  }

  updateConnectionStatus(modulesData);
  updateTiles(modulesData, eventsData);
  drawMap(modulesData);
  const alertCount = updateAlerts(modulesData);
  updateSituation(modulesData, alertCount);
  updateEvents(eventsData);
}

// meteen laden en daarna elke 5 seconden opnieuw
loadOverview();
setInterval(loadOverview, REFRESH_SECONDS * 1000);