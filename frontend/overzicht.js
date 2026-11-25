import { getCollection } from './api.js?v=2';

const eventsPage = document.body.dataset.view === 'events';
const icons = {
  brand: '<path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z"/><path d="m8 13 4-4 4 4m-4-4v8"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  module: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6v6H9zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 8a7 7 0 0 1 12-2l2 3M4 15l2 3a7 7 0 0 0 12-2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};

const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
const number = new Intl.NumberFormat('nl-NL');
const dateFormat = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('nl-NL', { weekday: 'short' });
const display = (value, fallback = '—') => value == null || value === '' ? fallback : String(value);
const formatNumber = (value) => value == null ? '—' : number.format(value);
const active = (module) => ['actief', 'active'].includes(String(module.status ?? '').trim().toLowerCase());
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const byId = (id) => document.getElementById(id);

function timestamp(value) {
  if (!value) return null;
  const input = String(value).replace(' ', 'T');
  const date = new Date(/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(input) ? input + 'Z' : input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function score(value) {
  if (value == null || value === '') return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
    ? Math.round(numeric <= 1 ? numeric * 100 : numeric) + '%' : display(value);
}

let modules;
let detections;
let loading = false;
let lastUpdated = '';
let failures = 0;
let range = 7;
let selectedDay;
let page = 1;
let selectedModule = eventsPage ? new URLSearchParams(location.search).get('module') ?? '' : '';
const pageSize = 12;

const nav = (href, label, glyph, selected) =>
  '<a href="' + href + '"' + (selected ? ' aria-current="page"' : '') + '>' + icon(glyph) + label + '</a>';

byId('app').innerHTML = '<a class="skip" href="#main">Naar inhoud</a>' +
  '<header class="site-header"><a class="brand" href="index.html"><span>' + icon('brand') + '</span>FlockShield</a>' +
  '<nav aria-label="Hoofdnavigatie">' + nav('index.html', 'Inzichten', 'overview', false) + nav('modules.html', 'Modules', 'module', !eventsPage) +
  nav('gebeurtenissen.html', 'Gebeurtenissen', 'activity', eventsPage) + '</nav>' +
  '<span class="connection" id="connection" role="status"><i></i> Verbinden…</span></header>' +
  '<main id="main"><header class="top"><div><h1>' + (eventsPage ? 'Gebeurtenissen' : 'Modules') + '</h1><p>' +
  (eventsPage ? 'Zoek en bekijk geregistreerde vogeldetecties.' : 'Volg vogeldetecties en de status van je modules.') +
  '</p></div><div class="refresh-area"><small id="updated"></small><button id="refresh" class="button">' + icon('refresh') + ' Vernieuwen</button></div></header>' +
  '<div id="notice" class="notice" role="status" hidden></div>' +
  (eventsPage ? '<section class="panel"><div class="panel-head"><h2>Detectielogboek</h2></div>' +
    '<div class="filters"><label>Zoeken<input id="search" type="search" placeholder="ID, module, bron of model"></label>' +
    '<label>Module<select id="module-filter"><option value="">Alle modules</option></select></label>' +
    '<label>Sorteren<select id="sort"><option value="new">Nieuwste eerst</option><option value="old">Oudste eerst</option></select></label>' +
    '<button class="button" id="reset" type="button">Wis filters</button></div><div id="events"></div>' +
    '<div class="pagination"><small id="result" aria-live="polite"></small><div><button class="button" id="prev">Vorige</button><button class="button" id="next">Volgende</button></div></div></section>'
  : '<div class="stats" id="stats"></div><div class="middle"><section class="panel"><div class="panel-head"><div><h2>Detectieactiviteit</h2><p>Per dag, binnen de opgehaalde detecties</p></div>' +
    '<div class="segments" role="group" aria-label="Grafiekperiode"><button data-range="7" aria-pressed="true">7 dagen</button><button data-range="14" aria-pressed="false">14 dagen</button></div></div><div id="chart"></div></section>' +
    '<section class="panel"><div class="panel-head"><div><h2>Modules</h2><p>Kies een module om detecties te zien</p></div></div><div id="modules"></div></section></div>' +
    '<section class="panel"><div class="panel-head"><h2>Recente detecties</h2><a class="text-link" href="gebeurtenissen.html">Alle gebeurtenissen ' + icon('arrow') + '</a></div><div id="events"></div></section>') + '</main>';

function metric(glyph, label, value, caption) {
  return '<article class="metric"><span class="tile-icon">' + icon(glyph) + '</span><h2>' + label +
    '</h2><strong>' + escape(value) + '</strong><small>' + escape(caption) + '</small></article>';
}

function moduleName(id) {
  const match = modules?.find((module) => String(module.module_id) === String(id));
  return match?.naam || match?.module_code || 'Module ' + display(id);
}

function empty(message) {
  return '<p class="empty">' + message + '</p>';
}

function unavailable(label) {
  return loading ? label + ' laden…' : label + ' tijdelijk niet beschikbaar.';
}

function renderChart() {
  const chart = byId('chart');
  if (!detections) {
    chart.innerHTML = empty(unavailable('Detecties'));
    return;
  }
  const key = (date) => [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
  const counts = new Map();
  for (const detection of detections) {
    const date = timestamp(detection.detectie_tijdstip);
    if (date) counts.set(key(date), (counts.get(key(date)) || 0) + 1);
  }
  const today = new Date();
  const days = Array.from({ length: range }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - range + 1 + index);
    return { date, count: counts.get(key(date)) || 0 };
  });
  const highest = Math.max(1, ...days.map(({ count }) => count));
  if (!days.some(({ date }) => key(date) === selectedDay)) selectedDay = key(today);
  const selected = days.find(({ date }) => key(date) === selectedDay);
  const label = (date, count) => date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) +
    ' · ' + count + (count === 1 ? ' detectie' : ' detecties');
  const focusedDay = chart.contains(document.activeElement) ? document.activeElement.dataset.day : null;
  chart.innerHTML = '<output class="chart-reading" id="chart-reading">' +
    escape(label(selected.date, selected.count)) + '</output><div class="chart" role="group" aria-label="Kies een dag">' + days.map(({ date, count }) => {
    const title = escape(label(date, count));
    const day = key(date);
    return '<button class="bar-item" type="button" data-day="' + day + '" aria-pressed="' +
      (day === selectedDay) + '" aria-label="' + title + '" title="' + title + '"><span class="bar-track"><span class="bar" style="--height:' +
      (count / highest * 100) + '%"></span></span><small>' +
      (range === 7 ? escape(dayFormat.format(date)) : date.getDate()) + '</small></button>';
  }).join('') + '</div>';
  if (focusedDay) chart.querySelector(`[data-day="${focusedDay}"]`)?.focus({ preventScroll: true });
}

function renderOverview() {
  const last = timestamp(detections?.[0]?.detectie_tijdstip);
  byId('stats').innerHTML = metric('module', 'Actieve modules', formatNumber(modules?.filter(active).length),
    modules ? 'Van ' + number.format(modules.length) + ' geregistreerde modules' : 'Geregistreerde modules') +
    metric('activity', 'Opgehaalde detecties', formatNumber(detections?.length), 'Maximaal 200 recente detecties') +
    metric('clock', 'Laatste detectie', last ? dateFormat.format(last) : '—',
      detections?.length ? moduleName(detections[0].module_id) : 'Meest recente registratie');
  byId('modules').innerHTML = !modules ? empty(unavailable('Modules')) : !modules.length ? empty('Er zijn nog geen modules geregistreerd.') :
    '<ul class="module-list">' + modules.map((module) =>
      '<li><a href="gebeurtenissen.html?module=' + encodeURIComponent(module.module_id) + '"><span class="tile-icon">' + icon('module') + '</span><div><strong>' + escape(moduleName(module.module_id)) +
      '</strong><small>' + escape([module.module_code, module.module_type].filter(Boolean).join(' · ')) +
      '</small></div><span class="pill' + (active(module) ? ' active' : '') + '">' + escape(display(module.status, 'Onbekend')) + '</span><span class="module-arrow">' +
      icon('arrow') + '</span></a></li>').join('') + '</ul>';
  renderChart();
}

function renderEvents() {
  let rows = detections || [];
  if (eventsPage) {
    const query = byId('search').value.trim().toLowerCase();
    const module = selectedModule;
    rows = rows.filter((item) => (!module || String(item.module_id) === module) &&
      [item.detectie_id, item.module_id, moduleName(item.module_id), item.invoerbron, item.model_versie]
        .some((value) => String(value ?? '').toLowerCase().includes(query)));
    if (byId('sort').value === 'old') rows.reverse();
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, pages);
    byId('result').textContent = detections ? rows.length + ' van ' + detections.length + ' detecties · Pagina ' + page + ' van ' + pages : '';
    byId('prev').disabled = page === 1;
    byId('next').disabled = page >= pages;
    rows = rows.slice((page - 1) * pageSize, page * pageSize);
  } else {
    rows = rows.slice(0, 5);
  }

  if (!rows.length) {
    byId('events').innerHTML = empty(!detections ? unavailable('Detecties') :
      detections.length ? 'Geen detecties gevonden met deze filters.' : 'Er zijn nog geen detecties geregistreerd.');
    return;
  }
  byId('events').innerHTML = '<div class="table-scroll"><table><thead><tr><th>Tijdstip</th><th>Module</th><th>Bron</th><th>Betrouwbaarheid</th>' +
    (eventsPage ? '<th>Detectie-ID</th>' : '') + '</tr></thead><tbody>' + rows.map((item) => {
      const date = timestamp(item.detectie_tijdstip);
      const id = display(item.detectie_id);
      return '<tr><td><strong>' + escape(date ? dateFormat.format(date) : '—') + '</strong></td><td>' +
        escape(moduleName(item.module_id)) + '</td><td>' + escape(display(item.invoerbron)) +
        '</td><td><span class="pill confidence">' + escape(score(item.betrouwbaarheidsscore)) + '</span></td>' +
        (eventsPage ? '<td><code title="' + escape(id) + '">' + escape(id.length > 16 ? id.slice(0, 12) + '…' : id) + '</code></td>' : '') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

function syncModuleFilter() {
  const filter = byId('module-filter');
  const ids = new Set([...(modules || []), ...(detections || [])].map((item) => String(item.module_id ?? '')).filter(Boolean));
  if (selectedModule) ids.add(selectedModule);
  filter.replaceChildren(new Option('Alle modules', ''), ...[...ids].map((id) => new Option(moduleName(id), id)));
  filter.value = selectedModule;
}

async function refresh() {
  if (loading) return;
  loading = true;
  byId('refresh').disabled = true;
  byId('refresh').setAttribute('aria-busy', 'true');
  if (!lastUpdated && failures === 0) {
    if (!eventsPage) renderOverview();
    renderEvents();
  }
  const results = await Promise.allSettled([
    getCollection('modules', 'modules'),
    getCollection('detections?limit=200', 'detections'),
  ]);
  const [moduleResult, detectionResult] = results;
  if (moduleResult.status === 'fulfilled') modules = moduleResult.value;
  if (detectionResult.status === 'fulfilled') detections = detectionResult.value;
  failures = results.filter(({ status }) => status === 'rejected').length;
  if (!failures) lastUpdated = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  loading = false;
  const status = byId('connection');
  status.dataset.state = ['online', 'partial', 'offline'][failures];
  status.innerHTML = '<i></i> ' + ['Verbonden', 'Deels verbonden', 'Niet verbonden'][failures];
  const notice = byId('notice');
  const messages = [];
  if (moduleResult.status === 'rejected') messages.push(modules ? 'Modules tonen de laatst ontvangen gegevens.' : 'Modules konden niet worden opgehaald.');
  if (detectionResult.status === 'rejected') messages.push(detections ? 'Detecties tonen de laatst ontvangen gegevens.' : 'Detecties konden niet worden opgehaald.');
  notice.hidden = !failures;
  const noticeText = messages.join(' ');
  if (notice.textContent !== noticeText) notice.textContent = noticeText;
  byId('updated').textContent = lastUpdated ? 'Laatst volledig ververst om ' + lastUpdated : '';
  byId('refresh').disabled = false;
  byId('refresh').removeAttribute('aria-busy');
  if (eventsPage) syncModuleFilter();
  else renderOverview();
  renderEvents();
}

byId('refresh').addEventListener('click', refresh);
if (eventsPage) {
  const filterEvents = () => { page = 1; renderEvents(); };
  byId('search').addEventListener('input', filterEvents);
  byId('module-filter').addEventListener('change', (event) => {
    selectedModule = event.currentTarget.value;
    filterEvents();
  });
  byId('sort').addEventListener('change', filterEvents);
  byId('reset').addEventListener('click', () => {
    byId('search').value = '';
    byId('module-filter').value = '';
    selectedModule = '';
    byId('sort').value = 'new';
    filterEvents();
  });
  byId('prev').addEventListener('click', () => { page -= 1; renderEvents(); });
  byId('next').addEventListener('click', () => { page += 1; renderEvents(); });
} else {
  const chart = byId('chart');
  chart.addEventListener('click', (event) => {
    const day = event.target.closest('[data-day]');
    if (!day) return;
    selectedDay = day.dataset.day;
    for (const button of chart.querySelectorAll('[data-day]')) {
      button.setAttribute('aria-pressed', String(button === day));
    }
    byId('chart-reading').textContent = day.getAttribute('aria-label');
  });
  const periods = document.querySelectorAll('[data-range]');
  for (const button of periods) {
    button.addEventListener('click', () => {
      range = Number(button.dataset.range);
      for (const period of periods) period.setAttribute('aria-pressed', String(period === button));
      renderChart();
    });
  }
}
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 5000);
