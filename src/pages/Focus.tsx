import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Coffee, Square, Timer } from 'lucide-react'
import { db, logEvent } from '../db/db'
import type { Task } from '../db/types'
import { todayKey } from '../lib/date'
import { fa } from '../lib/format'
import { setTaskDone } from '../lib/tasks'
import { Button, Chip, Label, Ring } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/Toast'

interface Run {
  taskId?: number
  title: string
  startAt: number
  planned: number // دقیقه
  phase: 'work' | 'break'
  saved?: boolean
}

const KEY = 'focusRun'
const read = (): Run | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}
const write = (r: Run | null) => {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r))
    else localStorage.removeItem(KEY)
  } catch {
    /* حافظهٔ مرورگر در دسترس نیست */
  }
}

const vibrate = () => {
  try {
    navigator.vibrate?.([250, 120, 250, 120, 400])
  } catch {
    /* پشتیبانی نمی‌شود */
  }
}

interface Ctx {
  openPicker: (task?: Task) => void
}
const FocusCtx = createContext<Ctx>({ openPicker: () => {} })
export const useFocus = () => useContext(FocusCtx)

/** تایمر تمرکز: زمان از روی ساعت واقعی حساب می‌شود، پس با خاموش شدن صفحه هم درست می‌ماند */
export function FocusProvider({ children }: { children: ReactNode }) {
  const [run, setRunState] = useState<Run | null>(read)
  const [picker, setPicker] = useState<{ task?: Task } | null>(null)
  const [view, setView] = useState(false)
  const [now, setNow] = useState(Date.now())
  const savingRef = useRef(false)

  const setRun = (r: Run | null) => {
    write(r)
    setRunState(r)
  }

  useEffect(() => {
    if (!run) return
    const tick = () => setNow(Date.now())
    const i = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(i)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [run])

  const remaining = run ? run.planned * 60000 - (now - run.startAt) : 0
  const finished = !!run && remaining <= 0

  const saveSession = useCallback(async (r: Run, actualMin: number, completed: boolean) => {
    if (actualMin < 1) return
    await db.focus.add({ date: todayKey(), taskId: r.taskId, title: r.title, startAt: r.startAt, planned: r.planned, actual: Math.round(actualMin * 10) / 10, completed })
    await logEvent('focus', r.taskId, { minutes: Math.round(actualMin), completed, hour: new Date(r.startAt).getHours() })
  }, [])

  // پایان جلسه: ذخیره (یک بار) و لرزش
  useEffect(() => {
    if (!finished || !run || run.saved || savingRef.current) return
    savingRef.current = true
    ;(async () => {
      if (run.phase === 'work') await saveSession(run, run.planned, true)
      vibrate()
      setRun({ ...run, saved: true })
      setView(true)
      savingRef.current = false
    })()
  }, [finished, run, saveSession])

  const start = (r: Omit<Run, 'startAt'>) => {
    setRun({ ...r, startAt: Date.now() })
    setPicker(null)
    setView(true)
  }

  const stop = async () => {
    if (!run) return
    if (run.phase === 'work' && !run.saved) await saveSession(run, (Date.now() - run.startAt) / 60000, false)
    setRun(null)
    setView(false)
  }

  const openPicker = useCallback((task?: Task) => {
    if (read()) {
      setView(true)
      return
    }
    setPicker({ task })
  }, [])

  return (
    <FocusCtx.Provider value={{ openPicker }}>
      {children}
      {run && !view && <FocusPill run={run} remaining={remaining} onOpen={() => setView(true)} />}
      <FocusPicker state={picker} onClose={() => setPicker(null)} onStart={start} />
      <Sheet open={view && !!run} onClose={() => setView(false)} title={run?.phase === 'break' ? 'استراحت' : 'تمرکز'}>
        {run && (
          <div className="flex flex-col items-center pb-2">
            <p className="mb-4 max-w-full truncate text-center font-semibold">{run.phase === 'break' ? 'از جایت بلند شو و کمی راه برو' : run.title}</p>
            <Ring value={finished ? 1 : 1 - remaining / (run.planned * 60000)} size={200} stroke={12} color={run.phase === 'break' ? 'var(--good)' : '#4f46e5'}>
              <span className="tnum text-4xl font-extrabold">{finished ? fa('00:00') : fmt(remaining)}</span>
            </Ring>
            {!finished ? (
              <>
                <p className="mt-4 text-center text-xs leading-6 text-muted">می‌توانی از برنامه بیرون بروی؛ زمان درست حساب می‌شود. آخر جلسه گوشی می‌لرزد (اگر برنامه باز باشد).</p>
                <Button variant="soft" className="mt-4" onClick={stop}>
                  <Square size={16} /> {run.phase === 'work' ? 'پایان زودتر' : 'پایان استراحت'}
                </Button>
              </>
            ) : run.phase === 'work' ? (
              <div className="mt-5 w-full space-y-2">
                <p className="text-center font-bold">{fa(run.planned)} دقیقه تمرکز ثبت شد 👏</p>
                {run.taskId && (
                  <Button
                    variant="soft"
                    block
                    onClick={async () => {
                      const t = await db.tasks.get(run.taskId!)
                      if (t) await setTaskDone(t, true)
                      toast('تسک انجام شد')
                    }}
                  >
                    <Check size={18} /> تسک تمام شد
                  </Button>
                )}
                <Button block onClick={() => setRun({ title: run.title, taskId: run.taskId, planned: 5, phase: 'break', startAt: Date.now() })}>
                  <Coffee size={18} /> ۵ دقیقه استراحت
                </Button>
                <Button variant="ghost" block onClick={() => setRun({ ...run, startAt: Date.now(), saved: false })}>
                  یک جلسهٔ دیگر
                </Button>
                <Button variant="ghost" block className="text-muted" onClick={stop}>
                  پایان
                </Button>
              </div>
            ) : (
              <div className="mt-5 w-full space-y-2">
                <p className="text-center font-bold">استراحت تمام شد</p>
                <Button block onClick={() => setRun({ title: run.title, taskId: run.taskId, planned: 25, phase: 'work', startAt: Date.now() })}>
                  شروع جلسهٔ بعد
                </Button>
                <Button variant="ghost" block className="text-muted" onClick={stop}>
                  پایان
                </Button>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </FocusCtx.Provider>
  )
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return fa(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
}

function FocusPill({ run, remaining, onOpen }: { run: Run; remaining: number; onOpen: () => void }) {
  return createPortal(
    <button
      onClick={onOpen}
      className="press fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-full py-2 ps-3 pe-4 text-sm font-bold text-white shadow-lg"
      style={{ background: run.phase === 'break' ? 'var(--good)' : '#4f46e5' }}
    >
      {run.phase === 'break' ? <Coffee size={16} /> : <Timer size={16} />}
      <span className="tnum">{remaining > 0 ? fmt(remaining) : 'تمام شد'}</span>
    </button>,
    document.body,
  )
}

function FocusPicker({ state, onClose, onStart }: { state: { task?: Task } | null; onClose: () => void; onStart: (r: Omit<Run, 'startAt'>) => void }) {
  const today = todayKey()
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(today).filter((t) => t.status === 'todo').toArray(), [today]) || []
  const [taskId, setTaskId] = useState<number | undefined>()
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(25)
  const [src, setSrc] = useState<typeof state>(null)
  if (state && state !== src) {
    setSrc(state)
    setTaskId(state.task?.id)
    setTitle(state.task?.title || '')
  }
  const chosen = tasks.find((t) => t.id === taskId)
  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      title="جلسهٔ تمرکز"
      footer={
        <Button block disabled={!chosen && !title.trim()} onClick={() => onStart({ taskId, title: chosen?.title || title.trim(), planned: minutes, phase: 'work' })}>
          <Timer size={18} /> شروع {fa(minutes)} دقیقه
        </Button>
      }
    >
      {tasks.length > 0 && (
        <>
          <Label>روی کدام تسک؟</Label>
          <div className="flex flex-wrap gap-2">
            {tasks.map((t) => (
              <Chip key={t.id} active={taskId === t.id} onClick={() => setTaskId(taskId === t.id ? undefined : t.id)}>
                {t.title}
              </Chip>
            ))}
          </div>
        </>
      )}
      {!chosen && (
        <>
          <Label>{tasks.length ? 'یا یک عنوان آزاد' : 'روی چه کاری؟'}</Label>
          <input className="field" placeholder="مثلاً طراحی صفحهٔ محصول" value={title} onChange={(e) => setTitle(e.target.value)} />
        </>
      )}
      <Label>مدت</Label>
      <div className="flex flex-wrap gap-2">
        {[15, 25, 45, 60, 90].map((m) => (
          <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>
            {fa(m)} دقیقه
          </Chip>
        ))}
      </div>
    </Sheet>
  )
}
