import { existsSync } from 'node:fs'
import { delimiter } from 'node:path'
import { spawnSync } from 'node:child_process'
import { detectContainerEnvironment } from './container'
import type { SandboxCapabilityProbe } from './resolve'
import type { SandboxCommand, SandboxStatus } from './types'

export function buildLinuxSandboxCommand(command: string, cwd: string, status: SandboxStatus): SandboxCommand | null {
  if (!status.enabled) return null
  if (!status.namespace_active && !status.network_active) return null

  const args = ['--user', '--map-root-user', '--mount', '--ipc', '--pid', '--uts', '--fork']
  if (status.network_active) args.push('--net')
  args.push('sh', '-lc', command)

  const cwdNorm = cwd.replace(/\/+$/, '')
  const env: Array<readonly [string, string]> = [
    ['HOME', `${cwdNorm}/.sandbox-home`],
    ['TMPDIR', `${cwdNorm}/.sandbox-tmp`],
    ['ORCHENTRA_SANDBOX_FILESYSTEM_MODE', status.filesystem_mode],
    ['ORCHENTRA_SANDBOX_ALLOWED_MOUNTS', status.allowed_mounts.join(':')],
  ]
  if (process.env.PATH !== undefined) env.push(['PATH', process.env.PATH])

  return { program: 'unshare', args, env }
}

let cachedNamespaceWorks: boolean | undefined
function unshareUserNamespaceWorks(): boolean {
  if (cachedNamespaceWorks !== undefined) return cachedNamespaceWorks
  if (process.platform !== 'linux') {
    cachedNamespaceWorks = false
    return false
  }
  if (!commandExists('unshare')) {
    cachedNamespaceWorks = false
    return false
  }
  const r = spawnSync('unshare', ['--user', '--map-root-user', 'true'], { stdio: 'ignore' })
  cachedNamespaceWorks = r.status === 0
  return cachedNamespaceWorks
}

function commandExists(name: string): boolean {
  const path = process.env.PATH
  if (!path) return false
  for (const dir of path.split(delimiter)) {
    if (dir.length === 0) continue
    if (existsSync(`${dir.replace(/\/+$/, '')}/${name}`)) return true
  }
  return false
}

export function linuxCapabilityProbe(): SandboxCapabilityProbe {
  return {
    namespaceSupported: () => unshareUserNamespaceWorks(),
    containerEnvironment: () => detectContainerEnvironment(),
  }
}

export function resetLinuxCapabilityCache(): void {
  cachedNamespaceWorks = undefined
}
