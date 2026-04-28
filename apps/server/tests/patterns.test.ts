import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { dbClientMockBase } from './helpers/db-client-mock'
import { aiMockBase } from './helpers/ai-mock'
import { llmMockBase } from './helpers/llm-mock'

// --- State trackers ---
let embedCalls: { value: string }[] = []
let dbInserts: Record<string, unknown>[] = []
let dbUpdates: { values: Record<string, unknown>; id: string }[] = []
let storedPatterns: Record<string, unknown>[] = []
let incidentRows: Record<string, unknown>[] = []

// Pre-computed fake embeddings (1536-dim vectors)
const fakeEmbedding1 = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.1))
const fakeEmbedding2 = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.1 + 0.01)) // very similar
const fakeEmbeddingDifferent = new Array(1536).fill(0).map((_, i) => Math.cos(i * 0.5)) // different

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: ['my-org/api'] },
    llm: { api_key: 'sk-test', model: 'anthropic/claude-sonnet-4-5', embedding_model: 'text-embedding-3-small' },
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: true, strings, values }),
}))

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    query: {
      incidents: {
        findFirst: async (opts: { where: { val: string } }) => {
          return incidentRows.find((r) => r.id === opts.where.val) ?? null
        },
      },
      resolvedPatterns: {
        findFirst: async (opts: { where: { val: string } }) => {
          return storedPatterns.find((r) => r.incidentId === opts.where.val) ?? null
        },
        findMany: async (opts?: { where?: { col: unknown; val: unknown } }) => {
          if (opts?.where?.val) {
            return storedPatterns.filter((r) => r.orgId === opts.where!.val)
          }
          return storedPatterns
        },
      },
    },
    insert: () => ({
      values: (val: Record<string, unknown>) => {
        dbInserts.push(val)
        return Promise.resolve([val])
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: { val: string }) => {
          dbUpdates.push({ values, id: condition.val })
          return Promise.resolve()
        },
      }),
    }),
  },
  incidents: { id: 'id' },
  resolvedPatterns: { id: 'id', incidentId: 'incident_id', orgId: 'org_id' },
}))

mock.module('../src/agent/llm', () => ({
  ...llmMockBase(),
  createEmbeddingModel: () => ({ modelId: 'text-embedding-3-small' }),
}))

mock.module('ai', () => ({
  ...aiMockBase(),
  embed: async (opts: { value: string }) => {
    embedCalls.push({ value: opts.value })
    // Return similar embedding for similar text, different for different text
    if (opts.value.includes('different-workflow')) {
      return { embedding: fakeEmbeddingDifferent }
    }
    return { embedding: fakeEmbedding1 }
  },
  cosineSimilarity: (a: number[], b: number[]) => {
    // Actual cosine similarity computation
    let dot = 0
    let magA = 0
    let magB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB))
  },
}))

const { saveResolvedPattern, findSimilarPatterns, formatPatternContext } = await import('../src/agent/patterns')

beforeEach(() => {
  embedCalls = []
  dbInserts = []
  dbUpdates = []
  storedPatterns = []
  incidentRows = []
})

// ---- saveResolvedPattern tests ----

describe('saveResolvedPattern', () => {
  test('embeds and stores pattern for resolved incident with brief', async () => {
    const brief = {
      failureType: 'code_bug',
      summary: 'Type error in auth module',
      rootCause: 'TypeError in login.ts',
      suggestedFix: 'Fix line 42',
      confidence: 0.85,
      similarIncidentId: null,
    }

    incidentRows.push({
      id: 'inc-1',
      repo: 'my-org/api',
      workflowName: 'CI / Build',
      branch: 'main',
      rootCause: 'TypeError in login.ts',
      suggestedFix: 'Fix line 42',
      briefJson: JSON.stringify(brief),
    })

    await saveResolvedPattern('inc-1')

    expect(embedCalls.length).toBe(1)
    expect(embedCalls[0].value).toContain('workflow: CI / Build')
    expect(embedCalls[0].value).toContain('root_cause: TypeError in login.ts')
    expect(embedCalls[0].value).toContain('failure_type: code_bug')

    expect(dbInserts.length).toBe(1)
    expect(dbInserts[0].incidentId).toBe('inc-1')
    expect(dbInserts[0].pattern).toContain('workflow: CI / Build')
    expect(dbInserts[0].resolution).toBe('Fix line 42')
    expect(dbInserts[0].failureType).toBe('code_bug')
    expect(JSON.parse(dbInserts[0].embedding as string)).toHaveLength(1536)
  })

  test('skips if incident not found', async () => {
    await saveResolvedPattern('nonexistent')
    expect(embedCalls.length).toBe(0)
    expect(dbInserts.length).toBe(0)
  })

  test('skips if no rootCause and no briefJson', async () => {
    incidentRows.push({
      id: 'inc-2',
      repo: 'my-org/api',
      workflowName: 'CI',
      branch: 'main',
      rootCause: null,
      suggestedFix: null,
      briefJson: null,
    })

    await saveResolvedPattern('inc-2')
    expect(embedCalls.length).toBe(0)
    expect(dbInserts.length).toBe(0)
  })

  test('skips if pattern already exists for incident', async () => {
    incidentRows.push({
      id: 'inc-3',
      repo: 'my-org/api',
      workflowName: 'CI',
      branch: 'main',
      rootCause: 'some error',
      suggestedFix: 'fix it',
      briefJson: null,
    })

    storedPatterns.push({ id: 'pat-existing', incidentId: 'inc-3' })

    await saveResolvedPattern('inc-3')
    expect(embedCalls.length).toBe(0)
    expect(dbInserts.length).toBe(0)
  })

  test('stores pattern with rootCause even without briefJson', async () => {
    incidentRows.push({
      id: 'inc-4',
      repo: 'my-org/api',
      workflowName: 'Deploy',
      branch: 'staging',
      rootCause: 'OOM in container',
      suggestedFix: 'Increase memory limit',
      briefJson: null,
    })

    await saveResolvedPattern('inc-4')

    expect(dbInserts.length).toBe(1)
    expect(dbInserts[0].pattern).toContain('root_cause: OOM in container')
    expect(dbInserts[0].resolution).toBe('Increase memory limit')
    expect(dbInserts[0].failureType).toBeNull()
  })
})

