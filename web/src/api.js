const BASE = import.meta.env.VITE_API_URL || ''

export async function call(path, body) {
  const r = await fetch(BASE + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}
