import type { PermissionMode } from '@orchentra/cli-core'

export type ValidationResult = { kind: 'allow' } | { kind: 'block'; reason: string } | { kind: 'warn'; message: string }

export type CommandIntent =
  | 'read_only'
  | 'write'
  | 'destructive'
  | 'network'
  | 'process_management'
  | 'package_management'
  | 'system_admin'
  | 'unknown'

export const WRITE_COMMANDS = [
  'cp',
  'mv',
  'rm',
  'mkdir',
  'rmdir',
  'touch',
  'chmod',
  'chown',
  'chgrp',
  'ln',
  'install',
  'tee',
  'truncate',
  'shred',
  'mkfifo',
  'mknod',
  'dd',
] as const

export const STATE_MODIFYING_COMMANDS = [
  'apt',
  'apt-get',
  'yum',
  'dnf',
  'pacman',
  'brew',
  'pip',
  'pip3',
  'npm',
  'yarn',
  'pnpm',
  'bun',
  'cargo',
  'gem',
  'go',
  'rustup',
  'docker',
  'systemctl',
  'service',
  'mount',
  'umount',
  'kill',
  'pkill',
  'killall',
  'reboot',
  'shutdown',
  'halt',
  'poweroff',
  'useradd',
  'userdel',
  'usermod',
  'groupadd',
  'groupdel',
  'crontab',
  'at',
] as const

export const WRITE_REDIRECTIONS = ['>', '>>', '>&'] as const

export const DESTRUCTIVE_PATTERNS: readonly (readonly [string, string])[] = [
  ['rm -rf /', 'Recursive forced deletion at root — this will destroy the system'],
  ['rm -rf ~', 'Recursive forced deletion of home directory'],
  ['rm -rf *', 'Recursive forced deletion of all files in current directory'],
  ['rm -rf .', 'Recursive forced deletion of current directory'],
  ['mkfs', 'Filesystem creation will destroy existing data on the device'],
  ['dd if=', 'Direct disk write — can overwrite partitions or devices'],
  ['> /dev/sd', 'Writing to raw disk device'],
  ['chmod -R 777', 'Recursively setting world-writable permissions'],
  ['chmod -R 000', 'Recursively removing all permissions'],
  [':(){ :|:& };:', 'Fork bomb — will crash the system'],
] as const

export const ALWAYS_DESTRUCTIVE_COMMANDS = ['shred', 'wipefs'] as const

export const GIT_READ_ONLY_SUBCOMMANDS = [
  'status',
  'log',
  'diff',
  'show',
  'branch',
  'tag',
  'stash',
  'remote',
  'fetch',
  'ls-files',
  'ls-tree',
  'cat-file',
  'rev-parse',
  'describe',
  'shortlog',
  'blame',
  'bisect',
  'reflog',
  'config',
] as const

export const SEMANTIC_READ_ONLY_COMMANDS = [
  'ls',
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'wc',
  'sort',
  'uniq',
  'grep',
  'egrep',
  'fgrep',
  'find',
  'which',
  'whereis',
  'whatis',
  'man',
  'info',
  'file',
  'stat',
  'du',
  'df',
  'free',
  'uptime',
  'uname',
  'hostname',
  'whoami',
  'id',
  'groups',
  'env',
  'printenv',
  'echo',
  'printf',
  'date',
  'cal',
  'bc',
  'expr',
  'test',
  'true',
  'false',
  'pwd',
  'tree',
  'diff',
  'cmp',
  'md5sum',
  'sha256sum',
  'sha1sum',
  'xxd',
  'od',
  'hexdump',
  'strings',
  'readlink',
  'realpath',
  'basename',
  'dirname',
  'seq',
  'yes',
  'tput',
  'column',
  'jq',
  'yq',
  'xargs',
  'tr',
  'cut',
  'paste',
  'awk',
  'sed',
] as const

export const NETWORK_COMMANDS = [
  'curl',
  'wget',
  'ssh',
  'scp',
  'rsync',
  'ftp',
  'sftp',
  'nc',
  'ncat',
  'telnet',
  'ping',
  'traceroute',
  'dig',
  'nslookup',
  'host',
  'whois',
  'ifconfig',
  'ip',
  'netstat',
  'ss',
  'nmap',
] as const

export const PROCESS_COMMANDS = [
  'kill',
  'pkill',
  'killall',
  'ps',
  'top',
  'htop',
  'bg',
  'fg',
  'jobs',
  'nohup',
  'disown',
  'wait',
  'nice',
  'renice',
] as const

export const PACKAGE_COMMANDS = [
  'apt',
  'apt-get',
  'yum',
  'dnf',
  'pacman',
  'brew',
  'pip',
  'pip3',
  'npm',
  'yarn',
  'pnpm',
  'bun',
  'cargo',
  'gem',
  'go',
  'rustup',
  'snap',
  'flatpak',
] as const

