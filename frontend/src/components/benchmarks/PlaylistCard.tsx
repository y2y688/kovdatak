import { Edit3, Play, Trash2 } from 'lucide-react';
import type { CustomPlaylist } from '../../types/domain';

type Props = {
  playlist: CustomPlaylist
  onLaunch: (sharecode: string) => void
  onEdit: (playlist: CustomPlaylist) => void
  onDelete: (id: string) => void
}

export function PlaylistCard({ playlist, onLaunch, onEdit, onDelete }: Props) {
  return (
    <div className="relative group pl-2 pr-10 py-2 rounded border border-primary bg-surface-2 hover:bg-surface-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onLaunch(playlist.sharecode)}
          title="启动播放列表"
          className="inline-flex items-center justify-center rounded w-8 h-8 text-accent hover:bg-accent/20 focus:outline-none transition-colors shrink-0 mt-0.5"
        >
          <Play size={18} strokeWidth={2} fill="currentColor" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-primary break-words">
            {playlist.name}
          </div>
          <div className="text-xs text-secondary font-mono truncate mt-0.5">
            {playlist.sharecode}
          </div>
        </div>
        <div className="flex items-start gap-1 shrink-0 mt-0.5">
          <button
            type="button"
            onClick={() => onEdit(playlist)}
            title="编辑"
            className="inline-flex items-center justify-center rounded w-8 h-8 text-secondary/60 hover:text-primary hover:bg-surface-3 focus:outline-none transition-colors"
          >
            <Edit3 size={16} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(playlist.id)}
            title="删除"
            className="inline-flex items-center justify-center rounded w-8 h-8 text-danger/60 hover:text-danger hover:bg-danger/10 focus:outline-none transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
