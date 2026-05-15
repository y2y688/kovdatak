export type MousePoint = {
  ts: number
  x: number
  y: number
  buttons?: number
  hit?: boolean  // 是否击中目标
  speed?: number  // 平滑速度（像素/秒），v3 格式预计算
  accel?: number  // 加速度（像素/秒²），前端从 speed 计算
}

export interface ScenarioRecord {
  filePath: string
  fileName: string
  traceId?: string
  stats: Record<string, any>
  events: string[][]
  mouseTrace?: Array<MousePoint>
  traceData?: string
  hasTrace?: boolean
}

export interface DifficultySubcategory {
  subcategoryName: string
  scenarioCount: number
  color?: string
}

export interface DifficultyCategory {
  categoryName: string
  color?: string
  subcategories: DifficultySubcategory[]
}

export interface BenchmarkDifficulty {
  difficultyName: string
  kovaaksBenchmarkId: number
  sharecode: string
  rankColors?: Record<string, string>
  categories?: DifficultyCategory[]
}

export interface CustomBenchmarkPayload {
  benchmarkName: string
  rankCalculation?: string
  abbreviation: string
  color: string
  spreadsheetURL?: string
  difficulties?: BenchmarkDifficulty[]
}

export interface Benchmark {
  benchmarkName: string
  rankCalculation: string
  abbreviation: string
  color: string
  spreadsheetURL: string
  dateAdded?: string
  difficulties: BenchmarkDifficulty[]
}

export interface RankDef {
  name: string
  color: string
}

export interface ProgressScenario {
  name: string
  score: number
  scenarioRank: number
  thresholds: number[]
  energy?: number
  leaderboardRank?: number
}

export interface ProgressGroup {
  name?: string
  color?: string
  scenarios: ProgressScenario[]
  energy?: number
}

export interface ProgressCategory {
  name: string
  color?: string
  groups: ProgressGroup[]
}

export interface BenchmarkProgress {
  overallRank: number
  benchmarkProgress: number
  ranks: RankDef[]
  categories: ProgressCategory[]
}

import type { Font, Theme } from '../lib/theme'

export interface Settings {
  steamInstallDir?: string
  steamIdOverride?: string
  statsDir: string
  tracesDir: string
  sessionGapMinutes: number
  theme: Theme
  font: Font
  favoriteBenchmarks?: string[]
  mouseTrackingEnabled?: boolean
  mouseBufferMinutes?: number
  maxExistingOnStart?: number
  autostartEnabled?: boolean
  geminiApiKey?: string
  scenarioNotes?: Record<string, ScenarioNote>
  sessionNotes?: Record<string, SessionNote>
}

export interface ScenarioNote {
  notes: string
  sens: string
}

export interface SessionNote {
  name: string
  notes: string
}

export interface KovaaksScoreAttributes {
  score: number
  challengeStart: string
}

export interface ScenarioTopScore {
  scenario_name: string
  leaderboard_id: number | null
  top_score: number | null
}

export interface KovaaksLastScore {
  id: string
  type: string
  attributes: KovaaksScoreAttributes
}
