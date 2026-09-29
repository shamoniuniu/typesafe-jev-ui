import { describe, expect, it } from 'vitest'
import {
  parseCsvText,
  parseJsonLines,
  parseTextLines,
  stateFromCell,
  tabularFromMatrix,
  validateBatchSize,
} from '../src/batchParsing.js'

describe('批量输入解析', () => {
  it('解析 JSONL 并报告准确行号', () => {
    expect(parseJsonLines('{"id":1}\n\n{"id":2}')).toEqual([{ id: 1 }, { id: 2 }])
    expect(() => parseJsonLines('{"ok":true}\nnot-json')).toThrow('第 2 行')
  })

  it('按非空行解析纯文本', () => {
    expect(parseTextLines(' 第一条 \r\n\r\n第二条 ')).toEqual(['第一条', '第二条'])
  })

  it('解析工作表矩阵并选择性解析 JSON 单元格', () => {
    const parsed = tabularFromMatrix([
      ['id', 'state'],
      [1, '{"tier":"pro"}'],
      [2, 'plain text'],
    ])

    expect(parsed.columns).toEqual(['id', 'state'])
    expect(parsed.rows).toHaveLength(2)
    expect(stateFromCell(parsed.rows[0].state)).toEqual({ tier: 'pro' })
    expect(stateFromCell(parsed.rows[1].state)).toBe('plain text')
  })

  it('解析含逗号、换行及转义引号的 CSV', () => {
    const parsed = parseCsvText('id,state\n1,"hello, world"\n2,"line 1\nline ""2"""')
    expect(parsed.rows).toEqual([
      { id: '1', state: 'hello, world' },
      { id: '2', state: 'line 1\nline "2"' },
    ])
  })

  it('限制为 100–1000 条', () => {
    expect(validateBatchSize(Array(100).fill(null))).toHaveLength(100)
    expect(() => validateBatchSize(Array(99).fill(null))).toThrow('100–1000')
    expect(() => validateBatchSize(Array(1001).fill(null))).toThrow('100–1000')
  })
})