// ---- findSimilarPatterns tests ----

describe('findSimilarPatterns', () => {
  test('returns empty array when no patterns exist', async () => {
    const matches = await findSimilarPatterns('some incident text', 'org-1')
    expect(matches).toEqual([])
    expect(embedCalls.length).toBe(0)
  })

  test('returns matching patterns above similarity threshold', async () => {
    storedPatterns.push({
      id: 'pat-1',
      incidentId: 'inc-old-1',
      orgId: 'org-1',
      embedding: JSON.stringify(fakeEmbedding2),
      pattern: 'workflow: CI\nroot_cause: TypeError',
      resolution: 'Fix the type error',
      failureType: 'code_bug',
      usageCount: 0,
    })

    const matches = await findSimilarPatterns('workflow: CI, TypeError in build', 'org-1')

    expect(embedCalls.length).toBe(1)
    expect(matches.length).toBe(1)
    expect(matches[0].id).toBe('pat-1')
    expect(matches[0].similarity).toBeGreaterThan(0.78)
    expect(matches[0].resolution).toBe('Fix the type error')
  })

  test('filters out patterns below similarity threshold', async () => {
    storedPatterns.push({
      id: 'pat-diff',
      incidentId: 'inc-old-2',
      orgId: 'org-1',
      embedding: JSON.stringify(fakeEmbeddingDifferent),
      pattern: 'workflow: Deploy\nroot_cause: Network timeout',
      resolution: 'Check DNS',
      failureType: 'infra_timeout',
      usageCount: 0,
    })

    // Query text WITHOUT "different-workflow" so embed mock returns fakeEmbedding1,
    // which has low cosine similarity against fakeEmbeddingDifferent
    const matches = await findSimilarPatterns('completely unrelated workflow with no match', 'org-1')

    expect(matches.length).toBe(0)
  })

  test('limits results to specified count', async () => {
    // Add 5 similar patterns
    for (let i = 0; i < 5; i++) {
      storedPatterns.push({
        id: `pat-${i}`,
        incidentId: `inc-old-${i}`,
        orgId: 'org-1',
        embedding: JSON.stringify(fakeEmbedding2),
        pattern: `workflow: CI\nroot_cause: Error ${i}`,
        resolution: `Fix ${i}`,
        failureType: 'code_bug',
        usageCount: 0,
      })
    }

    const matches = await findSimilarPatterns('some CI failure', 'org-1', 2)
    expect(matches.length).toBe(2)
  })

  test('sorts results by similarity descending', async () => {
    // Slightly different embeddings with varying similarity
    const slightlyDifferent = fakeEmbedding1.map((v, i) => v + (i % 50 === 0 ? 0.3 : 0))
    storedPatterns.push(
      {
        id: 'pat-high',
        incidentId: 'inc-h',
        orgId: 'org-1',
        embedding: JSON.stringify(fakeEmbedding2), // very similar to fakeEmbedding1
        pattern: 'exact match pattern',
        resolution: 'exact fix',
        failureType: 'code_bug',
        usageCount: 0,
      },
      {
        id: 'pat-medium',
        incidentId: 'inc-m',
        orgId: 'org-1',
        embedding: JSON.stringify(slightlyDifferent),
        pattern: 'partial match pattern',
        resolution: 'partial fix',
        failureType: 'code_bug',
        usageCount: 0,
      },
    )

    const matches = await findSimilarPatterns('some failure text', 'org-1')
    expect(matches.length).toBe(2)
    expect(matches[0].similarity).toBeGreaterThanOrEqual(matches[1].similarity)
  })

  test('updates usageCount and lastMatchedAt for matched patterns', async () => {
    storedPatterns.push({
      id: 'pat-usage',
      incidentId: 'inc-u',
      orgId: 'org-1',
      embedding: JSON.stringify(fakeEmbedding2),
      pattern: 'workflow: CI\nroot_cause: crash',
      resolution: 'restart',
      failureType: 'code_bug',
      usageCount: 3,
    })

    await findSimilarPatterns('CI failure crash', 'org-1')

    expect(dbUpdates.length).toBe(1)
    expect((dbUpdates[0].values.usageCount as { __sql: boolean }).__sql).toBe(true)
    expect(dbUpdates[0].values.lastMatchedAt).toBeInstanceOf(Date)
  })

  test('skips patterns with missing or invalid embeddings', async () => {
    storedPatterns.push(
      {
        id: 'pat-null',
        incidentId: 'inc-null',
        orgId: 'org-1',
        embedding: null,
        pattern: 'no embedding',
        resolution: 'n/a',
        failureType: 'unknown',
        usageCount: 0,
      },
      {
        id: 'pat-bad',
        incidentId: 'inc-bad',
        orgId: 'org-1',
        embedding: 'not valid json',
        pattern: 'bad embedding',
        resolution: 'n/a',
        failureType: 'unknown',
        usageCount: 0,
      },
      {
        id: 'pat-good',
        incidentId: 'inc-good',
        orgId: 'org-1',
        embedding: JSON.stringify(fakeEmbedding2),
        pattern: 'valid pattern',
        resolution: 'valid fix',
        failureType: 'code_bug',
        usageCount: 0,
      },
    )

    const matches = await findSimilarPatterns('some text', 'org-1')
    // Only the valid pattern should be returned
    expect(matches.every((m) => m.id !== 'pat-null')).toBe(true)
    expect(matches.every((m) => m.id !== 'pat-bad')).toBe(true)
  })

  test('skips patterns with dimension mismatch', async () => {
    storedPatterns.push({
      id: 'pat-wrong-dim',
      incidentId: 'inc-wd',
      orgId: 'org-1',
      embedding: JSON.stringify([0.1, 0.2, 0.3]), // only 3 dims vs 1536
      pattern: 'wrong dimensions',
      resolution: 'n/a',
      failureType: 'unknown',
      usageCount: 0,
    })

    const matches = await findSimilarPatterns('some text', 'org-1')
    expect(matches.length).toBe(0)
  })

  test('scopes results by orgId', async () => {
    storedPatterns.push(
      {
        id: 'pat-org1',
        incidentId: 'inc-o1',
        orgId: 'org-1',
        embedding: JSON.stringify(fakeEmbedding2),
        pattern: 'workflow: CI\nroot_cause: TypeError',
        resolution: 'Fix type error',
        failureType: 'code_bug',
        usageCount: 0,
      },
      {
        id: 'pat-org2',
        incidentId: 'inc-o2',
        orgId: 'org-2',
        embedding: JSON.stringify(fakeEmbedding2),
        pattern: 'workflow: CI\nroot_cause: TypeError',
        resolution: 'Fix type error (other org)',
        failureType: 'code_bug',
        usageCount: 0,
      },
    )

    const matches = await findSimilarPatterns('workflow: CI, TypeError in build', 'org-1')
    expect(matches.length).toBe(1)
    expect(matches[0].id).toBe('pat-org1')
  })
})

