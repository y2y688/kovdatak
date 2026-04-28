import { ChevronLeft, Play, Star } from 'lucide-react';
import { Dropdown } from '../../components/shared/Dropdown';
import { Tabs } from '../../components/shared/Tabs';
import { useOpenedBenchmarkProgress } from '../../hooks/useOpenedBenchmarkProgress';
import { useUIState } from '../../hooks/useUIState';
import { launchPlaylist } from '../../lib/internal';
import type { Benchmark } from '../../types/ipc';
import { AnalysisTab } from './tabs/Analysis';
import { OverviewTab } from './tabs/Overview';

type BenchmarksDetailProps = {
  id: string
  bench?: Benchmark
  favorites: string[]
  onToggleFav: (id: string) => void
  onBack: () => void
}

export function BenchmarksDetail({ id, bench, favorites, onToggleFav, onBack }: BenchmarksDetailProps) {
  const [tab, setTab] = useUIState<'overview' | 'analysis' | 'ai'>(`benchmark:${id}:tab`, 'overview')
  const { progress, loading, error, difficultyIndex, setDifficultyIndex } = useOpenedBenchmarkProgress({ id, bench: bench ?? null })

  return (
    <div className="space-y-3 p-4 h-full overflow-auto">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-surface-3 text-primary"
          aria-label="返回"
          title="返回"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-lg font-medium flex items-center gap-2">
          <span>基准测试: {bench ? `${bench.abbreviation} ${bench.benchmarkName}` : id}</span>
          <button
            onClick={() => { if (bench) launchPlaylist(bench.difficulties[difficultyIndex].sharecode) }}
            disabled={!bench}
            className="p-1 rounded hover:bg-surface-3 text-primary mb-1 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="播放基准测试播放列表"
            title="在Kovaak's中播放基准测试播放列表"
          >
            <Play size={18} />
          </button>
          <button
            onClick={() => onToggleFav(id)}
            className={`p-1 rounded hover:bg-surface-3 mb-1 transition-colors ${favorites.includes(id) ? 'text-accent' : 'text-primary hover:text-accent'}`}
            aria-label={favorites.includes(id) ? '取消收藏' : '收藏'}
            title={favorites.includes(id) ? '取消收藏' : '收藏'}
          >
            <Star
              size={20}
              strokeWidth={1.5}
              fill={favorites.includes(id) ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>
      {bench?.difficulties?.length ? (
        <div className="flex items-center gap-2">
          <Dropdown
            label="难度"
            size="md"
            value={difficultyIndex}
            onChange={(v: string) => setDifficultyIndex(Number(v))}
            options={bench.difficulties.map((d, i) => ({ label: d.difficultyName, value: i }))}
          />
        </div>
      ) : <div className="text-sm text-secondary">无难度信息。</div>}
      <Tabs tabs={[
        { id: 'overview', label: '概览', content: <OverviewTab bench={bench} difficultyIndex={difficultyIndex} loading={loading} error={error} progress={progress} /> },
        { id: 'analysis', label: '分析', content: <AnalysisTab bench={bench} difficultyIndex={difficultyIndex} loading={loading} error={error} progress={progress} /> },
      ]} active={tab} onChange={(id) => setTab(id as any)} />

    </div>
  )
}
