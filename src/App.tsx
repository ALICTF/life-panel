import { lazy, Suspense, useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Home, LayoutGrid, Wallet } from 'lucide-react'
import { Toaster } from './ui/Toast'
import { runAutomation } from './lib/automation'
import { useTheme } from './lib/theme'
import { FocusProvider } from './pages/Focus'

const Today = lazy(() => import('./pages/Today'))
const CalendarPage = lazy(() => import('./pages/Calendar'))
const Habits = lazy(() => import('./pages/Habits'))
const Money = lazy(() => import('./pages/Money'))
const More = lazy(() => import('./pages/More'))
const Health = lazy(() => import('./pages/Health'))
const Goals = lazy(() => import('./pages/Goals'))
const Reviews = lazy(() => import('./pages/Reviews'))
const Notes = lazy(() => import('./pages/Notes'))
const NoteEditor = lazy(() => import('./pages/NoteEditor'))
const Planner = lazy(() => import('./pages/Planner'))
const Settings = lazy(() => import('./pages/Settings'))

const TABS = [
  { to: '/', label: 'امروز', icon: Home },
  { to: '/calendar', label: 'تقویم', icon: CalendarDays },
  { to: '/habits', label: 'عادت‌ها', icon: CheckCircle2 },
  { to: '/money', label: 'مالی', icon: Wallet },
  { to: '/more', label: 'بیشتر', icon: LayoutGrid },
]

function TabBar() {
  const loc = useLocation()
  const hide = loc.pathname.startsWith('/notes/')
  if (hide) return null
  const moreActive = ['/more', '/health', '/goals', '/reviews', '/notes', '/settings'].some((p) => loc.pathname.startsWith(p))
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-lg safe-bottom">
      <div className="mx-auto flex max-w-xl">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => {
              const a = isActive || (to === '/more' && moreActive) || (to === '/calendar' && loc.pathname === '/planner')
              return `press flex h-16 flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] font-semibold ${a ? 'text-accent' : 'text-muted'}`
            }}
          >
            {({ isActive }) => {
              const a = isActive || (to === '/more' && moreActive) || (to === '/calendar' && loc.pathname === '/planner')
              return (
                <>
                  <Icon size={23} strokeWidth={a ? 2.4 : 2} />
                  {label}
                  <span className={a ? 'tab-ind' : 'h-1'} />
                </>
              )
            }}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default function App() {
  useTheme()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    runAutomation().finally(() => setReady(true))
    const onVis = () => !document.hidden && runAutomation()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <HashRouter>
      <FocusProvider>
      <main className="mx-auto min-h-dvh max-w-xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {ready && (
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/habits" element={<Habits />} />
              <Route path="/money" element={<Money />} />
              <Route path="/more" element={<More />} />
              <Route path="/health" element={<Health />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/notes/:id" element={<NoteEditor />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        )}
      </main>
      <TabBar />
      </FocusProvider>
      <Toaster />
    </HashRouter>
  )
}
