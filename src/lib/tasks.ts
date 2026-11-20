import { db, logEvent } from '../db/db'
import type { Recurring, Task } from '../db/types'
import { addDaysKey, jDay, rangeKeys, todayKey, weekIndex } from './date'

export function newTask(p: Partial<Task> & { date: string }): Task {
  return {
    title: '',
    allDay: !p.start,
    priority: 2,
    subtasks: [],
    status: 'todo',
    createdAt: Date.now(),
    originalDate: p.date,
    postponed: 0,
    ...p,
  }
}

export function matchesRule(r: Recurring, k: string) {
  if (k < r.start) return false
  if (r.until && k > r.until) return false
  if (r.skip.includes(k)) return false
  if (r.freq === 'daily') return true
  if (r.freq === 'weekly') return (r.weekdays || []).includes(weekIndex(k))
  if (r.freq === 'monthly') return jDay(k) === r.monthDay
  return false
}

/** نمونه‌های تسک‌های تکراری را در بازهٔ داده‌شده می‌سازد */
export async function ensureRecurringTasks(from: string, to: string) {
  const rules = await db.recurring.where('kind').equals('task').toArray()
  if (!rules.length) return
  await db.transaction('rw', db.tasks, async () => {
    for (const r of rules) {
      for (const k of rangeKeys(from < r.start ? r.start : from, to)) {
        if (!matchesRule(r, k)) continue
        const ex = await db.tasks.where('[recurId+date]').equals([r.id!, k]).first()
        if (ex) continue
        // فیلدهای مخصوص هر نمونه از قالب حذف می‌شوند تا هر نمونه تاریخ برنامه‌ریزی خودش را داشته باشد
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { originalDate, createdAt, postponed, doneAt, ...t } = r.template as Partial<Task>
        await db.tasks.add(newTask({ ...t, id: undefined, date: k, recurId: r.id, status: 'todo', subtasks: (t.subtasks || []).map((s) => ({ ...s, done: false })) }))
      }
    }
  })
}

export async function setTaskDone(t: Task, done: boolean) {
  await db.tasks.update(t.id!, { status: done ? 'done' : 'todo', doneAt: done ? Date.now() : undefined })
  if (done) {
    const now = new Date()
    await logEvent('task_done', t.id, {
      planned: t.start,
      hour: now.getHours(),
      lateDays: Math.max(0, Math.round((now.getTime() - new Date(t.date + 'T00:00').getTime()) / 864e5)),
    })
  }
}

export async function moveTask(t: Task, date: string) {
  const postponed = date > t.date ? t.postponed + 1 : t.postponed
  await db.tasks.update(t.id!, { date, postponed })
  if (date > t.date) await logEvent('task_postponed', t.id, { from: t.date, to: date })
}

export async function deleteTask(t: Task, series = false) {
  if (t.recurId) {
    const r = await db.recurring.get(t.recurId)
    if (r) {
      if (series) {
        await db.recurring.update(r.id!, { until: addDaysKey(t.date, -1) })
        const future = await db.tasks.where('recurId').equals(r.id!).filter((x) => x.date >= t.date && x.status === 'todo').primaryKeys()
        await db.tasks.bulkDelete(future)
        return
      }
      await db.recurring.update(r.id!, { skip: [...r.skip, t.date] })
    }
  }
  await db.tasks.delete(t.id!)
}

/** تسک‌های انجام‌نشدهٔ روزهای گذشته */
export async function overdueTasks() {
  const today = todayKey()
  return db.tasks
    .where('date')
    .between(addDaysKey(today, -30), today, true, false)
    .filter((t) => t.status === 'todo')
    .toArray()
}

export const PRIORITY = { 1: 'بالا', 2: 'متوسط', 3: 'پایین' } as const

/** چیدن تسک‌های هم‌پوشان در ستون‌ها */
export function layoutBlocks<T extends { s: number; e: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e)
  const out: (T & { col: number; cols: number })[] = []
  let group: (T & { col: number; cols: number })[] = []
  let groupEnd = -1
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.col + 1))
    group.forEach((g) => (g.cols = n))
    out.push(...group)
    group = []
  }
  for (const it of sorted) {
    if (it.s >= groupEnd && group.length) flush()
    const used = new Set(group.filter((g) => g.e > it.s).map((g) => g.col))
    let col = 0
    while (used.has(col)) col++
    group.push({ ...it, col, cols: 1 })
    groupEnd = Math.max(groupEnd, it.e)
  }
  if (group.length) flush()
  return out
}
