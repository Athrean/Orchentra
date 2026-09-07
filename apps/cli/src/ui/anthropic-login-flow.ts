import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { startAnthropicLogin, completeAnthropicLogin } from '@orchentra/cli-api'
import { readClipboard, writeClipboard } from './clipboard'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,}#[A-Za-z0-9_-]{16,}$/

const C = {
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  boldCyan: '\x1b[1;36m',
}

export interface AnthropicLoginFlowResult {
  ok: boolean
  message: string
  path?: string
}

export async function runAnthropicLoginFlow(): Promise<AnthropicLoginFlowResult> {
  const pending = startAnthropicLogin()
  await openInBrowser(pending.authUrl)

  if (!stdin.isTTY) {
    return runFallbackPrompt(pending)
  }

  const initialClipboard = (readClipboard() ?? '').trim()
  const origRaw = stdin.isRaw ?? false
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  stdout.write('\x1b[?25l')

  let frame = 0
  let linesDrawn = 0
  let status: { text: string; color: string; spinner: boolean } = {
    text: 'Waiting for code — copy it from the browser',
    color: C.cyan,
    spinner: true,
  }
  let toast: string | null = null
  let toastClearAt = 0

  const draw = (): void => {
    if (linesDrawn > 0) stdout.write(`\x1b[${linesDrawn}A`)
    const lines: string[] = []
    lines.push('')
    lines.push(`  ${C.boldCyan}Orchentra${C.reset} ${C.dim}→${C.reset} ${C.bold}Claude${C.reset}`)
    lines.push(`  ${C.dim}Sign in with your Claude Pro / Max subscription${C.reset}`)
    lines.push('')
    lines.push(`  ${C.green}✓${C.reset} Browser opened to claude.ai`)
    const glyph = status.spinner ? FRAMES[frame] : '✓'
    lines.push(`  ${status.color}${glyph}${C.reset} ${status.text}`)
    lines.push(`     ${C.dim}Copy the code from the callback page — we'll detect it automatically.${C.reset}`)
    lines.push('')
    lines.push(
      `  ${C.dim}[c]${C.reset} copy URL    ${C.dim}[p]${C.reset} paste manually    ${C.dim}[q]${C.reset} cancel`,
    )
    lines.push(toast ? `  ${C.green}${toast}${C.reset}` : '')
    for (const line of lines) stdout.write(`\x1b[2K${line}\n`)
    linesDrawn = lines.length
  }

  const cleanup = (): void => {
    stdin.removeAllListeners('data')
    if (stdin.isTTY) stdin.setRawMode(origRaw)
    stdin.pause()
    stdout.write('\x1b[?25h')
  }

  draw()

  return new Promise<AnthropicLoginFlowResult>((resolve) => {
    let finished = false
    let pasteMode = false

    const tick = setInterval(() => {
      if (finished) return
      frame = (frame + 1) % FRAMES.length
      if (toast && Date.now() > toastClearAt) toast = null
      draw()
    }, 100)

    const clipPoll = setInterval(() => {
      if (finished || pasteMode) return
      const content = (readClipboard() ?? '').trim()
      if (!content || content === initialClipboard) return
      if (!CODE_PATTERN.test(content)) return
      proceed(content, 'Code detected from clipboard')
    }, 300)

    const timeout = setTimeout(() => {
      if (finished) return
      finalize({ ok: false, message: 'login timed out' })
    }, 5 * 60_000)

    const finalize = (r: AnthropicLoginFlowResult): void => {
      if (finished) return
      finished = true
      clearInterval(tick)
      clearInterval(clipPoll)
      clearTimeout(timeout)
      draw()
      cleanup()
      resolve(r)
    }

    const proceed = async (pasted: string, note: string): Promise<void> => {
      status = { text: note, color: C.green, spinner: false }
      draw()
      status = { text: 'Exchanging tokens…', color: C.cyan, spinner: true }
      draw()
      try {
        const result = await completeAnthropicLogin({ pasted, verifier: pending.verifier })
        status = { text: 'Connected to Claude', color: C.green, spinner: false }
        finalize({ ok: true, message: 'Connected to Claude', path: result.persistedPath })
      } catch (err) {
        status = {
          text: `Failed: ${(err as Error).message.slice(0, 80)}`,
          color: C.red,
          spinner: false,
        }
        finalize({ ok: false, message: (err as Error).message })
      }
    }

    stdin.on('data', async (chunk: string | Buffer) => {
      if (finished || pasteMode) return
      const key = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      if (key === 'q' || key === '\x03' || key === '\x1b') {
        finalize({ ok: false, message: 'cancelled' })
        return
      }
      if (key === 'c') {
        const ok = writeClipboard(pending.authUrl)
        toast = ok ? '✓ URL copied to clipboard' : 'No clipboard tool available'
        toastClearAt = Date.now() + 2000
        draw()
        return
      }
      if (key === 'p') {
        pasteMode = true
        clearInterval(tick)
        clearInterval(clipPoll)
        stdin.removeAllListeners('data')
        stdin.setRawMode(false)
        stdout.write('\n  Paste authorization code and press Enter:\n  ')
        const rl = createInterface({ input: stdin, output: stdout })
        const code = (await rl.question('')).trim()
        rl.close()
        if (!code) {
          finalize({ ok: false, message: 'cancelled' })
          return
        }
        pasteMode = false
        proceed(code, 'Code entered manually')
      }
    })
  })
}

async function runFallbackPrompt(pending: { authUrl: string; verifier: string }): Promise<AnthropicLoginFlowResult> {
  stdout.write(`\n  ${C.boldCyan}Orchentra${C.reset} ${C.dim}→${C.reset} ${C.bold}Claude${C.reset}\n`)
  stdout.write(`  ${C.dim}Open this URL and paste the code back:${C.reset}\n`)
  stdout.write(`  ${pending.authUrl}\n\n`)
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const pasted = (await rl.question('  Authorization code: ')).trim()
    if (!pasted) return { ok: false, message: 'cancelled' }
    const result = await completeAnthropicLogin({ pasted, verifier: pending.verifier })
    return { ok: true, message: 'Connected to Claude', path: result.persistedPath }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  } finally {
    rl.close()
  }
}

async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  try {
    await new Promise<void>((resolve) => {
      const child = spawn(cmd, platform === 'win32' ? ['', url] : [url], {
        stdio: 'ignore',
        detached: true,
        shell: platform === 'win32',
      })
      child.on('error', () => resolve())
      child.on('exit', () => resolve())
      child.unref()
      setTimeout(resolve, 500)
    })
  } catch {
    /* ignore */
  }
}
