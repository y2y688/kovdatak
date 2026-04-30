import { useEffect, useState } from 'react';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { Modal } from '../shared/Modal';
import type { CustomPlaylist } from '../../types/domain';

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  editPlaylist?: CustomPlaylist | null
}

export function CreateBenchmarkModal({ isOpen, onClose, onCreated, editPlaylist }: Props) {
  const [name, setName] = useState('')
  const [sharecode, setSharecode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const isEditing = !!editPlaylist

  useEffect(() => {
    if (isOpen && editPlaylist) {
      setName(editPlaylist.name)
      setSharecode(editPlaylist.sharecode)
    } else if (isOpen) {
      resetForm()
    }
  }, [isOpen, editPlaylist])

  const resetForm = () => {
    setName('')
    setSharecode('')
    setError('')
  }

  const handleClose = () => { resetForm(); onClose() }

  const handleSave = async () => {
    const trimmedName = name.trim()
    const trimmedSc = sharecode.trim()
    if (!trimmedName) { setError('请输入播放列表名称'); return }
    if (!trimmedSc) { setError('请输入 Sharecode'); return }

    setSaving(true)
    setError('')
    try {
      if (isEditing && editPlaylist) {
        const { updateCustomPlaylist } = await import('../../lib/internal')
        await updateCustomPlaylist(editPlaylist.id, trimmedName, trimmedSc)
      } else {
        const { addCustomPlaylist } = await import('../../lib/internal')
        await addCustomPlaylist(trimmedName, trimmedSc)
      }
      resetForm()
      onCreated()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditing ? '编辑自定义播放列表' : '添加自定义播放列表'} width="480px" height="auto">
      <div className="p-4 space-y-4">
        {error && (
          <div className="p-2 rounded bg-danger/20 border border-danger text-sm text-danger">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-secondary">名称 *</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如: My Warmup Playlist"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-secondary">Sharecode *</label>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="text-xs text-accent hover:text-accent/80 underline underline-offset-2"
              >
                如何获取 Sharecode？
              </button>
            </div>
            <Input
              value={sharecode}
              onChange={e => setSharecode(e.target.value)}
              placeholder="KovaaKs..."
              onKeyDown={e => { if (e.key === 'Enter' && !saving) handleSave() }}
            />
            <p className="text-xs text-primary">
              粘贴 KovaaKs 播放列表的 sharecode 以保存供后续快速启动。
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>取消</Button>
          <Button variant="accent" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      <Modal isOpen={showHelp} onClose={() => setShowHelp(false)} title="如何获取 Sharecode" width="520px" height="80vh">
        <div className="p-4 space-y-6 overflow-y-auto h-full">
          <div className="space-y-2">
            <div className="text-sm font-medium text-accent">方法一：官网查找</div>
            <p className="text-xs text-secondary">
              打开
              <a href="https://kovaaks.com/kovaaks/playlists" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 mx-1">
                kovaaks.com/kovaaks/playlists
              </a>
              ，选择想要的播放列表，点击右上角的 <strong>分享</strong> 按钮即可复制 sharecode。
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-accent">方法二：游戏内创建</div>
            <p className="text-xs text-secondary">在游戏中创建自己的播放清单，步骤如下：</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-secondary mb-1">1. 在本地游玩清单中点击"创建新的游玩清单"</p>
                <img src="/images/step1.png" alt="Step 1" className="w-full rounded border border-primary/30 max-h-[400px] object-contain" />
              </div>
              <div>
                <p className="text-xs text-secondary mb-1">2. 点击"在线"</p>
                <img src="/images/step2.png" alt="Step 2" className="w-full rounded border border-primary/30 max-h-[400px] object-contain" />
              </div>
              <div>
                <p className="text-xs text-secondary mb-1">3. 在"在线场景"中添加场景，完成后点击保存</p>
                <img src="/images/step3.png" alt="Step 3" className="w-full rounded border border-primary/30 max-h-[400px] object-contain" />
              </div>
              <div>
                <p className="text-xs text-secondary mb-1">4. 上传游玩清单到服务器</p>
                <img src="/images/step4.png" alt="Step 4" className="w-full rounded border border-primary/30 max-h-[400px] object-contain" />
              </div>
              <div>
                <p className="text-xs text-secondary mb-1">5. 点击"分享"复制 sharecode</p>
                <img src="/images/step5.png" alt="Step 5" className="w-full rounded border border-primary/30 max-h-[400px] object-contain" />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </Modal>
  )
}
