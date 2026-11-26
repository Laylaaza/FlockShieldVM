import { getCollection } from './api.js';
import { actionResult, complete, dayKey, distinct, inPeriod, instant, outcomes, reactionTimes } from './performance.js';

const id = (name) => document.getElementById(name);
const filters = id('filters');
const moduleView = document.body.dataset.view === 'modules';
const dateFormat = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
const percentage = new Intl.NumberFormat('nl-NL', { style: 'percent', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 3 });
const countFormat = new Intl.NumberFormat('nl-NL');
const shortDate = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
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
let logMarkup;
let connectedModule = moduleView ? new URLSearchParams(location.search).get('module') || '' : '';
let refreshing = false;
const charts = {};
let missing = [];
let selectedChart = 'activity';

const explanations = {
  live: ['Live module', 'Kies een module en klik op Verbinden. In een actieve tab haalt dit scherm iedere vijf seconden de laatste gegevens op. De status komt uit de database. De module stuurt geen apart signaal waarmee dit scherm kan controleren of het apparaat online is.'],
  activation: ['Activering', 'Bevestigd betekent dat de module de activering van het mechanisme heeft bevestigd. Mislukt betekent dat een fout is geregistreerd. Zonder betrouwbare bevestiging blijft de uitkomst onbevestigd. De database meet niet of vogels daarna zijn weggegaan.'],
  precision: ['Precision', 'Hoe vaak had het model gelijk toen het vogels meldde? Correcte meldingen gedeeld door alle positieve voorspellingen, inclusief valse alarmen.'],
  recall: ['Recall', 'Hoe vaak vond het model de vogels die werkelijk aanwezig waren? Correcte meldingen gedeeld door alle tests waarin vogels aanwezig waren, inclusief gemiste detecties.'],
  successful: ['Succesvolle activeringen', 'Bevestigde activeringen gedeeld door acties met een bekende uitkomst. Acties zonder betrouwbare bevestiging of fout tellen niet mee.'],
  completeness: ['Datavolledigheid', 'Aandeel opgehaalde detecties en afschrikacties met alle verplichte kernvelden voor het logboek. Een betrouwbaarheidsscore is optioneel.'],
  activity: ['Activiteit per dag', 'Vergelijk het aantal detecties en afschrikopdrachten per UTC-dag. De grafiek toont maximaal 31 dagen tot de gekozen einddatum of de laatste registratie. Een dag met nul registraties betekent dat er in de opgehaalde gegevens niets voor die dag staat.'],
  'activation-chart': ['Uitkomst van afschrikacties', 'De ring vergelijkt bevestigde, mislukte en onbevestigde acties. De grafiek telt alle opgehaalde acties in de gekozen periode. Het activeringspercentage bovenaan gebruikt alleen acties met een bekende uitkomst.'],
  modules: ['Vergelijk modules', 'Vergelijk hoeveel detecties en afschrikopdrachten per module zijn opgehaald. De grafiek toont maximaal twaalf modules met de meeste registraties. De tabel toont ook modules zonder registraties in deze selectie.'],
  scenario: ['AI-uitkomsten per scenario', 'Elke balk groepeert de uitkomsten van één scenario in een testronde. De lengte toont het aantal tests. Wissel van gegevensbron onder Filters om simulaties en prototypetests afzonderlijk te bekijken.'],
  reaction: ['Reactietijd', 'Elk punt is een bevestigde actie met een gekoppelde detectie. De hoogte toont hoeveel seconden er verstreken tussen de detectie en bevestiging. De stippellijn toont de mediaan. Beweeg over een punt of open Bekijk waarden voor het exacte tijdstip.'],
};

