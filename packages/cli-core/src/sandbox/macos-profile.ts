import type { SandboxStatus } from './types'

export function buildMacosSandboxProfile(cwd: string, status: SandboxStatus): string {
  const lines: string[] = ['(version 1)', '(deny default)']

  lines.push('(allow file-read*)')
  lines.push('(allow process-fork)')
  lines.push('(allow process-exec)')
  lines.push('(allow mach-lookup)')
  lines.push('(allow sysctl-read)')
  lines.push('(allow ipc-posix-shm)')
  lines.push('(allow ipc-posix-sem)')
  lines.push('(allow signal (target self))')

  if (!status.requested.network_isolation) {
    lines.push('(allow network*)')
  }

  if (status.filesystem_active) {
    for (const path of writableSubpaths(cwd, status)) {
      lines.push(`(allow file-write* (subpath ${escapeSbString(path)}))`)
    }
  }

  return lines.join('\n') + '\n'
}

function writableSubpaths(cwd: string, status: SandboxStatus): string[] {
  const cwdNorm = cwd.replace(/\/+$/, '')
  const home = process.env.HOME?.replace(/\/+$/, '')
  const out = new Set<string>([
    cwdNorm,
    `${cwdNorm}/.sandbox-home`,
    `${cwdNorm}/.sandbox-tmp`,
    '/tmp',
    '/private/tmp',
    '/var/tmp',
    '/private/var/tmp',
  ])
  if (home) {
    out.add(`${home}/Library/Caches`)
    out.add(`${home}/Library/Logs`)
    out.add(`${home}/.npm`)
    out.add(`${home}/.cargo`)
    out.add(`${home}/.cache`)
  }
  for (const mount of status.allowed_mounts) out.add(mount.replace(/\/+$/, ''))
  return Array.from(out)
}

function escapeSbString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
