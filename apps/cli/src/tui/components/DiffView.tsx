import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'

export interface DiffViewProps {
  readonly text: string
  readonly maxLines?: number
}

type DiffLineKind = 'add' | 'del' | 'context' | 'hunk' | 'meta' | 'file'

interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
}

// Heuristic: a string "looks like a diff" if at least 30% of non-empty lines
// start with a +/- in column 0 *and* there is at least one such add and one
// such del (or a hunk header). This avoids treating a stack trace beginning
// with `- at frame …` as a diff.
export function looksLikeDiff(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.length > 0)
  if (lines.length < 2) return false
  let addCount = 0
  let delCount = 0
  let hunkCount = 0
  for (const line of lines) {
    if (line.startsWith('@@')) hunkCount++
    else if (line.startsWith('+++') || line.startsWith('---')) {
      // file headers — count as meta, not as add/del
    } else if (line.startsWith('+')) addCount++
    else if (line.startsWith('-')) delCount++
  }
  const markers = addCount + delCount + hunkCount
  if (markers === 0) return false
  if (hunkCount > 0) return true
  return addCount > 0 && delCount > 0 && markers / lines.length >= 0.3
}

export function classifyDiffLine(line: string): DiffLine {
  if (line.startsWith('diff --git ')) return { kind: 'file', text: line }
  if (line.startsWith('@@')) return { kind: 'hunk', text: line }
  if (line.startsWith('+++') || line.startsWith('---')) return { kind: 'meta', text: line }
  if (line.startsWith('+')) return { kind: 'add', text: line }
  if (line.startsWith('-')) return { kind: 'del', text: line }
  return { kind: 'context', text: line }
}

export function DiffView(props: DiffViewProps): React.ReactElement {
  const { text, maxLines = 40 } = props
  const allLines = text.split('\n')
  const truncated = allLines.length > maxLines
  const shown = truncated ? allLines.slice(0, maxLines) : allLines
  const lines = shown.map(classifyDiffLine)

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <DiffRow key={i} line={line} />
      ))}
      {truncated ? <Text dimColor>{`…(${allLines.length - maxLines} more lines)`}</Text> : null}
    </Box>
  )
}

function DiffRow({ line }: { readonly line: DiffLine }): React.ReactElement {
  switch (line.kind) {
    case 'file':
      return <Text color={THEME.diffFile}>{`file ${formatGitFileHeader(line.text)}`}</Text>
    case 'add':
      return <Text color={THEME.diffAdd}>{`add  ${line.text}`}</Text>
    case 'del':
      return <Text color={THEME.diffDel}>{`del  ${line.text}`}</Text>
    case 'hunk':
      return (
        <Text color={THEME.diffHunk} dimColor>
          {`hunk ${line.text}`}
        </Text>
      )
    case 'meta':
      return <Text dimColor>{`meta ${line.text}`}</Text>
    case 'context':
      return <Text>{`     ${line.text}`}</Text>
  }
}

function formatGitFileHeader(line: string): string {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
  if (!match) return line
  const [, from, to] = match
  return from === to ? from : `${from} → ${to}`
}