export const SYSTEM_ADMIN_COMMANDS = [
  'sudo',
  'su',
  'chroot',
  'mount',
  'umount',
  'fdisk',
  'parted',
  'lsblk',
  'blkid',
  'systemctl',
  'service',
  'journalctl',
  'dmesg',
  'modprobe',
  'insmod',
  'rmmod',
  'iptables',
  'ufw',
  'firewall-cmd',
  'sysctl',
  'crontab',
  'at',
  'useradd',
  'userdel',
  'usermod',
  'groupadd',
  'groupdel',
  'passwd',
  'visudo',
] as const

const SYSTEM_PATHS = ['/etc/', '/usr/', '/var/', '/boot/', '/sys/', '/proc/', '/dev/', '/sbin/', '/lib/', '/opt/']

export function extractFirstCommand(command: string): string {
  const trimmed = command.trim()
  let remaining = trimmed

  for (let i = 0; i < 10; i++) {
    const next = remaining.trimStart()
    const eqPos = next.indexOf('=')
    if (eqPos > 0) {
      const beforeEq = next.slice(0, eqPos)
      if (beforeEq.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(beforeEq)) {
        const afterEq = next.slice(eqPos + 1)
        const endOfValue = findEndOfValue(afterEq)
        if (endOfValue !== null) {
          remaining = afterEq.slice(endOfValue)
          continue
        }
        return ''
      }
    }
    break
  }

  return remaining.trimStart().split(/\s+/)[0] ?? ''
}

function findEndOfValue(s: string): number | null {
  const trimmed = s.trimStart()
  if (trimmed.length === 0) return null

  const first = trimmed[0]
  if (first === '"' || first === "'") {
    let i = 1
    while (i < trimmed.length) {
      if (trimmed[i] === first && (i === 0 || trimmed[i - 1] !== '\\')) {
        i++
        while (i < trimmed.length && !/\s/.test(trimmed[i])) i++
        return s.length - trimmed.length + i
      }
      i++
    }
    return null
  }

  const wsIdx = trimmed.search(/\s/)
  return wsIdx === -1 ? null : s.length - trimmed.length + wsIdx
}

function extractSudoInner(command: string): string {
  const parts = command.split(/\s+/)
  const sudoIdx = parts.indexOf('sudo')
  if (sudoIdx === -1) return ''

  const rest = parts.slice(sudoIdx + 1)
  for (const part of rest) {
    if (!part.startsWith('-')) {
      const offset = command.indexOf(part)
      return offset >= 0 ? command.slice(offset) : ''
    }
  }
  return ''
}

export function validateReadOnly(command: string, mode: PermissionMode): ValidationResult {
  if (mode !== 'read-only') return { kind: 'allow' }

  const firstCommand = extractFirstCommand(command)

  for (const writeCmd of WRITE_COMMANDS) {
    if (firstCommand === writeCmd) {
      return {
        kind: 'block',
        reason: `Command '${writeCmd}' modifies the filesystem and is not allowed in read-only mode`,
      }
    }
  }

  for (const stateCmd of STATE_MODIFYING_COMMANDS) {
    if (firstCommand === stateCmd) {
      return {
        kind: 'block',
        reason: `Command '${stateCmd}' modifies system state and is not allowed in read-only mode`,
      }
    }
  }

  if (firstCommand === 'sudo') {
    const inner = extractSudoInner(command)
    if (inner.length > 0) {
      const innerResult = validateReadOnly(inner, mode)
      if (innerResult.kind !== 'allow') return innerResult
    }
  }

  for (const redir of WRITE_REDIRECTIONS) {
    if (command.includes(redir)) {
      return {
        kind: 'block',
        reason: `Command contains write redirection '${redir}' which is not allowed in read-only mode`,
      }
    }
  }

  if (firstCommand === 'git') {
    return validateGitReadOnly(command)
  }

  return { kind: 'allow' }
}

function validateGitReadOnly(command: string): ValidationResult {
  const parts = command.split(/\s+/)
  const subcommand = parts.slice(1).find((p) => !p.startsWith('-'))

  if (subcommand && !GIT_READ_ONLY_SUBCOMMANDS.includes(subcommand as (typeof GIT_READ_ONLY_SUBCOMMANDS)[number])) {
    return {
      kind: 'block',
      reason: `Git subcommand '${subcommand}' modifies repository state and is not allowed in read-only mode`,
    }
  }

  return { kind: 'allow' }
}

