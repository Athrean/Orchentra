import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { THEME } from '../theme'
import { parseMarkdown, type Block, type TableBlock } from '../markdown/parse'
import { tokenizeInline, type InlineToken } from '../markdown/inline'
import { splitAtStreamBoundary } from '../markdown/stream'
import { computeColumnWidths, inlineWidth, wrapCell, type CellAlign } from '../markdown/table'

export interface MarkdownViewProps {
  readonly text: string
  /**
   * When true, defer rendering of the trailing partial block (open fence,
   * mid-paragraph) as plain text instead of styled markdown — avoids the
   * flicker of a half-typed code block being rendered as a closed box.
   */
  readonly streaming?: boolean
}

export function MarkdownView(props: MarkdownViewProps): React.ReactElement {
  const { stdout } = useStdout()
  // Assistant markdown sits inside paddingX={1} plus a 2-col `● ` marker, so
  // the usable content width is the terminal minus that gutter.
  const available = Math.max(24, (stdout?.columns ?? 80) - 4)
  if (props.streaming) {
    const { safe, pending } = splitAtStreamBoundary(props.text)
    const blocks = parseMarkdown(safe)
    return (
      <Box flexDirection="column">
        {blocks.map((block) => (
          <BlockView key={JSON.stringify(block)} block={block} width={available} />
        ))}
        {pending.length > 0 ? <Text>{pending}</Text> : null}
      </Box>
    )
  }
  const blocks = parseMarkdown(props.text)
  return (
    <Box flexDirection="column">
      {blocks.map((block) => (
        <BlockView key={JSON.stringify(block)} block={block} width={available} />
      ))}
    </Box>
  )
}

function BlockView({ block, width }: { readonly block: Block; readonly width: number }): React.ReactElement {
  switch (block.kind) {
    case 'heading': {
      const color =
        block.level === 1
          ? THEME.brand
          : block.level === 2
            ? THEME.heading
            : block.level === 3
              ? THEME.headingAlt
              : undefined
      return (
        <Text bold color={color}>
          <Inline text={block.text} />
        </Text>
      )
    }
    case 'paragraph':
      return (
        <Text>
          <Inline text={block.text} />
        </Text>
      )
    case 'list':
      return (
        <Box flexDirection="column">
          {block.items.map((item, i) => (
            <Box key={item} flexDirection="row">
              <Text color={THEME.brand}>{block.ordered ? `${i + 1}. ` : '• '}</Text>
              <Text>
                <Inline text={item} />
              </Text>
            </Box>
          ))}
        </Box>
      )
    case 'quote':
      return (
        <Box flexDirection="row">
          <Text color={THEME.quote}>{'│ '}</Text>
          <Text color={THEME.quote} italic>
            <Inline text={block.text} />
          </Text>
        </Box>
      )
    case 'code': {
      const lines = block.text.split('\n')
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={THEME.codeBorder} paddingX={1}>
          {block.lang ? (
            <Text color={THEME.brand} dimColor>
              {block.lang}
            </Text>
          ) : null}
          {lines.map((line, i) => (
            <Text key={i}>{line.length === 0 ? ' ' : line}</Text>
          ))}
        </Box>
      )
    }
    case 'table':
      return <TableView block={block} width={width} />
  }
}

function TableView({ block, width }: { readonly block: TableBlock; readonly width: number }): React.ReactElement {
  const widths = computeColumnWidths(block.headers, block.rows, width)
  const border = THEME.codeBorder
  const rule = (l: string, mid: string, r: string): string => l + widths.map((w) => '─'.repeat(w + 2)).join(mid) + r
  return (
    <Box flexDirection="column">
      <Text color={border}>{rule('╭', '┬', '╮')}</Text>
      <TableRow cells={block.headers} widths={widths} aligns={block.aligns} border={border} header />
      <Text color={border}>{rule('├', '┼', '┤')}</Text>
      {block.rows.map((row) => (
        <TableRow key={JSON.stringify(row)} cells={row} widths={widths} aligns={block.aligns} border={border} />
      ))}
      <Text color={border}>{rule('╰', '┴', '╯')}</Text>
    </Box>
  )
}

function TableRow(props: {
  readonly cells: readonly string[]
  readonly widths: readonly number[]
  readonly aligns: readonly CellAlign[]
  readonly border: string
  readonly header?: boolean
}): React.ReactElement {
  const wrapped = props.widths.map((w, c) => wrapCell(props.cells[c] ?? '', w))
  const height = wrapped.reduce((h, lines) => Math.max(h, lines.length), 1)
  const bar = <Text color={props.border}>│</Text>
  return (
    <Box flexDirection="column">
      {Array.from({ length: height }, (_, r) => (
        <Text key={r}>
          {props.widths.map((w, c) => {
            const seg = wrapped[c][r] ?? ''
            const pad = Math.max(0, w - inlineWidth(seg))
            const align = props.aligns[c] ?? 'left'
            const leftPad = align === 'right' ? pad : align === 'center' ? Math.floor(pad / 2) : 0
            const rightPad = pad - leftPad
            return (
              <React.Fragment key={c}>
                {bar}
                <Text>{` ${' '.repeat(leftPad)}`}</Text>
                {props.header ? (
                  <Text bold color={THEME.brand}>
                    <Inline text={seg} />
                  </Text>
                ) : (
                  <Inline text={seg} />
                )}
                <Text>{`${' '.repeat(rightPad)} `}</Text>
              </React.Fragment>
            )
          })}
          {bar}
        </Text>
      ))}
    </Box>
  )
}

function Inline({ text }: { readonly text: string }): React.ReactElement {
  const tokens = tokenizeInline(text)
  return (
    <>
      {tokens.map((tok) => (
        <InlineToken key={JSON.stringify(tok)} token={tok} />
      ))}
    </>
  )
}

function InlineToken({ token }: { readonly token: InlineToken }): React.ReactElement {
  switch (token.kind) {
    case 'text':
      return <Text>{token.value}</Text>
    case 'code':
      return (
        <Text color={THEME.inlineCode} backgroundColor={undefined}>
          {`\`${token.value}\``}
        </Text>
      )
    case 'bold':
      return (
        <Text bold color={THEME.strong}>
          {token.value}
        </Text>
      )
    case 'italic':
      return (
        <Text italic color={THEME.emphasis}>
          {token.value}
        </Text>
      )
    case 'link':
      return (
        <Text underline color={THEME.link}>
          {token.text}
          {token.text === token.href ? '' : ` (${token.href})`}
        </Text>
      )
  }
}
