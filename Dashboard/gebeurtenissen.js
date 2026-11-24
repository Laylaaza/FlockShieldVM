/*
 * FlockShield frontend: gebeurtenissen
 * Deze pagina leest alleen gegevens uit de bestaande PHP backend.
 * Alle databasehandelingen vinden plaats op de server, niet in de browser.
 */
'use strict';

const API_ROOT = '/api';
const AUTO_REFRESH_MS = 5_000;
const el = (id) => document.getElementById(id);
let allEvents = [];
let moduleNames = new Map();
let refreshing = false;

async function getJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(API_ROOT + path, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} bij ${path}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function text(value, fallback = 'Onbekend') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function dateText(value) {
  if (!value) return 'Onbekend';
  const input = String(value);
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]} ${match[4]}:${match[5]}`;
  return input;
}

function scoreText(value) {
  if (value === null || value === undefined || value === '') return 'Niet gemeten';
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return text(value);
  if (number <= 1) return `${Math.round(number * 100)}%`;
  if (number <= 100) return `${Math.round(number)}%`;
  return text(value);
}

function tableCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = text(value);
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

function renderEvents() {
  const query = el('search-input').value.trim().toLowerCase();
  const matching = allEvents.filter(event => {
    const name = moduleNames.get(String(event.module_id)) || '';
    return [event.detectie_id, event.module_id, name, event.invoerbron, event.model_versie]
      .some(value => String(value || '').toLowerCase().includes(query));
  });

  const tbody = el('events-body');
  tbody.replaceChildren();
  el('result-count').textContent = `${matching.length} van ${allEvents.length} opgehaalde detecties`;

  if (!matching.length) {
    const row = document.createElement('tr');
    const cell = tableCell(row, query ? 'Geen resultaten voor deze zoekterm.' : 'Er zijn nog geen detecties geregistreerd.', 'empty');
    cell.colSpan = 5;
    tbody.appendChild(row);
    return;
  }

  for (const event of matching) {
    const row = document.createElement('tr');
    const id = text(event.detectie_id);
    const shortId = id.length > 18 ? `${id.slice(0, 8)}…` : id;
    const idCell = tableCell(row, shortId, 'mono-cell');
    idCell.title = id;
    tableCell(row, dateText(event.detectie_tijdstip), 'primary-cell');
    tableCell(row, moduleNames.get(String(event.module_id)) || `Module ${text(event.module_id)}`);
    tableCell(row, event.invoerbron);
    tableCell(row, scoreText(event.betrouwbaarheidsscore));
    tbody.appendChild(row);
  }
}

async function refreshEvents() {
  if (refreshing) return;
  refreshing = true;
  el('refresh-button').disabled = true;
  el('refresh-button').textContent = 'Bezig met laden';
  el('error-message').hidden = true;

  const [eventsResult, modulesResult] = await Promise.allSettled([
    getJson('/detections?limit=200'),
    getJson('/modules')
  ]);

  if (modulesResult.status === 'fulfilled' && Array.isArray(modulesResult.value.modules)) {
    moduleNames = new Map(modulesResult.value.modules.map(m => [String(m.module_id), m.naam || m.module_code]));
  }

  if (eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value.detections)) {
    allEvents = eventsResult.value.detections;
    renderEvents();
    el('last-updated').textContent = `Laatste verversing: ${new Date().toLocaleTimeString('nl-NL')}`;
    const partial = modulesResult.status === 'rejected';
    el('connection-status').classList.toggle('is-connected', !partial);
    el('connection-status').classList.toggle('is-partial', partial);
    el('connection-text').textContent = partial ? 'Gedeeltelijk beschikbaar' : 'Verbonden';
    if (partial) {
      el('error-message').textContent = 'Modulenamen konden niet worden geladen. De detecties zijn wel beschikbaar.';
      el('error-message').hidden = false;
    }
  } else {
    el('connection-status').classList.remove('is-connected', 'is-partial');
    el('connection-text').textContent = 'Niet verbonden';
    el('error-message').textContent = 'Detecties konden niet worden opgehaald. Controleer of GET /api/detections in Nginx is toegestaan.';
    el('error-message').hidden = false;
    el('result-count').textContent = 'Detecties niet beschikbaar';
    const tbody = el('events-body');
    tbody.replaceChildren();
    const row = document.createElement('tr');
    const cell = tableCell(row, 'Geen verbinding met het detectieoverzicht.', 'empty');
    cell.colSpan = 5;
    tbody.appendChild(row);
  }

  refreshing = false;
  el('refresh-button').disabled = false;
  el('refresh-button').textContent = 'Vernieuwen';
}

el('search-input').addEventListener('input', renderEvents);
el('refresh-button').addEventListener('click', refreshEvents);
refreshEvents();
setInterval(() => {
  if (document.visibilityState === 'visible') refreshEvents();
}, AUTO_REFRESH_MS);
