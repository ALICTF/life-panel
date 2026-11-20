import { db, setSetting, TABLES } from '../db/db'
import { habitStats } from './habits'
import { jShort, todayKey, weekIndex, weekStart } from './date'

const APP = 'panel'
const VERSION = 1

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

async function dumpAll() {
  const tables: Record<string, unknown[]> = {}
  for (const t of TABLES) tables[t] = await db.table(t).toArray()
  return tables
}

export async function exportBackup() {
  const tables = await dumpAll()
  download(`panel-backup-${jShort(todayKey()).replace(/\//g, '-')}.json`, { app: APP, version: VERSION, exportedAt: new Date().toISOString(), tables })
  await setSetting('lastBackup', Date.now())
}

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  tables: Record<string, unknown[]>
}

export async function readBackup(file: File): Promise<BackupFile> {
  const data = JSON.parse(await file.text())
  if (data?.app !== APP || typeof data.tables !== 'object') throw new Error('این فایل پشتیبان این برنامه نیست.')
  return data
}

export async function restoreBackup(data: BackupFile) {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      const rows = data.tables[t]
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkAdd(rows)
    }
  })
}

export async function wipeAll() {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear()
  })
}

const SCHEMA = {
  توضیح: 'خروجی داشبورد شخصی برای تحلیل الگوهای رفتاری. تاریخ‌ها میلادی (yyyy-MM-dd)، مبالغ به تومان، زمان‌ها میلی‌ثانیهٔ یونیکس.',
  health: 'سلامت روزانه: weight وزن (کیلوگرم)، pai امتیاز PAI ساعت، mood حال ۱ تا ۵، energy انرژی ۱ تا ۵، sleep ساعت خواب',
  habits: 'عادت‌ها: type خوب (good) یا بد (bad)، days طول دوره، start شروع، result نتیجهٔ دورهٔ بایگانی‌شده',
  habitLogs: 'هر ردیف یعنی آن عادت آن روز انجام شده. برای عادت بد یعنی لغزش. at زمان دقیق تیک، trigger علت لغزش',
  tasks: 'تسک‌ها: date روز فعلی، originalDate روز برنامه‌ریزی اولیه، postponed تعداد عقب‌افتادن، start/end ساعت برنامه، doneAt زمان واقعی انجام، status: todo/done/dropped',
  dayPlans: 'پلنر روزانه: musts بایدها، mustNots نبایدها، plannedAt زمان پر کردن پلنر',
  goals: 'اهداف با سطح (vision/year/quarter/month/week)، SMART، WOOP، نیت اجرایی و تاریخچهٔ وضعیت',
  reviews: 'مرورهای هفتگی، ماهانه و سالانه با آمار و پاسخ‌ها',
  accounts: 'حساب‌ها و موجودی اولیه',
  transactions: 'تراکنش‌ها: type خرج/درآمد/انتقال/اصلاح/بدهی، feel: need ضروری یا impulse هیجانی، time ساعت ثبت',
  categories: 'دسته‌های خرج، درآمد و تسک',
  budgets: 'بودجهٔ ماهانهٔ هر دسته (ماه شمسی)',
  debts: 'طلب (lent) و بدهی (borrowed) با پرداخت‌ها',
  notes: 'یادداشت‌ها با برچسب',
  meals: 'وعده‌ها: type صبحانه/ناهار/شام/میان‌وعده (snack)، time ساعت، carbs کربوهیدرات داشت',
  meds: 'داروها با times ساعت برنامهٔ هر نوبت',
  medLogs: 'مصرف دارو: dose شمارهٔ نوبت، at زمان واقعی مصرف',
  workouts: 'ورزش: type نوع، minutes مدت، intensity شدت ۱ تا ۳',
  focus: 'جلسه‌های تمرکز: planned دقیقهٔ برنامه، actual دقیقهٔ واقعی، completed تا آخر رفت یا نه، taskId تسک مربوط',
  events: 'لاگ رفتاری: app_open_day، habit_done، habit_slip (با ساعت)، task_done (با ساعت و تأخیر)، task_postponed و غیره',
}

