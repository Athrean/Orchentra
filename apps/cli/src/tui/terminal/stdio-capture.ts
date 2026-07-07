export interface StdioCapture {
  stop: () => string
}

/**
 * Temporarily replace stdout/stderr writes with collectors so slash-command
 * handlers that still print directly can be rendered inside the TUI transcript.
 */
export function captureStdio(): StdioCapture {
  const buf: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  const collector = ((chunk: string | Uint8Array): boolean => {
    buf.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
    return true
  }) as typeof process.stdout.write
  process.stdout.write = collector
  process.stderr.write = collector
  return {
    stop: () => {
      process.stdout.write = origOut
      process.stderr.write = origErr
      return buf.join('')
    },
  }
}
