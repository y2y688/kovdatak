import { SegmentedControl } from './SegmentedControl'

type ToggleProps = {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  size?: 'sm' | 'md'
  className?: string
  onLabel?: string
  offLabel?: string
}

export function Toggle({
  checked,
  onChange,
  label,
  size = 'sm',
  className = '',
  onLabel = '开',
  offLabel = '关',
}: ToggleProps) {
  return (
    <div className={`inline-flex items-center gap-2 text-secondary ${size === 'md' ? 'text-sm' : 'text-xs'} ${className}`}>
      {label && <span className="select-none">{label}</span>}
      <SegmentedControl
        size={size}
        options={[{ label: onLabel, value: 'on' }, { label: offLabel, value: 'off' }]}
        value={checked ? 'on' : 'off'}
        onChange={(v) => onChange(v === 'on')}
      />
    </div>
  )
}
