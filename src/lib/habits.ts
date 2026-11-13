import { db, logEvent } from '../db/db'
import type { Habit, HabitLog, HabitResult } from '../db/types'
import { addDaysKey, diffDays, jMonthKey, rangeKeys, todayKey } from './date'

export const habitEnd = (h: Habit) => addDaysKey(h.start, h.days - 1)

export interface HabitStats {
  dayNo: number // روز چندم دوره
  elapsed: number // روزهای سپری‌شده تا امروز (شامل امروز)
  success: number
  rate: number
  streak: number
  best: number
  todayDone: boolean
  days: { k: string; state: 'ok' | 'fail' | 'today' | 'future' | 'pending' }[]
}

/** آمار یک عادت. برای عادت بد، روزِ بدون تیک موفق است. */
export function habitStats(h: Habit, logs: HabitLog[], today = todayKey()): HabitStats {
  const set = new Set(logs.filter((l) => l.habitId === h.id).map((l) => l.date))
  const end = h.status === 'archived' && h.result ? h.result.endDate : habitEnd(h)
  const keys = rangeKeys(h.start, habitEnd(h))
  const last = today < end ? today : end
  const good = h.type === 'good'
  let success = 0
  let run = 0
  let best = 0
  const days = keys.map((k) => {
    if (k > last) return { k, state: 'future' as const }
    const ticked = set.has(k)
    const ok = good ? ticked : !ticked
    if (k === today && h.status === 'active') {
      // امروز هنوز تمام نشده
      if (good) {
        if (ticked) {
          success++
          run++
          best = Math.max(best, run)
        }
        return { k, state: ticked ? ('ok' as const) : ('pending' as const) }
      }
      if (!ticked) {
        success++
        run++
        best = Math.max(best, run)
        return { k, state: 'pending' as const }
      }
      run = 0
      return { k, state: 'fail' as const }
    }
    if (ok) {
      success++
      run++
      best = Math.max(best, run)
    } else run = 0
    return { k, state: ok ? ('ok' as const) : ('fail' as const) }
  })
  // رشتهٔ فعلی از آخر حساب می‌شود
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const s = days[i].state
    if (s === 'future') continue
    if (s === 'pending' && good) continue
    if (s === 'ok' || s === 'pending') streak++
    else break
  }
  const pendingGood = good && days.some((d) => d.state === 'pending')
  const elapsed = Math.max(0, Math.min(h.days, diffDays(last, h.start) + 1) - (pendingGood ? 1 : 0))
  return {
    dayNo: Math.min(h.days, Math.max(1, diffDays(today, h.start) + 1)),
    elapsed,
    success,
    rate: elapsed ? success / elapsed : 0,
    streak,
    best,
    todayDone: set.has(today),
    days,
  }
}

export async function toggleHabit(h: Habit, trigger?: string) {
  const k = todayKey()
  const key: [number, string] = [h.id!, k]
  const ex = await db.habitLogs.get(key)
  if (ex) {
    await db.habitLogs.delete(key)
    await logEvent('habit_untick', h.id)
    return false
  }
  await db.habitLogs.put({ habitId: h.id!, date: k, at: Date.now(), trigger })
  await logEvent(h.type === 'good' ? 'habit_done' : 'habit_slip', h.id, { hour: new Date().getHours() })
  return true
}

export async function archiveHabit(h: Habit, early = false) {
  const logs = await db.habitLogs.where('habitId').equals(h.id!).toArray()
  const today = todayKey()
  const end = early ? (today < habitEnd(h) ? addDaysKey(today, -1) : habitEnd(h)) : habitEnd(h)
  const s = habitStats({ ...h, status: 'archived', result: { endDate: end } as HabitResult }, logs, addDaysKey(end, 1))
  const total = Math.max(1, diffDays(end, h.start) + 1)
  const result: HabitResult = {
    successDays: s.success,
    totalDays: total,
    rate: s.success / total,
    bestStreak: s.best,
    endDate: end,
    monthKey: jMonthKey(end),
    endedEarly: early || undefined,
  }
  await db.habits.update(h.id!, { status: 'archived', archivedAt: Date.now(), result })
  await logEvent('habit_archived', h.id, { rate: result.rate })
}

/** عادت‌هایی که دوره‌شان تمام شده خودکار بایگانی می‌شوند */
export async function autoArchiveHabits() {
  const today = todayKey()
  const active = await db.habits.where('status').equals('active').toArray()
  for (const h of active) if (habitEnd(h) < today) await archiveHabit(h)
}

export const TRIGGERS = ['استرس', 'خستگی', 'بی‌حوصلگی', 'جمع دوستانه', 'تنهایی', 'گرسنگی', 'سایر']
