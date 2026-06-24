import { isAbsolute, relative, resolve } from 'node:path'
import { grepSearch } from '@orchentra/cli-tools'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class SearchCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'search',
    aliases: [],
    summary: 'Search file contents in the workspace',
    argumentHint: '<pattern> [path] [--glob <glob>] [-i] [--limit <n>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const parsed = parseArgs(args)
    if (!parsed.pattern) {
      emit(ctx, {
        kind: 'note',
        tone: 'warn',
        text: 'Usage: /search <pattern> [path] [--glob <glob>] [-i] [--limit <n>]',
      })
      return true
    }

    const searchPath = resolveSearchPath(ctx.cwd, parsed.path)
    if (!isInside(ctx.cwd, searchPath)) {
      emit(ctx, { kind: 'note', tone: 'warn', text: `Search path escapes workspace: ${parsed.path}` })
      return true
    }

    try {
      const result = await grepSearch({
        pattern: parsed.pattern,
        path: searchPath,
        glob: parsed.glob,
        outputMode: 'content',
        caseInsensitive: parsed.caseInsensitive,
        headLimit: parsed.limit,
      })
      const body = result.content?.trim()
      const header = `${result.numFiles} file${result.numFiles === 1 ? '' : 's'} matched`
      const text = body ? `${header}\n${relativizeContent(ctx.cwd, body)}` : `${header}\nNo matches.`
      emit(ctx, { kind: 'text', text })
      return true
    } catch (error) {
      emit(ctx, { kind: 'note', tone: 'warn', text: `Search failed: ${(error as Error).message}` })
      return true
    }
  }
}

interface ParsedArgs {
  pattern?: string
  path?: string
  glob?: string
  caseInsensitive?: boolean
  limit?: number
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--glob') {
      parsed.glob = args[++i]
    } else if (arg === '--limit') {
      const n = Number(args[++i])
      if (Number.isFinite(n) && n > 0) parsed.limit = Math.floor(n)
    } else if (arg === '-i' || arg === '--ignore-case') {
      parsed.caseInsensitive = true
    } else {
      positional.push(arg)
    }
  }

  parsed.pattern = positional[0]
  parsed.path = positional[1]
  return parsed
}

function resolveSearchPath(cwd: string, path?: string): string {
  if (!path) return cwd
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path)
}

function isInside(root: string, target: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + '/')
}

function relativizeContent(cwd: string, content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const match = line.match(/^([^:]+):(.*)$/)
      if (!match) return line
      const file = match[1]
      const rest = match[2]
      return `${relative(cwd, file)}:${rest}`
    })
    .join('\n')
}

function emit(
  ctx: CommandContext,
  output: { kind: 'text'; text: string } | { kind: 'note'; text: string; tone?: 'info' | 'warn' },
): void {
  if (ctx.ui) ctx.ui(output)
  else process.stdout.write(output.text + '\n')
}
