import { describe, expect, test } from 'bun:test'
import { makeIgnoreMatcher, parseGitignore } from '../../src/tui/suggestions/gitignore'

describe('parseGitignore', () => {
  test('drops comments and blank lines, keeps patterns', () => {
    expect(parseGitignore('# comment\n\nnode_modules\n  dist/  \n')).toEqual(['node_modules', 'dist/'])
  })
})

describe('makeIgnoreMatcher', () => {
  test('ignores a bare directory name at any depth', () => {
    const ignored = makeIgnoreMatcher(['node_modules'])
    expect(ignored('node_modules', true)).toBe(true)
    expect(ignored('packages/x/node_modules', true)).toBe(true)
    expect(ignored('src/app.ts', false)).toBe(false)
  })

  test('a trailing-slash pattern only matches directories', () => {
    const ignored = makeIgnoreMatcher(['dist/'])
    expect(ignored('dist', true)).toBe(true)
    expect(ignored('dist', false)).toBe(false)
  })

  test('a leading slash anchors to the root', () => {
    const ignored = makeIgnoreMatcher(['/build'])
    expect(ignored('build', true)).toBe(true)
    expect(ignored('src/build', true)).toBe(false)
  })

  test('glob patterns match by extension at any level', () => {
    const ignored = makeIgnoreMatcher(['*.log'])
    expect(ignored('debug.log', false)).toBe(true)
    expect(ignored('logs/run.log', false)).toBe(true)
    expect(ignored('app.ts', false)).toBe(false)
  })

  test('a slash in the middle anchors the pattern to the root', () => {
    const ignored = makeIgnoreMatcher(['coverage/lcov.info'])
    expect(ignored('coverage/lcov.info', false)).toBe(true)
    expect(ignored('sub/coverage/lcov.info', false)).toBe(false)
  })

  test('negation with ! un-ignores a previously ignored path (last match wins)', () => {
    const ignored = makeIgnoreMatcher(['*.log', '!keep.log'])
    expect(ignored('debug.log', false)).toBe(true)
    expect(ignored('keep.log', false)).toBe(false)
  })

  test('an empty pattern list ignores nothing', () => {
    const ignored = makeIgnoreMatcher([])
    expect(ignored('anything', false)).toBe(false)
  })
})
