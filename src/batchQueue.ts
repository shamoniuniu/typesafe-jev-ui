export type BatchTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface BatchTask<T, R> {
  id: number
  input: T
  status: BatchTaskStatus
  result?: R
  error?: string
}

type Worker<T, R> = (input: T, index: number) => Promise<R>

export class BatchTaskQueue<T, R> {
  private tasks: BatchTask<T, R>[]
  private active = 0
  private concurrency: number
  private paused = true

  constructor(
    inputs: T[],
    private readonly worker: Worker<T, R>,
    private readonly onChange: (tasks: BatchTask<T, R>[]) => void,
    concurrency = 3,
  ) {
    this.concurrency = normalizeConcurrency(concurrency)
    this.tasks = inputs.map((input, id) => ({ id, input, status: 'queued' }))
    this.emit()
  }

  start() {
    this.paused = false
    this.pump()
  }

  pause() {
    this.paused = true
    this.emit()
  }

  resume() {
    this.start()
  }

  setConcurrency(value: number) {
    this.concurrency = normalizeConcurrency(value)
    this.pump()
  }

  retryFailed() {
    this.tasks = this.tasks.map((task) =>
      task.status === 'failed'
        ? { id: task.id, input: task.input, status: 'queued' }
        : task,
    )
    this.paused = false
    this.emit()
    this.pump()
  }

  isPaused() {
    return this.paused
  }

  private emit() {
    this.onChange(this.tasks.map((task) => ({ ...task })))
  }

  private pump() {
    if (this.paused) return
    while (this.active < this.concurrency) {
      const task = this.tasks.find((candidate) => candidate.status === 'queued')
      if (!task) break
      task.status = 'running'
      this.active += 1
      this.emit()

      void this.worker(task.input, task.id)
        .then((result) => {
          task.status = 'succeeded'
          task.result = result
          delete task.error
        })
        .catch((reason: unknown) => {
          task.status = 'failed'
          task.error = reason instanceof Error ? reason.message : String(reason)
          delete task.result
        })
        .finally(() => {
          this.active -= 1
          this.emit()
          this.pump()
        })
    }
  }
}

export function normalizeConcurrency(value: number) {
  return Math.max(1, Math.min(5, Math.round(value) || 1))
}