const help = document.createElement('dialog');
help.className = 'info-dialog';
help.setAttribute('aria-labelledby', 'info-title');
help.innerHTML = '<h2 id="info-title"></h2><p id="info-text"></p><form method="dialog"><button class="button" autofocus>Sluiten</button></form>';
document.body.append(help);
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-info]');
  const explanation = explanations[trigger?.dataset.info];
  if (!explanation) return;
  id('info-title').textContent = explanation[0];
  id('info-text').textContent = explanation[1];
  help.showModal();
});

function options(name, choices, fallback = '') {
  const select = filters.elements[name];
  const selected = select.value;
  if (select.options.length === choices.length && choices.every(([value, label], index) =>
    select.options[index].value === value && select.options[index].text === label)) return;
  select.replaceChildren(...choices.map(([value, label]) => new Option(label, value)));
  select.value = [...select.options].some((option) => option.value === selected) ? selected : fallback;
}

function metric(key, title, numerator, denominator, note) {
  const value = denominator ? percentage.format(numerator / denominator) : '—';
  return '<article class="metric"><div class="label-row"><h2>' + title +
    '</h2><button class="info" type="button" data-info="' + key + '" aria-label="Uitleg over ' + title + '">i</button></div><strong>' + value + '</strong><small>' +
    html(denominator ? numerator + ' van ' + denominator + ' ' + note : note || 'Onvoldoende gegevens') + '</small></article>';
}

function table(headers, rows) {
  return '<div class="table-wrap"><table><thead><tr>' + headers.map((header) => '<th scope="col">' + html(header) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}

function chart(name, config, message, values, height = 250) {
  charts[name]?.destroy();
  delete charts[name];
  const frame = id(name + '-frame');
  const details = id(name + '-data');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', frame.closest('section').querySelector('h2').textContent);
  frame.replaceChildren();
  frame.style.setProperty('--plot-height', height + 'px');
  details.hidden = !values;
  details.querySelector('div').innerHTML = values || '';
  if (config && globalThis.Chart) {
    const plot = document.createElement('div');
    plot.className = 'chart-plot';
    plot.append(canvas);
    frame.append(plot);
    charts[name] = new Chart(canvas, config);
  } else {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = config ? 'Grafiek niet geladen. De waarden staan hieronder.' : message;
    frame.append(empty);
  }
}

const seriesStyle = { detection: '#3b7865', action: '#7387a0', failed: '#bd7664', unknown: '#c3b48a' };
const legend = { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14 } };
const plotOptions = { responsive: true, maintainAspectRatio: false, animation: false };
const countScale = { beginAtZero: true, ticks: { precision: 0 } };

function renderActivity(detections, actions, period, message) {
  const interval = 86400000;
  const counts = (rows, field) => {
    const result = new Map();
    for (const row of rows || []) {
      const key = dayKey(instant(row[field]));
      if (key) result.set(key, (result.get(key) || 0) + 1);
    }
    return result;
  };
  const detectionDays = counts(detections, 'detectie_tijdstip');
  const actionDays = counts(actions, 'opdracht_tijdstip');
  const observed = [...detectionDays.keys(), ...actionDays.keys()].sort();
  const hasData = observed.length > 0;
  const first = Date.parse(period.from || observed[0]);
  const last = Date.parse(period.to || observed.at(-1));
  const windowStart = Math.max(first, last - 30 * interval);
  const days = hasData ? Array.from({ length: (last - windowStart) / interval + 1 }, (_, i) => windowStart + i * interval) : [];
  const plotted = days.map((time) => [detectionDays.get(dayKey(time)) || 0, actionDays.get(dayKey(time)) || 0]);
  const totals = [0, 1].map((index) => plotted.reduce((sum, counts) => sum + counts[index], 0));
  const datasets = [
    [detections, 'Detecties', seriesStyle.detection, 0],
    [actions, 'Afschrikopdrachten', seriesStyle.action, 1],
  ].filter(([rows]) => rows !== undefined).map(([, label, color, index]) => ({
    label, data: plotted.map((row) => row[index]), borderColor: color, backgroundColor: color,
    pointRadius: 3, pointHoverRadius: 5, borderWidth: 2,
  }));
  id('activity-caption').textContent = days.length ? [
    detections && countFormat.format(totals[0]) + ' detecties',
    actions && countFormat.format(totals[1]) + ' opdrachten',
    shortDate.format(days[0]) + ' – ' + shortDate.format(days.at(-1)) + ' (UTC)',
  ].filter(Boolean).join(' · ') : 'Detecties en opdrachten per UTC-dag';
  chart('activity', days.length ? {
    type: 'line',
    data: { labels: days.map((time) => shortDate.format(time)), datasets },
    options: {
      ...plotOptions, interaction: { mode: 'index', intersect: false },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: countScale },
      plugins: { legend },
    },
  } : null, message || 'Geen registraties met een datum in deze selectie.', days.length ? table(
    ['Datum (UTC)', 'Detecties', 'Afschrikopdrachten'],
    days.map((time, index) => [dayKey(time), detections ? plotted[index][0] : '—', actions ? plotted[index][1] : '—']),
  ) : '', 310);
}

