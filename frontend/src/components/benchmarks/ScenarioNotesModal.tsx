import { Copy, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../shared/Button'
import { Modal } from '../shared/Modal'

type ScenarioNotesModalProps = {
  isOpen: boolean
  onClose: () => void
  scenarioName: string
  initialNotes: string
  initialSens: string
  onSave: (notes: string, sens: string) => Promise<void>
}

export function ScenarioNotesModal({ isOpen, onClose, scenarioName, initialNotes, initialSens, onSave }: ScenarioNotesModalProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [sens, setSens] = useState(initialSens)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNotes(initialNotes)
      setSens(initialSens)
    }
  }, [isOpen, initialNotes, initialSens])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(notes, sens)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sens)
    } catch {
      // Silent fail - copy button is convenience feature
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={scenarioName} width={520} height="auto">
      <div className="flex flex-col">
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label htmlFor="sensitivity" className="block text-xs font-semibold text-secondary uppercase tracking-wide">
              训练灵敏度
            </label>
            <div className="flex gap-2">
              <input
                id="sensitivity"
                type="text"
                value={sens}
                onChange={e => setSens(e.target.value)}
                placeholder="例如：35.8cm 或 0.5"
                className="flex-1 bg-primary border border-primary rounded px-3 py-2.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={handleCopy}
                title="复制灵敏度到剪贴板"
                disabled={!sens.trim()}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2 flex flex-col">
            <label htmlFor="notes" className="block text-xs font-semibold text-secondary uppercase tracking-wide">
              笔记
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="记录你的策略、弱点和需要关注的重点..."
              className="min-h-[160px] bg-primary border border-primary rounded px-3 py-2.5 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-primary bg-surface-3/40 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="primary" size="md">
            <Save className="h-4 w-4 mr-2" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
