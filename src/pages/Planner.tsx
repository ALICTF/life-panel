import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
import { ArrowUp, Ban, Check, Clock, Moon, ShieldOff, Star, X } from 'lucide-react'
import { db, logEvent } from '../db/db'
import type { DayPlan, PlanItem, Task } from '../db/types'
import { addDaysKey, jLong, relDay, toMin, todayKey, tomorrowKey } from '../lib/date'
import { fa, uid } from '../lib/format'
import { moveTask, newTask, setTaskDone } from '../lib/tasks'
import { parseEntry } from '../lib/smart'
import { haptic } from '../lib/anim'
import { Button, Card, CheckButton, Chip, PageHeader } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/Toast'
import { TaskSheet } from './TaskSheet'
import { TaskRow, sortTasks, taskColor, useTaskCats } from './task-ui'
import { useStagger } from '../lib/anim'


export async function savePlan(date: string, patch: Partial<DayPlan>) {
  const ex = await db.dayPlans.get(date)
  const first = !ex?.plannedAt
  await db.dayPlans.put({ date, musts: [], mustNots: [], ...ex, ...patch, plannedAt: ex?.plannedAt || (date > todayKey() ? Date.now() : undefined), updatedAt: Date.now() })
  if (first && date > todayKey()) await logEvent('plan_filled', undefined, { date })
}

