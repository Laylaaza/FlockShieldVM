export function instant(value) {
  if (!value || typeof value !== 'string') return null;
  const date = value.replace(' ', 'T');
  const time = Date.parse(/T[\d:.]+$/.test(date) ? date + 'Z' : date);
  return Number.isFinite(time) ? time : null;
}

export function dayKey(time) {
  return time === null ? '' : new Date(time).toISOString().slice(0, 10);
}

export function inPeriod(time, { from, to }) {
  if (!from && !to) return true;
  const day = dayKey(time);
  return Boolean(day && (!from || day >= from) && (!to || day <= to));
}

export function distinct(rows, key) {
  const seen = new Set();
  return rows.filter((row) => {
    const id = row[key] == null ? '' : String(row[key]).trim().toLowerCase();
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function binary(value) {
  if ([true, 1, '1', 'true'].includes(value)) return true;
  if ([false, 0, '0', 'false'].includes(value)) return false;
  return null;
}

export function outcomes(evaluations) {
  const totals = { tp: 0, fp: 0, fn: 0, tn: 0, invalid: 0 };
  for (const row of evaluations) {
    const actual = binary(row.vogels_werkelijk_aanwezig);
    const predicted = binary(row.vogels_gedetecteerd);
    if (actual === null || predicted === null) totals.invalid++;
    else if (actual) totals[predicted ? 'tp' : 'fn']++;
    else totals[predicted ? 'fp' : 'tn']++;
  }
  return totals;
}

export function actionResult(row) {
  const status = String(row.status ?? '').trim().toLowerCase();
  const failed = Boolean(String(row.foutmelding ?? '').trim()) ||
    ['failed', 'failure', 'error', 'mislukt', 'fout'].includes(status);
  const ordered = instant(row.opdracht_tijdstip);
  const confirmed = instant(row.activering_bevestigd_op);
  if (failed && confirmed !== null) return 'unknown';
  if (failed) return 'failed';
  if (ordered !== null && confirmed !== null && confirmed >= ordered) return 'success';
  return 'unknown';
}

export function reactionTimes(actions, detections) {
  const detectedAt = new Map(detections.filter((row) => row.detectie_id)
    .map((row) => [String(row.detectie_id).toLowerCase(), instant(row.detectie_tijdstip)]));
  return actions.flatMap((row) => {
    const start = detectedAt.get(String(row.detectie_id).toLowerCase());
    const end = instant(row.activering_bevestigd_op);
    const order = instant(row.opdracht_tijdstip);
    if (actionResult(row) !== 'success' || start == null || order < start || end < start) return [];
    return [{ x: end, y: (end - start) / 1000 }];
  }).sort((left, right) => left.x - right.x);
}

export function complete(row, kind) {
  const present = (value) => value != null && String(value).trim() !== '';
  const core = kind === 'detection'
    ? present(row.detectie_id) && present(row.invoerbron) && instant(row.detectie_tijdstip) !== null
    : present(row.afschrikactie_id) && present(row.mechanisme_type) && present(row.status) && instant(row.opdracht_tijdstip) !== null;
  return core && /^\d+$/.test(String(row.module_id)) && Number(row.module_id) > 0;
}
