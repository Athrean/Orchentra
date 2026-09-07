import { spawnSync } from 'node:child_process'

// local-only oauth graft — used by the paste-back OAuth login flows.
export function readClipboard(): string | null {
  if (process.env['ORCHENTRA_NO_CLIPBOARD']) return null
  try {
    if (process.platform === 'darwin') {
      const r = spawnSync('pbpaste', [], { timeout: 500, encoding: 'utf8' })
      return r.status === 0 ? r.stdout : null
    }
    if (process.platform === 'linux') {
      const tools: Array<[string, string[]]> = [
        ['wl-paste', ['--no-newline']],
        ['xclip', ['-selection', 'clipboard', '-o']],
        ['xsel', ['--clipboard', '--output']],
      ]
      for (const [cmd, args] of tools) {
        const r = spawnSync(cmd, args, { timeout: 500, encoding: 'utf8' })
        if (r.status === 0) return r.stdout
      }
      return null
    }
    return null
  } catch {
    return null
  }
}

export function writeClipboard(text: string): boolean {
  if (process.env['ORCHENTRA_NO_CLIPBOARD']) return false
  try {
    if (process.platform === 'darwin') {
      const r = spawnSync('pbcopy', [], { input: text, timeout: 500 })
      return r.status === 0
    }
    if (process.platform === 'linux') {
      const tools: Array<[string, string[]]> = [
        ['wl-copy', []],
        ['xclip', ['-selection', 'clipboard']],
        ['xsel', ['--clipboard', '--input']],
      ]
      for (const [cmd, args] of tools) {
        const r = spawnSync(cmd, args, { input: text, timeout: 500 })
        if (r.status === 0) return true
      }
      return false
    }
    if (process.platform === 'win32') {
      const r = spawnSync('clip.exe', [], { input: text, timeout: 500 })
      return r.status === 0
    }
    return false
  } catch {
    return false
  }
}
