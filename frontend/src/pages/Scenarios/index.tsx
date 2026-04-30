import { Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EventsOn } from '../../lib/runtime';
import { Input } from '../../components/shared/Input';
import { ListDetail } from '../../components/shared/ListDetail';
import { usePageState } from '../../hooks/usePageState';
import { useStore } from '../../hooks/useStore';
import { useUIState } from '../../hooks/useUIState';
import { getScenarioTopScore, getSettings, launchScenario, updateSettings } from '../../lib/internal';
import { formatPct01, getDatePlayed, getScenarioName } from '../../lib/utils';
import type { ScenarioRecord, ScenarioTopScore } from '../../types/ipc';
import { ScenarioScoreAccHistoryChart } from '../../components/scenarios/ScenarioScoreAccHistoryChart';
import { MouseTraceTab } from './tabs/MouseTrace';

export function ScenariosPage() {
  const scenarios = useStore(s => s.scenarios)
  const [activeId, setActiveId] = usePageState<string | null>('activeFile', scenarios[0]?.filePath ?? null)
  const active = useMemo(() => scenarios.find(s => s.filePath === activeId) ?? scenarios[0] ?? null, [scenarios, activeId])
  const didInitFromUrl = useRef(false)
  const [watchPath, setWatchPath] = useState<string>('stats')
  const [statsDir, setStatsDir] = useState<string>('')
  const [savedStatsDir, setSavedStatsDir] = useState<string>('')
  const [statsDirSaving, setStatsDirSaving] = useState<boolean>(false)

  // One-time URL init + fallback to newest item when current selection disappears.
  useEffect(() => {
    if (!didInitFromUrl.current) {
      didInitFromUrl.current = true
      const qFile = new URLSearchParams(window.location.search).get('file')
      if (qFile && scenarios.some(s => s.filePath === qFile)) {
        setActiveId(qFile)
        return
      }
    }
    const exists = activeId ? scenarios.some(s => s.filePath === activeId) : false
    if (!exists) {
      setActiveId(scenarios[0]?.filePath ?? null)
    }
  }, [scenarios, activeId, setActiveId])

  // Resolve current watch path for placeholder text; update on watcher restarts
  useEffect(() => {
    let off: (() => void) | null = null
    getSettings().then(s => {
      if (s && typeof s.statsDir === 'string') {
        const v = s.statsDir.trim()
        if (v.length > 0) setWatchPath(v)
        setStatsDir(v)
        setSavedStatsDir(v)
      }
    }).catch(() => { /* ignore */ })
    try {
      off = EventsOn('watcher:started', (data: any) => {
        const p = data && (data.path || data.Path)
        if (typeof p === 'string' && p.length > 0) {
          setWatchPath(p)
        }
      })
    } catch { /* ignore */ }
    return () => {
      try { off && off() } catch { /* ignore */ }
    }
  }, [])

  const filteredScenarios = scenarios

  const prettyPath = useMemo(() => {
    const p = (watchPath || '').trim()
    if (!p) return 'stats/'
    // Add a trailing slash for readability
    return p.endsWith('/') ? p : p + '/'
  }, [watchPath])

  const normalizedStatsDir = statsDir.trim()
  const isStatsDirSaved = normalizedStatsDir.length > 0 && normalizedStatsDir === savedStatsDir.trim()

  type ScenarioGroup = {
    id: string
    name: string
    latest: ScenarioRecord
    items: ScenarioRecord[]
  }

  const groupedScenarios = useMemo<ScenarioGroup[]>(() => {
    // Keep overall ordering by the first occurrence in filteredScenarios (which is already sorted).
    const out: ScenarioGroup[] = []
    const idxByName = new Map<string, number>()
    for (const it of filteredScenarios) {
      const name = getScenarioName(it)
      const existingIdx = idxByName.get(name)
      if (existingIdx === undefined) {
        idxByName.set(name, out.length)
        out.push({
          id: `group:${name}`,
          name,
          latest: it,
          items: [it],
        })
      } else {
        const g = out[existingIdx]
        g.items.push(it)
      }
    }
    return out
  }, [filteredScenarios])

  return (
    <div className="space-y-4 h-full flex flex-col p-4">
      <div className="p-3 rounded border border-primary bg-surface-2 text-sm">
        <div className="font-medium mb-2">统计目录</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={statsDir}
            onChange={e => setStatsDir(e.target.value)}
            placeholder="例如:D:\steam\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats"
            className="w-[520px] max-w-full"
          />
          <button
            disabled={statsDirSaving || !normalizedStatsDir || isStatsDirSaved}
            onClick={async () => {
              setStatsDirSaving(true)
              try {
                const cur: any = await getSettings().catch(() => ({}))
                await updateSettings({ ...(cur || {}), statsDir: normalizedStatsDir } as any)
                const latest: any = await getSettings().catch(() => ({}))
                const saved = String(latest?.statsDir || normalizedStatsDir)
                setStatsDir(saved)
                setSavedStatsDir(saved)
                if (saved.trim().length > 0) setWatchPath(saved)
              } catch (e) {
                console.warn('更新统计目录失败', e)
              } finally {
                setStatsDirSaving(false)
              }
            }}
            className="px-3 py-2 rounded bg-surface-2 border border-primary text-sm hover:bg-surface-3 disabled:opacity-50"
          >
            {statsDirSaving ? '保存中...' : isStatsDirSaved ? '已保存' : '保存'}
          </button>
        </div>
        <div className="text-xs text-secondary mt-2">用于获取场景csv记录</div>
      </div>

      <div className="flex-1 min-h-0">
        <ListDetail
          id="scenarios:recent"
          title={`最近场景 (${groupedScenarios.length})`}
          items={groupedScenarios}
          getKey={(g) => g.id}
          renderItem={(g) => {
            const latest = g.latest
            const isActiveGroup = active ? (getScenarioName(active) === g.name) : false
            return (
              <button
                className={`w-full text-left p-2 rounded border ${isActiveGroup ? 'bg-surface-3 border-primary' : 'border-primary hover:bg-surface-3'}`}
                onClick={() => {
                  setActiveId(latest.filePath)
                }}
              >
                <div className="font-medium text-primary truncate" title={g.name}>{g.name}</div>
                <div className="text-xs text-secondary">{getDatePlayed(latest.stats)} {g.items.length > 1 ? `• ${g.items.length} 条记录` : ''}</div>
                <div className="text-xs text-secondary">分数: {latest.stats['Score'] ?? '?'} • 准确率: {formatPct01(latest.stats['Accuracy'])}</div>
              </button>
            )
          }}
          emptyPlaceholder={
            scenarios.length === 0 ? (
              <div className="p-3 text-sm text-secondary">在KovaaK's中玩一个场景以在此处查看其统计数据。确保您的统计数据被保存到 <code className="font-mono">{prettyPath}</code> 文件夹。</div>
            ) : (
              <div className="p-3 text-sm text-secondary">暂无场景数据。</div>
            )
          }
          detailHeader={active ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-base font-medium text-primary truncate" title={String(active.stats['Scenario'] ?? getScenarioName(active))}>
                {active.stats['Scenario'] ?? getScenarioName(active)}
              </div>
              <button
                className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-primary text-primary hover:bg-surface-3"
                title="在Kovaak's中播放"
                onClick={() => {
                  const name = String(active.stats['Scenario'] ?? getScenarioName(active))
                  launchScenario(name, 'challenge').catch(() => { /* ignore */ })
                }}
              >
                <Play size={14} />
                <span>播放</span>
              </button>
            </div>
          ) : null}
          detail={<ScenarioDetail item={active ?? null} />}
        />
      </div>
    </div>
  )
}

