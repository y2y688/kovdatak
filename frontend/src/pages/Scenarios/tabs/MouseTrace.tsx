import { useEffect, useMemo, useState } from 'react';
import { Input } from '../../../components/shared/Input';
import { TraceViewer } from '../../../components/scenarios/TraceViewer';
import { Loading } from '../../../components/shared/Loading';
import { getScenarioTrace, getSettings, updateSettings } from '../../../lib/internal';
import { decodeTraceData } from '../../../lib/trace';
import { formatPct01, getDatePlayed } from '../../../lib/utils';
import type { MousePoint, ScenarioRecord } from '../../../types/ipc';

type MouseTraceTabProps = { item: ScenarioRecord; items?: ScenarioRecord[] }

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
        <div className="font-medium mb-2">轨迹目录</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={tracesDir}
            onChange={e => setTracesDir(e.target.value)}
            placeholder="例如：C:\\path\\to\\traces"
            className="w-full"
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
      </div>

      <div className="p-2 rounded border border-primary bg-surface-2">
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
                    ? 'border-primary/40 text-secondary/50 bg-surface-2 cursor-not-allowed'
                    : active
                      ? 'bg-surface-3 border-primary text-primary'
                      : 'border-transparent bg-transparent text-secondary hover:bg-surface-3 hover:border-primary/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate">{getDatePlayed(r.stats)}</div>
                  <div className="shrink-0">
                    {canOpen ? '有轨迹' : '无轨迹'} • 分数 {r.stats['Score'] ?? '?'} • {formatPct01(r.stats['Accuracy'])}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {!currentItem ? (
        <div className="text-sm text-secondary p-2">请先在上方选择一条记录。</div>
      ) : loading ? (
        <Loading />
      ) : loadError ? (
        <div className="text-sm text-red-400 p-2">轨迹加载失败：{loadError}</div>
      ) : points.length === 0 ? (
        <div className="text-sm text-secondary p-2">该记录暂无可显示的鼠标轨迹。</div>
      ) : (
        <div className="space-y-3">
          <TraceViewer
            points={points}
            stats={currentItem.stats}
          />
        </div>
      )}
    </div>
  )
}
