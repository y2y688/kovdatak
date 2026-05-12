import { useEffect, useMemo, useState } from 'react';
import { Input } from '../../../components/shared/Input';
import { TraceViewer } from '../../../components/scenarios/TraceViewer';
import { Loading } from '../../../components/shared/Loading';
import { getScenarioTrace, getSettings, updateSettings } from '../../../lib/internal';
import { decodeTraceData } from '../../../lib/trace';
import { formatPct01, getDatePlayed } from '../../../lib/utils';
import { useStore } from '../../../hooks/useStore';
import type { MousePoint, ScenarioRecord } from '../../../types/ipc';

type MouseTraceTabProps = { item: ScenarioRecord; items?: ScenarioRecord[] }

export function PracticeHeatmap({ items }: { items?: ScenarioRecord[] }) {
  const allScenarios = useStore(s => s.scenarios)
  const sourceItems = items ?? allScenarios

  const dayCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of sourceItems) {
      const d = getDatePlayed(r.stats)
      if (!d) continue
      const key = d.slice(0, 10)
      m[key] = (m[key] || 0) + 1
    }
    return m
  }, [sourceItems])

  const maxCount = useMemo(() => Math.max(...Object.values(dayCounts), 1), [dayCounts])

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const dayLabels: string[] = []

  // Build a flat grid: 1-7, 8-14, 15-21, 22-28, 29-35, 36-42, trimmed to daysInMonth
  const grid = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const weeks: { day: number; count: number; date: string }[][] = []
    let d = 1
    for (let r = 0; r < 6; r++) {
      const week: { day: number; count: number; date: string }[] = []
      for (let c = 0; c < 7; c++) {
        if (d <= daysInMonth) {
          const yyyy = `${year}`
          const mm = String(month + 1).padStart(2, '0')
          const dd = String(d).padStart(2, '0')
          const dateStr = `${yyyy}-${mm}-${dd}`
          week.push({ day: d, count: dayCounts[dateStr] || 0, date: dateStr })
          d++
        } else {
          week.push({ day: 0, count: -1, date: '' })
        }
      }
      weeks.push(week)
    }
    return weeks
  }, [year, month, dayCounts])

  const canPrev = year > 2020 || (year === 2020 && month > 0)
  const canNext = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth())

  return (
    <div className="p-3 rounded border border-primary bg-surface-2 text-sm w-80 flex flex-col">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-sm font-medium text-primary">练习热点图</span>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            disabled={!canPrev}
            className="px-2 py-0.5 rounded border border-primary text-xs text-primary hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed"
          >‹</button>
          <span className="text-sm text-primary font-medium w-20 text-center">{year}年{month + 1}月</span>
          <button
            onClick={nextMonth}
            disabled={!canNext}
            className="px-2 py-0.5 rounded border border-primary text-xs text-primary hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed"
          >›</button>
        </div>
      </div>
      <div className="flex-1 grid auto-rows-fr gap-[4px]">
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-[4px]">
            {week.map((cell, di) => {
              if (cell.day === 0) return <div key={di} />
              const pct = cell.count > 0 ? Math.max(0.08, Math.log(cell.count + 1) / Math.log(maxCount + 1)) : 0
              return (
                <div
                  key={di}
                  className={`flex items-center justify-center rounded-md text-sm font-medium ${cell.count > 0 ? 'text-primary-foreground' : 'text-secondary/30'}`}
                  style={{ backgroundColor: cell.count > 0 ? `color-mix(in srgb, var(--accent-primary) ${pct * 100}%, transparent)` : 'transparent' }}
                  title={`${cell.date}: ${cell.count} 条记录`}
                >
                  {cell.day}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MouseTraceTab({ item, items }: MouseTraceTabProps) {
  const [tracesDir, setTracesDir] = useState<string>('')
  const [savedTracesDir, setSavedTracesDir] = useState<string>('')
  const [tracesDirSaving, setTracesDirSaving] = useState<boolean>(false)

  useEffect(() => {
    getSettings().then(s => {
      if (s && typeof (s as any).tracesDir === 'string') {
        const v = String((s as any).tracesDir || '')
        setTracesDir(v)
        setSavedTracesDir(v)
      }
    }).catch(() => { })
  }, [])

  const normalizedTracesDir = tracesDir.trim()
  const isTracesDirSaved = normalizedTracesDir.length > 0 && normalizedTracesDir === savedTracesDir.trim()
  const traceItems = useMemo(() => {
    const src = Array.isArray(items) && items.length ? [...items] : [item]
    src.sort((a, b) => Date.parse(getDatePlayed(b.stats)) - Date.parse(getDatePlayed(a.stats)))
    return src
  }, [items, item])
  const [selectedFilePath, setSelectedFilePath] = useState<string>('')
  const currentItem = useMemo(
    () => traceItems.find(x => x.filePath === selectedFilePath) ?? null,
    [traceItems, selectedFilePath],
  )
  const [fetchedPoints, setFetchedPoints] = useState<MousePoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // 场景切换后默认不自动展示轨迹，先让用户选具体记录
    setSelectedFilePath('')
    setFetchedPoints(null)
    setLoadError(null)
  }, [item.filePath])

  useEffect(() => {
    if (!currentItem) return
    // Reset when item changes
    setFetchedPoints(null);
    setLoadError(null);

    // If we already have data in the record, no need to fetch
    if ((Array.isArray(currentItem.mouseTrace) && currentItem.mouseTrace.length > 0) || currentItem.traceData) {
      return;
    }

    // If we have a trace on disk but no data loaded, fetch it
    if (currentItem.hasTrace) {
      setLoading(true);
      getScenarioTrace(currentItem.traceId || currentItem.fileName)
        .then(data => {
          const pts = decodeTraceData(data);
          setFetchedPoints(pts);
          if (!pts.length) setLoadError('轨迹文件已读取，但没有有效点位。')
          // Optionally update the item in place to cache it for this session?
          // item.traceData = data;
        })
        .catch(err => {
          console.error("Failed to load trace:", err)
          setLoadError((err as Error)?.message || '加载失败')
        })
        .finally(() => setLoading(false));
    }
  }, [currentItem?.fileName, currentItem?.traceId, currentItem?.hasTrace, currentItem?.mouseTrace, currentItem?.traceData]);

  const points = useMemo(() => {
    if (!currentItem) return [];
    if (fetchedPoints) return fetchedPoints;
    if (Array.isArray(currentItem.mouseTrace) && currentItem.mouseTrace.length > 0) {
      return currentItem.mouseTrace;
    }
    if (currentItem.traceData) {
      return decodeTraceData(currentItem.traceData);
    }
    return [];
  }, [currentItem, currentItem?.mouseTrace, currentItem?.traceData, fetchedPoints]);

  return (
    <div className="space-y-3">
      <div className="p-3 rounded border border-primary bg-surface-2 text-sm">
        <div className="flex items-center gap-2">
          <Input
            value={tracesDir}
            onChange={e => setTracesDir(e.target.value)}
            placeholder="例如：C:\\path\\to\\traces"
            className="w-[520px] max-w-full"
          />
          <button
            disabled={tracesDirSaving || !normalizedTracesDir || isTracesDirSaved}
            onClick={async () => {
              setTracesDirSaving(true)
              try {
                const cur: any = await getSettings().catch(() => ({}))
                await updateSettings({ ...(cur || {}), tracesDir: normalizedTracesDir } as any)
                const latest: any = await getSettings().catch(() => ({}))
                const saved = String(latest?.tracesDir || normalizedTracesDir)
                setTracesDir(saved)
                setSavedTracesDir(saved)
              } catch (e) {
                console.warn('更新轨迹目录失败', e)
              } finally {
                setTracesDirSaving(false)
              }
            }}
            className="px-3 py-2 rounded bg-surface-2 border border-primary text-sm hover:bg-surface-3 disabled:opacity-50"
          >
            {tracesDirSaving ? '保存中...' : isTracesDirSaved ? '已保存' : '保存'}
          </button>
        </div>
        <div className="text-xs text-secondary mt-2 mb-3">用于保存和读取轨迹文件</div>

        <div className="text-sm font-medium text-primary mb-2">同场景记录列表</div>
        <div className="max-h-40 overflow-auto space-y-1">
          {traceItems.map((r) => {
            const active = r.filePath === currentItem?.filePath
            const canOpen = Boolean(r.hasTrace)
            return (
              <button
                key={r.filePath}
                onClick={() => { if (canOpen) setSelectedFilePath(r.filePath) }}
                disabled={!canOpen}
                className={`w-full text-left px-2 py-1 rounded border text-xs transition-colors ${
                  !canOpen
                    ? 'border-transparent bg-transparent text-secondary/40 cursor-not-allowed'
                    : active
                      ? 'bg-surface-3 border-primary text-primary'
                      : 'border-primary/40 text-secondary bg-surface-2 hover:bg-surface-3'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate">{getDatePlayed(r.stats)}</div>
                  <div className="shrink-0">
                    {canOpen ? '有轨迹' : '无轨迹'} • 分数 {r.stats['Score'] ?? '?'} • {formatPct01(r.stats['Accuracy'])}{r.stats['Horiz Sens'] != null ? ` • ${r.stats['Sens Scale'] ?? '?'}: ${Number(r.stats['Horiz Sens']).toFixed(2)}` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {!currentItem ? (
        <div className="text-sm text-secondary p-2">请先在列表中选一条记录。</div>
      ) : loading ? (
        <Loading />
      ) : loadError ? (
        <div className="text-sm text-red-400 p-2">轨迹加载失败：{loadError}</div>
      ) : points.length === 0 ? (
        <div className="text-sm text-secondary p-2">该记录暂无可显示的鼠标轨迹。</div>
      ) : (
        <TraceViewer
          points={points}
          stats={currentItem.stats}
        />
      )}
    </div>
  )
}
