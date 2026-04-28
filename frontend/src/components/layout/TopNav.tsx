import { Settings as SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

function Link({ to, children, end = false }: { to: string, children: ReactNode, end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `px-3 py-1 rounded hover:bg-surface-3 ${isActive ? 'bg-surface-3' : ''}`}
    >
      {children}
    </NavLink>
  )
}

export function TopNav() {
  const link = (to: string, label: ReactNode, end = false) => (
    <Link to={to} end={end}>{label}</Link>
  )
  return (
    <div className="relative flex items-center px-4 py-2 bg-surface-2 text-primary border-b border-primary">
      <div className="flex items-center gap-2" />

      {/* Centered tabs - absolutely centered so side content doesn't affect position */}
      <div className="absolute left-1/2 transform -translate-x-1/2 flex gap-2 items-center">
        {link('/scenarios', '场景')}
        {link('/benchmarks', '基准测试')}
      </div>

      {/* Right-side actions - pushed to the end with ml-auto */}
      <div className="flex items-center gap-2 ml-auto">
        {link('/settings', (
          <>
            <SettingsIcon className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Settings</span>
          </>
        ))}
      </div>
    </div>
  )
}
