import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ClipboardList, Plus } from 'lucide-react'
import { db } from '../db/db'
import type { Category, Task } from '../db/types'
import {
  addDaysKey, fromMin, jDay, jDayMonth, jf, jLong, jMonthKey, jMonthLabel, jMonthRange, monthGrid,
  relDay, shiftMonth, toMin, todayKey, weekStart, rangeKeys, nowTime,
} from '../lib/date'
import { fa } from '../lib/format'
import { holidayOf } from '../lib/holidays'
import { ensureRecurringTasks, layoutBlocks, newTask, setTaskDone } from '../lib/tasks'
import { haptic } from '../lib/anim'
import { Card, Empty, Fab, Segmented } from '../ui/kit'
import { TaskSheet } from './TaskSheet'
import { TaskRow, sortTasks, taskColor, useTaskCats } from './task-ui'
import { WEEK } from '../ui/DatePicker'

type View = 'day' | 'week' | 'month' | 'list'
const START = 4 * 60
const END = 24 * 60

const readView = (): View => {
  try {
    return (localStorage.getItem('calView') as View) || 'day'
  } catch {
    return 'day'
  }
}

export default function CalendarPage() {
  const [view, setViewS] = useState<View>(readView)
  const [date, setDate] = useState(todayKey())
  const [editing, setEditing] = useState<Task | null>(null)
  const nav = useNavigate()
  const setView = (v: View) => {
    setViewS(v)
    try {
      localStorage.setItem('calView', v)
    } catch {
      /* اختیاری */
    }
  }

  const range = useMemo(() => {
    if (view === 'day') return { from: date, to: date }
    if (view === 'week') {
      const s = weekStart(date)
      return { from: s, to: addDaysKey(s, 6) }
    }
    if (view === 'month') {
      const g = monthGrid(jMonthKey(date))
      return { from: g[0], to: g[41] }
    }
    return { from: todayKey(), to: addDaysKey(todayKey(), 30) }
  }, [view, date])

  useEffect(() => {
    ensureRecurringTasks(range.from, range.to)
  }, [range.from, range.to])

  const tasks = useLiveQuery(() => db.tasks.where('date').between(range.from, range.to, true, true).toArray(), [range.from, range.to]) || []
  const cats = useTaskCats()

  const step = (n: number) => {
    if (view === 'day') setDate(addDaysKey(date, n))
    else if (view === 'week') setDate(addDaysKey(date, 7 * n))
    else if (view === 'month') setDate(jMonthRange(shiftMonth(jMonthKey(date), n)).from)
  }

  const title =
    view === 'day' ? relDay(date) : view === 'week' ? `${jDayMonth(range.from)} تا ${jDayMonth(range.to)}` : view === 'month' ? jMonthLabel(jMonthKey(date)) : '۳۰ روز آینده'
  const sub = view === 'day' ? jLong(date) : view === 'week' ? jf(range.from, 'MMMM yyyy') : undefined

  // کشیدن افقی برای جابه‌جایی بین روزها/هفته‌ها/ماه‌ها
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s || view === 'list' || dragging.current) return
    const dx = e.changedTouches[0].clientX - s.x
    const dy = e.changedTouches[0].clientY - s.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s.t < 600) step(dx > 0 ? 1 : -1)
  }
  const dragging = useRef(false)

  const openNew = (d: string, start?: string) =>
    setEditing(newTask({ date: d, start, end: start ? fromMin(Math.min(END - 1, toMin(start) + 60)) : undefined, allDay: !start }))

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="sticky top-0 z-20 -mx-4 bg-bg/90 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2 backdrop-blur-md">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
            {sub && <p className="truncate text-sm text-muted">{sub}</p>}
          </div>
          <button className="press grid size-10 place-items-center rounded-full bg-surface-2" onClick={() => nav('/planner')} aria-label="پلنر فردا">
            <ClipboardList size={19} />
          </button>
          {view !== 'list' && (
            <>
              <button className="press h-10 rounded-full bg-surface-2 px-3 text-sm font-semibold" onClick={() => setDate(todayKey())}>
                امروز
              </button>
              <button className="press grid size-10 place-items-center rounded-full" onClick={() => step(-1)} aria-label="قبلی">
                <ChevronRight size={22} />
              </button>
              <button className="press grid size-10 place-items-center rounded-full" onClick={() => step(1)} aria-label="بعدی">
                <ChevronLeft size={22} />
              </button>
            </>
          )}
        </div>
        <Segmented
          className="mt-2"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'روز' },
            { value: 'week', label: 'هفته' },
            { value: 'month', label: 'ماه' },
            { value: 'list', label: 'فهرست' },
          ]}
        />
      </header>

      {view === 'day' && <DayView date={date} tasks={tasks} cats={cats} onOpen={setEditing} onNew={openNew} dragging={dragging} />}
      {view === 'week' && <WeekView from={range.from} tasks={tasks} cats={cats} onOpen={setEditing} onNew={openNew} onDay={(d) => { setDate(d); setView('day') }} />}
      {view === 'month' && <MonthView date={date} setDate={setDate} tasks={tasks} cats={cats} onOpen={setEditing} onNew={openNew} onDay={(d) => { setDate(d); setView('day') }} />}
      {view === 'list' && <ListView tasks={tasks} cats={cats} onOpen={setEditing} />}

      <Fab onClick={() => openNew(view === 'list' ? todayKey() : date, view === 'day' || view === 'week' ? nextHalfHour() : undefined)} label="تسک جدید" />
      <TaskSheet task={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

const nextHalfHour = () => {
  const m = toMin(nowTime())
  return fromMin(Math.max(START, Math.min(END - 60, Math.ceil((m + 1) / 30) * 30)))
}

function HolidayBanner({ date }: { date: string }) {
  const h = holidayOf(date)
  if (!h) return null
  return <p className="mb-2 rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad">تعطیل رسمی: {h}</p>
}

/* ───────────── نمای روز ───────────── */

const HOUR_H = 60
const LABEL_W = 44

function DayView({ date, tasks, cats, onOpen, onNew, dragging }: { date: string; tasks: Task[]; cats: Map<number, Category>; onOpen: (t: Task) => void; onNew: (d: string, start?: string) => void; dragging: React.MutableRefObject<boolean> }) {
  const scroller = useRef<HTMLDivElement>(null)
  const allDay = tasks.filter((t) => t.allDay || !t.start).sort(sortTasks)
  const timed = tasks.filter((t) => !t.allDay && t.start)
  const blocks = layoutBlocks(timed.map((t) => ({ t, s: Math.max(START, toMin(t.start!)), e: Math.max(toMin(t.start!) + 15, toMin(t.end || fromMin(toMin(t.start!) + 60))) })))
  const isToday = date === todayKey()
  const [now, setNow] = useState(toMin(nowTime()))
  useEffect(() => {
    const i = setInterval(() => setNow(toMin(nowTime())), 60000)
    return () => clearInterval(i)
  }, [])

  // اسکرول خودکار به ساعت فعلی یا اولین تسک
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const first = timed.length ? Math.min(...timed.map((t) => toMin(t.start!))) : 8 * 60
    const target = isToday ? now - 90 : first - 60
    el.scrollTop = Math.max(0, ((target - START) / 60) * HOUR_H)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const hours = Array.from({ length: (END - START) / 60 }, (_, i) => START / 60 + i)

  return (
    <div className="mt-2">
      <HolidayBanner date={date} />
      {allDay.length > 0 && (
        <div className="card mb-2 px-3 py-1">
          <div className="max-h-36 divide-y divide-line overflow-y-auto">
            {allDay.map((t) => (
              <TaskRow key={t.id} t={t} cats={cats} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
      <div ref={scroller} className="card relative h-[calc(100dvh-env(safe-area-inset-top)-250px)] overflow-y-auto overscroll-contain" style={{ minHeight: 320 }}>
        <div
          className="relative"
          style={{ height: ((END - START) / 60) * HOUR_H }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return
            const rect = e.currentTarget.getBoundingClientRect()
            const min = START + Math.floor(((e.clientY - rect.top) / HOUR_H) * 2) * 30
            onNew(date, fromMin(Math.min(END - 60, min)))
          }}
        >
          {hours.map((h) => (
            <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: (h * 60 - START) / 60 * HOUR_H }}>
              <span className="tnum absolute -top-2.5 right-1.5 bg-surface px-1 text-[11px] text-muted">{fa(String(h).padStart(2, '0'))}:۰۰</span>
            </div>
          ))}
          {isToday && now >= START && (
            <div className="pointer-events-none absolute left-0 z-10 flex items-center" style={{ top: ((now - START) / 60) * HOUR_H, right: LABEL_W - 6 }}>
              <span className="size-2.5 rounded-full bg-bad" />
              <span className="h-0.5 flex-1 bg-bad" />
            </div>
          )}
          {blocks.map((b) => (
            <Block key={b.t.id} b={b} color={taskColor(b.t, cats)} onOpen={onOpen} dragging={dragging} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">برای ساخت تسک روی ساعت خالی بزن. برای جابه‌جایی، تسک را نگه دار و بکش.</p>
    </div>
  )
}

interface DragState {
  mode: 'wait' | 'move' | 'resize'
  y: number
  id: number
  timer?: ReturnType<typeof setTimeout>
  dy: number
}

function Block({ b, color, onOpen, dragging }: { b: { t: Task; s: number; e: number; col: number; cols: number }; color: string; onOpen: (t: Task) => void; dragging: React.MutableRefObject<boolean> }) {
  const el = useRef<HTMLDivElement>(null)
  const st = useRef<DragState | null>(null)
  const top = ((b.s - START) / 60) * HOUR_H
  const height = Math.max(22, ((b.e - b.s) / 60) * HOUR_H - 2)
  const w = `calc((100% - ${LABEL_W + 6}px) / ${b.cols})`
  const done = b.t.status === 'done'
  const snap = (px: number) => Math.round((px / HOUR_H) * 4) * 15 // دقیقه، گام ۱۵

  useEffect(() => {
    // جلوگیری از اسکرول صفحه هنگام کشیدن روی موبایل
    const node = el.current
    if (!node) return
    const block = (e: TouchEvent) => {
      if (st.current && st.current.mode !== 'wait') e.preventDefault()
    }
    node.addEventListener('touchmove', block, { passive: false })
    return () => node.removeEventListener('touchmove', block)
  }, [])

  const commit = async (deltaMin: number, mode: 'move' | 'resize') => {
    if (!deltaMin) return
    const s = toMin(b.t.start!)
    const e = toMin(b.t.end || fromMin(s + 60))
    if (mode === 'move') {
      const ns = Math.max(START, Math.min(END - (e - s), s + deltaMin))
      await db.tasks.update(b.t.id!, { start: fromMin(ns), end: fromMin(ns + (e - s)) })
    } else {
      const ne = Math.max(s + 15, Math.min(END - 1, e + deltaMin))
      await db.tasks.update(b.t.id!, { end: fromMin(ne) })
    }
  }

  const down = (e: React.PointerEvent, mode: 'wait' | 'resize') => {
    e.stopPropagation()
    if (st.current) return
    const s: DragState = { mode, y: e.clientY, id: e.pointerId, dy: 0 }
    st.current = s
    if (mode === 'resize') {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragging.current = true
      el.current?.classList.add('dragging')
    } else {
      const target = e.currentTarget as HTMLElement
      s.timer = setTimeout(() => {
        if (st.current !== s) return
        s.mode = 'move'
        dragging.current = true
        try {
          target.setPointerCapture(s.id)
        } catch {
          /* ممکن است اشاره‌گر رها شده باشد */
        }
        el.current?.classList.add('dragging')
        haptic(15)
      }, 380)
    }
  }
  const move = (e: React.PointerEvent) => {
    const s = st.current
    if (!s || s.id !== e.pointerId || !el.current) return
    const dy = e.clientY - s.y
    if (s.mode === 'wait') {
      if (Math.abs(dy) > 8) {
        clearTimeout(s.timer)
        st.current = null
      }
      return
    }
    s.dy = dy
    const m = snap(dy)
    if (s.mode === 'move') el.current.style.transform = `translateY(${(m / 60) * HOUR_H}px) scale(1.02)`
    else el.current.style.height = `${Math.max(22, height + (m / 60) * HOUR_H)}px`
  }
  const up = (e: React.PointerEvent) => {
    const s = st.current
    st.current = null
    if (!s || !el.current) return
    clearTimeout(s.timer)
    el.current.classList.remove('dragging')
    setTimeout(() => (dragging.current = false), 50)
    if (s.mode === 'wait') {
      if (e.type === 'pointerup') onOpen(b.t)
      return
    }
    el.current.style.transform = ''
    el.current.style.height = ''
    commit(snap(s.dy), s.mode)
  }

  return (
    <div
      ref={el}
      className="cal-block absolute overflow-hidden rounded-xl px-2 py-1 text-white select-none"
      style={{
        top: top + 1,
        height,
        right: `calc(${LABEL_W}px + ${w} * ${b.col})`,
        width: `calc(${w} - 3px)`,
        background: color,
        opacity: done ? 0.45 : b.t.status === 'dropped' ? 0.3 : 1,
        WebkitTouchCallout: 'none',
      }}
      onPointerDown={(e) => down(e, 'wait')}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-start gap-1">
        <button
          className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] border-white/90"
          style={{ background: done ? '#fff' : 'transparent' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setTaskDone(b.t, !done)
            haptic()
          }}
          aria-label="انجام شد"
        >
          {done && <span className="size-1.5 rounded-full" style={{ background: color }} />}
        </button>
        <p className={`min-w-0 flex-1 text-[13px] leading-5 font-semibold ${done ? 'line-through' : ''}`}>{b.t.title}</p>
      </div>
      {height > 38 && <p className="tnum text-[11px] opacity-85">{fa(b.t.start)}–{fa(b.t.end)}</p>}
      <div className="absolute inset-x-0 bottom-0 h-3 cursor-ns-resize touch-none" onPointerDown={(e) => down(e, 'resize')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="mx-auto mt-1 h-1 w-6 rounded-full bg-white/50" />
      </div>
    </div>
  )
}

/* ───────────── نمای هفته ───────────── */

const WH = 40

function WeekView({ from, tasks, cats, onOpen, onNew, onDay }: { from: string; tasks: Task[]; cats: Map<number, Category>; onOpen: (t: Task) => void; onNew: (d: string, s?: string) => void; onDay: (d: string) => void }) {
  const days = rangeKeys(from, addDaysKey(from, 6))
  const scroller = useRef<HTMLDivElement>(null)
  const today = todayKey()
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = ((7 * 60 - START) / 60) * WH
  }, [from])
  const hours = Array.from({ length: (END - START) / 60 }, (_, i) => START / 60 + i)
  return (
    <div className="card mt-2 overflow-hidden">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `28px repeat(7, 1fr)` }}>
        <div />
        {days.map((d, i) => {
          const off = i === 6 || !!holidayOf(d)
          const allDay = tasks.filter((t) => t.date === d && (t.allDay || !t.start))
          return (
            <button key={d} className="press flex flex-col items-center py-1.5" onClick={() => onDay(d)}>
              <span className={`text-[11px] ${off ? 'text-bad' : 'text-muted'}`}>{WEEK[i]}</span>
              <span className={`tnum grid size-7 place-items-center rounded-full text-sm font-bold ${d === today ? 'bg-accent text-accent-ink' : off ? 'text-bad' : ''}`}>{fa(jDay(d))}</span>
              <span className="flex h-1.5 gap-0.5">
                {allDay.slice(0, 3).map((t) => (
                  <i key={t.id} className="size-1.5 rounded-full" style={{ background: taskColor(t, cats) }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <div ref={scroller} className="relative h-[calc(100dvh-env(safe-area-inset-top)-300px)] overflow-y-auto" style={{ minHeight: 300 }}>
        <div className="relative grid" style={{ gridTemplateColumns: `28px repeat(7, 1fr)`, height: ((END - START) / 60) * WH }}>
          <div className="relative">
            {hours.map((h) => (
              <span key={h} className="tnum absolute right-1 text-[10px] text-muted" style={{ top: ((h * 60 - START) / 60) * WH - 6 }}>
                {fa(h)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const items = layoutBlocks(
              tasks.filter((t) => t.date === d && !t.allDay && t.start).map((t) => ({ t, s: Math.max(START, toMin(t.start!)), e: Math.max(toMin(t.start!) + 15, toMin(t.end || t.start!) ) })),
            )
            return (
              <div
                key={d}
                className="relative border-r border-line"
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${WH}px)` }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const min = START + Math.floor((e.clientY - rect.top) / WH) * 60
                  onNew(d, fromMin(Math.min(END - 60, min)))
                }}
              >
                {d === today && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-bad" style={{ top: ((toMin(nowTime()) - START) / 60) * WH }} />
                )}
                {items.map((b) => (
                  <button
                    key={b.t.id}
                    onClick={() => onOpen(b.t)}
                    className="press absolute overflow-hidden rounded-md px-0.5 text-start text-[10px] leading-tight font-semibold text-white"
                    style={{
                      top: ((b.s - START) / 60) * WH + 1,
                      height: Math.max(14, ((b.e - b.s) / 60) * WH - 2),
                      right: `${(100 / b.cols) * b.col}%`,
                      width: `calc(${100 / b.cols}% - 2px)`,
                      background: taskColor(b.t, cats),
                      opacity: b.t.status === 'done' ? 0.45 : 1,
                    }}
                  >
                    {b.t.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ───────────── نمای ماه ───────────── */

function MonthView({ date, setDate, tasks, cats, onOpen, onNew, onDay }: { date: string; setDate: (d: string) => void; tasks: Task[]; cats: Map<number, Category>; onOpen: (t: Task) => void; onNew: (d: string) => void; onDay: (d: string) => void }) {
  const mk = jMonthKey(date)
  const grid = monthGrid(mk)
  const today = todayKey()
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!m.has(t.date)) m.set(t.date, [])
      m.get(t.date)!.push(t)
    }
    return m
  }, [tasks])
  const rows = grid.slice(35).every((k) => jMonthKey(k) !== mk) ? 5 : 6
  const sel = (byDay.get(date) || []).sort(sortTasks)
  return (
    <div className="mt-2 space-y-3">
      <div className="card overflow-hidden p-1.5">
        <div className="grid grid-cols-7 text-center text-xs text-muted">
          {WEEK.map((w, i) => (
            <div key={w} className={`py-1.5 ${i === 6 ? 'text-bad' : ''}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.slice(0, rows * 7).map((k, i) => {
            const inMonth = jMonthKey(k) === mk
            const items = (byDay.get(k) || []).filter((t) => t.status !== 'dropped')
            const off = i % 7 === 6 || !!holidayOf(k)
            const selected = k === date
            return (
              <button
                key={k}
                onClick={() => (selected ? onDay(k) : setDate(k))}
                className={`press flex h-16 flex-col items-center rounded-xl pt-1 ${selected ? 'bg-accent-soft' : ''} ${inMonth ? '' : 'opacity-35'}`}
              >
                <span className={`tnum grid size-7 place-items-center rounded-full text-sm ${k === today ? 'bg-accent font-bold text-accent-ink' : off ? 'font-semibold text-bad' : 'font-medium'}`}>{fa(jDay(k))}</span>
                <span className="mt-1 flex w-full flex-col gap-0.5 px-1.5">
                  {items.slice(0, 3).map((t) => (
                    <i key={t.id} className="h-1 w-full rounded-full" style={{ background: taskColor(t, cats), opacity: t.status === 'done' ? 0.35 : 1 }} />
                  ))}
                </span>
                {items.length > 3 && <span className="tnum text-[9px] text-muted">+{fa(items.length - 3)}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <Card
        title={<span>{relDay(date)} <span className="text-sm font-normal text-muted">{jLong(date)}</span></span>}
        action={
          <button className="press grid size-9 place-items-center rounded-full bg-surface-2" onClick={() => onNew(date)} aria-label="تسک جدید برای این روز">
            <Plus size={18} />
          </button>
        }
      >
        <HolidayBanner date={date} />
        {sel.length ? (
          <div className="divide-y divide-line">
            {sel.map((t) => (
              <TaskRow key={t.id} t={t} cats={cats} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-sm text-muted">برای این روز تسکی نیست.</p>
        )}
        <button className="press mt-2 w-full rounded-xl py-2 text-sm font-semibold text-accent" onClick={() => onDay(date)}>
          نمای ساعتی این روز
        </button>
      </Card>
    </div>
  )
}

/* ───────────── نمای فهرست ───────────── */

function ListView({ tasks, cats, onOpen }: { tasks: Task[]; cats: Map<number, Category>; onOpen: (t: Task) => void }) {
  const days = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of [...tasks].filter((t) => t.status !== 'dropped').sort((a, b) => a.date.localeCompare(b.date) || sortTasks(a, b))) {
      if (!m.has(t.date)) m.set(t.date, [])
      m.get(t.date)!.push(t)
    }
    return [...m.entries()]
  }, [tasks])
  if (!days.length)
    return (
      <Card className="mt-2">
        <Empty icon={<ClipboardList />} title="۳۰ روز آینده خالی است" text="با دکمهٔ + اولین تسک را اضافه کن." />
      </Card>
    )
  return (
    <div className="mt-2 space-y-3">
      {days.map(([d, ts]) => (
        <Card key={d} title={<span>{relDay(d)} <span className="text-sm font-normal text-muted">{jf(d, 'EEEE d MMMM')}</span></span>}>
          <div className="-mt-1 divide-y divide-line">
            {ts.map((t) => (
              <TaskRow key={t.id} t={t} cats={cats} onOpen={onOpen} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
