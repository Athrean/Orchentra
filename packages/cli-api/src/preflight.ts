export interface PreflightResult {
  valid: boolean
  error?: string
}

export function validateApiKey(apiKey?: string): PreflightResult {
  if (!apiKey) {
    const envKey = process.env['ANTHROPIC_API_KEY'] ?? process.env['ANTHROPIC_AUTH_TOKEN']
    if (!envKey) {
      return { valid: false, error: 'ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN must be set' }
    }
  }
  return { valid: true }
}
