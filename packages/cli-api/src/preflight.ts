interface PreflightResult {
  valid: boolean
  error?: string
}

export function validateApiKey(apiKey?: string): PreflightResult {
  if (!apiKey) {
    const envKey =
      process.env['ANTHROPIC_API_KEY'] ?? process.env['ANTHROPIC_AUTH_TOKEN'] ?? process.env['CLAUDE_CODE_OAUTH_TOKEN']
    if (!envKey) {
      return {
        valid: false,
        error: 'ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or CLAUDE_CODE_OAUTH_TOKEN must be set',
      }
    }
  }
  return { valid: true }
}
