import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { classifyDiffLine, DiffView, looksLikeDiff } from '../src/tui/components/DiffView'

describe('looksLikeDiff', () => {
  test('detects unified-diff-style hunks', () => {
    const sample = `@@ -1,3 +1,3 @@
 unchanged
-removed
+added`
    expect(looksLikeDiff(sample)).toBe(true)
  })

  test('treats matching add+del without a hunk header as a diff', () => {
    const sample = `-old line one
-old line two
+new line one
+new line two`
    expect(looksLikeDiff(sample)).toBe(true)
  })

  test('rejects plain text with no diff markers', () => {
    expect(looksLikeDiff('hello\nworld\nno markers here')).toBe(false)
  })

  test('rejects a stack trace whose lines coincidentally start with a dash', () => {
    const trace = `Error: something
    - at frame one
    - at frame two
    - at frame three`
    expect(looksLikeDiff(trace)).toBe(false)
  })

  test('rejects single-line input', () => {
    expect(looksLikeDiff('+foo')).toBe(false)
  })
})

describe('classifyDiffLine', () => {
  test('classifies +/- and hunk headers correctly', () => {
    expect(classifyDiffLine('@@ -1 +1 @@').kind).toBe('hunk')
    expect(classifyDiffLine('+added').kind).toBe('add')
    expect(classifyDiffLine('-removed').kind).toBe('del')
    expect(classifyDiffLine(' context').kind).toBe('context')
    expect(classifyDiffLine('+++ b/file').kind).toBe('meta')
    expect(classifyDiffLine('--- a/file').kind).toBe('meta')
  })
})

describe('DiffView rendering', () => {
  test('renders file headers, hunks, additions, and deletions with visible row labels', () => {
    const sample = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-old line
+new line`
    const { lastFrame } = render(<DiffView text={sample} />)
    const out = lastFrame() ?? ''

    expect(out).toContain('file')
    expect(out).toContain('src/app.ts')
    expect(out).toContain('hunk')
    expect(out).toContain('-old line')
    expect(out).toContain('+new line')
  })
})
