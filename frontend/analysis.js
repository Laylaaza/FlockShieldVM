import { getCollection } from './api.js';
import { actionResult, complete, dayKey, distinct, inPeriod, instant, outcomes, reactionTimes } from './performance.js';

const id = (name) => document.getElementById(name);
const filters = id('filters');
const moduleView = document.body.dataset.view === 'modules';
const dateFormat = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
const percentage = new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 3 });
const clean = (value) => String(value ?? '').trim();
const html = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const stamp = (value) => value === null ? '—' : dateFormat.format(value) + ' UTC';
const datasets = {
  modules: ['modules', 'modules', 'module_id'],
  detections: ['detections?limit=1000', 'detections', 'detectie_id'],
  actions: ['actions?limit=1000', 'actions', 'afschrikactie_id'],
  rounds: ['ai/test-rounds', 'test_rounds', 'testronde_id'],
  evaluations: ['ai/evaluations', 'evaluations', 'evaluatie_id'],
};
let data = {};
let page = 1;
let connectedModule = moduleView ? new URLSearchParams(location.search).get('module') || '' : '';
let refreshing = false;
const charts = {};
let missing = [];

function options(name, choices, fallback = '') {
  const select = filters.elements[name];
  const selected = select.value;
  if (select.options.length === choices.length && choices.every(([value, label], index) =>
    select.options[index].value === value && select.options[index].text === label)) return;
  select.replaceChildren(...choices.map(([value, label]) => new Option(label, value)));
  select.value = [...select.options].some((option) => option.value === selected) ? selected : fallback;
}

function metric(title, numerator, denominator, note) {
  const value = denominator ? percentage.format(numerator / denominator) : '—';
  return '<article class="metric"><h2>' + title + '</h2><strong>' + value + '</strong><small>' +
    html(denominator ? numerator + ' van ' + denominator + ' ' + note : note || 'Onvoldoende gegevens') + '</small></article>';
}

