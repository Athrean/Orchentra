import React from 'react'
import { Box, Text } from 'ink'
import { THEME } from '../theme'
import { parseMarkdown, type Block } from '../markdown/parse'
import { tokenizeInline, type InlineToken } from '../markdown/inline'

export interface MarkdownViewProps {
  readonly text: string
}

export function MarkdownView(props: MarkdownViewProps): React.ReactElement {
  const blocks = parseMarkdown(props.text)
  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </Box>
  )
}

function BlockView({ block }: { readonly block: Block }): React.ReactElement {
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
            <Box key={i} flexDirection="row">
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
  }
}

function Inline({ text }: { readonly text: string }): React.ReactElement {
  const tokens = tokenizeInline(text)
  return (
    <>
      {tokens.map((tok, i) => (
        <InlineToken key={i} token={tok} />
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