/** فهرست ساده با تیک (برای نبایدها و بایدهای قدیمی) */
export function PlanList({ date, field, plan, placeholder, max }: { date: string; field: 'musts' | 'mustNots'; plan?: DayPlan; placeholder?: string; tone?: 'good' | 'bad'; max?: number }) {
  const [text, setText] = useState('')
  const items = plan?.[field] || []
  const update = (next: PlanItem[]) => savePlan(date, { [field]: next })
  const add = async () => {
    if (!text.trim()) return
    await savePlan(date, { [field]: [...items, { id: uid(), text: text.trim(), done: false }] })
    setText('')
  }
  return (
    <div>
      <div className="divide-y divide-line">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 py-2">
            <CheckButton size={26} checked={it.done} color="var(--good)" onChange={() => update(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} label={it.text} />
            <span className={`flex-1 ${it.done ? 'text-muted line-through decoration-1' : ''}`}>{it.text}</span>
            <button className="press p-1 text-muted" onClick={() => update(items.filter((x) => x.id !== it.id))} aria-label="حذف">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      {placeholder && (!max || items.length < max) && (
        <input className="field mt-2 h-11 py-0" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      )}
    </div>
  )
}

/* ───────────── منطق مشترک ───────────── */

type Mode = 'task' | 'must' | 'not'

async function starCount(date: string) {
  return db.tasks.where('date').equals(date).filter((t) => !!t.star && t.status !== 'dropped').count()
}

export async function toggleStar(t: Task) {
  if (!t.star && (await starCount(t.date)) >= 3) {
    toast('حداکثر سه باید؛ کمتر یعنی تمرکز بیشتر')
    return
  }
  await db.tasks.update(t.id!, { star: !t.star })
  haptic()
}

async function addFromText(date: string, mode: Mode, text: string) {
  const v = text.trim()
  if (!v) return false
  if (mode === 'not') {
    const plan = await db.dayPlans.get(date)
    await savePlan(date, { mustNots: [...(plan?.mustNots || []), { id: uid(), text: v, done: false }] })
    return true
  }
  if (mode === 'must' && (await starCount(date)) >= 3) {
    toast('سه باید پر شده؛ به‌عنوان تسک عادی اضافه شد')
    mode = 'task'
  }
  const p = parseEntry(v)
  await db.tasks.add(newTask({ date, title: p.title, start: p.start, end: p.end, allDay: !p.start, priority: p.priority ?? 2, star: mode === 'must' || undefined }))
  await savePlan(date, {})
  return true
}

/* ───────────── کادر نوشتن ───────────── */

const MODES: { v: Mode; label: string; ph: string }[] = [
  { v: 'task', label: 'تسک', ph: 'مثلاً «جلسه با تیم ۷ عصر» یا «خرید نان»' },
  { v: 'must', label: '⭐ باید', ph: 'مهم‌ترین کار؛ مثلاً «تحویل سایت سحر !»' },
  { v: 'not', label: '🚫 نباید', ph: 'مثلاً «گوشی بعد از ۱۲ شب»' },
]

export function Composer({ date, fixed = true, lock }: { date: string; fixed?: boolean; lock?: Mode }) {
  const [mode, setMode] = useState<Mode>(lock || 'task')
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const m = lock || mode
  const preview = m !== 'not' && text.trim() ? parseEntry(text) : null
  const send = async () => {
    if (await addFromText(date, m, text)) {
      setText('')
      haptic()
      input.current?.focus()
    }
  }
  return (
    <div className={fixed ? 'fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 backdrop-blur-lg' : ''}>
      <div className={fixed ? 'mx-auto max-w-xl px-4 pt-2 pb-2.5' : ''}>
        <div className="mb-2 flex items-center gap-1.5">
          {!lock &&
            MODES.map((x) => (
              <button
                key={x.v}
                onClick={() => {
                  setMode(x.v)
                  input.current?.focus()
                }}
                className={`press h-8 rounded-full px-3 text-[13px] font-semibold transition-colors ${mode === x.v ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`}
              >
                {x.label}
              </button>
            ))}
          {preview && (preview.start || preview.priority) && (
            <span className="ms-auto flex items-center gap-1.5 text-xs font-semibold text-accent">
              {preview.start && (
                <span className="tnum inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1">
                  <Clock size={12} />
                  {fa(preview.start)}–{fa(preview.end)}
                </span>
              )}
              {preview.priority && <span className="rounded-full bg-bad-soft px-2 py-1 text-bad">مهم</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={input}
            className="field h-12 flex-1 py-0"
            placeholder={MODES.find((x) => x.v === m)!.ph}
            value={text}
            enterKeyHint="send"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="press grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink disabled:opacity-40" disabled={!text.trim()} onClick={send} aria-label="افزودن">
            <ArrowUp size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────── نوار زمانی روز ───────────── */

function DayStrip({ tasks, cats }: { tasks: Task[]; cats: ReturnType<typeof useTaskCats> }) {
  const S = 6 * 60
  const E = 24 * 60
  const timed = tasks.filter((t) => t.start && !t.allDay && t.status !== 'dropped')
  if (!timed.length) return null
  return (
    <div className="card mb-3 px-4 pt-3 pb-2">
      <div className="relative h-7 rounded-lg bg-surface-2">
        {timed.map((t) => {
          const s = Math.max(S, toMin(t.start!))
          const e = Math.min(E, toMin(t.end || t.start!) || s + 60)
          return (
            <span
              key={t.id}
              className="absolute top-1 bottom-1 rounded-md"
              title={t.title}
              style={{ right: `${((s - S) / (E - S)) * 100}%`, width: `${Math.max(1.5, ((e - s) / (E - S)) * 100)}%`, background: taskColor(t, cats), opacity: t.status === 'done' ? 0.4 : 0.9 }}
            />
          )
        })}
      </div>
      <div className="tnum mt-1 flex justify-between text-[10px] text-muted">
        {[6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h}>{fa(h)}</span>
        ))}
      </div>
    </div>
  )
}

/* ───────────── صفحهٔ پلنر ───────────── */

export default function Planner() {
  const [params, setParams] = useSearchParams()
  const [date, setDate] = useState(tomorrowKey())
  const [editing, setEditing] = useState<Task | null>(null)
  const [review, setReview] = useState(false)
  const plan = useLiveQuery(() => db.dayPlans.get(date), [date])
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(date).toArray(), [date]) || []
  const cats = useTaskCats()
  const ref = useStagger<HTMLDivElement>([date])
  const today = todayKey()

  useEffect(() => {
    if (params.get('review')) {
      setReview(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  // پیشنهادها: کارهای انجام‌نشدهٔ روز قبل و نبایدهای تکراری
  const leftovers = useLiveQuery(
    () => (date > today ? db.tasks.where('date').equals(addDaysKey(date, -1)).filter((t) => t.status === 'todo' && !t.recurId).toArray() : Promise.resolve([] as Task[])),
    [date, today],
  ) || []
  const pastNots = useLiveQuery(async () => {
    const plans = await db.dayPlans.where('date').between(addDaysKey(date, -21), date, true, false).toArray()
    const count = new Map<string, number>()
    for (const p of plans) for (const n of p.mustNots) count.set(n.text, (count.get(n.text) || 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [date]) || []
  const curNots = new Set((plan?.mustNots || []).map((n) => n.text))
  const notSuggest = pastNots.filter((t) => !curNots.has(t)).slice(0, 6)

  const visible = tasks.filter((t) => t.status !== 'dropped')
  const stars = visible.filter((t) => t.star).sort(sortTasks)
  const rest = visible.filter((t) => !t.star).sort(sortTasks)
  const legacy = plan?.musts || []

  return (
    <div className="pb-28">
      <PageHeader
        title={`پلنر ${relDay(date)}`}
        sub={jLong(date)}
        back
        action={
          <button className="press flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-semibold" onClick={() => setReview(true)}>
            <Moon size={16} /> مرور شبانه
          </button>
        }
      />
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {[0, 1, 2].map((n) => {
          const k = addDaysKey(today, n)
          return (
            <Chip key={n} active={date === k} onClick={() => setDate(k)}>
              {relDay(k)}
            </Chip>
          )
        })}
      </div>

      <DayStrip tasks={visible} cats={cats} />

      <div ref={ref} className="space-y-3">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Star size={18} className="text-warn" fill="currentColor" strokeWidth={0} /> بایدها
              <span className="tnum text-xs font-normal text-muted">{fa(stars.length)} از ۳</span>
            </span>
          }
        >
          {stars.length || legacy.length ? (
            <div className="-mt-1 divide-y divide-line">
              {stars.map((t) => (
                <TaskRow key={t.id} t={t} cats={cats} onOpen={setEditing} onStar={toggleStar} />
              ))}
              {legacy.length > 0 && <PlanList date={date} field="musts" plan={plan} />}
            </div>
          ) : (
            <p className="text-sm leading-7 text-muted">کنار هر تسک یک ستاره هست. سه کار مهم را ستاره بزن، یا پایین صفحه «⭐ باید» را انتخاب کن و بنویس.</p>
          )}
        </Card>

        <Card title="تسک‌ها">
          {rest.length ? (
            <div className="-mt-1 divide-y divide-line">
              {rest.map((t) => (
                <TaskRow key={t.id} t={t} cats={cats} onOpen={setEditing} onStar={toggleStar} />
              ))}
            </div>
          ) : (
            <p className="text-sm leading-7 text-muted">پایین صفحه بنویس. ساعت را از متن می‌فهمم؛ مثلاً «باشگاه ۶ عصر». «!» آخر متن یعنی مهم.</p>
          )}
          {leftovers.length > 0 && (
            <div className="mt-3 rounded-2xl bg-surface-2 p-3">
              <p className="mb-2 text-xs font-semibold text-muted">از {relDay(addDaysKey(date, -1))} مانده؛ با یک لمس منتقل کن</p>
              <div className="flex flex-wrap gap-2">
                {leftovers.map((t) => (
                  <Chip
                    key={t.id}
                    onClick={async () => {
                      await moveTask(t, date)
                      await savePlan(date, {})
                      haptic()
                    }}
                  >
                    ↩ {t.title}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <ShieldOff size={18} className="text-bad" /> نبایدها
            </span>
          }
          action={<span className="text-xs text-muted">آخر روز رعایت‌شده‌ها را تیک بزن</span>}
        >
          {plan?.mustNots.length ? <PlanList date={date} field="mustNots" plan={plan} /> : <p className="text-sm text-muted">هنوز نبایدی نداری.</p>}
          {notSuggest.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {notSuggest.map((t) => (
                <Chip
                  key={t}
                  onClick={async () => {
                    await addFromText(date, 'not', t)
                    haptic()
                  }}
                >
                  + {t}
                </Chip>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Composer date={date} />
      <TaskSheet task={editing} onClose={() => setEditing(null)} />
      <NightReview open={review} onClose={() => setReview(false)} />
    </div>
  )
}

/* ───────────── مرور شبانه ───────────── */

function NightReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const today = todayKey()
  const tomorrow = tomorrowKey()
  const cats = useTaskCats()
  const left = useLiveQuery(() => db.tasks.where('date').between(addDaysKey(today, -14), today, true, true).filter((t) => t.status === 'todo' && !t.recurId).toArray(), [today]) || []
  const tmr = useLiveQuery(() => db.tasks.where('date').equals(tomorrow).filter((t) => t.status !== 'dropped').toArray(), [tomorrow]) || []
  const plan = useLiveQuery(() => db.dayPlans.get(tomorrow), [tomorrow])
  const pastNots = useLiveQuery(async () => {
    const plans = await db.dayPlans.where('date').between(addDaysKey(tomorrow, -21), tomorrow, true, false).toArray()
    return [...new Set(plans.flatMap((p) => p.mustNots.map((n) => n.text)))]
  }, [tomorrow]) || []
  const cur = new Set((plan?.mustNots || []).map((n) => n.text))
  const stars = tmr.filter((t) => t.star).length

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const steps = ['جامانده‌ها', 'سه کار مهم فردا', 'نبایدهای فردا']
  const finish = async () => {
    await savePlan(tomorrow, {})
    toast('فردا آماده است 🌙')
    onClose()
  }
  const sorted = useMemo(() => [...tmr].sort(sortTasks), [tmr])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      full
      title={
        <span className="flex items-center gap-2">
          <Moon size={18} /> مرور شبانه
          <span className="tnum text-sm font-normal text-muted">{fa(step + 1)} از ۳</span>
        </span>
      }
      footer={
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="soft" onClick={() => setStep(step - 1)}>
              قبلی
            </Button>
          )}
          <Button className="flex-1" onClick={() => (step < 2 ? setStep(step + 1) : finish())}>
            {step < 2 ? `بعدی: ${steps[step + 1]}` : 'تمام؛ فردا آماده است'}
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <span className={`block h-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-2'}`} />
            <span className={`mt-1 block text-center text-[10px] ${i === step ? 'font-bold' : 'text-muted'}`}>{s}</span>
          </div>
        ))}
      </div>

      {step === 0 &&
        (left.length ? (
          <div>
            <p className="mb-3 text-sm text-muted">برای هر کار انتخاب کن: انجام شد، فردا، یا رها.</p>
            <div className="space-y-2">
              {left.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2.5 ps-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.title}</span>
                    {t.date < today && <span className="text-xs text-warn">{relDay(t.date)}</span>}
                  </span>
                  <button className="press grid size-9 place-items-center rounded-xl bg-surface text-good" onClick={() => setTaskDone(t, true)} aria-label="انجام شد">
                    <Check size={18} />
                  </button>
                  <button className="press h-9 rounded-xl bg-surface px-3 text-sm font-semibold" onClick={() => moveTask(t, tomorrow)}>
                    فردا
                  </button>
                  <button className="press grid size-9 place-items-center rounded-xl bg-surface text-muted" onClick={() => db.tasks.update(t.id!, { status: 'dropped' })} aria-label="رها کن">
                    <Ban size={16} />
                  </button>
                </div>
              ))}
            </div>
            {left.length > 1 && (
              <Button
                variant="soft"
                block
                className="mt-3"
                onClick={async () => {
                  for (const t of left) await moveTask(t, tomorrow)
                }}
              >
                همه به فردا
              </Button>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-muted">کار جامانده‌ای نداری 👏</p>
        ))}

      {step === 1 && (
        <div>
          <p className="mb-3 text-sm leading-7 text-muted">سه کاری که اگر فردا فقط همین‌ها انجام شود، روز خوبی بوده. ستاره بزن یا بنویس.</p>
          <Composer date={tomorrow} fixed={false} lock={stars >= 3 ? 'task' : 'must'} />
          <div className="mt-3 divide-y divide-line">
            {sorted.map((t) => (
              <TaskRow key={t.id} t={t} cats={cats} onOpen={() => {}} onStar={toggleStar} />
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="mb-3 text-sm text-muted">فردا چه کارهایی را نباید بکنی؟</p>
          {pastNots.filter((t) => !cur.has(t)).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {pastNots
                .filter((t) => !cur.has(t))
                .map((t) => (
                  <Chip key={t} onClick={() => addFromText(tomorrow, 'not', t)}>
                    + {t}
                  </Chip>
                ))}
            </div>
          )}
          <Composer date={tomorrow} fixed={false} lock="not" />
          <div className="mt-3">
            <PlanList date={tomorrow} field="mustNots" plan={plan} />
          </div>
        </div>
      )}
    </Sheet>
  )
}