function renderActivations(actions, successful, failed, message) {
  const total = actions?.length || 0;
  const counts = [successful, failed, total - successful - failed];
  const labels = ['Bevestigd', 'Mislukt', 'Onbevestigd'];
  id('activation-caption').textContent = total
    ? labels.map((label, index) => countFormat.format(counts[index]) + ' ' + label.toLowerCase()).join(' · ')
    : 'Verdeling van de geregistreerde uitkomsten';
  chart('activation', total ? {
    type: 'doughnut',
    data: { labels, datasets: [{ data: counts, backgroundColor: [seriesStyle.detection, seriesStyle.failed, seriesStyle.unknown], borderWidth: 2, hoverOffset: 5 }] },
    options: { ...plotOptions, cutout: '70%', plugins: { legend } },
  } : null, message || 'Geen afschrikacties in deze selectie.', total ? table(['Uitkomst', 'Aantal', 'Aandeel'],
    labels.map((label, index) => [label, counts[index], percentage.format(counts[index] / total)]),
  ) : '', 310);
}

function renderModuleComparison(detections, actions, message) {
  const rows = new Map();
  const item = (key) => {
    if (!rows.has(key)) rows.set(key, { name: key ? 'Module ' + key : 'Onbekende module', detections: 0, actions: 0 });
    return rows.get(key);
  };
  for (const module of data.modules || []) {
    item(clean(module.module_id)).name = clean(module.naam) || clean(module.module_code) || 'Module ' + module.module_id;
  }
  for (const row of detections || []) item(clean(row.module_id)).detections++;
  for (const row of actions || []) item(clean(row.module_id)).actions++;
  const ordered = [...rows.values()].sort((a, b) => b.detections + b.actions - a.detections - a.actions || a.name.localeCompare(b.name, 'nl'));
  const plotted = ordered.filter((row) => row.detections || row.actions).slice(0, 12);
  id('modules-caption').textContent = plotted.length ? 'Aantal registraties per module · ' + plotted.length + ' in de grafiek' : 'Detecties en afschrikopdrachten per module';
  const datasets = [
    [detections, 'Detecties', 'detections', seriesStyle.detection],
    [actions, 'Afschrikopdrachten', 'actions', seriesStyle.action],
  ].filter(([records]) => records !== undefined).map(([, label, key, backgroundColor]) => ({
    label, backgroundColor, data: plotted.map((row) => row[key]), borderRadius: 4, maxBarThickness: 14,
  }));
  chart('modules', plotted.length ? {
    type: 'bar',
    data: { labels: plotted.map(({ name }) => name.length > 24 ? name.slice(0, 23) + '…' : name), datasets },
    options: {
      ...plotOptions, indexAxis: 'y',
      scales: { x: countScale, y: { grid: { display: false }, ticks: { autoSkip: false } } },
      plugins: { legend, tooltip: { callbacks: { title: (items) => plotted[items[0].dataIndex].name } } },
    },
  } : null, message || 'Geen registraties per module in deze selectie.', !message && ordered.length ? table(
    ['Module', 'Detecties', 'Afschrikopdrachten'],
    ordered.map((row) => [html(row.name), detections ? row.detections : '—', actions ? row.actions : '—']),
  ) : '', Math.max(260, 70 + plotted.length * 32));
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
      labels: labels.map((label) => {
        const [round, ...scenario] = label.split(' / ');
        const shorten = (part) => part.length > 22 ? part.slice(0, 21) + '…' : part;
        return [shorten(scenario.join(' / ')), shorten(round)];
      }),
      datasets: types.map(([key, label, backgroundColor]) => ({ label, backgroundColor, data: series.map((row) => row[key]), borderRadius: 3, maxBarThickness: 24 })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      indexAxis: 'y',
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Aantal tests' } }, y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => labels[items[0].dataIndex] } } },
    },
  } : null, disabledMessage || 'Onvoldoende geldige testuitkomsten.', hasData ? table(
    ['Scenario', ...types.map(([, label]) => label)],
    labels.map((label, index) => [html(label), ...types.map(([key]) => series[index][key])]),
  ) : '', Math.max(230, 85 + labels.length * 42));
  id('scenario-legend').hidden = !hasData;
}

