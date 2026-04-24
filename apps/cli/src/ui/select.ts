import { stdin, stdout } from 'node:process'

export interface SelectOption<T> {
  readonly value: T
  readonly label: string
  readonly hint?: string
}

export interface SelectPromptOptions<T> {
  readonly title: string
  readonly options: readonly SelectOption<T>[]
  readonly initialIndex?: number
}

export type SelectResult<T> = { readonly type: 'chosen'; readonly value: T } | { readonly type: 'cancelled' }

export function promptSelect<T>(opts: SelectPromptOptions<T>): Promise<SelectResult<T>> {
  return new Promise((resolve) => {
    if (!stdin.isTTY || opts.options.length === 0) {
      resolve({ type: 'cancelled' })
      return
    }

    let index = clamp(opts.initialIndex ?? 0, 0, opts.options.length - 1)
    const rowCount = opts.options.length + 2 // title + blank + options

    const render = (first: boolean): void => {
      if (!first) stdout.write(`\x1b[${rowCount}A`)
      stdout.write(`\x1b[2K${opts.title}\n\x1b[2K\n`)
      for (let i = 0; i < opts.options.length; i++) {
        const o = opts.options[i]
        const active = i === index
        const cursor = active ? '\x1b[36m❯\x1b[0m' : ' '
        const label = active ? `\x1b[36m${o.label}\x1b[0m` : o.label
        const hint = o.hint ? `  \x1b[2m${o.hint}\x1b[0m` : ''
        stdout.write(`\x1b[2K${cursor} ${label}${hint}\n`)
      }
    }

    const origRaw = stdin.isRaw ?? false
    stdout.write('\x1b[?25l') // hide cursor
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    render(true)

    const finish = (result: SelectResult<T>): void => {
      stdin.removeListener('data', onData)
      // Clear the picker (rowCount lines) and leave the cursor at the top.
      stdout.write(`\x1b[${rowCount}A`)
      for (let i = 0; i < rowCount; i++) stdout.write('\x1b[2K\n')
      stdout.write(`\x1b[${rowCount}A`)
      stdin.setRawMode(origRaw)
      stdin.pause()
      stdout.write('\x1b[?25h') // show cursor
      resolve(result)
    }

    const onData = (chunk: string): void => {
      if (chunk === '\x03' || chunk === 'q' || chunk === '\x1b') {
        finish({ type: 'cancelled' })
        return
      }
      if (chunk === '\r' || chunk === '\n') {
        finish({ type: 'chosen', value: opts.options[index].value })
        return
      }
      if (chunk === '\x1b[A' || chunk === 'k') {
        index = (index - 1 + opts.options.length) % opts.options.length
        render(false)
        return
      }
      if (chunk === '\x1b[B' || chunk === 'j') {
        index = (index + 1) % opts.options.length
        render(false)
        return
      }
    }

    stdin.on('data', onData)
  })
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
