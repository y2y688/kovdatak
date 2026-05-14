import { ChevronDown, List, Plus, Search, Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BenchmarkCard } from '../../components/benchmarks/BenchmarkCard';
import { PlaylistCard } from '../../components/benchmarks/PlaylistCard';
import { Dropdown } from '../../components/shared/Dropdown';
import { Input } from '../../components/shared/Input';
import { usePageState } from '../../hooks/usePageState';
import { useUIState } from '../../hooks/useUIState';
import { DEFAULT_BENCHMARK_CATEGORY } from '../../lib/constants';
import { getCustomPlaylists, getSettings, launchPlaylist, removeCustomPlaylist, updateSettings } from '../../lib/internal';
import { getBenchmarkCategory } from '../../lib/utils';
import type { BenchmarkListItem, CustomPlaylist } from '../../types/domain';
import type { Benchmark } from '../../types/ipc';
import { CreateBenchmarkModal } from '../../components/benchmarks/CreateBenchmarkModal';

function useBenchmarkList(items: BenchmarkListItem[], favorites: string[]) {
  const [query, setQuery] = usePageState<string>('explore:query', '')
  const [showFavOnly, setShowFavOnly] = usePageState<boolean>('explore:showFavOnly', false)
  const sortBy: 'abbr' = 'abbr'
  const groupBy: 'category' = 'category'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = items
    if (q) {
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.abbreviation.toLowerCase().includes(q) ||
        (i.subtitle ?? '').toLowerCase().includes(q)
      )
    }
    if (showFavOnly) {
      list = list.filter(i => favorites.includes(i.id))
    }
    return list
  }, [items, query, showFavOnly, favorites])

  const groups = useMemo(() => {
    // 1. Sort (fixed: by abbreviation)
    const sorted = [...filtered].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))

    // 2. Group (fixed: by category)
    const g: Record<string, BenchmarkListItem[]> = {}
    for (const item of sorted) {
      let key = ''
      key = getBenchmarkCategory(item.abbreviation)
      if (!g[key]) g[key] = []
      g[key].push(item)
    }
    return g
  }, [filtered, groupBy])

  const groupKeys = useMemo(() => Object.keys(groups).sort((a, b) => {
    if (a === 'All') return -1
    if (b === 'All') return 1
    if (a === DEFAULT_BENCHMARK_CATEGORY) return 1
    if (b === DEFAULT_BENCHMARK_CATEGORY) return -1
    return a.localeCompare(b)
  }), [groups])

  const getRandomId = () => {
    const list = filtered.length ? filtered : items
    if (list.length === 0) return null
    const r = list[Math.floor(Math.random() * list.length)]
    return r.id
  }

  return {
    query, setQuery,
    showFavOnly, setShowFavOnly,
    sortBy,
    groups, groupKeys,
    hasResults: filtered.length > 0,
    totalCount: items.length
  }
}

