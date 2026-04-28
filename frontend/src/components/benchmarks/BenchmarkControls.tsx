import type { RankDef } from '../../types/ipc'
import { Button } from '../shared/Button'
import { Dropdown } from '../shared/Dropdown'
import { Toggle } from '../shared/Toggle'

type BenchmarkControlsProps = {
  rankDefs: RankDef[]
  autoHideCleared: boolean
  setAutoHideCleared: (v: boolean) => void
  visibleRankCount: number
  setVisibleRankCount: (v: number) => void
  manuallyHidden: Set<number>
  toggleManualRank: (idx: number) => void
  resetManual: () => void
  autoHidden: Set<number>
  showNotesCol: boolean
  setShowNotesCol: (v: boolean) => void
  showRecCol: boolean
  setShowRecCol: (v: boolean) => void
  showPlayCol: boolean
  setShowPlayCol: (v: boolean) => void
  showHistoryCol: boolean
  setShowHistoryCol: (v: boolean) => void
}

export function BenchmarkControls({
  rankDefs,
  autoHideCleared, setAutoHideCleared,
  visibleRankCount, setVisibleRankCount,
  manuallyHidden, toggleManualRank, resetManual,
  autoHidden,
  showNotesCol, setShowNotesCol,
  showRecCol, setShowRecCol,
  showPlayCol, setShowPlayCol,
  showHistoryCol, setShowHistoryCol
}: BenchmarkControlsProps) {
  const ranks = (
    <div className="flex flex-wrap gap-1">
      {rankDefs.map((r, i) => {
        const auto = autoHidden.has(i)
        const manualHidden = manuallyHidden.has(i)
        const visible = !(auto || manualHidden)
        return (
          <Button
            key={r.name + i}
            size="sm"
            variant={visible ? 'secondary' : 'ghost'}
            onClick={() => toggleManualRank(i)}
            disabled={auto}
            className={`${auto ? 'opacity-60 cursor-not-allowed' : ''} ${r.color ? '' : 'text-secondary'}`}
            title={auto ? '自动隐藏（所有场景都已超过此等级）' : (visible ? '点击隐藏此列' : '点击显示此列')}
            style={r.color ? { color: r.color } : undefined}
          >
            {r.name}
          </Button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-primary">功能列</h3>
        <div className="flex flex-wrap gap-4">
          <Toggle size="sm" label="笔记" checked={showNotesCol} onChange={setShowNotesCol} />
          <Toggle size="sm" label="推荐" checked={showRecCol} onChange={setShowRecCol} />
          <Toggle size="sm" label="播放按钮" checked={showPlayCol} onChange={setShowPlayCol} />
          <Toggle size="sm" label="历史" checked={showHistoryCol} onChange={setShowHistoryCol} />
        </div>
      </div>

      <div className="h-px bg-border-secondary" />

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-primary">显示设置</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Toggle
            size="sm"
            label="自动隐藏早期等级"
            checked={autoHideCleared}
            onChange={setAutoHideCleared}
          />
          <div className="h-4 w-px bg-border-primary mx-2 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary">保持可见:</span>
            <Dropdown
              size="sm"
              ariaLabel="目标可见等级列数量"
              value={String(visibleRankCount)}
              onChange={v => setVisibleRankCount(Math.max(1, parseInt(v || '1', 10) || 1))}
              options={Array.from({ length: Math.max(9, rankDefs.length) }, (_, i) => i + 1).map(n => ({ label: String(n), value: String(n) }))}
            />
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={resetManual} title="重置手动可见性">全部重置</Button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-primary">等级列</h3>
        <p className="text-xs text-secondary">点击手动显示/隐藏列。自动隐藏的列已禁用。</p>
        <div>
          {ranks}
        </div>
      </div>
    </div>
  )
}