// ---- formatPatternContext tests ----

describe('formatPatternContext', () => {
  test('returns empty string for no matches', () => {
    expect(formatPatternContext([])).toBe('')
  })

  test('formats single match with similarity percentage', () => {
    const result = formatPatternContext([
      {
        id: 'pat-1',
        incidentId: 'inc-1',
        pattern: 'workflow: CI\nroot_cause: TypeError',
        resolution: 'Fix the import',
        failureType: 'code_bug',
        similarity: 0.92,
      },
    ])

    expect(result).toContain('## Similar Past Incidents')
    expect(result).toContain('92% similar')
    expect(result).toContain('**Source incident ID:** inc-1')
    expect(result).toContain('workflow: CI\nroot_cause: TypeError')
    expect(result).toContain('Fix the import')
    expect(result).toContain('code_bug')
  })

  test('formats multiple matches', () => {
    const result = formatPatternContext([
      {
        id: 'p1',
        incidentId: 'i1',
        pattern: 'pattern 1',
        resolution: 'fix 1',
        failureType: 'code_bug',
        similarity: 0.95,
      },
      {
        id: 'p2',
        incidentId: 'i2',
        pattern: 'pattern 2',
        resolution: 'fix 2',
        failureType: 'flaky_test',
        similarity: 0.82,
      },
    ])

    expect(result).toContain('95% similar')
    expect(result).toContain('82% similar')
    expect(result).toContain('fix 1')
    expect(result).toContain('fix 2')
  })

  test('does not embed behavioral instructions in context data', () => {
    const result = formatPatternContext([
      {
        id: 'p1',
        incidentId: 'i1',
        pattern: 'p',
        resolution: 'r',
        failureType: 'code_bug',
        similarity: 0.9,
      },
    ])

    expect(result).not.toContain('Use these past resolutions')
    expect(result).toContain('## Similar Past Incidents')
  })
})
