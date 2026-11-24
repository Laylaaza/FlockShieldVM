/*
 * FlockShield frontend
 * Deze JavaScript draait uitsluitend in de browser.
 * De bestaande PHP backend verzorgt de API en de SQL Server verbinding.
 * Er wordt geen gebruikgemaakt van mock-data.js of serverTime.
 */
'use strict';

const API_ROOT = '/api';
const AUTO_REFRESH_MS = 60_000;
const el = (id) => document.getElementById(id);

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
  if (!value) return 'Nog geen detectie';
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

function emptyRow(tbody, columns, message) {
  tbody.replaceChildren();
  const row = document.createElement('tr');
  const cell = tableCell(row, message, 'empty');
  cell.colSpan = columns;
  tbody.appendChild(row);
}

function setConnection(available, partial = false) {
  const status = el('connection-status');
  status.classList.toggle('is-connected', available && !partial);
  status.classList.toggle('is-partial', partial);
  el('connection-text').textContent = available ? (partial ? 'Gedeeltelijk beschikbaar' : 'Verbonden') : 'Niet verbonden';
}

function renderModules(modules) {
  el('module-count').textContent = String(modules.length);
  el('active-count').textContent = String(modules.filter(m =>
    ['actief', 'active'].includes(String(m.status || '').trim().toLowerCase())
  ).length);

  const tbody = el('modules-body');
  tbody.replaceChildren();
  if (!modules.length) {
    emptyRow(tbody, 4, 'Er staan nog geen modules in de database.');
    return;
  }

  for (const module of modules) {
    const row = document.createElement('tr');
    tableCell(row, module.naam || `Module ${text(module.module_id)}`, 'primary-cell');
    tableCell(row, module.module_code);
    tableCell(row, module.module_type);
    const status = tableCell(row, module.status);
    const badge = document.createElement('span');
    badge.className = 'status-pill';
    if (['actief', 'active'].includes(String(module.status || '').trim().toLowerCase())) {
      badge.classList.add('active');
    }
    badge.textContent = text(module.status);
    status.replaceChildren(badge);
    tbody.appendChild(row);
  }
}

function renderDetections(detections, modules) {
  el('detection-count').textContent = String(detections.length);
  el('latest-detection').textContent = detections.length ? dateText(detections[0].detectie_tijdstip) : 'Nog geen detecties';

  const moduleMap = new Map(modules.map(m => [String(m.module_id), m.naam || m.module_code]));
  const tbody = el('detections-body');
  tbody.replaceChildren();
  if (!detections.length) {
    emptyRow(tbody, 4, 'Er zijn nog geen detecties geregistreerd.');
    return;
  }

  for (const detection of detections.slice(0, 5)) {
    const row = document.createElement('tr');
    tableCell(row, dateText(detection.detectie_tijdstip), 'primary-cell');
    tableCell(row, moduleMap.get(String(detection.module_id)) || `Module ${text(detection.module_id)}`);
    tableCell(row, detection.invoerbron);
    tableCell(row, scoreText(detection.betrouwbaarheidsscore));
    tbody.appendChild(row);
  }
}

let refreshing = false;
async function refreshDashboard() {
  if (refreshing) return;
  refreshing = true;
  const button = el('refresh-button');
  button.disabled = true;
  button.textContent = 'Bezig met laden';
  el('error-message').hidden = true;

  const [modulesResult, detectionsResult] = await Promise.allSettled([
    getJson('/modules'),
    getJson('/detections?limit=100')
  ]);

  const errors = [];
  let modules = [];
  if (modulesResult.status === 'fulfilled' && Array.isArray(modulesResult.value.modules)) {
    modules = modulesResult.value.modules;
    renderModules(modules);
  } else {
    errors.push('Modules konden niet worden opgehaald.');
    el('module-count').textContent = '—';
    el('active-count').textContent = '—';
    emptyRow(el('modules-body'), 4, 'Modules tijdelijk niet beschikbaar.');
  }

  if (detectionsResult.status === 'fulfilled' && Array.isArray(detectionsResult.value.detections)) {
    renderDetections(detectionsResult.value.detections, modules);
  } else {
    errors.push('Detecties konden niet worden opgehaald. Controleer of GET /api/detections in Nginx is toegestaan.');
    el('detection-count').textContent = '—';
    el('latest-detection').textContent = 'Niet beschikbaar';
    emptyRow(el('detections-body'), 4, 'Detecties tijdelijk niet beschikbaar.');
  }

  const atLeastOneWorks = errors.length < 2;
  setConnection(atLeastOneWorks, errors.length === 1);
  if (errors.length) {
    el('error-message').textContent = errors.join(' ');
    el('error-message').hidden = false;
  }
  if (atLeastOneWorks) el('last-updated').textContent = `Laatste verversing: ${new Date().toLocaleTimeString('nl-NL')}`;
  refreshing = false;
  button.disabled = false;
  button.textContent = 'Vernieuwen';
}

el('refresh-button').addEventListener('click', refreshDashboard);
refreshDashboard();
setInterval(() => {
  if (document.visibilityState === 'visible') refreshDashboard();
}, AUTO_REFRESH_MS);
