import { spawnSync } from 'node:child_process'

export interface GhPrCreateInput {
  readonly owner: string
  readonly repo: string
  readonly head: string
  readonly base: string
  readonly title: string
  readonly body: string
}

export interface GhPrUpdateInput {
  readonly owner: string
  readonly repo: string
  readonly number: number
  readonly title: string
  readonly body: string
}

export interface GhPrViewResult {
  readonly number: number
  readonly state: string
  readonly url: string
}

export interface GhPrOps {
  /** Returns the open PR for the given head branch, or null when none exists. */
  findOpenByHead(owner: string, repo: string, head: string): Promise<GhPrViewResult | null>
  /** Opens a PR via `gh pr create`. Returns the new PR's number + URL. */
  create(input: GhPrCreateInput): Promise<GhPrViewResult>
  /** Updates the PR title + body via `gh pr edit`. */
  update(input: GhPrUpdateInput): Promise<GhPrViewResult>
}

export class GhPrError extends Error {
  readonly command: string
  readonly exitCode: number | null
  readonly stderr: string
  constructor(command: string, exitCode: number | null, stderr: string) {
    super(`gh ${command} failed (exit ${exitCode ?? 'unknown'}): ${stderr.trim().slice(0, 200)}`)
    this.name = 'GhPrError'
    this.command = command
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export interface ShellGhPrOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly ghBinary?: string
}

export class ShellGhPrOps implements GhPrOps {
  private readonly cwd?: string
  private readonly env: NodeJS.ProcessEnv
  private readonly bin: string

  constructor(opts: ShellGhPrOptions = {}) {
    this.cwd = opts.cwd
    this.env = opts.env ?? process.env
    this.bin = opts.ghBinary ?? 'gh'
  }

  async findOpenByHead(owner: string, repo: string, head: string): Promise<GhPrViewResult | null> {
    const stdout = this.runCapture([
      'pr',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--head',
      head,
      '--state',
      'open',
      '--json',
      'number,url,state',
      '--limit',
      '1',
    ])
    const rows = parseJsonArray(stdout)
    if (rows.length === 0) return null
    const row = rows[0] as { number: number; url: string; state: string }
    return { number: row.number, url: row.url, state: row.state }
  }

  async create(input: GhPrCreateInput): Promise<GhPrViewResult> {
    const url = this.runCapture([
      'pr',
      'create',
      '--repo',
      `${input.owner}/${input.repo}`,
      '--head',
      input.head,
      '--base',
      input.base,
      '--title',
      input.title,
      '--body',
      input.body,
    ]).trim()
    return this.view(input.owner, input.repo, parseNumberFromUrl(url), url)
  }

  async update(input: GhPrUpdateInput): Promise<GhPrViewResult> {
    this.run([
      'pr',
      'edit',
      String(input.number),
      '--repo',
      `${input.owner}/${input.repo}`,
      '--title',
      input.title,
      '--body',
      input.body,
    ])
    const url = this.runCapture([
      'pr',
      'view',
      String(input.number),
      '--repo',
      `${input.owner}/${input.repo}`,
      '--json',
      'url',
      '--jq',
      '.url',
    ]).trim()
    return { number: input.number, url, state: 'open' }
  }

  private view(owner: string, repo: string, number: number, fallbackUrl: string): GhPrViewResult {
    return { number, url: fallbackUrl, state: 'open' }
  }

  private run(args: string[]): void {
    const result = spawnSync(this.bin, args, { cwd: this.cwd, env: this.env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new GhPrError(args.slice(0, 2).join(' '), result.status, result.stderr ?? '')
    }
  }

  private runCapture(args: string[]): string {
    const result = spawnSync(this.bin, args, { cwd: this.cwd, env: this.env, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new GhPrError(args.slice(0, 2).join(' '), result.status, result.stderr ?? '')
    }
    return typeof result.stdout === 'string' ? result.stdout : ''
  }
}

function parseNumberFromUrl(url: string): number {
  const match = url.match(/\/pull\/(\d+)/)
  if (!match) {
    throw new Error(`gh pr create returned no parseable PR number: ${url}`)
  }
  return Number(match[1])
}

function parseJsonArray(text: string): unknown[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