export function BenchmarksExplore({ items, favorites, loading, onToggleFav, onOpen, benchmarksById, onRefresh }: {
  items: BenchmarkListItem[];
  favorites: string[];
  loading: boolean;
  onToggleFav: (id: string) => void;
  onOpen: (id: string) => void;
  benchmarksById: Record<string, Benchmark>;
  onRefresh?: () => void;
}) {
  const {
    query, setQuery,
    showFavOnly, setShowFavOnly,
    sortBy,
    groups, groupKeys,
    hasResults
  } = useBenchmarkList(items, favorites)

  const [collapsedGroups, setCollapsedGroups] = useUIState<Record<string, boolean>>('explore:collapsedGroups', {})
  const toggleGroup = (group: string) => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }))

  const [steamDir, setSteamDir] = useState('')
  const [savedSteamDir, setSavedSteamDir] = useState('')
  const [steamDirSaving, setSteamDirSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editingPlaylist, setEditingPlaylist] = useState<CustomPlaylist | null>(null)
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>([])

  useEffect(() => {
    getSettings().then(s => {
      const v = String((s as any)?.steamInstallDir || '')
      setSteamDir(v)
      setSavedSteamDir(v)
    }).catch(() => {})
  }, [])

  const isSteamDirSaved = steamDir.trim().length > 0 && steamDir.trim() === savedSteamDir.trim()

  const loadPlaylists = useCallback(async () => {
    const data = await getCustomPlaylists()
    setPlaylists(data)
  }, [])

  useEffect(() => { loadPlaylists() }, [loadPlaylists])

  const handleLaunchPlaylist = (sharecode: string) => {
    launchPlaylist(sharecode)
  }

  const handleDeletePlaylist = async (id: string) => {
    await removeCustomPlaylist(id)
    loadPlaylists()
  }

  const handleEditPlaylist = (playlist: CustomPlaylist) => {
    setEditingPlaylist(playlist)
    setShowCreate(true)
  }

  const closeModal = () => {
    setShowCreate(false)
    setEditingPlaylist(null)
  }

  const hasPlaylists = playlists.length > 0

  return (
    <><div className="space-y-4 h-full p-4 overflow-auto">
      {/* ── Steam安装目录 ── */}
      <div className="p-3 rounded border border-primary bg-surface-2 text-sm">
        <div className="font-medium mb-2">请填写steam安装目录</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={steamDir}
            onChange={e => setSteamDir(e.target.value)}
            placeholder="例如:D:\steam"
            className="w-[520px] max-w-full"
          />
          <button
            disabled={steamDirSaving || !steamDir.trim() || isSteamDirSaved}
            onClick={async () => {
              setSteamDirSaving(true)
              try {
                const cur = await getSettings()
                await updateSettings({ ...(cur as any), steamInstallDir: steamDir.trim() })
                setSavedSteamDir(steamDir.trim())
              } catch (e) {
                console.warn('更新steam安装目录失败', e)
              } finally {
                setSteamDirSaving(false)
              }
            }}
            className="px-3 py-2 rounded bg-surface-2 border border-primary text-sm hover:bg-surface-3 disabled:opacity-50"
          >
            {steamDirSaving ? '保存中...' : isSteamDirSaved ? '已保存' : '保存'}
          </button>
        </div>
        <div className="text-xs text-secondary mt-2">
          用于自动读取 <code className="font-mono">config/loginusers.vdf</code> 并获取 SteamID，从而拉取基准测试排名。
        </div>
      </div>

      {/* ── Custom Playlists ── */}
      {hasPlaylists && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-secondary mt-2 mb-2 select-none">
            <List size={16} />
            <span>自定义播放列表 <span className="text-xs opacity-50">({playlists.length})</span></span>
            <div className="h-px bg-primary/10 flex-1" />
          </div>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {playlists.map(p => (
              <PlaylistCard
                key={p.id}
                playlist={p}
                onLaunch={handleLaunchPlaylist}
                onEdit={handleEditPlaylist}
                onDelete={handleDeletePlaylist}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-medium">基准测试</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索..."
            icon={<Search size={16} strokeWidth={1.5} />}
            className="w-32 sm:w-48 transition-all focus:w-64"
          />

          <button
            onClick={() => setShowFavOnly(!showFavOnly)}
            className={`px-3 py-2 rounded border text-sm flex items-center gap-2 focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${showFavOnly ? 'bg-accent/20 border-accent text-accent hover:bg-accent/30' : 'bg-surface-2 border-primary text-primary hover:bg-surface-3 hover:text-accent'}`}
            title={showFavOnly ? '显示收藏' : '显示全部'}
          >
            <Star
              size={16}
              strokeWidth={1.5}
              fill={showFavOnly ? 'currentColor' : 'none'}
            />
            {showFavOnly ? '收藏' : '全部'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 rounded border text-sm flex items-center gap-2 bg-accent/20 border-accent text-accent hover:bg-accent/30 transition-colors"
            title="通过 Sharecode 启动播放列表"
          >
            <Plus size={16} strokeWidth={1.5} />
            播放列表
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {groupKeys.map(group => {
          const isCollapsed = collapsedGroups[group] || false
          return (
            <div key={group} className="space-y-2">
              <button
                onClick={() => toggleGroup(group)}
                className="flex items-center gap-2 text-sm font-medium text-secondary mt-2 mb-2 w-full hover:text-primary transition-colors text-left group select-none"
              >
                <ChevronDown size={16} className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className="whitespace-nowrap">{group} <span className="text-xs opacity-50">({groups[group].length})</span></span>
                <div className="h-px bg-primary/10 flex-1 group-hover:bg-primary/20 transition-colors" />
              </button>
              {!isCollapsed && (
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                  {groups[group].map(b => (
                    <BenchmarkCard
                      key={b.id}
                      id={b.id}
                      title={b.title}
                      abbreviation={b.abbreviation}
                      color={b.color}
                      isFavorite={favorites.includes(b.id)}
                      onOpen={onOpen}
                      onToggleFavorite={onToggleFav}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {!hasResults && (
          <div className="text-sm text-secondary">
            {loading ? '加载基准测试中…' : (
              showFavOnly ? (favorites.length ? '没有收藏匹配您的筛选条件。' : '还没有收藏。') : (query ? '无结果。' : '未找到基准测试。')
            )}
          </div>
        )}
      </div>
    </div>
      <CreateBenchmarkModal
        isOpen={showCreate}
        onClose={closeModal}
        onCreated={() => {
          closeModal()
          loadPlaylists()
          onRefresh?.()
        }}
        editPlaylist={editingPlaylist}
      />
    </>
  )
}
