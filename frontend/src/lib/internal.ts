import type { Benchmark, BenchmarkProgress, CustomBenchmarkPayload, KovaaksLastScore, ScenarioRecord, ScenarioTopScore, Settings } from '../types/ipc'
import type { CustomPlaylist } from '../types/domain'

async function apiJSON(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const LS_SCENARIO_NOTES = 'kovdatak:scenarioNotes'
const LS_SESSION_NOTES = 'kovdatak:sessionNotes'

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export async function getRecentScenarios(limit = 0): Promise<ScenarioRecord[]> {
  const n = Number(limit) || 200
  const res = await apiJSON(`/api/records?limit=${encodeURIComponent(String(n))}`)
  const rows = Array.isArray(res?.records) ? res.records : []
  return rows.map((rec: any) => ({
    filePath: rec?.filePath ?? rec?.file_path ?? '',
    fileName: rec?.fileName ?? rec?.file_name ?? '',
    traceId: rec?.traceId ?? rec?.trace_id ?? '',
    stats: rec?.stats ?? {},
    events: Array.isArray(rec?.events) ? rec.events : [],
    hasTrace: Boolean(rec?.hasTrace ?? rec?.has_trace),
  })) as ScenarioRecord[]
}

export async function getLastScenarioScores(scenarioName: string): Promise<KovaaksLastScore[]> {
  const all = await getRecentScenarios(2000)
  const rows = all
    .filter((r) => String(r?.stats?.Scenario || '') === String(scenarioName || ''))
    .slice(0, 10)
  return rows.map((r, idx) => ({
    id: `${r.filePath || 'record'}:${idx}`,
    type: 'score',
    attributes: {
      score: Number(r.stats?.Score || 0),
      challengeStart: String(r.stats?.['Date Played'] || ''),
    },
  }))
}

export async function getSettings(): Promise<Settings> {
  const cfg = await apiJSON('/api/config')
  return {
    steamInstallDir: cfg?.steam_install_dir || '',
    steamIdOverride: cfg?.steam_id_override || '',
    statsDir: cfg?.stats_dir || '',
    tracesDir: cfg?.traces_dir || '',
    sessionGapMinutes: 30,
    theme: 'dark',
    font: 'montserrat',
    favoriteBenchmarks: [],
    mouseTrackingEnabled: Boolean(cfg?.mouse_tracking_enabled ?? true),
    mouseBufferMinutes: Math.round((Number(cfg?.mouse_buffer_seconds) || 600) / 60),
    maxExistingOnStart: 0,
    autostartEnabled: false,
    scenarioNotes: readJSON(LS_SCENARIO_NOTES, {}),
    sessionNotes: readJSON(LS_SESSION_NOTES, {}),
  } as Settings
}

export async function updateSettings(payload: Settings): Promise<void> {
  await apiJSON('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      steam_install_dir: (payload as any)?.steamInstallDir,
      steam_id_override: (payload as any)?.steamIdOverride,
      stats_dir: (payload as any)?.statsDir,
      traces_dir: (payload as any)?.tracesDir,
      mouse_buffer_seconds: (Number((payload as any)?.mouseBufferMinutes) || 10) * 60,
      mouse_tracking_enabled: Boolean((payload as any)?.mouseTrackingEnabled ?? true),
    }),
  })
  if ((payload as any)?.scenarioNotes) writeJSON(LS_SCENARIO_NOTES, (payload as any).scenarioNotes)
  if ((payload as any)?.sessionNotes) writeJSON(LS_SESSION_NOTES, (payload as any).sessionNotes)
}

export async function resetSettings(config: boolean, favorites: boolean, scenarioNotes: boolean, sessionNotes: boolean): Promise<void> {
  if (scenarioNotes) localStorage.removeItem(LS_SCENARIO_NOTES)
  if (sessionNotes) localStorage.removeItem(LS_SESSION_NOTES)
  if (favorites) {
    await setFavoriteBenchmarks([])
  }
  if (config) {
    const cur = await getSettings()
    await updateSettings({
      ...cur,
      theme: 'dark',
      font: 'montserrat',
      sessionGapMinutes: 30,
      mouseBufferMinutes: 10,
    })
  }
}

export async function saveScenarioNote(scenario: string, notes: string, sens: string): Promise<void> {
  const all = readJSON<Record<string, { notes: string; sens: string }>>(LS_SCENARIO_NOTES, {})
  all[String(scenario || '')] = { notes: String(notes || ''), sens: String(sens || '') }
  writeJSON(LS_SCENARIO_NOTES, all)
}

export async function saveSessionNote(sessionID: string, name: string, notes: string): Promise<void> {
  const all = readJSON<Record<string, { name: string; notes: string }>>(LS_SESSION_NOTES, {})
  all[String(sessionID || '')] = { name: String(name || ''), notes: String(notes || '') }
  writeJSON(LS_SESSION_NOTES, all)
}

export async function getBenchmarks(): Promise<Benchmark[]> {
  const data = await apiJSON('/api/benchmarks')
  const benchmarks = data?.benchmarks
  if (!Array.isArray(benchmarks)) throw new Error('GetBenchmarks failed')
  return benchmarks as Benchmark[]
}

export async function getFavoriteBenchmarks(): Promise<string[]> {
  const data = await apiJSON('/api/benchmarks/favorites')
  const ids = data?.favorites
  return Array.isArray(ids) ? ids : []
}

