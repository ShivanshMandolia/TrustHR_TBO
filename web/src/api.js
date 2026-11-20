export async function call(path, body) {
  const r = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}
