import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'node:net'
import {
  ProcessSupervisor,
  sanitizeChildEnv,
  isSecretEnvName,
  type SupervisedHandle,
} from '../src/runtime/process-supervisor'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

interface Fake {
  handle: SupervisedHandle
  resolveExit: (code: number) => void
  killed: () => boolean
}

function fakeHandle(opts?: { stdout?: ReadableStream<Uint8Array> }): Fake {
  let resolve!: (code: number) => void
  let wasKilled = false
  const exited = new Promise<number>((r) => {
    resolve = r
  })
  return {
    handle: {
      pid: 4242,
      exited,
      kill: () => {
        wasKilled = true
        resolve(143)
      },
      stdout: opts?.stdout ?? null,
      stderr: null,
    },
    resolveExit: resolve,
    killed: () => wasKilled,
  }
}

function waitFor(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (pred()) return resolve()
      if (Date.now() > deadline) return reject(new Error('waitFor timed out'))
      setTimeout(tick, 10)
    }
    tick()
  })
}

describe('sanitizeChildEnv', () => {
  test('drops credential-named vars, keeps operational ones', () => {
    const clean = sanitizeChildEnv({
      PATH: '/usr/bin',
      HOME: '/home/x',
      NODE_ENV: 'development',
      PORT: '3000',
      ANTHROPIC_API_KEY: 'sk-secret',
      OPENAI_API_KEY: 'sk-secret',
      GITHUB_TOKEN: 'ghp_secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_ACCESS_KEY_ID: 'akid',
      NODE_AUTH_TOKEN: 'tok',
      DATABASE_PASSWORD: 'pw',
      UNDEF: undefined,
    })
    expect(clean).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/x',
      NODE_ENV: 'development',
      PORT: '3000',
    })
  })

  test('scrubs secrets smuggled through the explicit extra layer', () => {
    const clean = sanitizeChildEnv({ PATH: '/usr/bin' }, { MY_TOKEN: 'x', SAFE: 'y' })
    expect(clean).toEqual({ PATH: '/usr/bin', SAFE: 'y' })
  })

  test('isSecretEnvName matches segments not substrings', () => {
    expect(isSecretEnvName('API_KEY')).toBe(true)
    expect(isSecretEnvName('SESSION_TOKEN')).toBe(true)
    expect(isSecretEnvName('KEYCLOAK_URL')).toBe(false)
    expect(isSecretEnvName('AUTHOR')).toBe(false)
    expect(isSecretEnvName('PATH')).toBe(false)
  })
})

describe('ProcessSupervisor (fakes)', () => {
  test('waitUntilReady flips to ready once the probe passes', async () => {
    let ready = false
    const fake = fakeHandle()
    const sup = new ProcessSupervisor({ spawn: () => fake.handle, probe: async () => ready, baseEnv: {} })
    const proc = sup.start({ command: 'server', cwd: '/tmp', readiness: { port: 1234 } })
    expect(proc.status).toBe('starting')
    expect(proc.pid).toBe(4242)
    ready = true
    const done = await sup.waitUntilReady(proc.id, 2000)
    expect(done.status).toBe('ready')
    expect(done.readyAt).toBeDefined()
  })

  test('early non-zero exit is reported as failed, not ready', async () => {
    const fake = fakeHandle()
    const sup = new ProcessSupervisor({ spawn: () => fake.handle, probe: async () => false, baseEnv: {} })
    const proc = sup.start({ command: 'boom', cwd: '/tmp', readiness: { port: 1234 } })
    fake.resolveExit(1)
    await waitFor(() => proc.status === 'failed')
    expect(proc.exitCode).toBe(1)
    expect(proc.error).toContain('before ready')
  })

  test('discovers the URL from a logged localhost line', async () => {
    const fake = fakeHandle({ stdout: streamOf(['booting...\n', '  Local:   http://127.0.0.1:5173/\n']) })
    const sup = new ProcessSupervisor({ spawn: () => fake.handle, probe: async () => true, baseEnv: {} })
    const proc = sup.start({ command: 'vite', cwd: '/tmp', readiness: { urlFromLog: /Local:\s+(\S+)/ } })
    await waitFor(() => proc.url !== undefined)
    expect(proc.url).toBe('http://127.0.0.1:5173/')
    expect(proc.port).toBe(5173)
  })

  test('shutdown kills every managed process and clears the registry', async () => {
    const a = fakeHandle()
    const b = fakeHandle()
    const handles = [a, b]
    let i = 0
    const sup = new ProcessSupervisor({ spawn: () => handles[i++]!.handle, probe: async () => true, baseEnv: {} })
    sup.start({ command: 'one', cwd: '/tmp' })
    sup.start({ command: 'two', cwd: '/tmp' })
    expect(sup.list()).toHaveLength(2)
    await sup.shutdown()
    expect(a.killed()).toBe(true)
    expect(b.killed()).toBe(true)
    expect(sup.list()).toHaveLength(0)
  })

  test('spawned child env is scrubbed of secrets', () => {
    let captured: Record<string, string> = {}
    const fake = fakeHandle()
    const sup = new ProcessSupervisor({
      spawn: (req) => {
        captured = req.env
        return fake.handle
      },
      probe: async () => true,
      baseEnv: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-leak' },
    })
    sup.start({ command: 'srv', cwd: '/tmp' })
    expect(captured.PATH).toBe('/usr/bin')
    expect(captured.ANTHROPIC_API_KEY).toBeUndefined()
  })
})

describe('ProcessSupervisor (real dev server)', () => {
  let dir: string | undefined
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  test('starts a real server, detects readiness + URL, tears it down with no leak', async () => {
    dir = await mkdtemp(join(tmpdir(), 'otr-supervisor-'))
    const script = join(dir, 'server.ts')
    await writeFile(
      script,
      [
        "const s = Bun.serve({ port: 0, fetch: () => new Response('ok') })",
        'console.log(`ready http://127.0.0.1:${s.port}/`)',
      ].join('\n'),
    )

    const sup = new ProcessSupervisor()
    const proc = sup.start({
      command: `bun ${script}`,
      cwd: dir,
      readiness: { urlFromLog: /http:\/\/\S+/ },
      label: 'fixture-dev-server',
    })

    const ready = await sup.waitUntilReady(proc.id, 15_000)
    expect(ready.status).toBe('ready')
    expect(ready.url).toContain('127.0.0.1')
    expect(ready.port).toBeGreaterThan(0)
    const port = ready.port!

    // The server actually answers while supervised.
    const live = await fetch(`http://127.0.0.1:${port}/`)
    expect(await live.text()).toBe('ok')

    await sup.shutdown()
    expect(sup.get(proc.id)).toBeUndefined()

    // No leaked process: the port no longer accepts connections.
    const stillUp = await tcpOpen('127.0.0.1', port)
    expect(stillUp).toBe(false)
  }, 20_000)
})

function tcpOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    const finish = (ok: boolean): void => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}
