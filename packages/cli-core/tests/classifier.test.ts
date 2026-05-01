import { describe, expect, test } from 'bun:test'
import { classify } from '../src/permissions/classifier'

interface Case {
  readonly name: string
  readonly input: string
  readonly verb: string
  readonly subverb?: string
  readonly flags: readonly string[]
  readonly args: readonly string[]
}

const cases: readonly Case[] = [
  // basic verb
  { name: 'lone verb', input: 'pwd', verb: 'pwd', flags: [], args: [] },
  { name: 'verb + arg', input: 'cat README.md', verb: 'cat', flags: [], args: ['README.md'] },
  { name: 'verb + flag', input: 'ls -la', verb: 'ls', flags: ['-la'], args: [] },

  // subverb tools
  { name: 'git subverb', input: 'git status', verb: 'git', subverb: 'status', flags: [], args: [] },
  { name: 'gh subverb', input: 'gh issue list', verb: 'gh', subverb: 'issue', flags: [], args: ['list'] },
  { name: 'npm subverb', input: 'npm publish', verb: 'npm', subverb: 'publish', flags: [], args: [] },
  { name: 'pnpm subverb', input: 'pnpm install', verb: 'pnpm', subverb: 'install', flags: [], args: [] },
  { name: 'cargo subverb', input: 'cargo build', verb: 'cargo', subverb: 'build', flags: [], args: [] },
  { name: 'docker subverb', input: 'docker ps', verb: 'docker', subverb: 'ps', flags: [], args: [] },

  // flag forms
  {
    name: 'long flag w/ value (=)',
    input: 'curl --max-time=5 url',
    verb: 'curl',
    flags: ['--max-time=5'],
    args: ['url'],
  },
  {
    name: 'long flag w/ value (space)',
    input: 'curl --max-time 5 url',
    verb: 'curl',
    flags: ['--max-time', '5'],
    args: ['url'],
  },
  { name: 'short flags clustered', input: 'tar -xvf file.tar', verb: 'tar', flags: ['-xvf'], args: ['file.tar'] },

  // env assignment prefix
  { name: 'single env var prefix', input: 'FOO=bar git status', verb: 'git', subverb: 'status', flags: [], args: [] },
  {
    name: 'multiple env vars prefix',
    input: 'A=1 B=2 npm test',
    verb: 'npm',
    subverb: 'test',
    flags: [],
    args: [],
  },

  // quoted args
  {
    name: 'double-quoted arg with space',
    input: 'echo "hello world"',
    verb: 'echo',
    flags: [],
    args: ['hello world'],
  },
  {
    name: 'single-quoted arg with space',
    input: "echo 'hello world'",
    verb: 'echo',
    flags: [],
    args: ['hello world'],
  },
  {
    name: 'mixed quoted + unquoted',
    input: 'git commit -m "wip" --amend',
    verb: 'git',
    subverb: 'commit',
    flags: ['-m', '--amend'],
    args: ['wip'],
  },
  {
    name: 'escaped quote inside double',
    input: 'echo "a\\"b"',
    verb: 'echo',
    flags: [],
    args: ['a"b'],
  },

  // path-prefixed verb
  { name: 'absolute-path verb', input: '/usr/bin/git status', verb: 'git', subverb: 'status', flags: [], args: [] },
  { name: 'relative-path verb', input: './scripts/run.sh --dry', verb: 'run.sh', flags: ['--dry'], args: [] },

  // edge cases
  { name: 'leading whitespace', input: '   ls', verb: 'ls', flags: [], args: [] },
  { name: 'collapsed whitespace', input: 'git    status', verb: 'git', subverb: 'status', flags: [], args: [] },
  { name: 'env-only with no verb', input: 'FOO=bar', verb: '', flags: [], args: [] },
  { name: 'empty input', input: '', verb: '', flags: [], args: [] },
]

describe('classify', () => {
  for (const c of cases) {
    test(c.name, () => {
      const got = classify(c.input)
      expect(got.verb).toBe(c.verb)
      expect(got.subverb ?? null).toBe(c.subverb ?? null)
      expect(got.flags).toEqual(c.flags)
      expect(got.args).toEqual(c.args)
    })
  }
})
