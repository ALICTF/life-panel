import * as j from 'date-fns-jalali'
import { addDaysKey, dkey } from './date'

// تعطیلات خورشیدی ثابت: [ماه, روز, عنوان]
const SOLAR: [number, number, string][] = [
  [1, 1, 'عید نوروز'], [1, 2, 'عید نوروز'], [1, 3, 'عید نوروز'], [1, 4, 'عید نوروز'],
  [1, 12, 'روز جمهوری اسلامی'], [1, 13, 'روز طبیعت'],
  [3, 14, 'رحلت امام خمینی'], [3, 15, 'قیام ۱۵ خرداد'],
  [11, 22, 'پیروزی انقلاب اسلامی'], [12, 29, 'ملی شدن صنعت نفت'],
]

// تعطیلات قمری: [ماه, روز, عنوان]
const LUNAR: [number, number, string][] = [
  [1, 9, 'تاسوعا'], [1, 10, 'عاشورا'],
  [2, 20, 'اربعین'], [2, 28, 'رحلت پیامبر و شهادت امام حسن'],
  [3, 8, 'شهادت امام حسن عسکری'], [3, 17, 'میلاد پیامبر و امام صادق'],
  [6, 3, 'شهادت حضرت فاطمه'],
  [7, 13, 'ولادت امام علی'], [7, 27, 'مبعث'],
  [8, 15, 'ولادت امام زمان'],
  [9, 21, 'شهادت امام علی'],
  [10, 1, 'عید فطر'], [10, 2, 'تعطیل عید فطر'], [10, 25, 'شهادت امام صادق'],
  [12, 10, 'عید قربان'], [12, 18, 'عید غدیر'],
]

const hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric' })

function hijriOf(d: Date) {
  const parts = hijri.formatToParts(d)
  return {
    m: Number(parts.find((p) => p.type === 'month')?.value),
    d: Number(parts.find((p) => p.type === 'day')?.value),
  }
}

const cache = new Map<number, Map<string, string>>()

/** تعطیلات یک سال شمسی. تعطیلات قمری با تقویم ام‌القری محاسبه می‌شوند و ممکن است یک روز با تقویم رسمی ایران فرق کنند. */
export function holidaysOfYear(jy: number) {
  if (cache.has(jy)) return cache.get(jy)!
  const map = new Map<string, string>()
  for (const [m, d, name] of SOLAR) map.set(dkey(j.newDate(jy, m - 1, d)), name)
  const start = j.newDate(jy, 0, 1)
  const days = j.isLeapYear(start) ? 366 : 365
  let k = dkey(start)
  let prev = ''
  for (let i = 0; i < days + 1; i++) {
    const h = hijriOf(new Date(k + 'T12:00:00'))
    for (const [m, d, name] of LUNAR) if (h.m === m && h.d === d && i < days) map.set(k, map.has(k) ? map.get(k) + '، ' + name : name)
    // شهادت امام رضا: آخرین روز صفر
    if (h.m === 3 && h.d === 1 && prev) map.set(prev, map.has(prev) ? map.get(prev) + '، شهادت امام رضا' : 'شهادت امام رضا')
    prev = k
    k = addDaysKey(k, 1)
  }
  cache.set(jy, map)
  return map
}

export function holidayOf(k: string): string | undefined {
  const jy = j.getYear(new Date(k + 'T12:00:00'))
  return holidaysOfYear(jy).get(k)
}
