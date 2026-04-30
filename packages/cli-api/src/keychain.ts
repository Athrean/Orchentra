import { spawn } from 'node:child_process'

export interface KeychainExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export type KeychainExec = (args: readonly string[]) => Promise<KeychainExecResult>

export const defaultKeychainExec: KeychainExec = (args) =>
  new Promise<KeychainExecResult>((resolve) => {
    let child
    try {
      child = spawn('security', args)
    } catch {
      resolve({ code: 127, stdout: '', stderr: 'security CLI not available' })
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('error', () => resolve({ code: 127, stdout, stderr: stderr || 'security CLI not available' }))
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
  })

export interface KeychainEntry {
  readonly service: string
  readonly account: string | null
  readonly password: string
}

// Wraps the macOS `security` CLI for read-only Keychain access. Used to
// detect an existing Claude Code login and import its OAuth credential
// rather than forcing the user through a fresh /login flow.
export class MacKeychain {
  constructor(private readonly exec: KeychainExec = defaultKeychainExec) {}

  static available(): boolean {
    return process.platform === 'darwin'
  }

  async findGenericPassword(service: string, account?: string): Promise<KeychainEntry | null> {
    const args = ['find-generic-password', '-s', service, ...(account ? ['-a', account] : []), '-w']
    const res = await this.exec(args)
    if (res.code !== 0) return null
    return {
      service,
      account: account ?? null,
      password: res.stdout.replace(/\n+$/, ''),
    }
  }

  async listGenericPasswordServices(prefix: string): Promise<readonly string[]> {
    const res = await this.exec(['dump-keychain'])
    if (res.code !== 0) return []
    return parseServiceNames(res.stdout, prefix)
  }
}

function parseServiceNames(dump: string, prefix: string): readonly string[] {
  const services = new Set<string>()
  const re = /"svce"<blob>="((?:[^"\\]|\\.)*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(dump)) !== null) {
    const raw = match[1] ?? ''
    const name = raw.replace(/\\(.)/g, '$1')
    if (name.startsWith(prefix)) services.add(name)
  }
  return Array.from(services)
}
