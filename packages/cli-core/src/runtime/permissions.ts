export type PermissionMode = 'read-only' | 'prompt-on-write' | 'danger-full-access'

export type ToolLevel = 'read' | 'write' | 'admin'

export interface PermissionDecision {
  allowed: boolean
  requiresConfirmation: boolean
  reason?: string
}

export function decide(mode: PermissionMode, level: ToolLevel): PermissionDecision {
  if (mode === 'danger-full-access') {
    return { allowed: true, requiresConfirmation: false }
  }
  if (mode === 'read-only') {
    if (level === 'read') {
      return { allowed: true, requiresConfirmation: false }
    }
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `blocked: session is read-only, tool requires ${level}`,
    }
  }
  // prompt-on-write
  if (level === 'read') {
    return { allowed: true, requiresConfirmation: false }
  }
  if (level === 'admin') {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'blocked: admin tools disabled outside danger-full-access',
    }
  }
  return { allowed: true, requiresConfirmation: true }
}

export function isPermissionMode(value: string): value is PermissionMode {
  return value === 'read-only' || value === 'prompt-on-write' || value === 'danger-full-access'
}
