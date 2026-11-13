import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, ChevronLeft, Compass, Flag, Lightbulb, Repeat } from 'lucide-react'
import { db, getSetting, logEvent } from '../db/db'
import type { Goal, GoalLevel, Recurring } from '../db/types'
import { addDaysKey, diffDays, jDayMonth, jLong, todayKey, weekIndex, jMonthRange, jMonthKey, jYear, jYearRange, weekStart } from '../lib/date'
import { fa, num, pct } from '../lib/format'
import { clamp01, goalProgress, LEVELS, levelLabel, METRICS, parentLevel, STATUS, latestWeight, type GoalCtx } from '../lib/goals'
import { balances } from '../lib/money'
import { ensureRecurringTasks } from '../lib/tasks'
import { Button, Card, Chip, Empty, Fab, Label, NumberField, PageHeader, Progress, Segmented, Toggle } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { DateField, WEEK } from '../ui/DatePicker'
import { toast } from '../ui/Toast'
import { useStagger } from '../lib/anim'

export function useGoalCtx(): GoalCtx & { ready: boolean } {
  const goals = useLiveQuery(() => db.goals.toArray(), []) || []
  const tasks = useLiveQuery(() => db.tasks.where('goalId').above(0).toArray(), []) || []
  const health = useLiveQuery(() => db.health.orderBy('date').toArray(), []) || []
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) || []
  const txs = useLiveQuery(() => db.transactions.toArray(), []) || []
  const bal = useMemo(() => balances(accounts, txs), [accounts, txs])
  return { goals, tasks, latestWeight: latestWeight(health), balances: bal, ready: true }
}

const deadlineFor = (l: GoalLevel) => {
  const t = todayKey()
  if (l === 'week') return addDaysKey(weekStart(t), 6)
  if (l === 'month') return jMonthRange(jMonthKey(t)).to
  if (l === 'quarter') return addDaysKey(t, 90)
  if (l === 'year') return jYearRange(jYear(t)).to
  return addDaysKey(t, 365 * 3)
}

