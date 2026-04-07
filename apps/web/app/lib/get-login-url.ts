const DEV_FALLBACK = 'http://localhost:3001'

function resolveApiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (url) return url
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_API_URL must be set in production')
  }
  return DEV_FALLBACK
}

export function getLoginUrl(): string {
  return `${resolveApiBase()}/auth/github`
}

export function getApiBase(): string {
  return resolveApiBase()
}
