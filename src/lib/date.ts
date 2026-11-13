import { format as gFormat, parse as gParse, addDays as gAddDays, differenceInCalendarDays } from 'date-fns'
import * as j from 'date-fns-jalali'
import { fa } from './format'

/** کلید تاریخ: yyyy-MM-dd میلادی محلی */
export const dkey = (d: Date = new Date()) => gFormat(d, 'yyyy-MM-dd')
export const fromKey = (k: string) => gParse(k, 'yyyy-MM-dd', new Date())
export const todayKey = () => dkey(new Date())
export const addDaysKey = (k: string, n: number) => dkey(gAddDays(fromKey(k), n))
export const diffDays = (a: string, b: string) => differenceInCalendarDays(fromKey(a), fromKey(b))
export const tomorrowKey = () => addDaysKey(todayKey(), 1)

export function rangeKeys(from: string, to: string) {
  const out: string[] = []
  let k = from
  while (k <= to) {
    out.push(k)
    k = addDaysKey(k, 1)
  }
  return out
}

export const jf = (k: string | Date, pattern: string) => fa(j.format(typeof k === 'string' ? fromKey(k) : k, pattern))

/** ۲۲ آبان */
export const jDayMonth = (k: string) => jf(k, 'd MMMM')
/** جمعه ۲۲ آبان ۱۴۰۵ */
export const jLong = (k: string) => jf(k, 'EEEE d MMMM yyyy')
export const jShort = (k: string) => jf(k, 'yyyy/MM/dd')
export const jWeekday = (k: string) => jf(k, 'EEEE')
/** شمارهٔ روز هفته: ۰ = شنبه ... ۶ = جمعه */
export const weekIndex = (k: string) => (fromKey(k).getDay() + 1) % 7
/** کلید ماه شمسی، مثل 1405-08 */
export const jMonthKey = (k: string) => j.format(fromKey(k), 'yyyy-MM')
export const jMonthLabel = (mk: string) => {
  const [y, m] = mk.split('-').map(Number)
  return fa(j.format(j.newDate(y, m - 1, 1), 'MMMM yyyy'))
}
export const jDay = (k: string) => j.getDate(fromKey(k))
export const jYear = (k: string) => j.getYear(fromKey(k))

export function jMonthRange(mk: string) {
  const [y, m] = mk.split('-').map(Number)
  const first = j.newDate(y, m - 1, 1)
  const last = j.endOfMonth(first)
  return { from: dkey(first), to: dkey(last) }
}

export function shiftMonth(mk: string, n: number) {
  const [y, m] = mk.split('-').map(Number)
  return j.format(j.addMonths(j.newDate(y, m - 1, 1), n), 'yyyy-MM')
}

export function jYearRange(y: number) {
  const first = j.newDate(y, 0, 1)
  return { from: dkey(first), to: dkey(j.endOfYear(first)) }
}

/** شنبهٔ هفتهٔ این تاریخ */
export const weekStart = (k: string) => addDaysKey(k, -weekIndex(k))

/** ۴۲ خانهٔ جدول ماه، از شنبه */
export function monthGrid(mk: string) {
  const { from } = jMonthRange(mk)
  const start = weekStart(from)
  return Array.from({ length: 42 }, (_, i) => addDaysKey(start, i))
}

/** تاریخ شمسی با روز مشخص در ماه یک تاریخ؛ برای تکرار ماهانه */
export function jDateInMonth(mk: string, day: number) {
  const [y, m] = mk.split('-').map(Number)
  const first = j.newDate(y, m - 1, 1)
  const dim = j.getDaysInMonth(first)
  return dkey(j.newDate(y, m - 1, Math.min(day, dim)))
}

export const nowTime = () => gFormat(new Date(), 'HH:mm')
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export const fromMin = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export const faTime = (t?: string) => (t ? fa(t) : '')

export function relDay(k: string) {
  const d = diffDays(k, todayKey())
  if (d === 0) return 'امروز'
  if (d === 1) return 'فردا'
  if (d === -1) return 'دیروز'
  if (d === 2) return 'پس‌فردا'
  return jDayMonth(k)
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'شب بخیر'
  if (h < 12) return 'صبح بخیر'
  if (h < 17) return 'ظهر بخیر'
  if (h < 20) return 'عصر بخیر'
  return 'شب بخیر'
}
