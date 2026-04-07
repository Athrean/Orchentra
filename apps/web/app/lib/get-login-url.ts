const LOGIN_URL_FALLBACK = 'http://localhost:3001'

export function getLoginUrl(): string {
  return `${process.env.NEXT_PUBLIC_API_URL || LOGIN_URL_FALLBACK}/auth/github`
}

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || LOGIN_URL_FALLBACK
}
