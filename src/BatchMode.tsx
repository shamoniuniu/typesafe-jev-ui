import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { BatchTaskQueue, type BatchTask } from './batchQueue'
import {
  parseJsonLines,
  parseTabularFile,
  parseTextLines,
  stateFromCell,
  type TabularData,
  validateBatchSize,
} from './batchParsing'
import { findLowConfidenceFlags } from './confidence'
import type { ApiResult, Question, SystemOneRequest } from './types'

type InputMode = 'table' | 'jsonl' | 'text'

interface BatchResponse {
  response: ApiResult
  lowConfidence: ReturnType<typeof findLowConfidenceFlags>
}

export function BatchMode({
  apiKey,
  questions,
  questionsValid,
  questionEditor,
  onBusyChange,
}: {
  apiKey: string
  questions: Record<string, Question>
  questionsValid: boolean
  questionEditor: ReactNode
  onBusyChange: (busy: boolean) => void
}) {
  const [inputMode, setInputMode] = useState<InputMode>('table')
  const [sourceText, setSourceText] = useState('')
  const [table, setTable] = useState<TabularData | null>(null)
  const [stateColumn, setStateColumn] = useState('')
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [concurrency, setConcurrency] = useState(3)
  const [threshold, setThreshold] = useState(0.7)
  const [tasks, setTasks] = useState<BatchTask<unknown, BatchResponse>[]>([])
  const [paused, setPaused] = useState(false)
  const queueRef = useRef<BatchTaskQueue<unknown, BatchResponse> | null>(null)

  const inputs = useMemo(() => {
    try {
      if (inputMode === 'jsonl') return parseJsonLines(sourceText)
      if (inputMode === 'text') return parseTextLines(sourceText)
      if (!table || !stateColumn) return []
      return table.rows.map((row) => stateFromCell(row[stateColumn]))
    } catch {
      return []
    }
  }, [inputMode, sourceText, stateColumn, table])

  const counts = useMemo(() => ({
    succeeded: tasks.filter((task) => task.status === 'succeeded').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
    running: tasks.filter((task) => task.status === 'running').length,
    completed: tasks.filter((task) => ['succeeded', 'failed'].includes(task.status)).length,
  }), [tasks])

  const resetRun = () => {
    queueRef.current = null
    setTasks([])
    setPaused(false)
  }

  const changeInputMode = (mode: InputMode) => {
    setInputMode(mode)
    setParseError('')
    resetRun()
  }

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setParseError('')
    resetRun()
    try {
      const parsed = await parseTabularFile(file)
      setTable(parsed)
      setFileName(file.name)
      setStateColumn(parsed.columns.includes('state') ? 'state' : parsed.columns[0])
    } catch (reason) {
      setTable(null)
      setFileName('')
      setStateColumn('')
      setParseError(reason instanceof Error ? reason.message : '文件解析失败。')
    }
  }

  const worker = async (state: unknown): Promise<BatchResponse> => {
    const payload: SystemOneRequest = { state, model: 'jev-latest', questions }
    const response = await fetch('/api/systemone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey.trim() ? { 'X-TypeSafe-API-Key': apiKey.trim() } : {}),
      },
      body: JSON.stringify(payload),
    })
    let body: ApiResult
    try {
      body = await response.json() as ApiResult
    } catch {
      throw new Error(`响应不是有效 JSON (${response.status})`)
    }
    if (!response.ok) {
      throw new Error(typeof body.error === 'string' ? body.error : `请求失败 (${response.status})`)
    }
    return {
      response: body,
      lowConfidence: findLowConfidenceFlags(body, questions, threshold),
    }
  }

  const start = () => {
    setParseError('')
    try {
      if (!questionsValid) throw new Error('请先修正判断问题。')
      const validInputs = validateBatchSize(inputs)
      const queue = new BatchTaskQueue(validInputs, worker, setTasks, concurrency)
      queueRef.current = queue
      setPaused(false)
      queue.start()
    } catch (reason) {
      setParseError(reason instanceof Error ? reason.message : '无法开始批量任务。')
    }
  }

  const togglePause = () => {
    const queue = queueRef.current
    if (!queue) return
    if (paused) queue.resume()
    else queue.pause()
    setPaused(!paused)
  }

  const exportJsonl = () => {
    const content = tasks.map((task) => JSON.stringify({
      index: task.id + 1,
      input: task.input,
      status: task.status,
      response: task.result?.response,
      lowConfidence: task.result?.lowConfidence,
      error: task.error,
    })).join('\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-ndjson;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `jev-batch-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const busy = counts.running > 0 || tasks.some((task) => task.status === 'queued')
  const progress = tasks.length ? Math.round((counts.completed / tasks.length) * 100) : 0

  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])

  return (
    <>
      <div className="workspace">
        <section className="panel input-panel batch-input-panel">
          <div className="section-title">
            <div><span>01</span><h2>批量状态</h2></div>
            <span className="count-chip">{inputs.length} 条</span>
          </div>
          <div className="segmented">
            <button type="button" disabled={busy} className={inputMode === 'table' ? 'active' : ''} onClick={() => changeInputMode('table')}>CSV / XLSX</button>
            <button type="button" disabled={busy} className={inputMode === 'jsonl' ? 'active' : ''} onClick={() => changeInputMode('jsonl')}>JSONL</button>
            <button type="button" disabled={busy} className={inputMode === 'text' ? 'active' : ''} onClick={() => changeInputMode('text')}>每行文本</button>
          </div>
          {inputMode === 'table' ? (
            <div className="batch-source">
              <label className="file-drop">
                <input type="file" accept=".csv,.xlsx" disabled={busy} onChange={upload} />
                <strong>{fileName || '选择 CSV / XLSX 文件'}</strong>
                <span>首行作为表头，支持 100–1000 条数据</span>
              </label>
              {table && (
                <label>
                  State 列
                  <select disabled={busy} value={stateColumn} onChange={(event) => setStateColumn(event.target.value)}>
                    {table.columns.map((column) => <option key={column}>{column}</option>)}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <label>
              {inputMode === 'jsonl' ? '每行一个 JSON state' : '每行作为一个字符串 state'}
              <textarea
                className="code-editor batch-editor"
                value={sourceText}
                rows={15}
                spellCheck={false}
                disabled={busy}
                placeholder={inputMode === 'jsonl' ? '{"user_id": 1}\n{"user_id": 2}' : '第一条文本\n第二条文本'}
                onChange={(event) => {
                  setSourceText(event.target.value)
                  setParseError('')
                  resetRun()
                }}
              />
            </label>
          )}
          {parseError && <div className="error-box compact"><span>{parseError}</span></div>}
          <p className="help-text">表格单元格若为合法 JSON 会解析为对象，否则按原值发送。</p>
        </section>
        <div className={busy ? 'editor-locked' : ''} aria-disabled={busy}>
          {questionEditor}
        </div>
      </div>

      <div className="submit-bar batch-controls">
        <div className="batch-settings">
          <label>并发
            <input type="number" min="1" max="5" value={concurrency} onChange={(event) => {
              const value = Math.max(1, Math.min(5, Number(event.target.value)))
              setConcurrency(value)
              queueRef.current?.setConcurrency(value)
            }} />
          </label>
          <label>低置信阈值
            <input type="number" min="0.5" max="0.99" step="0.01" value={threshold} disabled={tasks.length > 0} onChange={(event) => setThreshold(Number(event.target.value))} />
          </label>
        </div>
        <div className="batch-actions">
          {!tasks.length && <button className="primary-button" type="button" onClick={start}>开始批量请求 →</button>}
          {tasks.length > 0 && busy && <button className="secondary-dark-button" type="button" onClick={togglePause}>{paused ? '继续' : '暂停'}</button>}
          {counts.failed > 0 && !busy && <button className="secondary-dark-button" type="button" onClick={() => queueRef.current?.retryFailed()}>重试失败项</button>}
          {tasks.length > 0 && !busy && <button className="primary-button" type="button" onClick={exportJsonl}>导出 JSONL</button>}
        </div>
      </div>

      <section className="panel result-panel batch-result">
        <div className="section-title">
          <div><span>03</span><h2>批量进度</h2></div>
          <strong>{progress}%</strong>
        </div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        <div className="stats">
          <span>完成 {counts.completed}/{tasks.length || inputs.length}</span>
          <span className="success-text">成功 {counts.succeeded}</span>
          <span className="danger-text">失败 {counts.failed}</span>
          <span>运行中 {counts.running}</span>
        </div>
        {!tasks.length ? (
          <div className="result-placeholder">准备 100–1000 条状态并开始后，将在这里显示逐条进度。</div>
        ) : (
          <div className="batch-table-wrap">
            <table>
              <thead><tr><th>#</th><th>状态</th><th>低置信标记</th><th>响应 / 错误</th></tr></thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.id + 1}</td>
                    <td><span className={`task-status ${task.status}`}>{task.status}</span></td>
                    <td>{task.result?.lowConfidence.map((flag) => flag.questionId).join(', ') || '—'}</td>
                    <td className="result-cell">{task.error || (task.result ? JSON.stringify(task.result.response) : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
