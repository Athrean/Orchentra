import type { IncidentJobRow, IncidentRow, JobQueue } from './job-queue'

/**
 * In-memory JobQueue implementation for tests.
 *
 * No worker loop, no real DB. enqueue/dequeue operate on an internal list;
 * processIncidentJob just records that it was called. Tests configure expected
 * behavior via constructor hooks.
 */
export class InMemoryJobQueue implements JobQueue {
  readonly enqueued: IncidentRow[] = []
  readonly processed: IncidentJobRow[] = []
  private agent: (incident: IncidentRow) => Promise<void>

  constructor(opts: { runAgent?: (incident: IncidentRow) => Promise<void> } = {}) {
    this.agent = opts.runAgent ?? (async () => {})
  }

  async enqueueInvestigateJob(incident: IncidentRow): Promise<void> {
    this.enqueued.push(incident)
  }

  async processIncidentJob(job: IncidentJobRow): Promise<void> {
    this.processed.push(job)
    // Test scenarios expect agent to be invoked for the matching incident.
    // Caller can wire this through the runAgent hook or override entirely.
    await this.agent({
      id: job.incidentId,
    } as unknown as IncidentRow)
  }

  startWorker(): void {
    // No-op in tests.
  }

  stopWorker(): void {
    // No-op in tests.
  }
}
