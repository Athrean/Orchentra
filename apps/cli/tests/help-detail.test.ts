import { describe, expect, test } from 'bun:test'
import { getPullRequestOperation, listWorkflowRunsOperation } from '@orchentra/operations'
import { renderOpDetail } from '../src/op-commands/help-detail'

describe('renderOpDetail', () => {
  test('renders required + type + description for get_pull_request params', () => {
    const out = renderOpDetail(getPullRequestOperation)
    expect(out).toContain('get_pull_request')
    expect(out).toContain('owner')
    expect(out).toContain('repo')
    expect(out).toContain('number')
    expect(out).toContain('Repository owner')
    expect(out).toContain('Pull request number')
    expect(out.toLowerCase()).toContain('required')
  })

  test('marks optional params as optional', () => {
    const out = renderOpDetail(listWorkflowRunsOperation)
    expect(out.toLowerCase()).toContain('optional')
  })
})
