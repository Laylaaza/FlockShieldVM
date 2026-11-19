const USE_MOCK = true;
const API_BASE_URL = "/api";

async function getModules() {
  if (USE_MOCK) {
    return MOCK_MODULES;
  }
  const response = await fetch(API_BASE_URL + "/modules");
  if (!response.ok) {
    throw new Error("Modules ophalen mislukt: " + response.status);
  }
  return response.json();
}

async function getEvents(limit) {
  if (USE_MOCK) {
    return { events: MOCK_EVENTS.events.slice(0, limit) };
  }
  const response = await fetch(API_BASE_URL + "/events?limit=" + limit);
  if (!response.ok) {
    throw new Error("Gebeurtenissen ophalen mislukt: " + response.status);
  }
  return response.json();
}