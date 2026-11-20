import { db, logEvent } from '../db/db'
import type { LearnItem, LearnKind, LearnLog, Recurring, Task } from '../db/types'
import { addDaysKey, diffDays, fromMin, rangeKeys, todayKey, toMin, weekIndex } from './date'
import { ensureRecurringTasks } from './tasks'

export const KINDS: { v: LearnKind; label: string; icon: string; unit: string; unitShort: string }[] = [
  { v: 'language', label: 'زبان', icon: '🗣️', unit: 'دقیقه', unitShort: 'دقیقه' },
  { v: 'skill', label: 'مهارت', icon: '🛠️', unit: 'درس', unitShort: 'درس' },
  { v: 'book', label: 'کتاب', icon: '📖', unit: 'صفحه', unitShort: 'ص' },
]
export const kindMeta = (k: LearnKind) => KINDS.find((x) => x.v === k)!

export const SOURCES = [
  { v: 'youtube', label: 'یوتیوب', icon: '▶️' },
  { v: 'site', label: 'سایت', icon: '🌐' },
  { v: 'online', label: 'کلاس آنلاین', icon: '💻' },
  { v: 'class', label: 'کلاس حضوری', icon: '🏫' },
  { v: 'app', label: 'اپلیکیشن', icon: '📱' },
  { v: 'book', label: 'کتاب', icon: '📚' },
  { v: 'podcast', label: 'پادکست', icon: '🎧' },
  { v: 'mentor', label: 'استاد / منتور', icon: '🧑‍🏫' },
  { v: 'other', label: 'سایر', icon: '✳️' },
]
export const sourceMeta = (v?: string) => SOURCES.find((x) => x.v === v)

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const LANG_SKILLS = ['شنیدن', 'صحبت', 'خواندن', 'نوشتن', 'لغت', 'گرامر']

