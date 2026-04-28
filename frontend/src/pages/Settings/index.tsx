import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/shared/Button';
import { Dropdown } from '../../components/shared/Dropdown';
import { Input } from '../../components/shared/Input';
import { Loading } from '../../components/shared/Loading';
import { useStore } from '../../hooks/useStore';
import { getRecentScenarios, getSettings, updateSettings } from '../../lib/internal';
import { FONTS, getSavedFont, getSavedTheme, setFont, setTheme, THEMES, type Font, type Theme } from '../../lib/theme';
import type { Settings } from '../../types/ipc';

export function SettingsPage() {
  const setSessionGap = useStore(s => s.setSessionGap)
  const setScenarios = useStore(s => s.setScenarios)
  const resetNew = useStore(s => s.resetNew)

  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    getSettings().then(s => {
      setSettings({ ...s, theme: getSavedTheme(), font: getSavedFont() })
    }).catch(() => { })
  }, [])

  const updateField = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      if (!prev) return null
      const next = { ...prev, [key]: value }
      return next
    })
  }

  const save = async () => {
    if (!settings) return
    try {
      await updateSettings(settings)
      setTheme(settings.theme)
      setFont(settings.font)
      setSessionGap(settings.sessionGapMinutes)
      // Force-refresh scenarios immediately after saving stats_dir changes
      // (avoids requiring a manual page refresh).
      const arr = await getRecentScenarios().catch(() => [])
      setScenarios(Array.isArray(arr) ? arr : [])
      resetNew()
    } catch (e) {
      console.error('UpdateSettings error:', e)
    }
  }

  if (!settings) return <Loading />

  return (
    <div className="space-y-4 h-full overflow-auto p-4">
      <div className="text-lg font-medium">设置</div>
      <div className="space-y-6 max-w-5xl">
        {/* 常规（主要设置） */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">常规</h3>
          <div className="space-y-3 p-3 rounded border border-primary bg-surface-2">
            <Field label="启用鼠标跟踪 (Windows)">
              <Dropdown
                value={settings.mouseTrackingEnabled ? 'on' : 'off'}
                onChange={(v: string) => updateField('mouseTrackingEnabled', v === 'on')}
                options={[{ label: '开启', value: 'on' }, { label: '关闭', value: 'off' }]}
                size="md"
              />
            </Field>
          </div>
        </section>

        {/* 外观 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">外观</h3>
          <div className="space-y-3 p-3 rounded border border-primary bg-surface-2">
            <Field label="主题">
              <Dropdown
                value={settings.theme}
                onChange={(v: string) => updateField('theme', v as Theme)}
                options={THEMES.map(t => ({ label: t.label, value: t.id }))}
                size="md"
              />
            </Field>
            <Field label="字体">
              <Dropdown
                value={settings.font}
                onChange={(v: string) => updateField('font', v as Font)}
                options={FONTS.map(f => ({ label: f.label, value: f.id }))}
                size="md"
              />
            </Field>
          </div>
        </section>

        {/* 操作和帮助 */}
        <section>
          <div className="flex items-center gap-2">
            <Button variant="accent" size="md" onClick={save}>保存</Button>
          </div>
        </section>
      </div>
    </div>
  )
}

type FieldProps = { label: string; children: ReactNode }

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex items-center gap-3">
      <div className="w-48 text-sm text-primary">{label}</div>
      <div className="flex-1">{children}</div>
    </label>
  )
}

export default SettingsPage
