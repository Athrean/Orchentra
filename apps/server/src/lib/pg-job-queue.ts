import { eq, sql } from 'drizzle-orm'
import { db, incidentJobs, incidents } from '../db/client'
import { runIncidentAgent } from '../agent/runner'
import type { IncidentJobRow, IncidentRow, JobQueue } from './job-queue'

const POLL_INTERVAL_MS = 5_000
const INITIAL_BACKOFF_MS = 10_000
const MAX_BACKOFF_MS = 5 * 60_000

function nextBackoff(attempt: number): Date {
  const delayMs = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS)
  return new Date(Date.now() + delayMs)
}

export class PgJobQueue implements JobQueue {
  private stopped = false
  private recoveryTimer: ReturnType<typeof setInterval> | null = null

  async enqueueInvestigateJob(incident: IncidentRow): Promise<void> {
    await db
      .insert(incidentJobs)
      .values({
        id: crypto.randomUUID(),
        incidentId: incident.id,
        status: 'queued',
        nextRunAt: new Date(),
      })
      .onConflictDoNothing({ target: [incidentJobs.incidentId] })
  }

  async processIncidentJob(job: IncidentJobRow): Promise<void> {
    const [incident] = await db.select().from(incidents).where(eq(incidents.id, job.incidentId)).limit(1)

    if (!incident) {
      await this.markFailed(job.id, new Error('Incident not found'), job.attempts, job.maxAttempts)
      return
    }

    await runIncidentAgent(incident)

    const [updated] = await db
      .select({ status: incidents.status })
      .from(incidents)
      .where(eq(incidents.id, incident.id))
      .limit(1)

    if (updated?.status === 'error') {
      throw new Error('Agent investigation failed — incident status is error')
    }

    await this.markCompleted(job.id)
  }

  startWorker(): void {
    this.stopped = false

    void this.recoverStaleJobs()

    this.recoveryTimer = setInterval(() => void this.recoverStaleJobs(), 60_000)
    this.recoveryTimer.unref()

    const poll = async (): Promise<void> => {
      if (this.stopped) return
      let hadWork = false
      try {
        const job = await this.claimNextJob()
        if (job) {
          hadWork = true
          try {
            await this.processIncidentJob(job)
          } catch (err) {
            await this.markFailed(job.id, err, job.attempts, job.maxAttempts)
          }
        }
      } catch (err) {
        console.error('Queue worker poll error:', err)
      }
      if (!this.stopped) {
        setTimeout(poll, hadWork ? 0 : POLL_INTERVAL_MS).unref()
      }
    }

    void poll()
    console.log('Incident queue worker started')
  }

  stopWorker(): void {
    this.stopped = true
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer)
      this.recoveryTimer = null
    }
  }

  private async claimNextJob(): Promise<IncidentJobRow | null> {
    const rows = await db.execute<{
      id: string
      incident_id: string
      status: string
      attempts: number
      max_attempts: number
      next_run_at: Date
      error: string | null
      started_at: Date | null
      completed_at: Date | null
      created_at: Date
    }>(sql`
      UPDATE incident_jobs
      SET status = 'processing', attempts = attempts + 1, started_at = now()
      WHERE id = (
        SELECT id FROM incident_jobs
        WHERE status = 'queued' AND next_run_at <= now()
        ORDER BY next_run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, incident_id, status, attempts, max_attempts, next_run_at, error, started_at, completed_at, created_at
    `)

    if (rows.length === 0) return null

    const row = rows[0]
    return {
      id: row.id,
      incidentId: row.incident_id,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextRunAt: row.next_run_at,
      error: row.error,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    }
  }

  private async markCompleted(jobId: string): Promise<void> {
    await db
      .update(incidentJobs)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(incidentJobs.id, jobId))
  }

  private async markFailed(jobId: string, error: unknown, attempts: number, maxAttempts: number): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)

    if (attempts >= maxAttempts) {
      await db.update(incidentJobs).set({ status: 'dead_letter', error: message }).where(eq(incidentJobs.id, jobId))
      console.error(`Job ${jobId} moved to dead_letter after ${attempts} attempts: ${message}`)
    } else {
      await db
        .update(incidentJobs)
        .set({ status: 'queued', error: message, nextRunAt: nextBackoff(attempts) })
        .where(eq(incidentJobs.id, jobId))
      console.warn(`Job ${jobId} failed (attempt ${attempts}/${maxAttempts}), retrying: ${message}`)
    }
  }

  private async recoverStaleJobs(): Promise<void> {
    const result = await db.execute<{ id: string }>(sql`
      UPDATE incident_jobs
      SET status = 'queued', started_at = null
      WHERE status = 'processing'
        AND started_at < now() - interval '5 minutes'
      RETURNING id
    `)
    if (result.length > 0) {
      console.log(`Recovered ${result.length} stale processing job(s) back to queued`)
    }
  }
}
