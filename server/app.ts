import express, { type Request, type Response } from 'express'

const UPSTREAM_URL = 'https://api.typesafe.ai/v1/systemone'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validatePayload(body: unknown): string | null {
  if (!isRecord(body)) return '请求体必须是 JSON 对象。'
  const payload = body
  if (payload.model !== 'jev-latest') return 'model 必须为 jev-latest。'
  if (!('state' in payload)) return '缺少 state。'
  if (!isRecord(payload.questions) || Object.keys(payload.questions).length === 0) {
    return 'questions 必须是非空 Record<questionId, question>。'
  }

  for (const [questionId, raw] of Object.entries(payload.questions)) {
    const path = `questions.${questionId}`
    if (!questionId.trim()) return 'questionId 不能为空。'
    if (!isRecord(raw)) return `${path} 格式无效。`
    const question = raw
    if (!['choice', 'score', 'noul'].includes(String(question.type))) {
      return `${path}.type 必须为 choice、score 或 noul。`
    }
    if (typeof question.instructions !== 'string' || !question.instructions.trim()) {
      return `${path}.instructions 不能为空。`
    }

    if (question.type === 'choice') {
      if (!isRecord(question.criteria) || Object.keys(question.criteria).length === 0) {
        return `${path}.criteria 必须是非空对象。`
      }
      if (
        Object.entries(question.criteria).some(
          ([key, value]) => !key.trim() || typeof value !== 'string' || !value.trim(),
        )
      ) {
        return `${path}.criteria 的键和值均须为非空字符串。`
      }
    }

    if (question.type === 'score') {
      if (
        !Array.isArray(question.criteria) ||
        question.criteria.length < 2 ||
        question.criteria.length > 10
      ) {
        return `${path}.criteria 必须是包含 2–10 项的数组。`
      }
      if (
        question.criteria.some(
          (criterion) => typeof criterion !== 'string' || !criterion.trim(),
        )
      ) {
        return `${path}.criteria 每一项都必须是非空字符串。`
      }
    }

    if (question.type === 'noul' && question.criteria !== undefined) {
      if (!isRecord(question.criteria)) {
        return `${path}.criteria 必须是 { true: string, false: string } 或省略。`
      }
      const keys = Object.keys(question.criteria).sort()
      if (
        keys.length !== 2 ||
        keys[0] !== 'false' ||
        keys[1] !== 'true' ||
        typeof question.criteria.true !== 'string' ||
        !question.criteria.true.trim() ||
        typeof question.criteria.false !== 'string' ||
        !question.criteria.false.trim()
      ) {
        return `${path}.criteria 必须仅包含非空字符串 true 与 false。`
      }
    }
  }
  return null
}

export function createApp(fetchImpl: typeof fetch = fetch) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.post('/api/systemone', async (req: Request, res: Response) => {
    const validationError = validatePayload(req.body)
    if (validationError) {
      res.status(400).json({ error: validationError })
      return
    }

    const apiKey = process.env.TYPESAFE_API_KEY
    if (!apiKey) {
      res.status(503).json({ error: '服务端尚未配置 TYPESAFE_API_KEY。' })
      return
    }

    try {
      const upstream = await fetchImpl(UPSTREAM_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(60_000),
      })

      const contentType = upstream.headers.get('content-type') ?? ''
      const data = contentType.includes('application/json')
        ? await upstream.json()
        : { error: await upstream.text() }

      res.status(upstream.status).json(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知网络错误'
      res.status(502).json({ error: `无法连接 Typesafe API：${message}` })
    }
  })

  return app
}
