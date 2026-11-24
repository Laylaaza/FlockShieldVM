// alles wat met de server praat staat in dit bestand

// de API staat op dezelfde server als de pagina
const API_BASE_URL = "/api";

async function getModules() {
  const response = await fetch(API_BASE_URL + "/modules");
  if (!response.ok) {
    throw new Error("Modules ophalen mislukt: " + response.status);
  }
  const data = await response.json();
  // klopt het antwoord niet, dan telt het als geen verbinding
  if (!Array.isArray(data.modules) || !data.serverTime) {
    throw new Error("Antwoord van /modules klopt niet");
  }
  return data;
}

async function getEvents(limit) {
  const response = await fetch(API_BASE_URL + "/events?limit=" + limit);
  if (!response.ok) {
    throw new Error("Gebeurtenissen ophalen mislukt: " + response.status);
  }
  const data = await response.json();
  if (!Array.isArray(data.events)) {
    throw new Error("Antwoord van /events klopt niet");
  }
  return data;
}