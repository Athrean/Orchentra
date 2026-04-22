const MCP_PREFIX = 'mcp__'
const CLAUDE_AI_SERVER_PREFIX = 'claude.ai '

export function normalizeNameForMcp(name: string): string {
  let normalized = ''
  for (const ch of name) {
    if (/[A-Za-z0-9_-]/.test(ch)) {
      normalized += ch
    } else {
      normalized += '_'
    }
  }
  if (name.startsWith(CLAUDE_AI_SERVER_PREFIX)) {
    normalized = collapseUnderscores(normalized).replace(/^_+|_+$/g, '')
  }
  return normalized
}

export function mcpToolPrefix(serverName: string): string {
  return `${MCP_PREFIX}${normalizeNameForMcp(serverName)}__`
}

export function mcpToolName(serverName: string, toolName: string): string {
  return `${mcpToolPrefix(serverName)}${normalizeNameForMcp(toolName)}`
}

export function isMcpToolName(value: string): boolean {
  return value.startsWith(MCP_PREFIX) && value.split('__').length >= 3
}

function collapseUnderscores(value: string): string {
  let out = ''
  let prevWasUnderscore = false
  for (const ch of value) {
    if (ch === '_') {
      if (!prevWasUnderscore) out += ch
      prevWasUnderscore = true
    } else {
      out += ch
      prevWasUnderscore = false
    }
  }
  return out
}