export const blankItem = (kind: LearnKind): LearnItem => ({
  kind,
  title: '',
  source: { type: kind === 'book' ? 'book' : kind === 'language' ? 'app' : 'youtube' },
  current: 0,
  schedule: { days: [], minutes: kind === 'book' ? 20 : 30 },
  minDaily: kind === 'book' ? 2 : 5,
  startDate: todayKey(),
  status: 'active',
  project: [],
  order: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

/** آیا این روز در برنامهٔ این مورد هست؟ */
export const scheduledOn = (it: LearnItem, k: string) => !!it.schedule?.days.includes(weekIndex(k))

export interface LearnStats {
  progress?: number
  todayDone: boolean
  todayAmount: number
  todayMinutes: number
  streak: number
  weekMinutes: number
  weekAmount: number
  weekSessions: number
  perDay?: number // مقدار لازم در روز برای رسیدن به مهلت
  behind?: number // مقدار عقب‌افتادگی
  daysLeft?: number
  eta?: string // پیش‌بینی پایان با سرعت فعلی
  days: { k: string; state: 'full' | 'min' | 'miss' | 'none' | 'future' }[]
}

/** مقدار هر ثبت به واحد اصلی (کتاب: صفحه، مهارت: درس یا دقیقه، زبان: دقیقه) */
const value = (it: LearnItem, l: LearnLog) => (it.kind === 'language' ? l.minutes || 0 : l.amount || 0)

export function learnStats(it: LearnItem, logs: LearnLog[], today = todayKey()): LearnStats {
  const mine = logs.filter((l) => l.itemId === it.id)
  const byDay = new Map<string, { amount: number; minutes: number }>()
  for (const l of mine) {
    const d = byDay.get(l.date) || { amount: 0, minutes: 0 }
    d.amount += value(it, l)
    d.minutes += l.minutes || 0
    byDay.set(l.date, d)
  }
  const min = it.minDaily || 1
  const target = it.kind === 'book' ? Math.max(min, 1) : it.schedule?.minutes || min
  const met = (k: string) => {
    const d = byDay.get(k)
    if (!d) return 0
    const v = it.kind === 'book' ? d.amount : Math.max(d.minutes, it.kind === 'skill' ? (d.amount ? min : 0) : 0)
    return v >= target ? 2 : v >= min || d.amount > 0 || d.minutes > 0 ? 1 : 0
  }
  // رشته: روزهای پشت‌سرهم با حداقل؛ امروز اگر هنوز ثبت نشده رشته را نمی‌شکند
  let streak = 0
  for (let k = met(today) ? today : addDaysKey(today, -1); k >= it.startDate; k = addDaysKey(k, -1)) {
    if (met(k)) streak++
    else break
  }
  const from30 = addDaysKey(today, -29)
  const days = rangeKeys(from30, today).map((k) => {
    if (k < it.startDate) return { k, state: 'future' as const }
    const m = met(k)
    if (m === 2) return { k, state: 'full' as const }
    if (m === 1) return { k, state: 'min' as const }
    if (k < today && scheduledOn(it, k)) return { k, state: 'miss' as const }
    return { k, state: 'none' as const }
  })
  const wk = rangeKeys(addDaysKey(today, -6), today)
  const weekLogs = mine.filter((l) => l.date >= wk[0])
  const t = byDay.get(today)

  const s: LearnStats = {
    todayDone: met(today) > 0,
    todayAmount: t?.amount || 0,
    todayMinutes: t?.minutes || 0,
    streak,
    weekMinutes: weekLogs.reduce((a, l) => a + (l.minutes || 0), 0),
    weekAmount: weekLogs.reduce((a, l) => a + value(it, l), 0),
    weekSessions: new Set(weekLogs.map((l) => l.date)).size,
    days,
  }
  if (it.total && it.kind !== 'language') {
    const cur = it.current || 0
    s.progress = cur / it.total
    const remaining = Math.max(0, it.total - cur)
    // سرعت ۱۴ روز اخیر
    const recent = mine.filter((l) => l.date >= addDaysKey(today, -13)).reduce((a, l) => a + value(it, l), 0)
    const rate = recent / Math.min(14, Math.max(1, diffDays(today, it.startDate) + 1))
    if (rate > 0 && remaining > 0) s.eta = addDaysKey(today, Math.ceil(remaining / rate))
    if (it.deadline) {
      const daysLeft = diffDays(it.deadline, today) + 1
      s.daysLeft = daysLeft
      if (daysLeft > 0) s.perDay = Math.ceil(remaining / daysLeft)
      const start = it.startValue ?? 0
      const span = diffDays(it.deadline, it.startDate) + 1
      const elapsed = Math.min(span, diffDays(today, it.startDate))
      if (span > 0) {
        const expected = start + ((it.total - start) * elapsed) / span
        const behind = Math.round(expected - cur)
        if (behind > 0) s.behind = behind
      }
    }
  }
  return s
}

/** برنامهٔ زمانی هر مورد → تسک تکراری ساعت‌دار در تقویم (نیت اجرایی) */
export async function syncSchedule(it: LearnItem): Promise<number | undefined> {
  const sch = it.schedule
  const old = it.recurId ? await db.recurring.get(it.recurId) : undefined
  const today = todayKey()
  const active = it.status === 'active' && sch && sch.days.length > 0 && sch.time
  if (old) {
    // نمونه‌های آینده‌ٔ قبلی پاک و قانون قبلی بسته می‌شود
    await db.recurring.update(old.id!, { until: addDaysKey(today, -1) })
    const future = await db.tasks.where('recurId').equals(old.id!).filter((t) => t.date >= today && t.status === 'todo').primaryKeys()
    await db.tasks.bulkDelete(future)
  }
  if (!active) return undefined
  const icon = kindMeta(it.kind).icon
  const r: Recurring = {
    kind: 'task',
    freq: sch!.days.length === 7 ? 'daily' : 'weekly',
    weekdays: sch!.days,
    start: today,
    until: it.deadline,
    template: {
      title: `${icon} ${it.title}`,
      start: sch!.time,
      end: fromMin(Math.min(24 * 60 - 1, toMin(sch!.time!) + (sch!.minutes || 30))),
      allDay: false,
      priority: 2,
      subtasks: [],
      status: 'todo',
      learnId: it.id,
      goalId: it.goalId,
    } as Partial<Task>,
    skip: [],
  }
  const id = await db.recurring.add(r)
  await ensureRecurringTasks(today, addDaysKey(today, 21))
  return id
}

/** ثبت پیشرفت: مقدار جدید، تسک امروز تیک می‌خورد، کتاب تمام‌شده بسته می‌شود */
export async function addLearnLog(it: LearnItem, log: Omit<LearnLog, 'id' | 'itemId' | 'date' | 'at'>) {
  const today = todayKey()
  await db.learnLogs.add({ ...log, itemId: it.id!, date: today, at: Date.now() })
  const patch: Partial<LearnItem> = { updatedAt: Date.now() }
  if (log.toValue !== undefined) patch.current = log.toValue
  else if (log.amount && it.kind !== 'language') patch.current = (it.current || 0) + log.amount
  let finished = false
  if (it.total && patch.current !== undefined && patch.current >= it.total) {
    patch.status = 'done'
    finished = true
  }
  await db.learn.update(it.id!, patch)
  const t = await db.tasks.where('date').equals(today).filter((x) => x.learnId === it.id && x.status === 'todo').first()
  if (t) await db.tasks.update(t.id!, { status: 'done', doneAt: Date.now() })
  await logEvent('learn', it.id, { kind: it.kind, minutes: log.minutes, amount: log.amount, hour: new Date().getHours() })
  if (finished && it.recurId) await syncSchedule({ ...it, status: 'done' })
  return finished
}
