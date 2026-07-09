/**
 * Provider-agnostic model-provenance guard — enforces the `sent === returned`
 * leg of the routing invariant. There is NO model fallback anywhere in
 * Orchentra (grep `fallback`: only auth/sandbox/editor, never a model swap),
 * so the model a provider reports it answered with must equal the model we
 * asked for. A mismatch means a gateway silently rerouted the request or the
 * wire contract drifted; we fail closed rather than let another model's output
 * masquerade as the selected one.
 *
 * When the provider does not report a model (`actualModel` empty/absent) we do
 * not fake certainty: the request stays request-side verified only and this
 * guard is a no-op. The error message carries only model ids + the request-id —
 * never tokens, keys, or headers.
 */
export class ModelProvenanceError extends Error {
  readonly requestedModel: string
  readonly actualModel: string
  readonly provider: string
  readonly requestId?: string

  constructor(requestedModel: string, actualModel: string, provider: string, requestId?: string) {
    super(
      `Model provenance mismatch: requested "${requestedModel}" but ${provider} answered as ` +
        `"${actualModel}"${requestId ? ` (request-id ${requestId})` : ''}. ` +
        'Failing closed — no model fallback is enabled.',
    )
    this.name = 'ModelProvenanceError'
    this.requestedModel = requestedModel
    this.actualModel = actualModel
    this.provider = provider
    this.requestId = requestId
  }
}

/**
 * Throw {@link ModelProvenanceError} when a provider reports it answered with a
 * different model than requested. No-op when the models match or when the
 * provider did not report a model at all.
 */
export function assertModelProvenance(
  requestedModel: string,
  actualModel: string | undefined | null,
  provider: string,
  requestId?: string,
): void {
  if (!actualModel) return
  if (actualModel === requestedModel) return
  throw new ModelProvenanceError(requestedModel, actualModel, provider, requestId)
}
