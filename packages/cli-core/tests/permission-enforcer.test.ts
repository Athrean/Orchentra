import { describe, expect, test } from 'bun:test'
import { PermissionEnforcer, isWithinWorkspace, isReadOnlyCommand } from '../src/runtime/permission-enforcer'
import { PermissionPolicy } from '../src/runtime/permissions'
import type { PermissionMode } from '../src/runtime/permissions'

function makeEnforcer(mode: PermissionMode): PermissionEnforcer {
  return new PermissionEnforcer(new PermissionPolicy(mode))
}

describe('PermissionEnforcer', () => {
  test('allow mode permits everything', () => {
    const enforcer = makeEnforcer('allow')
    expect(enforcer.isAllowed('bash', '')).toBe(true)
    expect(enforcer.isAllowed('write_file', '')).toBe(true)
    expect(enforcer.checkFileWrite('/outside/path', '/workspace')).toEqual({ kind: 'allowed' })
    expect(enforcer.checkBash('rm -rf /')).toEqual({ kind: 'allowed' })
  })

  test('read-only denies writes', () => {
    const policy = new PermissionPolicy('read-only')
      .withToolRequirement('read_file', 'read-only')
      .withToolRequirement('grep_search', 'read-only')
      .withToolRequirement('write_file', 'workspace-write')

    const enforcer = new PermissionEnforcer(policy)
    expect(enforcer.isAllowed('read_file', '')).toBe(true)
    expect(enforcer.isAllowed('grep_search', '')).toBe(true)

    const result = enforcer.check('write_file', '')
    expect(result.kind).toBe('denied')

    const fileResult = enforcer.checkFileWrite('/workspace/file.rs', '/workspace')
    expect(fileResult.kind).toBe('denied')
  })

  test('read-only allows read commands', () => {
    const enforcer = makeEnforcer('read-only')
    expect(enforcer.checkBash('cat src/main.rs')).toEqual({ kind: 'allowed' })
    expect(enforcer.checkBash('grep -r pattern .')).toEqual({ kind: 'allowed' })
    expect(enforcer.checkBash('ls -la')).toEqual({ kind: 'allowed' })
  })

  test('read-only denies write commands', () => {
    const enforcer = makeEnforcer('read-only')
    expect(enforcer.checkBash('rm file.txt').kind).toBe('denied')
  })

  test('workspace-write allows within workspace', () => {
    const enforcer = makeEnforcer('workspace-write')
    expect(enforcer.checkFileWrite('/workspace/src/main.rs', '/workspace')).toEqual({ kind: 'allowed' })
  })

  test('workspace-write denies outside workspace', () => {
    const enforcer = makeEnforcer('workspace-write')
    expect(enforcer.checkFileWrite('/etc/passwd', '/workspace').kind).toBe('denied')
  })

  test('prompt mode denies without prompter', () => {
    const enforcer = makeEnforcer('prompt')
    expect(enforcer.checkBash('echo test').kind).toBe('denied')
    expect(enforcer.checkFileWrite('/workspace/file.rs', '/workspace').kind).toBe('denied')
  })

  test('danger-full-access permits file writes and bash', () => {
    const enforcer = makeEnforcer('danger-full-access')
    expect(enforcer.checkFileWrite('/outside/workspace/file.txt', '/workspace')).toEqual({ kind: 'allowed' })
    expect(enforcer.checkBash('rm -rf /tmp/scratch')).toEqual({ kind: 'allowed' })
  })

  test('check denied payload contains tool and modes', () => {
    const policy = new PermissionPolicy('read-only').withToolRequirement('write_file', 'workspace-write')
    const enforcer = new PermissionEnforcer(policy)

    const result = enforcer.check('write_file', '{}')

    expect(result).toMatchObject({
      kind: 'denied',
      tool: 'write_file',
      activeMode: 'read-only',
      requiredMode: 'workspace-write',
    })
    if (result.kind === 'denied') {
      expect(result.reason).toContain('requires workspace-write permission')
    }
  })

  test('workspace-write relative path resolved', () => {
    const enforcer = makeEnforcer('workspace-write')
    expect(enforcer.checkFileWrite('src/main.rs', '/workspace')).toEqual({ kind: 'allowed' })
  })

  test('workspace root with trailing slash', () => {
    const enforcer = makeEnforcer('workspace-write')
    expect(enforcer.checkFileWrite('/workspace/src/main.rs', '/workspace/')).toEqual({ kind: 'allowed' })
  })

  test('active mode returns policy mode', () => {
    const modes: PermissionMode[] = ['read-only', 'workspace-write', 'danger-full-access', 'prompt', 'allow']
    const activeModes = modes.map((mode) => makeEnforcer(mode).activeMode())
    expect(activeModes).toEqual(modes)
  })
})

describe('isWithinWorkspace', () => {
  test('subdirectory inside workspace', () => {
    expect(isWithinWorkspace('/workspace/src/main.rs', '/workspace')).toBe(true)
  })

  test('exact workspace root', () => {
    expect(isWithinWorkspace('/workspace', '/workspace')).toBe(true)
  })

  test('outside workspace', () => {
    expect(isWithinWorkspace('/etc/passwd', '/workspace')).toBe(false)
  })

  test('prefix collision does not match', () => {
    expect(isWithinWorkspace('/workspacex/hack', '/workspace')).toBe(false)
  })

  test('trailing slash on root', () => {
    expect(isWithinWorkspace('/workspace', '/workspace/')).toBe(true)
  })
})

describe('isReadOnlyCommand', () => {
  test('read-only commands', () => {
    expect(isReadOnlyCommand('cat file.txt')).toBe(true)
    expect(isReadOnlyCommand('grep pattern file')).toBe(true)
    expect(isReadOnlyCommand('git log --oneline')).toBe(true)
    expect(isReadOnlyCommand('ls -la')).toBe(true)
    expect(isReadOnlyCommand('find . -name "*.ts"')).toBe(true)
  })

  test('write commands are not read-only', () => {
    expect(isReadOnlyCommand('rm file.txt')).toBe(false)
  })

  test('redirects block read-only commands', () => {
    expect(isReadOnlyCommand('cat Cargo.toml > out.txt')).toBe(false)
    expect(isReadOnlyCommand('echo test >> out.txt')).toBe(false)
  })

  test('in-place flag blocks', () => {
    expect(isReadOnlyCommand('python -i script.py')).toBe(false)
    expect(isReadOnlyCommand('sed --in-place s/a/b/ file.txt')).toBe(false)
  })

  test('full path prefix resolved', () => {
    expect(isReadOnlyCommand('/usr/bin/cat Cargo.toml')).toBe(true)
    expect(isReadOnlyCommand('/usr/local/bin/git status')).toBe(true)
  })

  test('empty and whitespace commands are not read-only', () => {
    expect(isReadOnlyCommand('')).toBe(false)
    expect(isReadOnlyCommand('   ')).toBe(false)
  })
})