export function checkDestructive(command: string): ValidationResult {
  for (const [pattern, warning] of DESTRUCTIVE_PATTERNS) {
    if (command.includes(pattern)) {
      return { kind: 'warn', message: `Destructive command detected: ${warning}` }
    }
  }

  const first = extractFirstCommand(command)
  for (const cmd of ALWAYS_DESTRUCTIVE_COMMANDS) {
    if (first === cmd) {
      return { kind: 'warn', message: `Command '${cmd}' is inherently destructive and may cause data loss` }
    }
  }

  if (command.includes('rm ') && command.includes('-r') && command.includes('-f')) {
    return { kind: 'warn', message: 'Recursive forced deletion detected — verify the target path is correct' }
  }

  return { kind: 'allow' }
}

function commandTargetsOutsideWorkspace(command: string): boolean {
  const first = extractFirstCommand(command)
  const isWriteCmd =
    WRITE_COMMANDS.includes(first as (typeof WRITE_COMMANDS)[number]) ||
    STATE_MODIFYING_COMMANDS.includes(first as (typeof STATE_MODIFYING_COMMANDS)[number])

  if (!isWriteCmd) return false

  for (const sysPath of SYSTEM_PATHS) {
    if (command.includes(sysPath)) return true
  }

  return false
}

export function validateMode(command: string, mode: PermissionMode): ValidationResult {
  if (mode === 'read-only') {
    return validateReadOnly(command, mode)
  }

  if (mode === 'workspace-write') {
    if (commandTargetsOutsideWorkspace(command)) {
      return {
        kind: 'warn',
        message: 'Command appears to target files outside the workspace — requires elevated permission',
      }
    }
    return { kind: 'allow' }
  }

  return { kind: 'allow' }
}

export function validateSed(command: string, mode: PermissionMode): ValidationResult {
  const first = extractFirstCommand(command)
  if (first !== 'sed') return { kind: 'allow' }

  if (mode === 'read-only' && command.includes(' -i')) {
    return { kind: 'block', reason: 'sed -i (in-place editing) is not allowed in read-only mode' }
  }

  return { kind: 'allow' }
}

export function validatePaths(command: string, workspace: string): ValidationResult {
  if (command.includes('../')) {
    if (!command.includes(workspace)) {
      return {
        kind: 'warn',
        message:
          "Command contains directory traversal pattern '../' — verify the target path resolves within the workspace",
      }
    }
  }

  if (command.includes('~/') || command.includes('$HOME')) {
    return { kind: 'warn', message: 'Command references home directory — verify it stays within the workspace scope' }
  }

  return { kind: 'allow' }
}

function classifyByFirstCommand(first: string, command: string): CommandIntent {
  if (SEMANTIC_READ_ONLY_COMMANDS.includes(first as (typeof SEMANTIC_READ_ONLY_COMMANDS)[number])) {
    if (first === 'sed' && command.includes(' -i')) return 'write'
    return 'read_only'
  }

  if (ALWAYS_DESTRUCTIVE_COMMANDS.includes(first as (typeof ALWAYS_DESTRUCTIVE_COMMANDS)[number]) || first === 'rm') {
    return 'destructive'
  }

  if (WRITE_COMMANDS.includes(first as (typeof WRITE_COMMANDS)[number])) return 'write'
  if (NETWORK_COMMANDS.includes(first as (typeof NETWORK_COMMANDS)[number])) return 'network'
  if (PROCESS_COMMANDS.includes(first as (typeof PROCESS_COMMANDS)[number])) return 'process_management'
  if (PACKAGE_COMMANDS.includes(first as (typeof PACKAGE_COMMANDS)[number])) return 'package_management'
  if (SYSTEM_ADMIN_COMMANDS.includes(first as (typeof SYSTEM_ADMIN_COMMANDS)[number])) return 'system_admin'

  if (first === 'git') {
    return classifyGitCommand(command)
  }

  return 'unknown'
}

function classifyGitCommand(command: string): CommandIntent {
  const parts = command.split(/\s+/)
  const subcommand = parts.slice(1).find((p) => !p.startsWith('-'))
  if (subcommand && GIT_READ_ONLY_SUBCOMMANDS.includes(subcommand as (typeof GIT_READ_ONLY_SUBCOMMANDS)[number])) {
    return 'read_only'
  }
  return 'write'
}

export function classifyCommand(command: string): CommandIntent {
  const first = extractFirstCommand(command)
  return classifyByFirstCommand(first, command)
}

export function validateCommand(command: string, mode: PermissionMode, workspace: string): ValidationResult {
  const modeResult = validateMode(command, mode)
  if (modeResult.kind !== 'allow') return modeResult

  const sedResult = validateSed(command, mode)
  if (sedResult.kind !== 'allow') return sedResult

  const destructiveResult = checkDestructive(command)
  if (destructiveResult.kind !== 'allow') return destructiveResult

  return validatePaths(command, workspace)
}
