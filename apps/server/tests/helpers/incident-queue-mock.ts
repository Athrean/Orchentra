/** Shared baseline for `mock.module('../src/lib/incident-queue', ...)`. */
export function incidentQueueMockBase(): Record<string, unknown> {
  return {
    enqueueInvestigateJob: async () => {},
    processIncidentJob: async () => {},
    startQueueWorker: () => {},
    stopQueueWorker: () => {},
  }
}
