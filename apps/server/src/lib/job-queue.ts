import type { incidentJobs, incidents } from '../db/client'

export type IncidentJobRow = typeof incidentJobs.$inferSelect
export type IncidentRow = typeof incidents.$inferSelect

export interface JobQueue {
  /** Enqueue an investigate job for an incident. No-op if a job already exists for this incident. */
  enqueueInvestigateJob(incident: IncidentRow): Promise<void>
  /** Process a single claimed job — runs the agent and marks the job completed/failed. */
  processIncidentJob(job: IncidentJobRow): Promise<void>
  /** Start the background worker loop. */
  startWorker(): void
  /** Stop the background worker loop. */
  stopWorker(): void
}

let active: JobQueue | null = null

export function setJobQueue(queue: JobQueue): void {
  active = queue
}

export function getJobQueue(): JobQueue {
  if (!active) {
    throw new Error('JobQueue not initialized — call setJobQueue() at composition root before use')
  }
  return active
}

/** Convenience helpers — keep call-sites tidy. Equivalent to getJobQueue().X. */
export const enqueueInvestigateJob: JobQueue['enqueueInvestigateJob'] = (incident) =>
  getJobQueue().enqueueInvestigateJob(incident)
export const processIncidentJob: JobQueue['processIncidentJob'] = (job) => getJobQueue().processIncidentJob(job)
export const startQueueWorker = (): void => getJobQueue().startWorker()
export const stopQueueWorker = (): void => getJobQueue().stopWorker()
