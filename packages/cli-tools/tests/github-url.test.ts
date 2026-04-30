import { describe, expect, test } from 'bun:test'
import { parseGitHubUrl } from '../src/github/url'

describe('parseGitHubUrl', () => {
  test.each([
    ['https://github.com/owner/repo', { owner: 'owner', repo: 'repo' }],
    ['http://github.com/owner/repo', { owner: 'owner', repo: 'repo' }],
    ['https://github.com/owner/repo.git', { owner: 'owner', repo: 'repo' }],
    ['https://github.com/owner/repo/', { owner: 'owner', repo: 'repo' }],
    ['https://github.com/owner/repo/issues', { owner: 'owner', repo: 'repo' }],
    ['https://github.com/owner/repo/pulls', { owner: 'owner', repo: 'repo' }],
    ['https://github.com/owner/repo/issues/123', { owner: 'owner', repo: 'repo', kind: 'issue', number: 123 }],
    ['https://github.com/owner/repo/pull/45', { owner: 'owner', repo: 'repo', kind: 'pull', number: 45 }],
    ['git@github.com:owner/repo.git', { owner: 'owner', repo: 'repo' }],
    ['git@github.com:owner/repo', { owner: 'owner', repo: 'repo' }],
    ['owner/repo', { owner: 'owner', repo: 'repo' }],
    ['Athrean/Orchentra', { owner: 'Athrean', repo: 'Orchentra' }],
  ])('parses %s', (input, expected) => {
    expect(parseGitHubUrl(input)).toEqual(expected)
  })

  test.each([
    [''],
    ['   '],
    ['not a url'],
    ['https://example.com/owner/repo'],
    ['https://github.com/owner'],
    ['https://github.com/'],
    ['https://gitlab.com/owner/repo'],
    ['owner'],
    ['owner/'],
    ['/repo'],
  ])('rejects %s', (input) => {
    expect(parseGitHubUrl(input)).toBeNull()
  })

  test('trims whitespace', () => {
    expect(parseGitHubUrl('  https://github.com/owner/repo  ')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('handles non-numeric issue/pull suffix as bare repo', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/issues/abc')).toEqual({ owner: 'owner', repo: 'repo' })
  })
})
