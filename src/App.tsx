import { FormEvent, useMemo, useState } from 'react'
import { BatchMode } from './BatchMode'
import { getApiErrorMessage, type ApiResult, type Question, type SystemOneAnswer, type SystemOneRequest } from './types'

const sampleState = {
  user: { id: 'demo-42', tier: 'pro', locale: 'zh-CN' },
  context: {
    page: 'checkout',
    cartTotal: 899,
    recentActions: ['查看定价页', '添加年度套餐'],
  },
}

const sampleStateText = JSON.stringify(sampleState, null, 2)

interface QuestionDraft {
  id: string
  question: Question
}

const sampleQuestions: QuestionDraft[] = [
  {
    id: 'next_action',
    question: {
      type: 'choice',
      instructions: '判断此用户下一步最可能采取的动作',
      criteria: {
        purchase: '完成付款',
        compare: '继续比较套餐',
        leave: '离开结算页',
      },
    },
  },
  {
    id: 'purchase_signals',
    question: {
      type: 'score',
      instructions: '分别评估以下购买信号，返回概率',
      criteria: ['价格接受度', '产品匹配度', '购买紧迫度'],
    },
  },
  {
    id: 'ready_to_buy',
    question: {
      type: 'noul',
      instructions: '判断用户是否已经准备好购买',
      criteria: {
        true: '已有明确购买意愿与足够信息',
        false: '仍有明显疑虑或缺少关键信息',
      },
    },
  },
]

const sampleInputValues = new Set([
  ...sampleQuestions.map(({ id }) => id),
  ...sampleQuestions.map(({ question }) => question.instructions),
  ...sampleQuestions.flatMap(({ question }) => {
    if (question.type === 'choice') {
      return Object.entries(question.criteria).flat()
    }
    if (question.type === 'score') return question.criteria
    return question.criteria ? [question.criteria.true, question.criteria.false] : []
  }),
])

const clearIfSample = (value: string, clear: () => void) => {
  if (sampleInputValues.has(value)) clear()
}

const emptyQuestion = (type: Question['type'] = 'choice'): Question => {
  if (type === 'choice') {
    return { type, instructions: '', criteria: { option_a: '', option_b: '' } }
  }
  if (type === 'score') {
    return { type, instructions: '', criteria: ['', ''] }
  }
  return { type, instructions: '', criteria: { true: '', false: '' } }
}

function isQuestionComplete(question: Question) {
  if (!question.instructions.trim()) return false
  if (question.type === 'choice') {
    const entries = Object.entries(question.criteria)
    return entries.length > 0 && entries.every(([key, value]) => key.trim() && value.trim())
  }
  if (question.type === 'score') {
    return question.criteria.length >= 2 &&
      question.criteria.length <= 10 &&
      question.criteria.every((value) => value.trim())
  }
  return !question.criteria ||
    (question.criteria.true.trim().length > 0 && question.criteria.false.trim().length > 0)
}

