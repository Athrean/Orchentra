import { randomUUID } from 'node:crypto'
import type { TaskHandle, TaskStore } from './tools'

export class InMemoryTaskStore implements TaskStore {
  private tasks: Map<string, TaskHandle> = new Map()
  private counter = 0

  create(prompt: string): TaskHandle {
    this.counter++
    const handle: TaskHandle = {
      taskId: `task_${this.counter}_${randomUUID().slice(0, 8)}`,
      status: 'pending',
      prompt,
      createdAt: new Date().toISOString(),
    }
    this.tasks.set(handle.taskId, handle)
    return handle
  }

  get(taskId: string): TaskHandle | undefined {
    return this.tasks.get(taskId)
  }

  list(): TaskHandle[] {
    return Array.from(this.tasks.values())
  }

  update(taskId: string, patch: Partial<TaskHandle>): void {
    const existing = this.tasks.get(taskId)
    if (!existing) return
    this.tasks.set(taskId, { ...existing, ...patch })
  }

  cancel(taskId: string): void {
    const existing = this.tasks.get(taskId)
    if (!existing) return
    if (existing.status === 'completed' || existing.status === 'failed') return
    this.tasks.set(taskId, { ...existing, status: 'cancelled' })
  }
}
