import { db, getSetting, logEvent, seedIfEmpty, setSetting } from '../db/db'
import { autoArchiveHabits } from './habits'
import { carryBudgets, runRecurringTx } from './money'
import { ensureRecurringTasks } from './tasks'
import { addDaysKey, todayKey } from './date'

let running: Promise<void> | null = null

/** کارهای خودکار هنگام باز شدن برنامه و هر بار برگشت به آن (هم‌زمان فقط یک اجرا) */
export function runAutomation() {
  if (!running) running = doRun().finally(() => (running = null))
  return running
}

async function doRun() {
  await seedIfEmpty()
  const today = todayKey()
  const last = await getSetting<string>('lastRun', '')
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* اختیاری */
  }
  await autoArchiveHabits()
  await runRecurringTx()
  await carryBudgets()
  await ensureRecurringTasks(today, addDaysKey(today, 14))
  if (last !== today) {
    await logEvent('app_open_day')
    // پاک‌سازی یادداشت‌هایی که بیش از ۳۰ روز در سطل بوده‌اند
    const limit = Date.now() - 30 * 864e5
    const old = await db.notes.filter((n) => n.deleted > 0 && n.deleted < limit).primaryKeys()
    if (old.length) await db.notes.bulkDelete(old)
    await setSetting('lastRun', today)
  }
}
