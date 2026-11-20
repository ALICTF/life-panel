import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronLeft, Flag, ClipboardList, HardDriveDownload, NotebookPen, Plus, ShieldOff, Target } from 'lucide-react'
import { db, getSetting, logEvent } from '../db/db'
import type { Goal, Task, Transaction } from '../db/types'
import { clamp01, goalProgress } from '../lib/goals'
import { addDaysKey, greeting, jLong, jMonthKey, jMonthRange, relDay, todayKey, tomorrowKey, weekIndex, weekStart } from '../lib/date'
import { fa, num, pct, shortMoney } from '../lib/format'
import { holidayOf } from '../lib/holidays'
import { habitStats } from '../lib/habits'
import { moveTask, newTask } from '../lib/tasks'
import { exportBackup } from '../lib/backup'
import { useStagger } from '../lib/anim'
import { Button, Card, Progress, Ring } from '../ui/kit'
import { toast } from '../ui/Toast'
import { HealthQuick, CheckIn } from './health-shared'
import { HabitRow } from './Habits'
import { TaskSheet } from './TaskSheet'
import { TaskRow, sortTasks, useTaskCats } from './task-ui'
import { PlanList } from './Planner'
import { TxSheet, blankTx } from './TxSheet'
import { GoalCard, useGoalCtx } from './Goals'
import { periodOf } from './Reviews'
import { QuickBar } from './QuickLog'

