import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const DEFAULT_FORMAT = 'zip'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  artifactId: z.number().int().positive().describe('Artifact id (from list_workflow_run_artifacts)'),
  format: z.string().optional().describe(`Archive format passed to GitHub (default: ${DEFAULT_FORMAT})`),
})

type Params = z.infer<typeof parameters>

function toBuffer(payload: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(payload)) return payload
  if (payload instanceof ArrayBuffer) return Buffer.from(payload)
  return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
}

export const downloadArtifactOperation: Operation<Params, unknown> = {
  id: 'download_artifact',
  description:
    'Download a GitHub Actions artifact archive. Returns base64-encoded contents capped at 10MB; payloads ' +
    'larger than the cap are truncated and `truncated: true` is set so the caller knows to fetch the rest ' +
    'out-of-band via archiveDownloadUrl.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'download_artifact' },
  handler: async (_ctx, { owner, repo, artifactId, format }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    const archiveFormat = format ?? DEFAULT_FORMAT
    try {
      const { data } = await getGithubAdapter().actions.downloadArtifact({
        owner,
        repo,
        artifact_id: artifactId,
        archive_format: archiveFormat,
      })
      const buffer = toBuffer(data)
      const truncated = buffer.byteLength > MAX_BYTES
      const sliced = truncated ? buffer.subarray(0, MAX_BYTES) : buffer
      return {
        contents: sliced.toString('base64'),
        sizeInBytes: sliced.byteLength,
        format: archiveFormat,
        ...(truncated ? { truncated: true, originalSizeInBytes: buffer.byteLength } : {}),
      }
    } catch (err) {
      return { error: `Failed to download artifact: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
