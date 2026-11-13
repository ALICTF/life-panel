import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NotebookPen } from 'lucide-react'
import { db } from '../db/db'
import type { Review } from '../db/types'
import { addDaysKey, jDayMonth, jMonthKey, jMonthLabel, jMonthRange, jYear, jYearRange, rangeKeys, todayKey, weekStart } from '../lib/date'
import { fa, num, pct, shortMoney } from '../lib/format'
import { habitStats } from '../lib/habits'
import { Button, Card, Empty, Label, PageHeader, Segmented } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/Toast'
import { useStagger } from '../lib/anim'

type Kind = Review['kind']

export function periodOf(kind: Kind, ref = todayKey()) {
  if (kind === 'week') {
    const s = weekStart(ref)
    return { start: s, end: addDaysKey(s, 6), label: `هفتهٔ ${jDayMonth(s)} تا ${jDayMonth(addDaysKey(s, 6))}` }
  }
  if (kind === 'month') {
    const mk = jMonthKey(ref)
    const r = jMonthRange(mk)
    return { start: r.from, end: r.to, label: jMonthLabel(mk) }
  }
  const y = jYear(ref)
  const r = jYearRange(y)
  return { start: r.from, end: r.to, label: `سال ${fa(y)}` }
}

export async function computeStats(start: string, end: string) {
  const to = end < todayKey() ? end : todayKey()
  const tasks = await db.tasks.where('date').between(start, to, true, true).toArray()
  const done = tasks.filter((t) => t.status === 'done').length
  const planned = tasks.filter((t) => t.status !== 'dropped').length
  const postponed = (await db.events.where('at').between(new Date(start + 'T00:00').getTime(), new Date(to + 'T23:59:59').getTime()).filter((e) => e.kind === 'task_postponed').count())
  const health = await db.health.where('date').between(start, to, true, true).toArray()
  const w = health.filter((h) => h.weight)
  const pai = health.reduce((s, h) => s + (h.pai || 0), 0)
  const moods = health.filter((h) => h.mood)
  const txs = await db.transactions.where('date').between(start, to, true, true).toArray()
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const habits = await db.habits.toArray()
  const logs = await db.habitLogs.where('date').between(start, to, true, true).toArray()
  // نرخ موفقیت عادت‌ها در همین بازه
  let ok = 0
  let all = 0
  for (const h of habits) {
    const s = habitStats(h, logs, to)
    for (const d of s.days) if (d.k >= start && d.k <= to && (d.state === 'ok' || d.state === 'fail')) {
      all++
      if (d.state === 'ok') ok++
    }
  }
  const plans = await db.dayPlans.where('date').between(start, to, true, true).toArray()
  const days = rangeKeys(start, to).length
  return {
    tasksDone: done,
    tasksPlanned: planned,
    postponed,
    habitRate: all ? ok / all : -1,
    weightChange: w.length >= 2 ? +(w[w.length - 1].weight! - w[0].weight!).toFixed(1) : 0,
    paiSum: pai,
    avgMood: moods.length ? +(moods.reduce((s, h) => s + h.mood!, 0) / moods.length).toFixed(1) : 0,
    expense,
    income,
    plannedDays: plans.filter((p) => p.plannedAt).length,
    days,
  }
}

