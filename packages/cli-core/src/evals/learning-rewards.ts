import { parseLearningExport, type LearningExport } from './learning-export'

/** Labels come from a recorded external verifier/rubric, never model prose or event counts. */
export interface LearningVerifierLabel {
  verifier: string
  version: string
  artifactSha256: string
  score: number
}

export interface LearningRewardInput {
  schemaVersion: 1
  datasetHash: string
  labels: {
    correctness?: LearningVerifierLabel
    decomposition?: LearningVerifierLabel
    evidenceQuality?: LearningVerifierLabel
  }
  limits: {
    maxDepth: number
    maxConcurrentJobsPerRuntime: number
    maxTokens: number
    maxCostUsd: number
    maxLatencyMs: number
  }
}

export interface LearningReward {
  schemaVersion: 1
  datasetHash: string
  components: {
    correctness: number | null
    decomposition: number | null
    evidenceQuality: number | null
    completion: number | null
    boundedRecursion: number | null
    costEfficiency: number | null
  }
  withinEnvelope: boolean | null
  /** Missing evidence cannot yield a complete scalar reward. */
  total: number | null
  missing: string[]
  verifierInput: LearningRewardInput
}

export function scoreLearningTrajectory(raw: LearningExport, input: LearningRewardInput): LearningReward {
  const data = parseLearningExport(raw)
  if (input.schemaVersion !== 1 || input.datasetHash !== data.datasetHash)
    throw new Error('learning reward version or dataset mismatch')
  const limits = input.limits
  if (
    !limits ||
    !Number.isInteger(limits.maxDepth) ||
    limits.maxDepth < 0 ||
    !Number.isInteger(limits.maxConcurrentJobsPerRuntime) ||
    limits.maxConcurrentJobsPerRuntime < 1 ||
    !Number.isInteger(limits.maxTokens) ||
    limits.maxTokens < 1 ||
    !Number.isFinite(limits.maxCostUsd) ||
    limits.maxCostUsd <= 0 ||
    !Number.isFinite(limits.maxLatencyMs) ||
    limits.maxLatencyMs <= 0
  )
    throw new Error('invalid learning reward limits')
  const correctness = labelScore(input.labels.correctness, true)
  const decomposition = labelScore(input.labels.decomposition)
  let evidenceQuality = labelScore(input.labels.evidenceQuality)
  const root = data.runs[0]!.manifest
  const lastGate = root.gateDecisions?.[root.gateDecisions.length - 1]
  if (lastGate && lastGate.outcome !== 'pass') evidenceQuality = 0
  const completion = root.doneReason !== 'stop' ? 0 : correctness
  let boundedRecursion: number | null = 1
  for (const run of data.runs) {
    const active = new Set<string>()
    for (const event of run.events) {
      if (event.kind !== 'model_job') continue
      const job = event.job
      const key = `${job.jobId}:${job.attempt}`
      if (!Number.isInteger(job.depth) || job.depth < 0) throw new Error('invalid recorded model-job depth')
      if (job.depth > limits.maxDepth) boundedRecursion = 0
      if (job.status === 'running') active.add(key)
      else if (!active.delete(key) && boundedRecursion !== 0) boundedRecursion = null
      if (active.size > limits.maxConcurrentJobsPerRuntime) boundedRecursion = 0
    }
    if (active.size > 0) boundedRecursion = 0
  }
  const cost = knownNonnegative(root.estimatedCostUsd)
  const latency = knownNonnegative(root.latencyMs)
  const tokens = knownNonnegative(root.billedTokens + root.cachedTokens)
  const withinEnvelope =
    cost === null || latency === null || tokens === null
      ? null
      : cost <= limits.maxCostUsd && latency <= limits.maxLatencyMs && tokens <= limits.maxTokens
  const components = {
    correctness,
    decomposition,
    evidenceQuality,
    completion,
    boundedRecursion,
    costEfficiency: cost === null ? null : Math.max(0, 1 - cost / limits.maxCostUsd),
  }
  const missing = Object.entries(components)
    .filter(([, score]) => score === null)
    .map(([name]) => name)
  if (withinEnvelope === null) missing.push('resourceEnvelope')
  let total: number | null = null
  if (!missing.length) {
    total =
      correctness !== 1 ||
      completion !== 1 ||
      boundedRecursion !== 1 ||
      withinEnvelope !== true ||
      (lastGate !== undefined && lastGate.outcome !== 'pass')
        ? 0
        : 0.45 * correctness +
          0.15 * decomposition! +
          0.15 * evidenceQuality! +
          0.1 * completion +
          0.1 * boundedRecursion +
          0.05 * components.costEfficiency!
  }
  return {
    schemaVersion: 1,
    datasetHash: data.datasetHash,
    components,
    withinEnvelope,
    total,
    missing,
    verifierInput: JSON.parse(JSON.stringify(input)) as LearningRewardInput,
  }
}

function labelScore(label: LearningVerifierLabel | undefined, binary = false): number | null {
  if (!label) return null
  if (
    !label.verifier?.trim() ||
    !label.version?.trim() ||
    !/^[a-f0-9]{64}$/.test(label.artifactSha256) ||
    !Number.isFinite(label.score) ||
    label.score < 0 ||
    label.score > 1 ||
    (binary && label.score !== 0 && label.score !== 1)
  )
    throw new Error('invalid verifier label or provenance')
  return label.score
}

function knownNonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
