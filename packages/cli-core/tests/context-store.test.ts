import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ContextStoreError,
  CURRENT_CONTEXT_MANIFEST_VERSION,
  RunContextStore,
  expireContextHandles,
  loadContextManifest,
} from '../src/runtime/context-store'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('RunContextStore', () => {
  test('stores immutable descriptors and supports bounded read/search', async () => {
    const store = new RunContextStore('run-a', { clock: () => '2026-09-03T00:00:00.000Z' })
    const descriptor = await store.store({
      kind: 'text',
      trust: 'untrusted',
      provenance: { kind: 'user-input', label: 'large document' },
      value: { text: 'alpha NEEDLE omega NEEDLE tail' },
    })

    expect(descriptor.handle).toMatch(/^ctx_[a-f0-9]{10}_1_[a-f0-9]{10}$/)
    expect(store.list()).toEqual([descriptor])
    expect(store.read(descriptor.handle, 6, 6)).toMatchObject({
      text: 'NEEDLE',
      offset: 6,
      nextOffset: 12,
      truncated: true,
    })
    expect(store.search(descriptor.handle, 'needle')).toMatchObject({
      query: 'needle',
      matches: [
        { offset: 6, end: 12 },
        { offset: 19, end: 25 },
      ],
      truncated: false,
    })
  })

  test('rejects cross-run handles, quota overflow, and access after close', async () => {
    const first = new RunContextStore('run-a', { limits: { maxEntryBytes: 32, maxTotalBytes: 32 } })
    const second = new RunContextStore('run-b')
    const descriptor = await first.store({
      kind: 'text',
      trust: 'untrusted',
      provenance: { kind: 'model' },
      value: { text: 'small' },
    })

    expect(() => second.read(descriptor.handle)).toThrow('different run')
    await expect(
      first.store({
        kind: 'text',
        trust: 'untrusted',
        provenance: { kind: 'model' },
        value: { text: 'x'.repeat(100) },
      }),
    ).rejects.toBeInstanceOf(ContextStoreError)
    await first.close()
    expect(() => first.read(descriptor.handle)).toThrow('no longer valid')
  })

  test('keeps images, evidence, artifacts, and structured data typed', async () => {
    const store = new RunContextStore('run-rich')
    const descriptor = await store.storeToolResult(
      {
        id: 'tool-1',
        content: 'visual assertion',
        isError: false,
        data: { url: 'http://localhost' },
        images: [{ data: 'aGVsbG8=', mediaType: 'image/png' }],
        evidence: [{ kind: 'browser-screenshot', summary: 'visible' }],
        artifacts: [{ uri: '/tmp/screenshot.png', kind: 'file', action: 'created' }],
      },
      'browser_screenshot',
    )

    const read = store.read(descriptor.handle)
    expect(read.data).toEqual({ url: 'http://localhost' })
    expect(read.images).toEqual([{ data: 'aGVsbG8=', mediaType: 'image/png' }])
    expect(read.evidence).toEqual([{ kind: 'browser-screenshot', summary: 'visible' }])
    expect(read.artifacts).toEqual([{ uri: '/tmp/screenshot.png', kind: 'file', action: 'created' }])
  })

  test('redacts persisted values and migrates a v1 manifest', async () => {
    const root = tempDir()
    const store = new RunContextStore('run-persisted', {
      persistRoot: root,
      clock: () => '2026-09-03T00:00:00.000Z',
    })
    const descriptor = await store.store({
      kind: 'json',
      trust: 'untrusted',
      provenance: { kind: 'tool-result', label: 'secret fixture' },
      value: { data: { apiKey: 'sk-test-secret-value', note: 'Bearer abcdefghijklmnop' } },
    })
    await store.close()

    const persisted = readFileSync(join(root, 'entries', `${descriptor.handle}.json`), 'utf8')
    expect(persisted).not.toContain('sk-test-secret-value')
    expect(persisted).not.toContain('abcdefghijklmnop')
    expect(persisted).toContain('<REDACTED>')
    expect((await loadContextManifest(join(root, 'manifest.json'))).closedAt).toBe('2026-09-03T00:00:00.000Z')

    const v1Path = join(root, 'v1.json')
    writeFileSync(
      v1Path,
      JSON.stringify({
        version: 1,
        runId: 'legacy',
        createdAt: '2026-01-01T00:00:00.000Z',
        totalBytes: 0,
        entries: [],
      }),
    )
    const migrated = await loadContextManifest(v1Path)
    expect(migrated.version).toBe(CURRENT_CONTEXT_MANIFEST_VERSION)
    expect(migrated.closedAt).toBeNull()
  })

  test('expires prior-run handle text without touching unrelated content', () => {
    expect(expireContextHandles('use ctx_aaaaaaaaaa_1_bbbbbbbbbb then continue')).toBe(
      'use [expired context handle from prior run] then continue',
    )
    expect(expireContextHandles('ordinary text')).toBe('ordinary text')
  })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orchentra-context-'))
  dirs.push(dir)
  return dir
}
