import { describe, expect, test } from 'bun:test'
import { gitDiscoveryEnv, gitOutput, runProcess, runProcessSync } from '../src/runtime/run-process'

describe('runProcess', () => {
  test('captures stdout, stderr and exit code', async () => {
    const result = await runProcess(['sh', '-c', 'printf out; printf err >&2; exit 3'])
    expect(result.stdout).toBe('out')
    expect(result.stderr).toBe('err')
    expect(result.exitCode).toBe(3)
  })

  test('writes stdin when provided', async () => {
    const result = await runProcess(['cat'], { stdin: 'piped' })
    expect(result.stdout).toBe('piped')
    expect(result.exitCode).toBe(0)
  })

  test('honours cwd and env', async () => {
    const result = await runProcess(['sh', '-c', 'printf "$MARKER"'], { cwd: '/tmp', env: { MARKER: 'set' } })
    expect(result.stdout).toBe('set')
  })
})

describe('runProcessSync', () => {
  test('captures stdout, stderr and exit code', () => {
    const result = runProcessSync(['sh', '-c', 'printf out; printf err >&2; exit 3'])
    expect(result.stdout).toBe('out')
    expect(result.stderr).toBe('err')
    expect(result.exitCode).toBe(3)
  })
})

describe('gitDiscoveryEnv', () => {
  test('drops every GIT_ variable and keeps the rest', () => {
    const env = gitDiscoveryEnv({
      GIT_DIR: '/somewhere/.git',
      GIT_WORK_TREE: '/somewhere',
      GIT_INDEX_FILE: '.git/index',
      PATH: '/usr/bin',
      HOME: '/home/x',
    })
    expect(Object.keys(env).some((key) => key.startsWith('GIT_'))).toBe(false)
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/x' })
  })

  test('skips undefined values', () => {
    expect(gitDiscoveryEnv({ SET: 'yes', UNSET: undefined })).toEqual({ SET: 'yes' })
  })
})

describe('gitOutput', () => {
  test('returns trimmed stdout for a successful command', () => {
    expect(gitOutput(process.cwd(), ['rev-parse', '--is-inside-work-tree'])).toBe('true')
  })

  test('returns null when git fails', () => {
    expect(gitOutput(process.cwd(), ['rev-parse', '--verify', 'refs/heads/definitely-not-a-branch-xyz'])).toBeNull()
  })
})
