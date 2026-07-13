import { spawnSync } from 'node:child_process'

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