function QuestionEditor({
  id,
  question,
  index,
  idError,
  onIdChange,
  onChange,
  onRemove,
}: {
  id: string
  question: Question
  index: number
  idError: string
  onIdChange: (value: string) => void
  onChange: (value: Question) => void
  onRemove: () => void
}) {
  const setType = (type: Question['type']) => onChange(emptyQuestion(type))

  const updateChoiceEntry = (oldKey: string, key: string, value: string) => {
    if (question.type !== 'choice') return
    const entries = Object.entries(question.criteria).map(([k, v]) =>
      k === oldKey ? [key, value] : [k, v],
    )
    onChange({ ...question, criteria: Object.fromEntries(entries) })
  }

  const updateListEntry = (itemIndex: number, value: string) => {
    if (question.type !== 'score') return
    const criteria = [...question.criteria]
    criteria[itemIndex] = value
    onChange({ ...question, criteria })
  }

  return (
    <article className="question-card">
      <div className="question-head">
        <div>
          <span className="eyebrow">问题 {index + 1}</span>
          <select
            aria-label={`问题 ${index + 1} 类型`}
            value={question.type}
            onChange={(event) => setType(event.target.value as Question['type'])}
          >
            <option value="choice">choice · 选项决策</option>
            <option value="score">score · 指标评分</option>
            <option value="noul">noul · 真假判断</option>
          </select>
        </div>
        <button className="icon-button danger" type="button" onClick={onRemove}>
          删除
        </button>
      </div>

      <label>
        唯一 ID
        <input
          className={[
            idError ? 'invalid' : '',
            sampleInputValues.has(id) ? 'sample-value' : '',
          ].filter(Boolean).join(' ')}
          aria-label={`问题 ${index + 1} 唯一 ID`}
          value={id}
          placeholder="例如：purchase_intent"
          onFocus={() => clearIfSample(id, () => onIdChange(''))}
          onChange={(event) => onIdChange(event.target.value)}
        />
        {idError && <small className="field-error">{idError}</small>}
      </label>

      <label>
        指令
        <textarea
          className={sampleInputValues.has(question.instructions) ? 'sample-value' : ''}
          value={question.instructions}
          rows={2}
          placeholder="清晰描述希望模型完成的判断"
          onFocus={() =>
            clearIfSample(question.instructions, () =>
              onChange({ ...question, instructions: '' }),
            )}
          onChange={(event) => onChange({ ...question, instructions: event.target.value })}
        />
      </label>

      <div className="criteria-block">
        <div className="field-heading">
          <span>
            {question.type === 'choice'
              ? '选项键与判断标准'
              : question.type === 'score'
                ? '评估标准（2–10 项）'
                : '真假边界'}
          </span>
          {question.type === 'noul' && <small>criteria 可选</small>}
        </div>

        {question.type === 'choice'
          ? Object.entries(question.criteria).map(([key, value], criteriaIndex) => (
              <div className="criteria-row choice-row" key={`${index}-${criteriaIndex}`}>
                <input
                  className={sampleInputValues.has(key) ? 'sample-value' : ''}
                  aria-label="选项键"
                  value={key}
                  placeholder="option_key"
                  onFocus={() =>
                    clearIfSample(key, () => updateChoiceEntry(key, '', value))}
                  onChange={(event) => updateChoiceEntry(key, event.target.value, value)}
                />
                <input
                  className={sampleInputValues.has(value) ? 'sample-value' : ''}
                  aria-label="判断标准"
                  value={value}
                  placeholder="描述此选项"
                  onFocus={() =>
                    clearIfSample(value, () => updateChoiceEntry(key, key, ''))}
                  onChange={(event) => updateChoiceEntry(key, key, event.target.value)}
                />
                <button
                  className="mini-button"
                  type="button"
                  aria-label="删除标准"
                  onClick={() => {
                    const criteria = { ...question.criteria }
                    delete criteria[key]
                    onChange({ ...question, criteria })
                  }}
                >
                  ×
                </button>
              </div>
            ))
          : question.type === 'score'
            ? question.criteria.map((value, criteriaIndex) => (
              <div className="criteria-row" key={`${index}-${criteriaIndex}`}>
                <input
                  className={sampleInputValues.has(value) ? 'sample-value' : ''}
                  aria-label="评估标准"
                  value={value}
                  placeholder="例如：转化意愿"
                  onFocus={() =>
                    clearIfSample(value, () => updateListEntry(criteriaIndex, ''))}
                  onChange={(event) => updateListEntry(criteriaIndex, event.target.value)}
                />
                <button
                  className="mini-button"
                  type="button"
                  aria-label="删除标准"
                  onClick={() =>
                    onChange({
                      ...question,
                      criteria: question.criteria.filter((_, i) => i !== criteriaIndex),
                    })
                  }
                  disabled={question.criteria.length <= 2}
                >
                  ×
                </button>
              </div>
            ))
            : question.criteria && (
              <div className="noul-boundaries">
                <label>
                  true · 为真边界
                  <input
                    className={
                      sampleInputValues.has(question.criteria.true) ? 'sample-value' : ''
                    }
                    aria-label="为真边界"
                    value={question.criteria.true}
                    placeholder="什么情况下判断为 true"
                    onFocus={() =>
                      clearIfSample(question.criteria!.true, () =>
                        onChange({
                          ...question,
                          criteria: { ...question.criteria!, true: '' },
                        }),
                      )}
                    onChange={(event) =>
                      onChange({
                        ...question,
                        criteria: { ...question.criteria!, true: event.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  false · 为假边界
                  <input
                    className={
                      sampleInputValues.has(question.criteria.false) ? 'sample-value' : ''
                    }
                    aria-label="为假边界"
                    value={question.criteria.false}
                    placeholder="什么情况下判断为 false"
                    onFocus={() =>
                      clearIfSample(question.criteria!.false, () =>
                        onChange({
                          ...question,
                          criteria: { ...question.criteria!, false: '' },
                        }),
                      )}
                    onChange={(event) =>
                      onChange({
                        ...question,
                        criteria: { ...question.criteria!, false: event.target.value },
                      })
                    }
                  />
                </label>
              </div>
            )}

        <button
          className="text-button"
          type="button"
          disabled={question.type === 'score' && question.criteria.length >= 10}
          onClick={() => {
            if (question.type === 'choice') {
              let n = Object.keys(question.criteria).length + 1
              let key = `option_${n}`
              while (key in question.criteria) key = `option_${++n}`
              onChange({ ...question, criteria: { ...question.criteria, [key]: '' } })
            } else if (question.type === 'score') {
              onChange({ ...question, criteria: [...question.criteria, ''] })
            } else {
              onChange({
                ...question,
                criteria: question.criteria ? undefined : { true: '', false: '' },
              })
            }
          }}
        >
          {question.type === 'noul'
            ? question.criteria
              ? '移除真假边界'
              : '＋ 添加真假边界'
            : '＋ 添加标准'}
        </button>
      </div>
    </article>
  )
}

export default function App() {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [batchBusy, setBatchBusy] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [stateText, setStateText] = useState(sampleStateText)
  const [questions, setQuestions] = useState<QuestionDraft[]>(sampleQuestions)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const stateError = useMemo(() => {
    try {
      JSON.parse(stateText)
      return ''
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'JSON 格式无效'
    }
  }, [stateText])

  const idErrors = useMemo(() => {
    const counts = new Map<string, number>()
    questions.forEach(({ id }) => {
      const normalized = id.trim()
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    })
    return questions.map(({ id }) => {
      const normalized = id.trim()
      if (!normalized) return 'ID 不能为空'
      if ((counts.get(normalized) ?? 0) > 1) return 'ID 必须唯一'
      return ''
    })
  }, [questions])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setResult(null)
    if (stateError) {
      setError(`state JSON 无效：${stateError}`)
      return
    }
    if (!questions.length) {
      setError('请至少添加一个问题。')
      return
    }
    const invalidId = idErrors.find(Boolean)
    if (invalidId) {
      setError(`问题 ID 无效：${invalidId}`)
      return
    }

    const payload: SystemOneRequest = {
      state: JSON.parse(stateText),
      model: 'jev-latest',
      questions: Object.fromEntries(
        questions.map(({ id, question }) => [id.trim(), question]),
      ),
    }

    setLoading(true)
    try {
      const response = await fetch('/api/systemone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey.trim() ? { 'X-TypeSafe-API-Key': apiKey.trim() } : {}),
        },
        body: JSON.stringify(payload),
      })
      const body = (await response.json()) as ApiResult
      if (!response.ok) {
        const message = getApiErrorMessage(body, response.status)
        throw new Error(message)
      }
      setResult(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '请求失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  const answers = result?.answers && typeof result.answers === 'object'
    ? Object.entries(result.answers)
    : []

  const renderValue = (value: unknown) => {
    if (value === undefined) return <span className="muted">未返回</span>
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return <strong>{String(value)}</strong>
    }
    return <code>{JSON.stringify(value)}</code>
  }

  const renderProbabilities = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return renderValue(value)
    }
    return (
      <div className="probability-list">
        {Object.entries(value as Record<string, unknown>).map(([key, probability]) => {
          const numeric = Number(probability)
          const width = Number.isFinite(numeric)
            ? Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric))
            : 0
          return (
            <div className="metric" key={key}>
              <div><span>{key}</span><strong>{String(probability)}</strong></div>
              <div className="meter"><i style={{ width: `${width}%` }} /></div>
            </div>
          )
        })}
      </div>
    )
  }

  const answerFields: Array<
    keyof Pick<SystemOneAnswer, 'choice' | 'score' | 'noul' | 'probabilities' | 'confidence'>
  > = ['choice', 'score', 'noul', 'probabilities', 'confidence']

  const questionsRecord = Object.fromEntries(
    questions.map(({ id, question }) => [id.trim(), question]),
  )
  const questionsValid = questions.length > 0 &&
    !idErrors.some(Boolean) &&
    questions.every(({ question }) => isQuestionComplete(question))

  const renderQuestionPanel = () => (
    <section className="panel question-panel">
      <div className="section-title">
        <div><span>02</span><h2>判断问题</h2></div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            let number = questions.length + 1
            let id = `question_${number}`
            const existingIds = new Set(questions.map((item) => item.id))
            while (existingIds.has(id)) id = `question_${++number}`
            setQuestions([...questions, { id, question: emptyQuestion() }])
          }}
        >
          ＋ 新增问题
        </button>
      </div>
      <div className="question-list">
        {questions.map(({ id, question }, index) => (
          <QuestionEditor
            key={index}
            index={index}
            id={id}
            idError={idErrors[index]}
            question={question}
            onIdChange={(nextId) =>
              setQuestions(questions.map((item, i) =>
                i === index ? { ...item, id: nextId } : item,
              ))
            }
            onChange={(next) =>
              setQuestions(questions.map((item, i) =>
                i === index ? { ...item, question: next } : item,
              ))
            }
            onRemove={() => setQuestions(questions.filter((_, i) => i !== index))}
          />
        ))}
        {!questions.length && <div className="empty">暂无问题，请添加一个问题。</div>}
      </div>
    </section>
  )

  return (
    <main>
      <header className="hero">
        <div className="brand-mark">S1</div>
        <div>
          <span className="eyebrow">TYPESAFE AI · SYSTEMONE</span>
          <h1>决策请求调试台</h1>
          <p>构造结构化状态与判断问题，通过服务端安全代理获取模型结果。</p>
        </div>
        <div className="status"><i /> API 密钥不写入浏览器存储</div>
      </header>

      <nav className="mode-tabs" aria-label="请求模式">
        <button type="button" disabled={batchBusy} title={batchBusy ? '请先等待当前批次结束' : undefined} className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>单条模式</button>
        <button type="button" className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>批量模式</button>
      </nav>

      <section className="api-key-panel" aria-label="API Key 配置">
        <div className="api-key-copy">
          <span className="eyebrow">CONNECTION CREDENTIAL</span>
          <strong>API Key</strong>
          <small>仅保存在当前页面内存，刷新后自动清除</small>
        </div>
        <div className="api-key-field">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            placeholder="留空则使用服务端 .env 中的密钥"
            aria-label="API Key"
            onChange={(event) => setApiKey(event.target.value)}
          />
          <button type="button" onClick={() => setShowApiKey((current) => !current)}>
            {showApiKey ? '隐藏' : '显示'}
          </button>
          {apiKey && <button type="button" onClick={() => setApiKey('')}>清除</button>}
        </div>
        <span className={`key-source ${apiKey.trim() ? 'temporary' : ''}`}>
          <i />
          {apiKey.trim() ? '使用临时密钥' : '使用服务端密钥'}
        </span>
      </section>

      {mode === 'single' ? <>
      <form onSubmit={submit}>
        <div className="workspace">
          <section className="panel input-panel">
            <div className="section-title">
              <div><span>01</span><h2>输入状态</h2></div>
              <button
                type="button"
                className="text-button"
                onClick={() => setStateText(sampleStateText)}
              >
                恢复示例
              </button>
            </div>
            <label>
              State · JSON
              <textarea
                className={[
                  'code-editor',
                  stateError ? 'invalid' : '',
                  stateText === sampleStateText ? 'sample-value' : '',
                ].filter(Boolean).join(' ')}
                value={stateText}
                rows={15}
                spellCheck={false}
                onFocus={() => {
                  if (stateText === sampleStateText) setStateText('')
                }}
                onChange={(event) => setStateText(event.target.value)}
              />
            </label>
            <div className={`json-status ${stateError ? 'bad' : ''}`}>
              {stateError ? `格式错误：${stateError}` : 'JSON 格式有效'}
            </div>
          </section>

          {renderQuestionPanel()}
        </div>

        <div className="submit-bar">
          <div><strong>jev-latest</strong><span>固定模型版本</span></div>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? <><i className="spinner" /> 正在推理</> : '发送决策请求 →'}
          </button>
        </div>
      </form>

      <section className="panel result-panel">
        <div className="section-title">
          <div><span>03</span><h2>响应结果</h2></div>
          {result && <span className="success-chip">请求成功</span>}
        </div>
        {error && <div className="error-box"><strong>无法完成请求</strong><span>{error}</span></div>}
        {!error && !result && <div className="result-placeholder">发送请求后，概率、置信度与原始响应将在此展示。</div>}
        {result && (
          <div className="result-grid">
            <div>
              <h3>逐题答案</h3>
              {answers.length ? answers.map(([questionId, answer]) => {
                const safeAnswer = answer && typeof answer === 'object'
                  ? answer as SystemOneAnswer
                  : {}
                return (
                  <article className="answer-card" key={questionId}>
                    <h4>{questionId}</h4>
                    <dl>
                      {answerFields.map((field) => (
                        <div key={field}>
                          <dt>{field}</dt>
                          <dd>
                            {field === 'probabilities'
                              ? renderProbabilities(safeAnswer[field])
                              : renderValue(safeAnswer[field])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                )
              }) : <p className="muted">response.answers 中没有可展示的逐题答案。</p>}
            </div>
            <div>
              <h3>原始 JSON</h3>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          </div>
        )}
      </section>
      </> : (
        <BatchMode
          apiKey={apiKey}
          questions={questionsRecord}
          questionsValid={questionsValid}
          questionEditor={renderQuestionPanel()}
          onBusyChange={setBatchBusy}
        />
      )}
      <footer>界面密钥仅驻留当前页面内存，并通过本地服务端代理转发。</footer>
    </main>
  )
}
