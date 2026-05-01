import { detectContainerEnvironment } from './container'
import { buildMacosSandboxProfile } from './macos-profile'
import type { SandboxCapabilityProbe } from './resolve'
import type { SandboxCommand, SandboxStatus } from './types'

export function buildMacosSandboxCommand(command: string, cwd: string, status: SandboxStatus): SandboxCommand | null {
  if (!status.enabled) return null
  if (!status.filesystem_active && !status.requested.network_isolation) return null

  const profile = buildMacosSandboxProfile(cwd, status)
  const cwdNorm = cwd.replace(/\/+$/, '')

  const env: Array<readonly [string, string]> = [
    ['HOME', `${cwdNorm}/.sandbox-home`],
    ['TMPDIR', `${cwdNorm}/.sandbox-tmp`],
    ['ORCHENTRA_SANDBOX_FILESYSTEM_MODE', status.filesystem_mode],
    ['ORCHENTRA_SANDBOX_ALLOWED_MOUNTS', status.allowed_mounts.join(':')],
  ]
  if (process.env.PATH !== undefined) env.push(['PATH', process.env.PATH])

  return {
    program: 'sandbox-exec',
    args: ['-p', profile, 'sh', '-lc', command],
    env,
  }
}

export function macosCapabilityProbe(): SandboxCapabilityProbe {
  return {
    namespaceSupported: () => false,
    containerEnvironment: () => detectContainerEnvironment(),
  }
}
