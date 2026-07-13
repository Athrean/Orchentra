import { describe, expect, test } from 'bun:test'
import { failureSignature, normalizeFailureLog, redactSecrets } from '../src/memory/failure-signature'

describe('normalizeFailureLog', () => {
  test('strips timestamps, paths, line numbers, hashes, and counters', () => {
    const out = normalizeFailureLog(
      '2026-06-25T10:00:00.123Z ERROR at /Users/alice/proj/src/foo.test.ts:42:10 — run abc123def4 took 30000ms',
    )
    expect(out).not.toContain('2026-06-25')
    expect(out).not.toContain('/Users/alice')
    expect(out).not.toContain('42:10')
    expect(out).not.toContain('abc123def4')
    expect(out).not.toContain('30000')
    expect(out).toContain('foo.test.ts')
    expect(out).toContain('ERROR')
  })
})

describe('failureSignature', () => {
  test('same failure under different timestamps/paths/ids hashes identically', () => {
    const a = failureSignature({
      workflowName: 'ci',
      jobName: 'test',
      stepName: 'unit',
      log: '2026-06-25T10:00:00.123Z FAIL /Users/alice/proj/src/foo.test.ts:42:10 timeout 30000ms (run abc123def4)',
    })
    const b = failureSignature({
      workflowName: 'ci',
      jobName: 'test',
      stepName: 'unit',
      log: '2026-06-26T11:22:33.999Z FAIL /home/bob/work/src/foo.test.ts:88:3 timeout 45000ms (run 9f8e7d6cab)',
    })
    expect(a.hash).toBe(b.hash)
  })

  test('genuinely different errors hash differently', () => {
    const a = failureSignature({ workflowName: 'ci', log: 'TypeError: cannot read property x of undefined' })
    const b = failureSignature({ workflowName: 'ci', log: 'ReferenceError: y is not defined' })
    expect(a.hash).not.toBe(b.hash)
  })

  test('different job in the same workflow hashes differently', () => {
    const log = 'FAIL timeout'
    const a = failureSignature({ workflowName: 'ci', jobName: 'lint', log })
    const b = failureSignature({ workflowName: 'ci', jobName: 'test', log })
    expect(a.hash).not.toBe(b.hash)
  })

  test('redacts secrets before hashing so the secret never enters the signature', () => {
    const withSecret = failureSignature({
      workflowName: 'ci',
      log: 'auth failed token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    })
    const withoutSecret = failureSignature({
      workflowName: 'ci',
      log: 'auth failed token ghp_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
    })
    expect(withSecret.hash).toBe(withoutSecret.hash)
    expect(withSecret.normalizedLog).not.toContain('ghp_ABCDEFG')
  })
})

describe('redactSecrets', () => {
  test('removes common credential shapes', () => {
    const redacted = redactSecrets(
      [
        'token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        'aws AKIAIOSFODNN7EXAMPLE',
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
        'openai sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
        'API_KEY=supersecretvalue',
      ].join('\n'),
    )
    expect(redacted).not.toContain('ghp_ABCDEFG')
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(redacted).not.toContain('eyJhbGci')
    expect(redacted).not.toContain('sk-ABCDEFG')
    expect(redacted).not.toContain('supersecretvalue')
    expect(redacted).toContain('<REDACTED>')
  })

  test('removes an entire PEM private-key block, not only its header', () => {
    const pem = ['-----BEGIN PRIVATE KEY-----', 'raw-private-material', '-----END PRIVATE KEY-----'].join('\n')
    const redacted = redactSecrets(`before\n${pem}\nafter`)

    expect(redacted).toBe('before\n<REDACTED>\nafter')
    expect(redacted).not.toContain('raw-private-material')
  })
})