export async function exportForAnalysis() {
  const tables = await dumpAll()
  const habits = await db.habits.toArray()
  const logs = await db.habitLogs.toArray()
  const tasks = await db.tasks.toArray()
  const health = await db.health.toArray()
  const txs = await db.transactions.toArray()
  const meals = await db.meals.toArray()
  const workouts = await db.workouts.toArray()
  const focus = await db.focus.toArray()

  // خلاصهٔ هفتگی
  const today = todayKey()
  const weeks = new Map<string, { tasksPlanned: number; tasksDone: number; tasksDropped: number; postponed: number; expense: number; impulse: number; weights: number[]; pai: number; moods: number[]; sleeps: number[]; slips: number; goodDone: number; water: number[]; workoutMin: number; snacks: number; focusMin: number }>()
  const W = (k: string) => {
    const w = weekStart(k)
    if (!weeks.has(w)) weeks.set(w, { tasksPlanned: 0, tasksDone: 0, tasksDropped: 0, postponed: 0, expense: 0, impulse: 0, weights: [], pai: 0, moods: [], sleeps: [], slips: 0, goodDone: 0, water: [], workoutMin: 0, snacks: 0, focusMin: 0 })
    return weeks.get(w)!
  }
  // فقط تسک‌های تا امروز؛ نمونه‌های تکراری آینده هنوز «برنامه» نشده‌اند
  for (const t of tasks) {
    const d = t.recurId ? t.date : t.originalDate || t.date
    if (d > today) continue
    const w = W(d)
    if (t.status === 'dropped') w.tasksDropped++
    else w.tasksPlanned++
    if (t.status === 'done') w.tasksDone++
    w.postponed += t.postponed
  }
  for (const t of txs)
    if (t.type === 'expense') {
      const w = W(t.date)
      w.expense += t.amount
      if (t.feel === 'impulse') w.impulse += t.amount
    }
  for (const h of health) {
    const w = W(h.date)
    if (h.weight) w.weights.push(h.weight)
    if (h.pai) w.pai += h.pai
    if (h.mood) w.moods.push(h.mood)
    if (h.sleep) w.sleeps.push(h.sleep)
    if (h.water) w.water.push(h.water)
  }
  for (const m of meals) if (m.type === 'snack') W(m.date).snacks++
  for (const x of workouts) W(x.date).workoutMin += x.minutes
  for (const f of focus) W(f.date).focusMin += f.actual
  const htype = new Map(habits.map((h) => [h.id!, h.type]))
  const byWeekday = Array.from({ length: 7 }, () => ({ slips: 0, goodDone: 0, tasksDone: 0, expense: 0 }))
  for (const l of logs) {
    const w = W(l.date)
    const wd = byWeekday[weekIndex(l.date)]
    if (htype.get(l.habitId) === 'bad') {
      w.slips++
      wd.slips++
    } else {
      w.goodDone++
      wd.goodDone++
    }
  }
  for (const t of tasks) if (t.status === 'done') byWeekday[weekIndex(t.date)].tasksDone++
  for (const t of txs) if (t.type === 'expense') byWeekday[weekIndex(t.date)].expense += t.amount
  const avg = (a: number[]) => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : null)
  const weekly = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, w]) => ({
      weekStart: week,
      tasksPlanned: w.tasksPlanned,
      tasksDone: w.tasksDone,
      tasksDropped: w.tasksDropped,
      taskRate: w.tasksPlanned ? +(w.tasksDone / w.tasksPlanned).toFixed(2) : null,
      postponed: w.postponed,
      expense: w.expense,
      impulseExpense: w.impulse,
      avgWeight: avg(w.weights),
      paiSum: w.pai,
      avgMood: avg(w.moods),
      avgSleep: avg(w.sleeps),
      badHabitSlips: w.slips,
      goodHabitDone: w.goodDone,
      avgWater: avg(w.water),
      workoutMinutes: w.workoutMin,
      snacks: w.snacks,
      focusMinutes: Math.round(w.focusMin),
    }))
  const habitSummary = habits.map((h) => {
    const s = habitStats(h, logs)
    return { name: h.name, type: h.type, days: h.days, start: h.start, status: h.status, rate: +(h.result?.rate ?? s.rate).toFixed(2), bestStreak: h.result?.bestStreak ?? s.best }
  })
  const slipHours = Array(24).fill(0)
  const triggers: Record<string, number> = {}
  for (const l of logs)
    if (htype.get(l.habitId) === 'bad') {
      slipHours[new Date(l.at).getHours()]++
      if (l.trigger) triggers[l.trigger] = (triggers[l.trigger] || 0) + 1
    }

  download(`panel-analysis-${jShort(todayKey()).replace(/\//g, '-')}.json`, {
    app: APP,
    kind: 'analysis',
    exportedAt: new Date().toISOString(),
    schema: SCHEMA,
    summary: {
      weekly,
      byWeekday: byWeekday.map((d, i) => ({ weekday: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'][i], ...d })),
      habits: habitSummary,
      badHabitSlipsByHour: slipHours,
      slipTriggers: triggers,
    },
    tables,
  })
}
