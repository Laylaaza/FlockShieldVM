export async function getCollection(path, key) {
  const response = await fetch('/api/' + path, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  if (!Array.isArray(data[key])) throw new Error('Ongeldig API-antwoord');
  return data[key];
}