function renderReactions(points, blocked) {
  const durations = points.map(({ y }) => y).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median = durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2;
  id('reaction-caption').textContent = points.length
    ? points.length + (points.length === 1 ? ' bevestigde actie' : ' bevestigde acties') + ' · Mediaan ' + decimal.format(median) + ' s'
    : 'Van detectie tot bevestigde activering';
  const indexed = points.map(({ x, y }, index) => ({ x: index + 1, y, time: x }));
  chart('reaction', points.length ? {
    type: 'scatter',
    data: { datasets: [
      { label: 'Reactietijd', data: indexed, backgroundColor: '#3b7865', pointRadius: 4, pointHitRadius: 8 },
      { label: 'Mediaan', type: 'line', data: [{ x: 0.5, y: median }, { x: points.length + 0.5, y: median }], borderColor: '#647885', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { min: 0.5, max: points.length + 0.5, ticks: { precision: 0, maxTicksLimit: 7, callback: (value) => Number.isInteger(value) ? value : '' }, title: { display: true, text: 'Acties in tijdsvolgorde' } },
        y: { beginAtZero: true, title: { display: true, text: 'Seconden' } },
      },
      plugins: { legend: { display: false }, tooltip: { filter: (item) => item.datasetIndex === 0, callbacks: { label: ({ raw }) => stamp(raw.time) + ' · ' + decimal.format(raw.y) + ' s' } } },
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
  const markup = events.length ? table(
    ['Tijdstip (UTC)', 'Gebeurtenis', 'Uitkomst / bron', 'Details'],
    events.slice((page - 1) * 12, page * 12).map(({ row, type, at }) => [
      at === null ? '—' : html(dateFormat.format(at)), '<span class="badge' + (type === 'error' ? ' error' : '') + '">' + labels[type] + '</span>' +
        (type !== 'detection' && clean(row.mechanisme_type) ? '<small class="event-mechanism">' + html(row.mechanisme_type) + '</small>' : ''),
      html(type === 'detection' ? (clean(row.invoerbron) || 'Onbekende bron') : type === 'error'
        ? 'Activeringsfout geregistreerd' : actionResult(row) === 'success' ? 'Bevestigd' : 'Uitkomst onbekend'),
      '<details class="event-details"><summary>Gegevens</summary><dl><dt>Module</dt><dd>' +
        html(moduleNames.get(String(row.module_id)) || clean(row.module_id) || '—') +
        '</dd><dt>Registratie-ID</dt><dd>' + html(clean(row.afschrikactie_id ?? row.detectie_id) || '—') +
        '</dd><dt>Detectie-ID</dt><dd>' + html(clean(row.detectie_id) || '—') +
        '</dd><dt>Betrouwbaarheid</dt><dd>' + (type === 'detection' && clean(row.betrouwbaarheidsscore) &&
        Number(row.betrouwbaarheidsscore) >= 0 && Number(row.betrouwbaarheidsscore) <= 1
          ? percentage.format(Number(row.betrouwbaarheidsscore)) : '—') + '</dd></dl></details>',
    ]),
  ) : '<p class="empty">' + html(blocked || 'Geen gebeurtenissen binnen deze selectie.') + '</p>';
  if (logMarkup !== markup) {
    id('events').innerHTML = markup;
    logMarkup = markup;
  }
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
    metric('precision', 'Precision', total.tp, total.tp + total.fp, total.tp + total.fp ? 'vogelmeldingen correct' : invalidMessage || 'Geen geldige positieve voorspellingen') +
    metric('recall', 'Recall', total.tp, total.tp + total.fn, total.tp + total.fn ? 'tests met vogels correct herkend' : invalidMessage || 'Geen geldige tests met vogels aanwezig') +
    metric('successful', 'Succesvolle activeringen', successful, successful + failed, successful + failed ? 'acties met bekende uitkomst bevestigd' : invalidMessage || 'Geen acties met bekende uitkomst') +
    metric('completeness', 'Datavolledigheid', full, sufficientLog ? detections.length + actions.length : 0, sufficientLog && detections.length + actions.length
      ? 'gebeurtenissen met verplichte kernvelden' : invalidMessage || 'Detecties en acties nodig voor deze KPI');
  const groups = new Map();
  for (const { row, title } of matching) {
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(row);
  }
  id('scenario-caption').textContent = (form.source ? form.source + ' · ' : '') + matching.length +
    ' evaluaties op datum van de testronde' + (total.invalid ? ' · ' + total.invalid + ' ongeldige uitkomsten overgeslagen' : '');
  const operationalMessage = invalidMessage || (!data.actions && !data.detections ? 'De detecties en acties konden niet worden opgehaald.' : '');
  switch (selectedChart) {
    case 'activity':
      renderActivity(data.detections && detections, data.actions && actions, form, operationalMessage);
      break;
    case 'activation':
      renderActivations(data.actions && actions, successful, failed, invalidMessage || (!data.actions ? 'De acties konden niet worden opgehaald.' : ''));
      break;
    case 'modules':
      renderModuleComparison(data.detections && detections, data.actions && actions, operationalMessage);
      break;
    case 'scenario':
      renderScenarios(groups, invalidMessage || (!data.rounds || !data.evaluations ? 'De testgegevens konden niet worden opgehaald.' : ''));
      break;
    case 'reaction':
      renderReactions(reactionTimes(actions, data.detections || []), invalidMessage ||
        (!data.actions || !data.detections ? 'De detecties of acties konden niet worden opgehaald.' : ''));
      break;
  }
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
  const keys = moduleView ? (selected ? ['modules', 'detections', 'actions'] : ['modules']) : ['modules', 'detections', 'actions', 'rounds', 'evaluations'];
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
} else {
  const controls = document.querySelectorAll('[data-chart]');
  const panels = document.querySelectorAll('[data-chart-panel]');
  for (const button of controls) {
    button.addEventListener('click', () => {
      if (button.dataset.chart === selectedChart) return;
      charts[selectedChart]?.destroy();
      delete charts[selectedChart];
      selectedChart = button.dataset.chart;
      for (const control of controls) control.setAttribute('aria-pressed', String(control === button));
      for (const panel of panels) panel.hidden = panel.dataset.chartPanel !== selectedChart;
      render();
    });
  }
}
id('refresh').addEventListener('click', refresh);
refresh();