function ScenarioDetail({ item }: { item: ScenarioRecord | null }) {
  const allScenarios = useStore(s => s.scenarios)
  const [topScore, setTopScore] = useState<ScenarioTopScore | null>(null)
  const [topLoading, setTopLoading] = useState(false)

  const scenarioName = useMemo(() => {
    if (!item) return ''
    return getScenarioName(item)
  }, [item])

  const groupItems = useMemo(() => {
    if (!item) return []
    const name = getScenarioName(item)
    return allScenarios.filter(s => getScenarioName(s) === name)
  }, [allScenarios, item])

  const bestScore = useMemo(() => {
    let best = 0
    for (const r of groupItems) {
      const s = Number(r.stats?.Score || 0)
      if (s > best) best = s
    }
    return best
  }, [groupItems])

  useEffect(() => {
    if (!scenarioName) { setTopScore(null); return }
    let cancelled = false
    setTopLoading(true)
    getScenarioTopScore(scenarioName)
      .then(d => { if (!cancelled) setTopScore(d) })
      .catch(() => { if (!cancelled) setTopScore(null) })
      .finally(() => { if (!cancelled) setTopLoading(false) })
    return () => { cancelled = true }
  }, [scenarioName])

  if (!item) return <div className="p-8 text-center text-secondary">选择一个场景查看详情</div>

  const topValue = topScore?.top_score
  const pct = topValue && topValue > 0 ? Math.min((bestScore / topValue) * 100, 100) : 0

  return (
    <div className="space-y-3">
      <ScenarioScoreAccHistoryChart items={groupItems} />
      <div className="p-2 rounded border border-primary bg-surface-2 text-sm space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-secondary">世界第一名</span>
          {topLoading ? (
            <span className="text-secondary">正在加载...</span>
          ) : topValue != null ? (
            <span className="text-primary font-medium">{topValue.toLocaleString()}</span>
          ) : (
            <span className="text-secondary">暂无数据</span>
          )}
        </div>
        {topValue != null && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-secondary">你的最高</span>
              <span className="text-primary">{bestScore.toLocaleString()}</span>
              <span className="text-secondary">({pct.toFixed(1)}%)</span>
            </div>
            <div className="w-full h-2 rounded bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded bg-accent transition-all duration-300"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <MouseTraceTab item={item} items={groupItems} />
    </div>
  )
}

export default ScenariosPage
