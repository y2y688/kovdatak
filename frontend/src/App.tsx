import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppErrorBoundary } from './components/layout/AppErrorBoundary'
import { AppLayout } from './components/layout/AppLayout'
import { Loading } from './components/shared/Loading'
import { StoreProvider } from './hooks/useStore'
import { applyFont, applyTheme, getSavedFont, getSavedTheme } from './lib/theme'
import { getSettings } from './lib/internal'

const BenchmarksPage = lazy(() => import('./pages/Benchmarks').then(m => ({ default: m.BenchmarksPage })))
const ScenariosPage = lazy(() => import('./pages/Scenarios').then(m => ({ default: m.ScenariosPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })))

export default function App() {
  // Bootstrap theme from backend config, fall back to localStorage.
  useEffect(() => {
    getSettings().then(s => {
      applyTheme((s?.theme as any) || getSavedTheme())
      applyFont((s?.font as any) || getSavedFont())
    }).catch(() => {
      applyTheme(getSavedTheme())
      applyFont(getSavedFont())
    })
  }, [])

  return (
    <StoreProvider>
      <AppErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/scenarios" replace />} />
              <Route path="scenarios" element={<ScenariosPage />} />
              <Route path="benchmarks" element={<BenchmarksPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </AppErrorBoundary>
    </StoreProvider>
  )
}