function table(headers, rows) {
  return '<div class="table-wrap"><table><thead><tr>' + headers.map((header) => '<th scope="col">' + html(header) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}

function chart(name, config, message, values) {
  charts[name]?.destroy();
  delete charts[name];
  const frame = id(name + '-frame');
  const details = id(name + '-data');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', name === 'scenario' ? 'AI-uitkomsten per scenario' : 'Reactietijd per bevestigde actie in seconden');
  frame.replaceChildren();
  details.hidden = !values;
  details.querySelector('div').innerHTML = values || '';
  if (config && globalThis.Chart) {
    frame.append(canvas);
    charts[name] = new Chart(canvas, config);
  } else {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = config ? 'Grafiek niet geladen. De waarden staan hieronder.' : message;
    frame.append(empty);
  }
}

function renderScenarios(groups, disabledMessage) {
  const labels = [...groups.keys()];
  const types = [
    ['tp', 'Correct gedetecteerd', '#3b7865'],
    ['fp', 'Vals alarm', '#c48b54'],
    ['fn', 'Gemist', '#a3656b'],
    ['tn', 'Correct afwezig', '#88a0ad'],
  ];
  const series = [...groups.values()].map(outcomes);
  const hasData = series.some((entry) => types.some(([key]) => entry[key]));
  chart('scenario', hasData ? {
    type: 'bar',
    data: {
      labels: labels.map((label) => label.length > 23 ? label.slice(0, 22) + '…' : label),
      datasets: types.map(([key, label, backgroundColor]) => ({ label, backgroundColor, data: series.map((row) => row[key]), borderRadius: 3 })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Aantal tests' } } },
      plugins: { legend: { labels: { boxWidth: 9, boxHeight: 9 } }, tooltip: { callbacks: { title: (items) => labels[items[0].dataIndex] } } },
    },
  } : null, disabledMessage || 'Onvoldoende geldige testuitkomsten.', hasData ? table(
    ['Scenario', ...types.map(([, label]) => label)],
    labels.map((label, index) => [html(label), ...types.map(([key]) => series[index][key])]),
  ) : '');
}

function renderReactions(points, blocked) {
  chart('reaction', points.length ? {
    type: 'scatter',
    data: { datasets: [{ label: 'Reactietijd', data: points, backgroundColor: '#3b7865', pointRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { ticks: { maxTicksLimit: 5, callback: (value) => dayKey(value) }, title: { display: true, text: 'Activering (UTC)' } },
        y: { beginAtZero: true, title: { display: true, text: 'Seconden' } },
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ({ raw }) => stamp(raw.x) + ' · ' + decimal.format(raw.y) + ' s' } } },
    },
  } : null, blocked || 'Geen acties met verifieerbare detectie- en activeringstijd.', points.length ? table(
    ['Bevestigde activering', 'Reactietijd'],
    points.map(({ x, y }) => [html(stamp(x)), decimal.format(y) + ' s']),
  ) : '');
}

function renderLog(detections, actions, moduleNames, blocked) {
  const eventType = id('event-type').value;
  const type = (row) => actionResult(row) === 'failed' || clean(row.foutmelding) ? 'error' : 'action';
  const events = [
    ...detections.map((row) => ({ row, type: 'detection', at: instant(row.detectie_tijdstip) })),
    ...actions.map((row) => ({ row, type: type(row), at: instant(row.opdracht_tijdstip) })),
  ].filter((event) => !eventType || event.type === eventType).sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
  const pages = Math.max(1, Math.ceil(events.length / 12));
  page = Math.min(page, pages);
  const labels = { detection: 'Detectie', action: 'Afschrikactie', error: 'Fout' };
  id('events').innerHTML = events.length ? table(
    ['Tijdstip', 'Type', 'Module', 'Bron / uitkomst', 'Betrouwbaarheid', 'Registratie-ID', 'Detectie-ID'],
    events.slice((page - 1) * 12, page * 12).map(({ row, type, at }) => [
      html(stamp(at)), '<span class="badge' + (type === 'error' ? ' error' : '') + '">' + labels[type] + '</span>',
      html(moduleNames.get(String(row.module_id)) || clean(row.module_id) || '—'),
      html(type === 'detection' ? (clean(row.invoerbron) || 'Onbekende bron') : type === 'error'
        ? 'Activeringsfout geregistreerd' : actionResult(row) === 'success' ? 'Bevestigd' : 'Uitkomst onbekend'),
      type === 'detection' && clean(row.betrouwbaarheidsscore) && Number(row.betrouwbaarheidsscore) >= 0 &&
        Number(row.betrouwbaarheidsscore) <= 1 ? percentage.format(Number(row.betrouwbaarheidsscore)) : '—',
      html(clean(row.afschrikactie_id ?? row.detectie_id) || '—'), html(clean(row.detectie_id) || '—'),
    ]),
  ) : '<p class="empty">' + html(blocked || 'Geen gebeurtenissen binnen deze selectie.') + '</p>';
  id('event-count').textContent = events.length + ' gebeurtenissen · pagina ' + page + ' van ' + pages;
  id('prev').disabled = page === 1;
  id('next').disabled = page >= pages;
}

function renderModule() {
  const modules = new Map((data.modules || []).filter((row) => row.module_id != null).map((row) => [String(row.module_id), row]));
  const names = new Map([...modules].map(([key, row]) => [key, row.naam || row.module_code || 'Module ' + key]));
  options('module', [['', 'Kies een module'], ...names], connectedModule);
  const select = filters.elements.module;
  if (!select.dataset.ready && data.modules) {
    if (modules.has(connectedModule)) select.value = connectedModule;
    select.dataset.ready = 'true';
  }
  const module = modules.get(connectedModule);
  id('disconnect').hidden = !connectedModule;
  const pending = select.value;
  id('connect').disabled = refreshing || !pending || pending === connectedModule;
  id('module-detail').hidden = !module;
  const notices = datasetNotices();
  if (!modules.size && data.modules) notices.push('Er zijn nog geen modules geregistreerd.');
  else if (connectedModule && data.modules && !module) notices.push('Deze module is niet beschikbaar. Kies een andere module.');
  showNotices(notices);
  if (!module) return;

  id('module-name').textContent = names.get(connectedModule);
  id('module-status').textContent = clean(module.status) ? 'Geregistreerd: ' + clean(module.status) : 'Status onbekend';
  id('module-status').dataset.active = String(['actief', 'active'].includes(clean(module.status).toLowerCase()));
  id('module-meta').textContent = [module.module_code, module.module_type].filter(Boolean).join(' · ');
  const belongs = (row) => String(row.module_id) === connectedModule;
  const detections = (data.detections || []).filter(belongs);
  const actions = (data.actions || []).filter(belongs);
  const action = actions[0];
  const detection = detections[0];
  const result = action ? actionResult(action) : '';
  id('mechanism').textContent = action ? clean(action.mechanisme_type) || 'Onbekend mechanisme' : data.actions ? 'Geen actie' : '—';
  id('action-time').textContent = action ? 'Opdracht · ' + stamp(instant(action.opdracht_tijdstip)) : '';
  id('activation').textContent = ({ success: 'Bevestigd', failed: 'Mislukt', unknown: 'Niet bevestigd' })[result] || '—';
  id('activation').dataset.result = result;
  const confirmed = action ? instant(action.activering_bevestigd_op) : null;
  id('activation-time').textContent = result === 'success' ? stamp(confirmed) :
    result === 'failed' ? 'Activering is als mislukt geregistreerd.' :
    result === 'unknown' ? 'Er is geen betrouwbare bevestiging.' : '';
  id('latest-detection').textContent = detection ? stamp(instant(detection.detectie_tijdstip)) : data.detections ? 'Geen detectie' : '—';
  id('detection-source').textContent = detection ? clean(detection.invoerbron) : '';
  renderLog(detections, actions, names, !data.detections && !data.actions ? 'Gebeurtenisgegevens konden niet worden opgehaald.' : '');
}

function datasetNotices() {
  const notices = [];
  if (missing.length) notices.push((moduleView ? 'Niet ververst: ' : 'Niet geladen: ') + missing.join(', ') + '.');
  if ((data.detections?.length ?? 0) >= 1000 || (data.actions?.length ?? 0) >= 1000) {
    notices.push('De API levert maximaal 1.000 recente detecties en 1.000 recente acties.');
  }
  return notices;
}

function showNotices(notices) {
  id('notice').textContent = notices.join(' ');
  id('notice').hidden = !notices.length;
}

function renderInsights() {
  const rounds = new Map((data.rounds || []).map((row) => [String(row.testronde_id), row]));
  const sources = [...new Set([...rounds.values()].map((row) => clean(row.gegevensbron)).filter(Boolean))].sort();
  options('source', sources.length ? sources.map((source) => [source, source]) : [['', 'Geen bron beschikbaar']], sources[0]);
  const form = Object.fromEntries(new FormData(filters));
  const evaluations = (data.evaluations || []).flatMap((row) => {
    const round = rounds.get(String(row.testronde_id));
    if (!form.source || !round || clean(round.gegevensbron) !== form.source) return [];
    const title = (clean(round.naam) || 'Testronde') + ' (#' + row.testronde_id + ') / ' +
      (clean(row.testomstandigheid) || ('Testitem ' + (clean(row.test_item_id) || 'onbekend')));
    return [{ row, title, round }];
  });
  const scenarios = [...new Set(evaluations.map(({ title }) => title))].sort();
  options('scenario', [['', 'Alle scenario’s'], ...scenarios.map((title) => [title, title])]);
  form.scenario = filters.elements.scenario.value;
  const invalidPeriod = Boolean(form.to && form.from && form.to < form.from);
  const invalidMessage = invalidPeriod ? 'De einddatum ligt vóór de begindatum.' : '';
  const detections = invalidPeriod ? [] : (data.detections || []).filter((row) => inPeriod(instant(row.detectie_tijdstip), form));
  const actions = invalidPeriod ? [] : (data.actions || []).filter((row) => inPeriod(instant(row.opdracht_tijdstip), form));
  const matching = invalidPeriod ? [] : evaluations.filter(({ title, round }) =>
    (!form.scenario || title === form.scenario) && inPeriod(instant(round.uitgevoerd_op), form));
  const total = outcomes(matching.map(({ row }) => row));
  const successful = actions.filter((row) => actionResult(row) === 'success').length;
  const failed = actions.filter((row) => actionResult(row) === 'failed').length;
  const full = detections.filter((row) => complete(row, 'detection')).length + actions.filter((row) => complete(row, 'action')).length;
  const sufficientLog = data.detections && data.actions;
  id('metrics').innerHTML =
    metric('Precision', total.tp, total.tp + total.fp, total.tp + total.fp ? 'positieve voorspellingen correct' : invalidMessage || 'Geen geldige positieve voorspellingen') +
    metric('Recall', total.tp, total.tp + total.fn, total.tp + total.fn ? 'tests met vogels correct herkend' : invalidMessage || 'Geen geldige tests met vogels aanwezig') +
    metric('Succesvolle activeringen', successful, successful + failed, successful + failed ? 'acties met bekende uitkomst bevestigd' : invalidMessage || 'Geen acties met bekende uitkomst') +
    metric('Datavolledigheid', full, sufficientLog ? detections.length + actions.length : 0, sufficientLog && detections.length + actions.length
      ? 'gebeurtenissen met verplichte kernvelden' : invalidMessage || 'Detecties en acties nodig voor deze KPI');
  const groups = new Map();
  for (const { row, title } of matching) {
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(row);
  }
  id('scenario-caption').textContent = (form.source ? form.source + ' · ' : '') + matching.length +
    ' evaluaties op datum van de testronde' + (total.invalid ? ' · ' + total.invalid + ' ongeldige uitkomsten overgeslagen' : '');
  renderScenarios(groups, invalidMessage);
  renderReactions(reactionTimes(actions, data.detections || []), invalidMessage);
  const notices = datasetNotices();
  if (invalidMessage) notices.push(invalidMessage);
  showNotices(notices);
}

const render = moduleView ? renderModule : renderInsights;

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  const selected = connectedModule;
  id('refresh').disabled = true;
  if (moduleView) id('connect').disabled = true;
  else id('sync').textContent = 'Gegevens laden…';
  const keys = moduleView ? (selected ? ['modules', 'detections', 'actions'] : ['modules']) : ['detections', 'actions', 'rounds', 'evaluations'];
  const entries = keys.map((key) => [key, datasets[key]]);
  const results = await Promise.allSettled(entries.map(([key, [path, collection]]) => {
    const url = moduleView && key !== 'modules' ? collection + '?limit=30&module_id=' + encodeURIComponent(selected) : path;
    return getCollection(url, collection);
  }));
  refreshing = false;
  id('refresh').disabled = false;
  if (selected !== connectedModule) {
    refresh();
    return;
  }
  if (!moduleView) data = {};
  missing = [];
  const names = { modules: 'modules', detections: 'detecties', actions: 'afschrikacties', rounds: 'testrondes', evaluations: 'AI-evaluaties' };
  results.forEach((result, index) => {
    const [key, [, , uniqueId]] = entries[index];
    if (result.status === 'fulfilled') data[key] = distinct(result.value, uniqueId);
    else missing.push(names[key]);
  });
  id('sync').textContent = missing.length ? 'Verbinding onvolledig' : moduleView && !selected
    ? 'Kies een module om te beginnen' : 'Bijgewerkt om ' + new Date().toLocaleTimeString('nl-NL');
  render();
}

filters.addEventListener('change', () => { page = 1; render(); });
filters.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!moduleView || !filters.elements.module.value) return;
  connectedModule = filters.elements.module.value;
  delete data.actions;
  delete data.detections;
  missing = [];
  page = 1;
  id('event-type').value = '';
  id('sync').textContent = 'Verbinden…';
  refresh();
  render();
});
filters.addEventListener('reset', () => setTimeout(() => { page = 1; render(); }, 0));
if (moduleView) {
  id('disconnect').addEventListener('click', () => {
    connectedModule = '';
    filters.elements.module.value = '';
    delete data.actions;
    delete data.detections;
    missing = [];
    id('sync').textContent = 'Live verbinding gestopt';
    render();
  });
  setInterval(() => { if (connectedModule && !document.hidden) refresh(); }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (connectedModule && !document.hidden) refresh();
  });
  id('event-type').addEventListener('change', () => { page = 1; render(); });
  id('prev').addEventListener('click', () => { page--; render(); });
  id('next').addEventListener('click', () => { page++; render(); });
}
id('refresh').addEventListener('click', refresh);
refresh();
