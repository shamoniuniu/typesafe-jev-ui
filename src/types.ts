export type CriteriaMap = Record<string, string>
export type QuestionId = string

export interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: CriteriaMap
}

export interface ScoreQuestion {
  type: 'score'
  instructions: string
  criteria: string[]
}

export interface NoulQuestion {
  type: 'noul'
  instructions: string
  criteria?: {
    true: string
    false: string
  }
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion

export interface SystemOneRequest {
  state: unknown
  model: 'jev-latest'
  questions: Record<QuestionId, Question>
}

export interface SystemOneAnswer {
  choice?: unknown
  score?: unknown
  noul?: unknown
  probabilities?: unknown
  confidence?: unknown
  [key: string]: unknown
}

export interface ApiResult {
  answers?: Record<QuestionId, SystemOneAnswer>
  error?: string
  [key: string]: unknown
}
