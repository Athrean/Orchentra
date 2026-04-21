import * as readline from 'node:readline'

export type ReadOutcome = { type: 'submit'; text: string } | { type: 'cancel' } | { type: 'exit' }

export function readLine(prompt: string): Promise<ReadOutcome> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      readFromPipe(resolve)
      return
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt,
    })

    let resolved = false

    function onLine(line: string): void {
      if (resolved) return
      resolved = true
      cleanup()
      resolve({ type: 'submit', text: line })
    }

    function onClose(): void {
      if (resolved) return
      resolved = true
      cleanup()
      resolve({ type: 'exit' })
    }

    function onSigint(): void {
      if (resolved) return
      resolved = true
      cleanup()
      process.stdout.write('\n')
      resolve(rl.line.length > 0 ? { type: 'cancel' } : { type: 'exit' })
    }

    function cleanup(): void {
      rl.removeListener('line', onLine)
      rl.removeListener('close', onClose)
      process.removeListener('SIGINT', onSigint)
      rl.close()
    }

    rl.on('line', onLine)
    rl.on('close', onClose)
    process.once('SIGINT', onSigint)
    rl.prompt()
  })
}

function readFromPipe(resolve: (outcome: ReadOutcome) => void): void {
  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    rl.close()
    resolve({ type: 'submit', text: line })
  })
  rl.on('close', () => {
    resolve({ type: 'exit' })
  })
}