export const blankGoal = (level: GoalLevel = 'month', parentId?: number): Goal => ({
  title: '',
  level,
  parentId,
  area: '',
  smart: {},
  woop: {},
  metric: { kind: 'check' },
  deadline: deadlineFor(level),
  status: 'active',
  history: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

export default function Goals() {
  const [level, setLevel] = useState<GoalLevel | 'all'>('all')
  const [wizard, setWizard] = useState<Goal | null>(null)
  const [detail, setDetail] = useState<number | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const ctx = useGoalCtx()
  const ref = useStagger<HTMLDivElement>([level])
  const list = ctx.goals
    .filter((g) => (level === 'all' ? true : g.level === level))
    .filter((g) => (showClosed ? true : g.status === 'active' || g.status === 'paused'))
    .sort((a, b) => LEVELS.findIndex((l) => l.value === a.level) - LEVELS.findIndex((l) => l.value === b.level) || (a.deadline || '').localeCompare(b.deadline || ''))
  const nav = useNavigate()

  return (
    <div>
      <PageHeader
        title="اهداف"
        sub="از چشم‌انداز تا کار امروز"
        back
        action={
          <button className="press h-10 rounded-full bg-surface-2 px-3 text-sm font-semibold" onClick={() => nav('/reviews')}>
            مرورها
          </button>
        }
      />
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        <Chip active={level === 'all'} onClick={() => setLevel('all')}>همه</Chip>
        {LEVELS.map((l) => (
          <Chip key={l.value} active={level === l.value} onClick={() => setLevel(l.value)}>
            {l.label}
          </Chip>
        ))}
      </div>
      {!list.length ? (
        <Card>
          <Empty
            icon={<Compass />}
            title="هنوز هدفی ننوشته‌ای"
            text="از بالا شروع کن: سه تا پنج سال دیگر می‌خواهی زندگی‌ات چه شکلی باشد؟ بعد آن را به هدف سالانه، ماهانه و هفتگی بشکن."
            action={<Button onClick={() => setWizard(blankGoal(level === 'all' ? 'vision' : level))}>ساخت هدف</Button>}
          />
        </Card>
      ) : (
        <div ref={ref} className="space-y-2.5">
          {list.map((g) => (
            <GoalCard key={g.id} g={g} ctx={ctx} onOpen={() => setDetail(g.id!)} />
          ))}
        </div>
      )}
      <button className="press mt-3 w-full py-2 text-sm text-muted" onClick={() => setShowClosed(!showClosed)}>
        {showClosed ? 'پنهان کردن اهداف بسته‌شده' : 'نمایش اهداف انجام‌شده و رهاشده'}
      </button>
      <Fab onClick={() => setWizard(blankGoal(level === 'all' ? 'month' : level))} label="هدف جدید" />
      <GoalWizard goal={wizard} ctx={ctx} onClose={() => setWizard(null)} />
      <GoalDetail id={detail} ctx={ctx} onClose={() => setDetail(null)} onEdit={(g) => { setDetail(null); setWizard(g) }} onChild={(g) => { setDetail(null); setWizard(g) }} />
    </div>
  )
}

export function GoalCard({ g, ctx, onOpen, compact }: { g: Goal; ctx: GoalCtx; onOpen?: () => void; compact?: boolean }) {
  const p = clamp01(goalProgress(g, ctx))
  const parent = g.parentId ? ctx.goals.find((x) => x.id === g.parentId) : undefined
  const left = g.deadline ? diffDays(g.deadline, todayKey()) : undefined
  return (
    <button className={`press block w-full text-start ${compact ? 'py-2' : 'card p-4'}`} onClick={onOpen}>
      <div className="flex items-center gap-2">
        {!compact && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">{levelLabel(g.level)}</span>}
        {g.status !== 'active' && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn">{STATUS[g.status]}</span>}
        <span className="min-w-0 flex-1 truncate font-bold">{g.title}</span>
        <span className="tnum text-sm font-bold">{pct(p)}</span>
      </div>
      <Progress value={p} className="mt-2" />
      {!compact && (
        <p className={`mt-2 truncate text-xs ${left !== undefined && left < 0 && g.status === 'active' ? 'text-bad' : 'text-muted'}`}>
          {[
            g.area,
            parent && `زیرمجموعهٔ «${parent.title}»`,
            left !== undefined && g.status === 'active' && (left < 0 ? `${fa(-left)} روز از مهلت گذشته` : left === 0 ? 'مهلت امروز' : `${fa(left)} روز مانده`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </button>
  )
}

/* ───────────── راهنمای ساخت هدف ───────────── */

const STEPS = ['پایه', 'چرا', 'SMART', 'WOOP', 'نیت اجرایی']

function GoalWizard({ goal, ctx, onClose }: { goal: Goal | null; ctx: GoalCtx; onClose: () => void }) {
  const [g, setG] = useState<Goal | null>(null)
  const [src, setSrc] = useState<Goal | null>(null)
  const [step, setStep] = useState(0)
  const [makeTask, setMakeTask] = useState(false)
  const [taskDays, setTaskDays] = useState<number[]>([])
  const [taskTime, setTaskTime] = useState('07:00')
  const areas = useLiveQuery(() => getSetting<string[]>('areas', []), []) || []
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).toArray(), []) || []
  if (goal && goal !== src) {
    setSrc(goal)
    setG(goal)
    setStep(0)
    setMakeTask(false)
    setTaskDays([weekIndex(todayKey())])
  }
  if (!g) return null
  const set = (p: Partial<Goal>) => setG({ ...g, ...p })
  const isNew = !g.id
  const pl = parentLevel(g.level)
  const parents = ctx.goals.filter((x) => x.status === 'active' && x.id !== g.id && LEVELS.findIndex((l) => l.value === x.level) < LEVELS.findIndex((l) => l.value === g.level))
  const outcomeLike = g.metric.kind === 'weight' || g.metric.kind === 'account' || g.metric.kind === 'number'

  const save = async () => {
    const now = Date.now()
    const data: Goal = { ...g, title: g.title.trim(), updatedAt: now }
    if (data.metric.kind === 'weight' && data.metric.start === undefined) data.metric = { ...data.metric, start: ctx.latestWeight }
    let id = data.id
    if (isNew) {
      data.history = [{ at: now, status: 'active' }]
      id = await db.goals.add(data)
      await logEvent('goal_created', id, { level: data.level })
    } else await db.goals.put(data)
    if (makeTask && taskDays.length && data.intention) {
      const r: Recurring = {
        kind: 'task',
        freq: taskDays.length === 7 ? 'daily' : 'weekly',
        weekdays: taskDays,
        start: todayKey(),
        until: data.deadline,
        template: { title: data.intention.slice(0, 80), start: taskTime, end: fromMinutes(taskTime, 30), allDay: false, priority: 2, subtasks: [], goalId: id, status: 'todo', postponed: 0 },
        skip: [],
      }
      await db.recurring.add(r)
      await ensureRecurringTasks(todayKey(), addDaysKey(todayKey(), 30))
      toast('هدف ذخیره شد و تسک تکراری‌اش در تقویم ساخته شد')
    } else toast('هدف ذخیره شد')
    onClose()
  }

  const canNext = step === 0 ? !!g.title.trim() : true
  return (
    <Sheet
      open={!!goal}
      onClose={onClose}
      full
      title={
        <span className="flex items-center gap-2">
          {isNew ? 'هدف جدید' : 'ویرایش هدف'}
          <span className="tnum text-sm font-normal text-muted">{fa(step + 1)} از {fa(STEPS.length)}</span>
        </span>
      }
      footer={
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="soft" onClick={() => setStep(step - 1)}>
              قبلی
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <>
              {g.title.trim() && step > 0 && (
                <Button variant="ghost" onClick={save}>
                  ذخیره
                </Button>
              )}
              <Button className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>
                بعدی: {STEPS[step + 1]}
              </Button>
            </>
          ) : (
            <Button className="flex-1" disabled={!g.title.trim()} onClick={save}>
              ذخیرهٔ هدف
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-4 flex gap-1">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => g.title.trim() && setStep(i)} className="flex-1" aria-label={s}>
            <span className={`block h-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-surface-2'}`} />
            <span className={`mt-1 block text-center text-[10px] ${i === step ? 'font-bold text-ink' : 'text-muted'}`}>{s}</span>
          </button>
        ))}
      </div>

      {step === 0 && (
        <div>
          <Label>سطح زمانی</Label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {LEVELS.map((l) => (
              <Chip key={l.value} active={g.level === l.value} onClick={() => set({ level: l.value, deadline: deadlineFor(l.value), parentId: undefined })}>
                {l.label}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{LEVELS.find((l) => l.value === g.level)?.hint}</p>
          <Label>عنوان هدف</Label>
          <input className="field" autoFocus={isNew} placeholder="مثلاً رسیدن به وزن ۷۵ کیلو" value={g.title} onChange={(e) => set({ title: e.target.value })} />
          <Label>حوزهٔ زندگی</Label>
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <Chip key={a} active={g.area === a} onClick={() => set({ area: a })}>
                {a}
              </Chip>
            ))}
          </div>
          {pl && parents.length > 0 && (
            <>
              <Label hint="هدف بزرگ‌تری که این هدف به آن کمک می‌کند">زیرمجموعهٔ</Label>
              <select className="field" value={g.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">هیچ‌کدام</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {levelLabel(p.level)}: {p.title}
                  </option>
                ))}
              </select>
            </>
          )}
          <Label>مهلت</Label>
          <DateField value={g.deadline || todayKey()} onChange={(deadline) => set({ deadline })} />
        </div>
      )}

      {step === 1 && (
        <div>
          <Tip>
            هدفی که به ارزش‌های خودت وصل باشد (انگیزهٔ درونی) خیلی بیشتر دوام می‌آورد تا هدفی که برای تأیید دیگران است. وقتی انگیزه افت کرد، این جواب را دوباره می‌خوانی.
          </Tip>
          <Label>چرا این هدف برایم مهم است؟</Label>
          <textarea className="field min-h-32 leading-8" placeholder="وقتی به این هدف برسم، زندگی‌ام چه فرقی می‌کند؟ به کدام ارزشم وصل است؟" value={g.why || ''} onChange={(e) => set({ why: e.target.value })} />
        </div>
      )}

      {step === 2 && (
        <div>
          <Tip>هدف خوب «SMART» است: مشخص، قابل‌اندازه‌گیری، دست‌یافتنی، مرتبط و زمان‌دار. مهلت را در مرحلهٔ اول تعیین کردی.</Tip>
          <Label>مشخص: دقیقاً چه چیزی؟</Label>
          <input className="field" placeholder="مثلاً هفته‌ای ۴ جلسه ورزش ۴۵ دقیقه‌ای" value={g.smart.specific || ''} onChange={(e) => set({ smart: { ...g.smart, specific: e.target.value } })} />
          <Label>قابل‌اندازه‌گیری: پیشرفت چطور سنجیده شود؟</Label>
          <div className="grid grid-cols-2 gap-2">
            {METRICS.map((m) => (
              <button
                key={m.value}
                onClick={() => set({ metric: { ...g.metric, kind: m.value } })}
                className={`press rounded-2xl p-3 text-start ${g.metric.kind === m.value ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2'}`}
              >
                <span className="block text-sm font-bold">{m.label}</span>
                <span className="block text-[11px] leading-5 text-muted">{m.hint}</span>
              </button>
            ))}
          </div>
          {g.metric.kind === 'number' && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div><p className="mb-1 text-xs text-muted">شروع</p><NumberField value={g.metric.start ?? 0} onChange={(v) => set({ metric: { ...g.metric, start: v } })} /></div>
              <div><p className="mb-1 text-xs text-muted">هدف</p><NumberField value={g.metric.target} onChange={(v) => set({ metric: { ...g.metric, target: v } })} /></div>
              <div><p className="mb-1 text-xs text-muted">واحد</p><input className="field h-12" placeholder="کتاب" value={g.metric.unit || ''} onChange={(e) => set({ metric: { ...g.metric, unit: e.target.value } })} /></div>
            </div>
          )}
          {g.metric.kind === 'weight' && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-muted">وزن هدف {ctx.latestWeight ? `(الان ${fa(ctx.latestWeight)} کیلو)` : ''}</p>
              <NumberField value={g.metric.target} onChange={(v) => set({ metric: { ...g.metric, target: v } })} suffix="کیلو" />
            </div>
          )}
          {g.metric.kind === 'account' && (
            <div className="mt-3 space-y-2">
              <select className="field" value={g.metric.accountId ?? ''} onChange={(e) => set({ metric: { ...g.metric, accountId: e.target.value ? Number(e.target.value) : undefined } })}>
                <option value="">انتخاب حساب</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <NumberField value={g.metric.target} onChange={(v) => set({ metric: { ...g.metric, target: v } })} suffix="تومان" placeholder="مبلغ هدف" />
            </div>
          )}
          <Label>دست‌یافتنی: با شرایط فعلی شدنی است؟</Label>
          <input className="field" placeholder="چه منابع، زمان یا مهارتی لازم دارم؟" value={g.smart.achievable || ''} onChange={(e) => set({ smart: { ...g.smart, achievable: e.target.value } })} />
          <Label>مرتبط: به کجای زندگی‌ام کمک می‌کند؟</Label>
          <input className="field" placeholder="مثلاً انرژی بیشتر برای کار و خانواده" value={g.smart.relevant || ''} onChange={(e) => set({ smart: { ...g.smart, relevant: e.target.value } })} />
          {outcomeLike && (
            <Tip icon={<Flag size={16} />}>
              این یک هدف «نتیجه‌ای» است. کنارش یک هدف «رفتاری» هم بساز (مثلاً «هفته‌ای ۴ بار ورزش»)؛ رفتار کاملاً در کنترل توست و نتیجه را می‌سازد.
            </Tip>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <Tip>روش WOOP (گابریله اوتینگن): فقط تصور موفقیت انگیزه را کم می‌کند. اگر مانع درونی را هم ببینی و برایش برنامه داشته باشی، احتمال رسیدن بیشتر می‌شود.</Tip>
          <Label>آرزو (Wish)</Label>
          <input className="field" placeholder="در یک جمله چه می‌خواهم؟" value={g.woop.wish || ''} onChange={(e) => set({ woop: { ...g.woop, wish: e.target.value } })} />
          <Label>بهترین نتیجه (Outcome)</Label>
          <textarea className="field min-h-20 leading-7" placeholder="وقتی برسم چه حسی دارم؟ تصورش کن." value={g.woop.outcome || ''} onChange={(e) => set({ woop: { ...g.woop, outcome: e.target.value } })} />
          <Label>مانع درونی (Obstacle)</Label>
          <textarea className="field min-h-20 leading-7" placeholder="چه چیزی در خودم جلویم را می‌گیرد؟ مثلاً خستگی بعد از کار" value={g.woop.obstacle || ''} onChange={(e) => set({ woop: { ...g.woop, obstacle: e.target.value } })} />
          <Label>برنامه (Plan): اگر … آنگاه …</Label>
          <textarea className="field min-h-20 leading-7" placeholder="اگر بعد از کار خسته بودم، آنگاه فقط ۱۰ دقیقه پیاده‌روی می‌کنم." value={g.woop.plan || ''} onChange={(e) => set({ woop: { ...g.woop, plan: e.target.value } })} />
        </div>
      )}

      {step === 4 && (
        <div>
          <Tip>نیت اجرایی یعنی تصمیم دقیق دربارهٔ «کی و کجا». پژوهش‌ها نشان می‌دهند همین جمله احتمال انجام کار را به‌طور قابل‌توجهی بالا می‌برد.</Tip>
          <Label>من … را در … در … انجام می‌دهم</Label>
          <textarea className="field min-h-24 leading-8" placeholder="من ۳۰ دقیقه دویدن را ساعت ۷ صبح در پارک نزدیک خانه انجام می‌دهم." value={g.intention || ''} onChange={(e) => set({ intention: e.target.value })} />
          <div className="mt-3 rounded-2xl bg-surface-2 p-3">
            <Toggle checked={makeTask} onChange={setMakeTask} label={<span className="flex items-center gap-2 text-sm font-semibold"><Repeat size={16} /> ساخت تسک تکراری در تقویم</span>} />
            {makeTask && (
              <>
                <div className="mt-2 flex justify-between gap-1">
                  {WEEK.map((w, i) => (
                    <button
                      key={w}
                      onClick={() => setTaskDays(taskDays.includes(i) ? taskDays.filter((x) => x !== i) : [...taskDays, i])}
                      className={`press size-9 rounded-full text-sm font-bold ${taskDays.includes(i) ? 'bg-accent text-accent-ink' : 'bg-surface text-muted'}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  ساعت
                  <input type="time" className="field tnum h-10 w-28 py-0" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} />
                </label>
                {!g.intention && <p className="mt-2 text-xs text-warn">اول جملهٔ نیت اجرایی را بنویس؛ عنوان تسک از آن ساخته می‌شود.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

const fromMinutes = (t: string, add: number) => {
  const [h, m] = t.split(':').map(Number)
  const v = Math.min(1439, h * 60 + m + add)
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

function Tip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mt-2 flex gap-2.5 rounded-2xl bg-accent-soft p-3 text-[13px] leading-7">
      <span className="mt-1 shrink-0 text-accent">{icon || <Lightbulb size={16} />}</span>
      <p>{children}</p>
    </div>
  )
}

/* ───────────── جزئیات هدف ───────────── */

function GoalDetail({ id, ctx, onClose, onEdit, onChild }: { id: number | null; ctx: GoalCtx; onClose: () => void; onEdit: (g: Goal) => void; onChild: (g: Goal) => void }) {
  const g = ctx.goals.find((x) => x.id === id)
  const [note, setNote] = useState('')
  const kids = g ? ctx.goals.filter((x) => x.parentId === g.id) : []
  const tasks = g ? ctx.tasks.filter((t) => t.goalId === g.id) : []
  const p = g ? clamp01(goalProgress(g, ctx)) : 0
  const childLevel = g ? LEVELS[LEVELS.findIndex((l) => l.value === g.level) + 1]?.value : undefined
  const setStatus = async (status: Goal['status']) => {
    if (!g) return
    await db.goals.update(g.id!, { status, updatedAt: Date.now(), history: [...g.history, { at: Date.now(), status, note: note || undefined }] })
    await logEvent('goal_status', g.id, { status })
    setNote('')
    toast(status === 'done' ? 'تبریک! هدف انجام شد' : `وضعیت: ${STATUS[status]}`)
  }
  return (
    <Sheet open={!!g} onClose={onClose} title={g?.title} full>
      {g && (
        <div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-bold">{levelLabel(g.level)}</span>
            {g.area && <span>{g.area}</span>}
            {g.deadline && <span>· مهلت {jLong(g.deadline)}</span>}
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-semibold">پیشرفت</span>
              <span className="tnum font-bold">{pct(p)}</span>
            </div>
            <Progress value={p} />
          </div>

          {g.metric.kind === 'check' && g.status === 'active' && (
            <Button block variant="soft" className="mt-3" onClick={() => db.goals.update(g.id!, { metric: { ...g.metric, done: !g.metric.done } })}>
              {g.metric.done ? 'برداشتن تیک' : 'انجام شد ✓'}
            </Button>
          )}
          {g.metric.kind === 'number' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-muted">مقدار فعلی</span>
              <NumberField className="flex-1" value={g.metric.current ?? g.metric.start ?? 0} onChange={(v) => db.goals.update(g.id!, { metric: { ...g.metric, current: v }, updatedAt: Date.now() })} suffix={`از ${num(g.metric.target || 0)} ${g.metric.unit || ''}`} />
            </div>
          )}
          {g.metric.kind === 'weight' && <p className="mt-2 text-xs text-muted">از {fa(g.metric.start ?? '—')} به {fa(g.metric.target ?? '—')} کیلو؛ خودکار از نمودار وزن به‌روز می‌شود.</p>}
          {g.metric.kind === 'tasks' && <p className="mt-2 text-xs text-muted">{fa(tasks.filter((t) => t.status === 'done').length)} از {fa(tasks.filter((t) => t.status !== 'dropped').length)} تسک متصل انجام شده.</p>}

          {g.why && <Section title="چرا مهم است">{g.why}</Section>}
          {(g.smart.specific || g.smart.achievable || g.smart.relevant) && (
            <Section title="SMART">
              {g.smart.specific && <p><b>مشخص:</b> {g.smart.specific}</p>}
              {g.smart.achievable && <p><b>دست‌یافتنی:</b> {g.smart.achievable}</p>}
              {g.smart.relevant && <p><b>مرتبط:</b> {g.smart.relevant}</p>}
            </Section>
          )}
          {(g.woop.wish || g.woop.obstacle || g.woop.plan) && (
            <Section title="WOOP">
              {g.woop.wish && <p><b>آرزو:</b> {g.woop.wish}</p>}
              {g.woop.outcome && <p><b>نتیجه:</b> {g.woop.outcome}</p>}
              {g.woop.obstacle && <p><b>مانع:</b> {g.woop.obstacle}</p>}
              {g.woop.plan && <p><b>برنامه:</b> {g.woop.plan}</p>}
            </Section>
          )}
          {g.intention && <Section title="نیت اجرایی">{g.intention}</Section>}

          {childLevel && (
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="font-bold">زیرهدف‌ها</h4>
                <button className="press text-sm font-semibold text-accent" onClick={() => onChild(blankGoal(childLevel, g.id))}>
                  + زیرهدف {levelLabel(childLevel)}
                </button>
              </div>
              {kids.length ? (
                <div className="divide-y divide-line">
                  {kids.map((k) => (
                    <GoalCard key={k.id} g={k} ctx={ctx} compact />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">هدف بزرگ را به قدم‌های کوچک‌تر بشکن.</p>
              )}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-1 flex items-center gap-2 font-bold"><CalendarCheck size={16} /> تسک‌های متصل</h4>
              <div className="divide-y divide-line text-sm">
                {tasks.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((t) => (
                  <div key={t.id} className="flex justify-between py-2">
                    <span className={t.status === 'done' ? 'text-muted line-through' : ''}>{t.title}</span>
                    <span className="text-muted">{jDayMonth(t.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-surface-2 p-3">
            <p className="mb-2 text-sm font-bold">تغییر وضعیت</p>
            <input className="field mb-2 bg-surface text-sm" placeholder="یادداشت (اختیاری)؛ مثلاً دلیل توقف" value={note} onChange={(e) => setNote(e.target.value)} />
            <Segmented
              value={g.status}
              onChange={setStatus}
              options={(['active', 'done', 'paused', 'dropped'] as const).map((s) => ({ value: s, label: STATUS[s] }))}
            />
            <p className="mt-2 text-xs leading-6 text-muted">رها کردن هدف شکست نیست؛ یعنی اولویت‌ها عوض شده. دلیلش را بنویس تا بعداً از آن یاد بگیریم.</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="soft" onClick={() => onEdit(g)}>
              ویرایش
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await db.goals.delete(g.id!)
                for (const k of kids) await db.goals.update(k.id!, { parentId: g.parentId })
                onClose()
                toast('هدف حذف شد', { label: 'بازگردانی', run: () => db.goals.add(g).then(() => undefined) })
              }}
            >
              حذف
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="mb-1 flex items-center gap-1 text-sm font-bold text-muted">
        <ChevronLeft size={14} className="rotate-180" />
        {title}
      </h4>
      <div className="space-y-1 text-[15px] leading-8">{children}</div>
    </div>
  )
}
