import type { ApiResult, Question } from './types'

export interface ConfidenceFlag {
  questionId: string
  type: Question['type']
  reason: string
}

function probability(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return numeric > 1 && numeric <= 100 ? numeric / 100 : numeric
}

export function findLowConfidenceFlags(
  result: ApiResult,
  questions: Record<string, Question>,
  threshold: number,
): ConfidenceFlag[] {
  const normalizedThreshold = Math.max(0.5, Math.min(0.99, threshold))
  const lower = 1 - normalizedThreshold
  const flags: ConfidenceFlag[] = []

  Object.entries(questions).forEach(([questionId, question]) => {
    const answer = result.answers?.[questionId]
    if (!answer) return

    if (question.type === 'noul') {
      const noul = probability(answer.noul)
      if (noul !== null && noul >= lower && noul <= normalizedThreshold) {
        flags.push({
            questionId,
            type: question.type,
            reason: `noul=${noul} 位于中间区间 ${lower.toFixed(2)}–${normalizedThreshold.toFixed(2)}`,
        })
      }
      return
    }

    const confidence = probability(answer.confidence)
    if (confidence !== null && confidence < normalizedThreshold) {
      flags.push({
          questionId,
          type: question.type,
          reason: `confidence=${confidence} 低于阈值 ${normalizedThreshold.toFixed(2)}`,
      })
    }
  })
  return flags
}
