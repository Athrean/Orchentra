const API_BASE = 'http://localhost:3001'

export async function api<T>(path: string, init?: globalThis.RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
  })

  if (res.status === 401) {
    window.location.href = '/'
    throw new Error('Not authenticated')
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }

  return res.json()
}
