import { readSheet } from 'read-excel-file/browser'

export interface TabularData {
  columns: string[]
  rows: Record<string, unknown>[]
}

export function parseJsonLines(text: string): unknown[] {
  const values: unknown[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    try {
      values.push(JSON.parse(line))
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'JSON 无效'
      throw new Error(`第 ${index + 1} 行 JSON 无效：${detail}`)
    }
  })
  return values
}

export function parseTextLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function tabularFromMatrix(matrix: unknown[][]): TabularData {
  if (!matrix.length) throw new Error('文件为空。')

  const columns = matrix[0].map((value, index) => {
    const name = String(value).replace(/^\uFEFF/, '').trim()
    return name || `列_${index + 1}`
  })
  if (!columns.length) throw new Error('文件中没有可用列。')
  if (new Set(columns).size !== columns.length) {
    throw new Error('表头包含重复列名，请先修改后再上传。')
  }

  const rows = matrix.slice(1)
    .filter((row) => row.some((value) => String(value).trim() !== ''))
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ''])))

  return { columns, rows }
}

export function parseCsvText(text: string): TabularData {
  const rows: string[][] = [[]]
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        rows.at(-1)!.push('"')
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      rows.at(-1)!.push('\u0000')
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      rows.push([])
    } else {
      rows.at(-1)!.push(character)
    }
  }
  if (quoted) throw new Error('CSV 引号未闭合。')

  const matrix = rows
    .map((characters) => characters.join('').split('\u0000'))
    .filter((row, index) => index === 0 || row.some((cell) => cell.trim() !== ''))
  return tabularFromMatrix(matrix)
}

export async function parseTabularFile(file: File): Promise<TabularData> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return parseCsvText(await file.text())
  }
  const rows = await readSheet(file)
  return tabularFromMatrix(rows as unknown[][])
}

export function stateFromCell(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

export function validateBatchSize(inputs: unknown[]) {
  if (inputs.length < 100 || inputs.length > 1000) {
    throw new Error(`批量输入须为 100–1000 条，当前为 ${inputs.length} 条。`)
  }
  return inputs
}
