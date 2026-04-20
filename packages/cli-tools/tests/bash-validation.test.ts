import { describe, expect, test } from 'bun:test'
import {
  validateReadOnly,
  checkDestructive,
  validateMode,
  validateSed,
  validatePaths,
  classifyCommand,
  validateCommand,
  extractFirstCommand,
} from '../src/bash-validation'

describe('validateReadOnly', () => {
  test('blocks rm in read-only mode', () => {
    const result = validateReadOnly('rm -rf /tmp/x', 'read-only')
    expect(result.kind).toBe('block')
    if (result.kind === 'block') expect(result.reason).toContain('rm')
  })

  test('allows rm in workspace-write mode', () => {
    expect(validateReadOnly('rm -rf /tmp/x', 'workspace-write')).toEqual({ kind: 'allow' })
  })

  test('blocks write redirections in read-only mode', () => {
    const result = validateReadOnly('echo hello > file.txt', 'read-only')
    expect(result.kind).toBe('block')
    if (result.kind === 'block') expect(result.reason).toContain('redirection')
  })

  test('allows read commands in read-only mode', () => {
    expect(validateReadOnly('ls -la', 'read-only')).toEqual({ kind: 'allow' })
    expect(validateReadOnly('cat /etc/hosts', 'read-only')).toEqual({ kind: 'allow' })
    expect(validateReadOnly('grep -r pattern .', 'read-only')).toEqual({ kind: 'allow' })
  })

  test('blocks sudo write in read-only mode', () => {
    const result = validateReadOnly('sudo rm -rf /tmp/x', 'read-only')
    expect(result.kind).toBe('block')
    if (result.kind === 'block') expect(result.reason).toContain('rm')
  })

  test('blocks git push in read-only mode', () => {
    const result = validateReadOnly('git push origin main', 'read-only')
    expect(result.kind).toBe('block')
    if (result.kind === 'block') expect(result.reason).toContain('push')
  })

  test('allows git status in read-only mode', () => {
    expect(validateReadOnly('git status', 'read-only')).toEqual({ kind: 'allow' })
  })

  test('blocks package install in read-only mode', () => {
    const result = validateReadOnly('npm install express', 'read-only')
    expect(result.kind).toBe('block')
    if (result.kind === 'block') expect(result.reason).toContain('npm')
  })

  test('allows git log in read-only mode', () => {
    expect(validateReadOnly('git log --oneline', 'read-only')).toEqual({ kind: 'allow' })
  })
})

describe('checkDestructive', () => {
  test('warns rm -rf root', () => {
    const result = checkDestructive('rm -rf /')
    expect(result.kind).toBe('warn')
    if (result.kind === 'warn') expect(result.message).toContain('root')
  })

  test('warns rm -rf home', () => {
    const result = checkDestructive('rm -rf ~')
    expect(result.kind).toBe('warn')
    if (result.kind === 'warn') expect(result.message).toContain('home')
  })

  test('warns shred', () => {
    const result = checkDestructive('shred /dev/sda')
    expect(result.kind).toBe('warn')
    if (result.kind === 'warn') expect(result.message).toContain('destructive')
  })

  test('warns fork bomb', () => {
    const result = checkDestructive(':(){ :|:& };:')
    expect(result.kind).toBe('warn')
    if (result.kind === 'warn') expect(result.message).toContain('Fork bomb')
  })

  test('allows safe commands', () => {
    expect(checkDestructive('ls -la')).toEqual({ kind: 'allow' })
    expect(checkDestructive('echo hello')).toEqual({ kind: 'allow' })
  })
})

describe('validateMode', () => {
  test('workspace-write warns system paths', () => {
    const result = validateMode('cp file.txt /etc/config', 'workspace-write')
    expect(result.kind).toBe('warn')
    if (result.kind === 'warn') expect(result.message).toContain('outside the workspace')
  })

  test('workspace-write allows local writes', () => {
    expect(validateMode('cp file.txt ./backup/', 'workspace-write')).toEqual({ kind: 'allow' })
  })

  test('danger-full-access allows everything', () => {
    expect(validateMode('rm -rf /', 'danger-full-access')).toEqual({ kind: 'allow' })
  })
})

