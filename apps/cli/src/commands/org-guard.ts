const ENV_VAR = 'ORCHENTRA_ALLOWED_ORGS'

export class OrgNotAllowedError extends Error {
  constructor(owner: string, allowed: readonly string[]) {
    super(
      `Organization "${owner}" is not in ${ENV_VAR} (allowed: ${allowed.join(', ') || '<empty>'}). ` +
        `Refusing to cross-org boundary.`,
    )
    this.name = 'OrgNotAllowedError'
  }
}

export function assertOrgAllowed(owner: string, env: NodeJS.ProcessEnv = process.env): void {
  const raw = env[ENV_VAR]
  if (!raw || raw.trim().length === 0) return

  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (allowed.length === 0) return
  if (!allowed.includes(owner)) {
    throw new OrgNotAllowedError(owner, allowed)
  }
}
