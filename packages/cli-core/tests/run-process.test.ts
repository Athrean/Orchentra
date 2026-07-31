import { describe, expect, test } from 'bun:test'
import { gitCommandEnv, gitDiscoveryEnv, gitOutput, runProcess, runProcessSync } from '../src/runtime/run-process'

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

describe('gitCommandEnv', () => {
  test('drops repo-discovery vars but keeps credentials and identity', () => {
    const env = gitCommandEnv({
      GIT_DIR: '/somewhere/.git',
      GIT_WORK_TREE: '/somewhere',
      GIT_INDEX_FILE: '.git/index',
      GIT_CONFIG_PARAMETERS: "'core.hooksPath=/dev/null'",
      GIT_SSH_COMMAND: 'ssh -i /key',
      GIT_ASKPASS: '/usr/bin/askpass',
      GIT_AUTHOR_NAME: 'Rishit',
      GIT_COMMITTER_EMAIL: 'r@example.com',
      PATH: '/usr/bin',
    })
    // Stripping these is the whole point: they redirect git at another repo.
    expect(env.GIT_DIR).toBeUndefined()
    expect(env.GIT_WORK_TREE).toBeUndefined()
    expect(env.GIT_INDEX_FILE).toBeUndefined()
    expect(env.GIT_CONFIG_PARAMETERS).toBeUndefined()
    // Keeping these is equally the point: a blanket GIT_* strip breaks SSH
    // pushes and loses commit identity.
    expect(env.GIT_SSH_COMMAND).toBe('ssh -i /key')
    expect(env.GIT_ASKPASS).toBe('/usr/bin/askpass')
    expect(env.GIT_AUTHOR_NAME).toBe('Rishit')
    expect(env.GIT_COMMITTER_EMAIL).toBe('r@example.com')
    expect(env.PATH).toBe('/usr/bin')
  })

  test('is stricter than gitDiscoveryEnv only about non-discovery vars', () => {
    const source = { GIT_DIR: '/x', GIT_SSH_COMMAND: 'ssh', PATH: '/usr/bin' }
    expect(gitDiscoveryEnv(source)).toEqual({ PATH: '/usr/bin' })
    expect(gitCommandEnv(source)).toEqual({ GIT_SSH_COMMAND: 'ssh', PATH: '/usr/bin' })
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