describe('validateSed', () => {
  test('blocks sed in-place in read-only mode', () => {
    const result = validateSed("sed -i 's/old/new/' file.txt", 'read-only')
    expect(result.kind).toBe('block')
    if (result.kind === 'block') expect(result.reason).toContain('sed -i')
  })

  test('allows sed stdout in read-only mode', () => {
    expect(validateSed("sed 's/old/new/' file.txt", 'read-only')).toEqual({ kind: 'allow' })
  })

  test('allows non-sed commands', () => {
    expect(validateSed('cat file.txt', 'read-only')).toEqual({ kind: 'allow' })
  })
})

describe('validatePaths', () => {
  test('warns directory traversal', () => {
    const result = validatePaths('cat ../../../etc/passwd', '/workspace/project')
    expect(result.kind).toBe('warn')
    if (result.kind === 'warn') expect(result.message).toContain('traversal')
  })

  test('warns home directory reference', () => {
    const result = validatePaths('cat ~/.ssh/id_rsa', '/workspace/project')
    expect(result.kind).toBe('warn')
    if (result.kind === 'warn') expect(result.message).toContain('home directory')
  })

  test('allows normal paths', () => {
    expect(validatePaths('cat src/main.ts', '/workspace')).toEqual({ kind: 'allow' })
  })
})

describe('classifyCommand', () => {
  test('classifies read-only commands', () => {
    expect(classifyCommand('ls -la')).toBe('read_only')
    expect(classifyCommand('cat file.txt')).toBe('read_only')
    expect(classifyCommand('grep -r pattern .')).toBe('read_only')
    expect(classifyCommand("find . -name '*.ts'")).toBe('read_only')
  })

  test('classifies write commands', () => {
    expect(classifyCommand('cp a.txt b.txt')).toBe('write')
    expect(classifyCommand('mv old.txt new.txt')).toBe('write')
    expect(classifyCommand('mkdir -p /tmp/dir')).toBe('write')
  })

  test('classifies destructive commands', () => {
    expect(classifyCommand('rm -rf /tmp/x')).toBe('destructive')
    expect(classifyCommand('shred /dev/sda')).toBe('destructive')
  })

  test('classifies network commands', () => {
    expect(classifyCommand('curl https://example.com')).toBe('network')
    expect(classifyCommand('wget file.zip')).toBe('network')
  })

  test('classifies sed in-place as write', () => {
    expect(classifyCommand("sed -i 's/old/new/' file.txt")).toBe('write')
  })

  test('classifies sed stdout as read-only', () => {
    expect(classifyCommand("sed 's/old/new/' file.txt")).toBe('read_only')
  })

  test('classifies git status as read-only', () => {
    expect(classifyCommand('git status')).toBe('read_only')
    expect(classifyCommand('git log --oneline')).toBe('read_only')
  })

  test('classifies git push as write', () => {
    expect(classifyCommand('git push origin main')).toBe('write')
  })

  test('classifies unknown commands', () => {
    expect(classifyCommand('my-custom-tool arg1')).toBe('unknown')
  })
})

describe('validateCommand (full pipeline)', () => {
  test('pipeline blocks write in read-only', () => {
    const result = validateCommand('rm -rf /tmp/x', 'read-only', '/workspace')
    expect(result.kind).toBe('block')
  })

  test('pipeline warns destructive in write mode', () => {
    const result = validateCommand('rm -rf /', 'workspace-write', '/workspace')
    expect(result.kind).toBe('warn')
  })

  test('pipeline allows safe read in read-only', () => {
    expect(validateCommand('ls -la', 'read-only', '/workspace')).toEqual({ kind: 'allow' })
  })
})

describe('extractFirstCommand', () => {
  test('extracts command from env prefix', () => {
    expect(extractFirstCommand('FOO=bar ls -la')).toBe('ls')
    expect(extractFirstCommand('A=1 B=2 echo hello')).toBe('echo')
  })

  test('extracts plain command', () => {
    expect(extractFirstCommand('grep -r pattern .')).toBe('grep')
  })

  test('extracts from empty input', () => {
    expect(extractFirstCommand('')).toBe('')
  })

  test('extracts from sudo', () => {
    expect(extractFirstCommand('sudo rm -rf /tmp')).toBe('sudo')
  })
})