export default function Reviews() {
  const [kind, setKind] = useState<Kind>('week')
  const [open, setOpen] = useState<Review | null>(null)
  const reviews = useLiveQuery(() => db.reviews.where('kind').equals(kind).reverse().sortBy('start'), [kind]) || []
  const ref = useStagger<HTMLDivElement>([kind])
  const cur = periodOf(kind)
  const has = reviews.find((r) => r.start === cur.start)

  const startNew = async () => {
    if (has) return setOpen(has)
    const stats = await computeStats(cur.start, cur.end)
    setOpen({ kind, start: cur.start, end: cur.end, stats, answers: {}, createdAt: Date.now() })
  }

  return (
    <div>
      <PageHeader title="مرورها" sub="نگاه به عقب، برای قدم بعدی" back />
      <Segmented
        className="mb-3"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'week', label: 'هفتگی' },
          { value: 'month', label: 'ماهانه' },
          { value: 'year', label: 'سالانه' },
        ]}
      />
      <Card className="mb-3">
        <p className="text-sm text-muted">دورهٔ فعلی</p>
        <p className="font-bold">{cur.label}</p>
        <Button block className="mt-3" onClick={startNew}>
          {has ? 'ادامهٔ مرور' : 'شروع مرور'}
        </Button>
      </Card>
      {!reviews.length ? (
        <Card>
          <Empty icon={<NotebookPen />} title="هنوز مروری ثبت نشده" text="هر جمعه چند دقیقه وقت بگذار. آمار هفته از قبل آماده است؛ فقط سه سؤال کوتاه جواب می‌دهی." />
        </Card>
      ) : (
        <div ref={ref} className="space-y-2.5">
          {reviews.map((r) => (
            <button key={r.id} className="card press block w-full p-4 text-start" onClick={() => setOpen(r)}>
              <p className="font-bold">{periodOf(r.kind, r.start).label}</p>
              <p className="mt-1 text-xs text-muted">
                تسک‌ها {fa(r.stats.tasksDone)} از {fa(r.stats.tasksPlanned)}
                {Number(r.stats.habitRate) >= 0 && ` · عادت‌ها ${pct(Number(r.stats.habitRate))}`}
                {` · خرج ${shortMoney(Number(r.stats.expense))}`}
              </p>
              {r.answers.change && <p className="mt-2 line-clamp-2 text-sm leading-7">{r.answers.change}</p>}
            </button>
          ))}
        </div>
      )}
      <ReviewSheet r={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function ReviewSheet({ r, onClose }: { r: Review | null; onClose: () => void }) {
  const [cur, setCur] = useState<Review | null>(null)
  const [src, setSrc] = useState<Review | null>(null)
  if (r && r !== src) {
    setSrc(r)
    setCur(r)
  }
  if (!cur) return null
  const s = cur.stats as Record<string, number>
  const set = (a: Partial<Review['answers']>) => setCur({ ...cur, answers: { ...cur.answers, ...a } })
  const rows: [string, string][] = [
    ['تسک‌های انجام‌شده', `${num(s.tasksDone)} از ${num(s.tasksPlanned)}${s.tasksPlanned ? ` (${pct(s.tasksDone / s.tasksPlanned)})` : ''}`],
    ['عقب‌افتادن تسک‌ها', `${num(s.postponed)} بار`],
    ['موفقیت عادت‌ها', s.habitRate >= 0 ? pct(s.habitRate) : '—'],
    ['تغییر وزن', s.weightChange ? `${s.weightChange > 0 ? '+' : ''}${fa(s.weightChange)} کیلو` : '—'],
    ['مجموع PAI', num(s.paiSum)],
    ['میانگین حال', s.avgMood ? `${fa(s.avgMood)} از ۵` : '—'],
    ['درآمد', shortMoney(s.income)],
    ['خرج', shortMoney(s.expense)],
    ['روزهایی که پلنر شب قبل پر شد', `${num(s.plannedDays)} از ${num(s.days)}`],
  ]
  return (
    <Sheet
      open={!!r}
      onClose={onClose}
      full
      title={periodOf(cur.kind, cur.start).label}
      footer={
        <Button
          block
          onClick={async () => {
            await db.reviews.put(cur)
            toast('مرور ذخیره شد')
            onClose()
          }}
        >
          ذخیرهٔ مرور
        </Button>
      }
    >
      <div className="divide-y divide-line rounded-2xl bg-surface-2 px-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-2.5 text-sm">
            <span className="text-muted">{k}</span>
            <span className="tnum font-bold">{v}</span>
          </div>
        ))}
      </div>
      <button
        className="press mt-2 text-xs font-semibold text-accent"
        onClick={async () => setCur({ ...cur, stats: await computeStats(cur.start, cur.end) })}
      >
        به‌روزرسانی آمار
      </button>
      <Label>چه چیزی خوب پیش رفت؟</Label>
      <textarea className="field min-h-24 leading-8" placeholder="حتی موفقیت‌های کوچک را بنویس." value={cur.answers.good || ''} onChange={(e) => set({ good: e.target.value })} />
      <Label>چه چیزی خوب پیش نرفت؟ چرا؟</Label>
      <textarea className="field min-h-24 leading-8" placeholder="بدون سرزنش؛ فقط علت را پیدا کن." value={cur.answers.bad || ''} onChange={(e) => set({ bad: e.target.value })} />
      <Label>دورهٔ بعد چه چیزی را تغییر می‌دهم؟</Label>
      <textarea className="field min-h-24 leading-8" placeholder="یک یا دو تغییر مشخص." value={cur.answers.change || ''} onChange={(e) => set({ change: e.target.value })} />
    </Sheet>
  )
}