export default function Today() {
  const today = todayKey()
  const nav = useNavigate()
  const [task, setTask] = useState<Task | null>(null)
  const [tx, setTx] = useState<Transaction | null>(null)
  const cats = useTaskCats()
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(today).toArray(), [today]) || []
  const overdue = useLiveQuery(() => db.tasks.where('date').below(today).filter((t) => t.status === 'todo' && !t.recurId).toArray(), [today]) || []
  const habits = useLiveQuery(() => db.habits.where('status').equals('active').toArray(), []) || []
  const logs = useLiveQuery(() => db.habitLogs.toArray(), []) || []
  const plan = useLiveQuery(() => db.dayPlans.get(today), [today])
  const tomorrowPlan = useLiveQuery(() => db.dayPlans.get(tomorrowKey()), [])
  const lastBackup = useLiveQuery(() => getSetting<number>('lastBackup', 0), [])
  const seeded = useLiveQuery(() => getSetting<number>('seeded', Date.now()), [])
  const weekReview = useLiveQuery(() => db.reviews.where('start').equals(weekStart(today)).filter((r) => r.kind === 'week').first(), [today])
  const money = useLiveQuery(async () => {
    const { from, to } = jMonthRange(jMonthKey(today))
    const txs = await db.transactions.where('date').between(from, to, true, true).toArray()
    const budgets = await db.budgets.where('month').equals(jMonthKey(today)).toArray()
    return {
      today: txs.filter((t) => t.type === 'expense' && t.date === today).reduce((s, t) => s + t.amount, 0),
      month: txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      budget: budgets.reduce((s, b) => s + b.limit, 0),
    }
  }, [today])
  const ctx = useGoalCtx()
  const dueGoals = ctx.goals.filter((g) => g.status === 'active' && ((g.deadline && g.deadline < today) || clamp01(goalProgress(g, ctx)) >= 1))
  const weekGoals = ctx.goals.filter((g) => g.status === 'active' && (g.level === 'week' || g.level === 'month')).slice(0, 4)
  const ref = useStagger<HTMLDivElement>([])

  const sorted = [...tasks].filter((t) => t.status !== 'dropped').sort(sortTasks)
  const doneCount = sorted.filter((t) => t.status === 'done').length
  const habitDone = habits.filter((h) => habitStats(h, logs).todayDone === (h.type === 'good')).length
  const hol = holidayOf(today)
  const hour = new Date().getHours()
  const needBackup = (lastBackup || seeded || 0) < Date.now() - 7 * 864e5
  const showPlanTomorrow = hour >= 18 && !tomorrowPlan?.plannedAt
  const isFriday = weekIndex(today) === 6
  const hasPlan = (plan?.musts.length || 0) + (plan?.mustNots.length || 0) > 0
  const goodHabits = habits.filter((h) => h.type === 'good')
  const badHabits = habits.filter((h) => h.type === 'bad')

  return (
    <div>
      <header className="pt-[calc(env(safe-area-inset-top)+16px)] pb-3">
        <p className="deco text-sm text-muted">{greeting()}</p>
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">{jLong(today)}</h1>
        {hol && <p className="mt-1 text-sm font-medium text-bad">تعطیل رسمی: {hol}</p>}
      </header>

      <div ref={ref} className="space-y-3">
        {/* خلاصهٔ روز */}
        <div className="card flex items-center justify-around p-4">
          <SummaryRing label="تسک‌ها" value={sorted.length ? doneCount / sorted.length : 0} text={`${fa(doneCount)}/${fa(sorted.length)}`} />
          <SummaryRing label="عادت‌ها" value={habits.length ? habitDone / habits.length : 0} text={`${fa(habitDone)}/${fa(habits.length)}`} color="var(--good)" />
          <SummaryRing label="بایدها" value={plan?.musts.length ? plan.musts.filter((m) => m.done).length / plan.musts.length : 0} text={plan?.musts.length ? `${fa(plan.musts.filter((m) => m.done).length)}/${fa(plan.musts.length)}` : '—'} color="var(--warn)" />
        </div>

        {/* ثبت سریع */}
        <div>
          <QuickBar />
        </div>

        {/* یادآوری‌های داخلی */}
        {overdue.length > 0 && (
          <Card
            className="border-warn"
            title={
              <span className="flex items-center gap-2">
                <AlertCircle size={18} className="text-warn" /> جامانده‌ها
              </span>
            }
            action={<span className="text-xs text-muted">{fa(overdue.length)} تسک</span>}
          >
            <div className="-mt-1 max-h-48 divide-y divide-line overflow-y-auto">
              {overdue.sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                <TaskRow key={t.id} t={t} cats={cats} onOpen={setTask} showDate={relDay(t.date)} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="soft"
                className="h-10 text-sm"
                onClick={async () => {
                  for (const t of overdue) await moveTask(t, today)
                  toast('همه به امروز منتقل شدند')
                }}
              >
                همه به امروز
              </Button>
              <Button
                variant="ghost"
                className="h-10 text-sm text-muted"
                onClick={async () => {
                  const ids = overdue.map((t) => t.id!)
                  await db.tasks.bulkUpdate(ids.map((id) => ({ key: id, changes: { status: 'dropped' as const } })))
                  toast('رها شدند', { label: 'بازگردانی', run: () => db.tasks.bulkUpdate(ids.map((id) => ({ key: id, changes: { status: 'todo' as const } }))).then(() => undefined) })
                }}
              >
                رها کن
              </Button>
            </div>
          </Card>
        )}

        {dueGoals.map((g) => {
          const reached = clamp01(goalProgress(g, ctx)) >= 1
          const close = async (status: Goal['status']) => {
            await db.goals.update(g.id!, { status, updatedAt: Date.now(), history: [...g.history, { at: Date.now(), status }] })
            await logEvent('goal_status', g.id, { status, auto: true })
            toast(status === 'done' ? 'تبریک! هدف انجام شد' : 'هدف رها شد')
          }
          return (
            <div key={g.id} className={`rounded-2xl p-4 ${reached ? 'bg-good-soft' : 'bg-warn-soft'}`}>
              <p className="flex items-center gap-2 text-sm">
                <Flag size={16} className={reached ? 'text-good' : 'text-warn'} />
                <span className="min-w-0 flex-1">
                  {reached ? 'به هدف رسیدی: ' : 'مهلت این هدف تمام شد: '}
                  <b>{g.title}</b>
                </span>
              </p>
              <div className="mt-3 flex gap-2">
                <button className="press flex-1 rounded-xl bg-surface py-2 text-sm font-bold" onClick={() => close('done')}>
                  انجام شد
                </button>
                {!reached && (
                  <button
                    className="press flex-1 rounded-xl bg-surface py-2 text-sm font-semibold"
                    onClick={async () => {
                      const span = { week: 7, month: 30, quarter: 90, year: 365, vision: 365 }[g.level]
                      await db.goals.update(g.id!, { deadline: addDaysKey(today, span), updatedAt: Date.now() })
                      toast('مهلت تمدید شد')
                    }}
                  >
                    تمدید
                  </button>
                )}
                {!reached && (
                  <button className="press rounded-xl px-3 py-2 text-sm text-muted" onClick={() => close('dropped')}>
                    رها کن
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {showPlanTomorrow && (
          <Reminder icon={<ClipboardList size={18} />} text="پلنر فردا را هنوز پر نکرده‌ای." action="پر کردن" onClick={() => nav('/planner')} />
        )}
        {isFriday && !weekReview && (
          <Reminder icon={<NotebookPen size={18} />} text={`مرور ${periodOf('week').label} آماده است.`} action="شروع" onClick={() => nav('/reviews')} />
        )}
        {needBackup && (
          <Reminder
            icon={<HardDriveDownload size={18} />}
            text="بیش از یک هفته است پشتیبان نگرفته‌ای."
            action="پشتیبان"
            onClick={async () => {
              await exportBackup()
              toast('فایل پشتیبان ذخیره شد')
            }}
          />
        )}

        {/* سلامت */}
        <Card title="سلامت امروز" action={<MoreLink to="/health" />}>
          <HealthQuick />
          <div className="mt-4 border-t border-line pt-3">
            <CheckIn />
          </div>
        </Card>

        {/* عادت‌ها */}
        <Card title="عادت‌های امروز" action={<MoreLink to="/habits" />}>
          {habits.length === 0 ? (
            <EmptyLine text="هنوز عادتی تعریف نکرده‌ای." to="/habits" action="افزودن عادت" />
          ) : (
            <div className="space-y-3">
              {goodHabits.length > 0 && (
                <div className="space-y-2.5">
                  {goodHabits.map((h) => (
                    <HabitRow key={h.id} h={h} logs={logs} compact />
                  ))}
                </div>
              )}
              {badHabits.length > 0 && (
                <div className="space-y-2.5 border-t border-line pt-3">
                  <p className="text-xs text-muted">عادت‌های بد؛ فقط اگر انجامش دادی تیک بزن</p>
                  {badHabits.map((h) => (
                    <HabitRow key={h.id} h={h} logs={logs} compact />
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* تسک‌ها */}
        <Card
          title="تسک‌های امروز"
          action={
            <button className="press grid size-9 place-items-center rounded-full bg-surface-2" onClick={() => setTask(newTask({ date: today }))} aria-label="تسک جدید">
              <Plus size={18} />
            </button>
          }
        >
          {sorted.length === 0 ? (
            <EmptyLine text="برای امروز تسکی نداری." to="/calendar" action="باز کردن تقویم" />
          ) : (
            <div className="-mt-1 divide-y divide-line">
              {sorted.map((t) => (
                <TaskRow key={t.id} t={t} cats={cats} onOpen={setTask} />
              ))}
            </div>
          )}
        </Card>

        {/* بایدها و نبایدها */}
        <Card title="بایدها و نبایدهای امروز" action={<MoreLink to="/planner" />}>
          {!hasPlan && <p className="mb-2 text-xs text-muted">بهتر است شب قبل در پلنر نوشته شوند؛ اما الان هم می‌توانی اضافه کنی.</p>}
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Target size={15} className="text-good" /> بایدها</p>
          <PlanList date={today} field="musts" plan={plan} placeholder="مهم‌ترین کار امروز" tone="good" max={3} />
          <p className="mt-4 mb-1 flex items-center gap-1.5 text-sm font-semibold"><ShieldOff size={15} className="text-bad" /> نبایدها</p>
          <PlanList date={today} field="mustNots" plan={plan} placeholder="کاری که امروز نباید بکنم" tone="bad" />
        </Card>

        {/* مالی */}
        <Card title="مالی" action={<MoreLink to="/money" />}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted">خرج امروز</p>
              <p className="tnum text-2xl font-extrabold">{num(money?.today || 0)} <span className="text-sm font-medium text-muted">تومان</span></p>
            </div>
            <Button className="h-11 text-sm" onClick={() => setTx(blankTx())}>
              <Plus size={18} /> ثبت خرج
            </Button>
          </div>
          {money && money.budget > 0 ? (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>خرج این ماه</span>
                <span className="tnum">{shortMoney(money.month)} از {shortMoney(money.budget)} ({pct(money.month / money.budget)})</span>
              </div>
              <Progress value={money.month / money.budget} color={money.month > money.budget ? 'var(--bad)' : money.month > money.budget * 0.8 ? 'var(--warn)' : undefined} />
            </div>
          ) : (
            money && money.month > 0 && <p className="tnum mt-2 text-xs text-muted">خرج این ماه: {shortMoney(money.month)} تومان</p>
          )}
        </Card>

        {/* اهداف */}
        <Card title="اهداف جاری" action={<MoreLink to="/goals" />}>
          {weekGoals.length === 0 ? (
            <EmptyLine text="هدف هفتگی یا ماهانه‌ای نداری." to="/goals" action="تعیین هدف" />
          ) : (
            <div className="divide-y divide-line">
              {weekGoals.map((g) => (
                <GoalCard key={g.id} g={g} ctx={ctx} compact onOpen={() => nav('/goals')} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <TaskSheet task={task} onClose={() => setTask(null)} />
      <TxSheet tx={tx} onClose={() => setTx(null)} />
    </div>
  )
}

function SummaryRing({ label, value, text, color }: { label: string; value: number; text: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Ring value={value} size={62} stroke={6} color={color}>
        <span className="tnum text-[13px]">{text}</span>
      </Ring>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

function Reminder({ icon, text, action, onClick }: { icon: React.ReactNode; text: string; action: string; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3">
      <span className="text-warn">{icon}</span>
      <p className="flex-1 text-sm">{text}</p>
      <button className="press rounded-xl bg-surface px-3 py-1.5 text-sm font-bold" onClick={onClick}>
        {action}
      </button>
    </div>
  )
}

function MoreLink({ to }: { to: string }) {
  return (
    <Link to={to} className="press flex items-center text-sm font-semibold text-muted" aria-label="بیشتر">
      همه <ChevronLeft size={16} />
    </Link>
  )
}

function EmptyLine({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{text}</span>
      <Link to={to} className="press font-semibold text-accent">
        {action}
      </Link>
    </div>
  )
}