export async function setFavoriteBenchmarks(ids: string[]): Promise<void> {
  await apiJSON('/api/benchmarks/favorites', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorites: Array.isArray(ids) ? ids : [] }),
  })
}

export async function getBenchmarkProgress(benchmarkId: number): Promise<BenchmarkProgress> {
  const id = Number(benchmarkId) || 0
  const data = await apiJSON(`/api/benchmarks/progress/${encodeURIComponent(String(id))}`)
  return data?.progress as BenchmarkProgress
}

export async function createCustomBenchmark(payload: CustomBenchmarkPayload): Promise<Benchmark> {
  const data = await apiJSON('/api/benchmarks/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return data?.benchmark as Benchmark
}

export async function updateCustomBenchmark(cid: string, payload: CustomBenchmarkPayload): Promise<Benchmark> {
  const data = await apiJSON(`/api/benchmarks/custom/${encodeURIComponent(cid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return data?.benchmark as Benchmark
}

export async function deleteCustomBenchmark(cid: string): Promise<void> {
  await apiJSON(`/api/benchmarks/custom/${encodeURIComponent(cid)}`, { method: 'DELETE' })
}

// Launch a Kovaak's scenario via Steam deeplink
export async function launchScenario(name: string, mode: string = 'challenge'): Promise<void> {
  const n = String(name || '').trim()
  if (!n) return
  const m = String(mode || 'challenge').trim() || 'challenge'
  try {
    await apiJSON('/api/launch/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, mode: m }),
    })
  } catch {
    // Fallback: direct deeplink (may be less reliable in some browsers)
    const en = encodeURIComponent(n)
    const em = encodeURIComponent(m)
    window.location.href = `steam://run/824270/?action=jump-to-scenario;name=${en};mode=${em}`
  }
}

// Launch a Kovaak's playlist via Steam deeplink using a sharecode
export async function launchPlaylist(sharecode: string): Promise<void> {
  const sc = String(sharecode || '').trim()
  if (!sc) return
  try {
    await apiJSON('/api/launch/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharecode: sc }),
    })
  } catch {
    const esc = encodeURIComponent(sc)
    window.location.href = `steam://run/824270/?action=jump-to-playlist;sharecode=${esc}`
  }
}

export async function getScenarioTopScore(scenarioName: string): Promise<ScenarioTopScore> {
  const p = new URLSearchParams({ scenario: scenarioName })
  return apiJSON(`/api/scenario/top-score?${p}`) as Promise<ScenarioTopScore>
}

export async function getScenarioTrace(fileOrTraceId: string): Promise<string> {
  const fileName = String(fileOrTraceId || '').trim()
  const base = fileName
    .replace(/\.csv$/i, '')
    .replace(/\.trace$/i, '')
    .replace(/\.json$/i, '')
    .replace(/ Stats$/i, '')
  const d = await apiJSON(`/api/traces/${encodeURIComponent(base)}`)
  const pts = Array.isArray(d?.points) ? d.points : []
  const count = pts.length >>> 0
  // 检测是否有任何点包含 hit 字段为 true，使用 v2 格式（21字节）
  // 后端返回 ts 字段（秒），不是 t
  const hasHit = pts.some((p: any) => p.hit === true)
  const hasAcc = pts.some((p: any) => p.acc !== undefined)
  const pointSize = hasAcc ? 25 : (hasHit ? 21 : 20)
  const buf = new ArrayBuffer(4 + count * pointSize)
  const view = new DataView(buf)
  let off = 0
  view.setUint32(off, count, true)
  off += 4
  for (let i = 0; i < count; i++) {
    const p = pts[i] || {}
    // 后端返回 ts 字段（秒），不是 t
    const ts = p.ts ?? p.t ?? 0
    const tsMs = Math.round(Number(ts) * 1000)
    const tsNano = BigInt(Math.trunc(tsMs)) * BigInt(1000000)
    view.setBigInt64(off, tsNano, true)
    view.setInt32(off + 8, Number(p.x) | 0, true)
    view.setInt32(off + 12, Number(p.y) | 0, true)
    view.setUint32(off + 16, Number(p.buttons) >>> 0, true)
    if (pointSize >= 21) {
      view.setUint8(off + 20, p.hit ? 1 : 0)
    }
    // v3 格式支持加速度
    if (pointSize >= 25) {
      view.setFloat32(off + 21, Number(p.acc) || 0, true)
    }
    off += pointSize
  }
  const bytes = new Uint8Array(buf)
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(s)
}

export async function getCustomPlaylists(): Promise<CustomPlaylist[]> {
  const data = await apiJSON('/api/playlists/custom')
  return Array.isArray(data?.playlists) ? data.playlists as CustomPlaylist[] : []
}

export async function addCustomPlaylist(name: string, sharecode: string): Promise<CustomPlaylist> {
  const data = await apiJSON('/api/playlists/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sharecode }),
  })
  return data?.playlist as CustomPlaylist
}

export async function removeCustomPlaylist(id: string): Promise<void> {
  await apiJSON(`/api/playlists/custom/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function updateCustomPlaylist(id: string, name: string, sharecode: string): Promise<CustomPlaylist | null> {
  const data = await apiJSON(`/api/playlists/custom/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sharecode }),
  })
  return (data?.playlist as CustomPlaylist) || null
}
