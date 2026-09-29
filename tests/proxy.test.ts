import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'

const validPayload = {
  state: { plan: 'pro' },
  model: 'jev-latest',
  questions: {
    purchase_intent: {
      type: 'choice',
      instructions: '选择最可能的结果',
      criteria: { yes: '会购买', no: '不会购买' },
    },
  },
}

afterEach(() => {
  delete process.env.TYPESAFE_API_KEY
  vi.restoreAllMocks()
})

describe('POST /api/systemone', () => {
  it('拒绝无效的请求结构', async () => {
    const response = await request(createApp()).post('/api/systemone').send({
      state: {},
      model: 'other',
      questions: {},
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('model')
  })

  it('要求 questions 为以唯一 ID 为键的对象，且 type 必须小写', async () => {
    const arrayResponse = await request(createApp()).post('/api/systemone').send({
      ...validPayload,
      questions: Object.values(validPayload.questions),
    })
    expect(arrayResponse.status).toBe(400)
    expect(arrayResponse.body.error).toContain('Record')

    const uppercaseResponse = await request(createApp()).post('/api/systemone').send({
      ...validPayload,
      questions: {
        invalid: { ...validPayload.questions.purchase_intent, type: 'Choice' },
      },
    })
    expect(uppercaseResponse.status).toBe(400)
    expect(uppercaseResponse.body.error).toContain('choice')
  })

  it('校验 score 为 2–10 项数组，noul 为可选真假边界', async () => {
    const invalidScore = await request(createApp()).post('/api/systemone').send({
      ...validPayload,
      questions: {
        score: { type: 'score', instructions: '评分', criteria: ['仅一项'] },
      },
    })
    expect(invalidScore.status).toBe(400)
    expect(invalidScore.body.error).toContain('2–10')

    const invalidNoul = await request(createApp()).post('/api/systemone').send({
      ...validPayload,
      questions: {
        boundary: {
          type: 'noul',
          instructions: '判断真假',
          criteria: { true: '成立' },
        },
      },
    })
    expect(invalidNoul.status).toBe(400)
    expect(invalidNoul.body.error).toContain('true 与 false')
  })

  it('缺少服务端密钥时返回清晰错误', async () => {
    const response = await request(createApp()).post('/api/systemone').send(validPayload)

    expect(response.status).toBe(503)
    expect(response.body.error).toContain('TYPESAFE_API_KEY')
  })

  it('携带 Bearer 密钥并透传上游 JSON', async () => {
    process.env.TYPESAFE_API_KEY = 'test-only-key'
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        answers: {
          purchase_intent: {
            choice: 'yes',
            score: null,
            noul: null,
            probabilities: { yes: 0.87, no: 0.13 },
            confidence: 0.91,
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await request(createApp(mockFetch))
      .post('/api/systemone')
      .send(validPayload)

    expect(response.status).toBe(200)
    expect(response.body.answers.purchase_intent).toEqual({
      choice: 'yes',
      score: null,
      noul: null,
      probabilities: { yes: 0.87, no: 0.13 },
      confidence: 0.91,
    })
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect((options?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-only-key',
    )
    expect(JSON.parse(String(options?.body))).toEqual(validPayload)
  })
})
