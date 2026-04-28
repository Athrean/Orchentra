/**
 * Shared baseline for `mock.module('../src/queries/incidents', ...)`.
 * See tests/helpers/ai-mock.ts for the rationale.
 */
export function incidentsQueriesMockBase(): Record<string, unknown> {
  return {
    listIncidents: async () => [],
    findIncident: async () => undefined,
    findIncidentForOrg: async () => null,
    getIncidentRelations: async () => [[], []],
    findIncidentByPrUrl: async () => null,
    findIncidentByRunId: async () => undefined,
    resetIncidentForRetry: async () => {},
    findFixingIncidentForRepoBranch: async () => null,
    createIncident: async () => undefined,
  }
}
