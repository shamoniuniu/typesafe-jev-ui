import { describe, expect, it } from 'vitest'
import { BatchTaskQueue, type BatchTask } from '../src/batchQueue.js'

const waitUntil = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('等待队列状态超时')
}

describe('BatchTaskQueue', () => {
  it('遵守并发上限，单项失败不打断其他任务', async () => {
    let active = 0
    let maxActive = 0
    let snapshot: BatchTask<number, number>[] = []
    const queue = new BatchTaskQueue(
      [1, 2, 3, 4, 5],
      async (value) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
        if (value === 3) throw new Error('boom')
        return value * 2
      },
      (tasks) => { snapshot = tasks },
      2,
    )

    queue.start()
    await waitUntil(() => snapshot.every((task) => ['succeeded', 'failed'].includes(task.status)))

    expect(maxActive).toBe(2)
    expect(snapshot.filter((task) => task.status === 'succeeded')).toHaveLength(4)
    expect(snapshot.find((task) => task.input === 3)?.error).toBe('boom')
  })

  it('暂停时不启动新任务，继续后完成剩余任务', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    let snapshot: BatchTask<number, number>[] = []
    const queue = new BatchTaskQueue(
      [1, 2, 3],
      async (value) => {
        if (value === 1) await firstGate
        return value
      },
      (tasks) => { snapshot = tasks },
      1,
    )

    queue.start()
    await waitUntil(() => snapshot[0].status === 'running')
    queue.pause()
    releaseFirst()
    await waitUntil(() => snapshot[0].status === 'succeeded')
    expect(snapshot.slice(1).every((task) => task.status === 'queued')).toBe(true)

    queue.resume()
    await waitUntil(() => snapshot.every((task) => task.status === 'succeeded'))
  })

  it('仅重试失败项', async () => {
    let attempt = 0
    let snapshot: BatchTask<number, number>[] = []
    const queue = new BatchTaskQueue(
      [1, 2],
      async (value) => {
        if (value === 2 && attempt === 0) throw new Error('first failure')
        return value
      },
      (tasks) => { snapshot = tasks },
      2,
    )

    queue.start()
    await waitUntil(() => snapshot.every((task) => ['succeeded', 'failed'].includes(task.status)))
    attempt += 1
    queue.retryFailed()
    await waitUntil(() => snapshot.every((task) => task.status === 'succeeded'))
    expect(snapshot.map((task) => task.result)).toEqual([1, 2])
  })
})
