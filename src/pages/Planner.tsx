import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Plus, ShieldOff, Target, X } from 'lucide-react'
import { db, logEvent } from '../db/db'
import type { DayPlan, PlanItem, Task } from '../db/types'
import { addDaysKey, jLong, relDay, todayKey, tomorrowKey } from '../lib/date'
import { uid } from '../lib/format'
import { newTask } from '../lib/tasks'
import { Card, CheckButton, Chip, PageHeader } from '../ui/kit'
import { toast } from '../ui/Toast'
import { TaskSheet } from './TaskSheet'
import { TaskRow, sortTasks, useTaskCats } from './task-ui'
import { useStagger } from '../lib/anim'

export async function savePlan(date: string, patch: Partial<DayPlan>) {
  const ex = await db.dayPlans.get(date)
  const first = !ex?.plannedAt
  await db.dayPlans.put({ date, musts: [], mustNots: [], ...ex, ...patch, plannedAt: ex?.plannedAt || (date > todayKey() ? Date.now() : undefined), updatedAt: Date.now() })
  if (first && date > todayKey()) await logEvent('plan_filled', undefined, { date })
}

export function PlanList({ date, field, plan, placeholder, tone, max }: { date: string; field: 'musts' | 'mustNots'; plan?: DayPlan; placeholder: string; tone: 'good' | 'bad'; max?: number }) {
  const [text, setText] = useState('')
  const items = plan?.[field] || []
  const add = async () => {
    if (!text.trim()) return
    await savePlan(date, { [field]: [...items, { id: uid(), text: text.trim(), done: false }] })
    setText('')
  }
  const update = (next: PlanItem[]) => savePlan(date, { [field]: next })
  return (
    <div>
      <div className="divide-y divide-line">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 py-2">
            <CheckButton size={26} checked={it.done} color={tone === 'good' ? 'var(--good)' : 'var(--good)'} onChange={() => update(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} label={it.text} />
            <span className={`flex-1 ${it.done ? 'text-muted line-through decoration-1' : ''}`}>{it.text}</span>
            <button className="press p-1 text-muted" onClick={() => update(items.filter((x) => x.id !== it.id))} aria-label="حذف">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      {(!max || items.length < max) && (
        <div className="mt-2 flex gap-2">
          <input className="field h-11 flex-1 py-0" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="press grid size-11 place-items-center rounded-xl bg-surface-2" onClick={add} aria-label="افزودن">
            <Plus size={18} />
          </button>
        </div>
      )}
      {max && items.length >= max && <p className="mt-2 text-xs text-muted">حداکثر {max === 3 ? 'سه' : max} مورد؛ تمرکز روی کارهای کم‌تر، احتمال انجامشان را بالا می‌برد.</p>}
    </div>
  )
}

export default function Planner() {
  const [date, setDate] = useState(tomorrowKey())
  const [editing, setEditing] = useState<Task | null>(null)
  const [quick, setQuick] = useState('')
  const plan = useLiveQuery(() => db.dayPlans.get(date), [date])
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(date).toArray(), [date]) || []
  const cats = useTaskCats()
  const ref = useStagger<HTMLDivElement>([date])
  const prevKey = addDaysKey(date, -1)
  const copyFromPrev = async () => {
    const prev = await db.dayPlans.get(prevKey)
    if (!prev || (!prev.musts.length && !prev.mustNots.length)) return toast('برای روز قبل چیزی ثبت نشده')
    const fresh = (l: PlanItem[]) => l.map((x) => ({ ...x, id: uid(), done: false }))
    const cur = plan || { musts: [], mustNots: [] }
    const has = (l: PlanItem[], t: string) => l.some((x) => x.text === t)
    await savePlan(date, {
      musts: [...cur.musts, ...fresh(prev.musts).filter((x) => !has(cur.musts, x.text))],
      mustNots: [...cur.mustNots, ...fresh(prev.mustNots).filter((x) => !has(cur.mustNots, x.text))],
    })
    toast('از روز قبل کپی شد')
  }

  return (
    <div>
      <PageHeader title={`پلنر ${relDay(date)}`} sub={jLong(date)} back />
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {[0, 1, 2].map((n) => {
          const k = addDaysKey(todayKey(), n)
          return (
            <Chip key={n} active={date === k} onClick={() => setDate(k)}>
              {relDay(k)}
            </Chip>
          )
        })}
      </div>
      <div ref={ref} className="space-y-3">
        <Card title="تسک‌ها و کارها">
          {tasks.length > 0 && (
            <div className="-mt-1 mb-1 divide-y divide-line">
              {[...tasks].sort(sortTasks).map((t) => (
                <TaskRow key={t.id} t={t} cats={cats} onOpen={setEditing} />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="field h-11 flex-1 py-0"
              placeholder="تسک سریع (بدون ساعت)"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && quick.trim()) {
                  await db.tasks.add(newTask({ date, title: quick.trim() }))
                  await savePlan(date, {})
                  setQuick('')
                }
              }}
            />
            <button className="press h-11 rounded-xl bg-surface-2 px-3 text-sm font-semibold" onClick={() => setEditing(newTask({ date, start: '09:00', end: '10:00', allDay: false }))}>
              با ساعت
            </button>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Target size={18} className="text-good" /> بایدها
            </span>
          }
          action={<span className="text-xs text-muted">مهم‌ترین کارهایی که حتماً انجام می‌شوند</span>}
        >
          <PlanList date={date} field="musts" plan={plan} placeholder="مثلاً تحویل گزارش" tone="good" max={3} />
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <ShieldOff size={18} className="text-bad" /> نبایدها
            </span>
          }
          action={<span className="text-xs text-muted">آخر روز، رعایت‌شده‌ها را تیک بزن</span>}
        >
          <PlanList date={date} field="mustNots" plan={plan} placeholder="مثلاً گوشی بعد از ۱۲ شب" tone="bad" />
        </Card>

        <button className="press flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-muted" onClick={copyFromPrev}>
          <Copy size={16} /> کپی بایدها و نبایدها از {relDay(prevKey)}
        </button>
      </div>
      <TaskSheet task={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
