// فهم متن فارسی آزاد برای ساخت سریع تسک: «جلسه با تیم ۷ عصر»، «باشگاه ساعت ۱۸:۳۰ تا ۲۰»، «دکتر ۹ و نیم صبح !»

import { fromMin, toMin } from './date'

export interface Parsed {
  title: string
  start?: string
  end?: string
  priority?: 1
}

const WORDS: Record<string, number> = {
  یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12,
}

const norm = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/‌/g, ' ')

const PART = '(صبح|ظهر|بعد ?از ?ظهر|بعدازظهر|عصر|شب|بامداد)'
const NUM = `(\\d{1,2}|${Object.keys(WORDS).join('|')})`

function toH(v: string) {
  return /^\d+$/.test(v) ? +v : WORDS[v]
}

function apply(h: number, m: number, part?: string, explicit24 = false) {
  if (part) {
    if (/صبح|بامداد/.test(part)) {
      if (h === 12) h = 0
    } else if (/ظهر/.test(part) && !/بعد/.test(part)) {
      if (h < 6) h += 12
    } else if (/شب/.test(part)) {
      if (h === 12) h = 23
      else if (h < 12 && h >= 5) h += 12
    } else if (h < 12) h += 12 // عصر، بعدازظهر
  } else if (!explicit24 && h >= 1 && h <= 6) h += 12 // «ساعت ۵» معمولاً یعنی ۵ عصر
  if (h > 23 || m > 59) return undefined
  return h * 60 + m
}

export function parseEntry(input: string): Parsed {
  let s = norm(input).trim()
  let priority: 1 | undefined
  if (/(^|\s)(!|مهم)(\s|$)|!$/.test(s)) {
    priority = 1
    s = s.replace(/(^|\s)(!|مهم)(?=\s|$)/g, ' ').replace(/!+$/, '')
  }

  let start: number | undefined
  let end: number | undefined
  const cut = (re: RegExp) => {
    s = s.replace(re, ' ')
  }

  // ۱۸:۳۰ یا ساعت ۱۸:۳۰، با بخش اختیاری روز
  const colon = new RegExp(`(?:ساعت\\s*)?(\\d{1,2}):(\\d{2})\\s*${PART}?(?:\\s*تا\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${PART}?)?`)
  const word = new RegExp(`(?:ساعت\\s*)?${NUM}(?:\\s*و\\s*(نیم|ربع|\\d{1,2}))?\\s*${PART}(?:\\s*تا\\s*${NUM}(?:\\s*و\\s*(نیم|ربع))?\\s*${PART}?)?`)
  // «۱۰ تا ۱۱ شب»: بخش روز در آخر برای هر دو
  const range = new RegExp(`(?:ساعت\\s*)?${NUM}(?:\\s*و\\s*(نیم|ربع))?\\s*تا\\s*${NUM}(?:\\s*و\\s*(نیم|ربع))?\\s*${PART}`)
  const bare = new RegExp(`ساعت\\s*${NUM}(?:\\s*و\\s*(نیم|ربع|\\d{1,2}))?(?:\\s*تا\\s*${NUM}(?:\\s*و\\s*(نیم|ربع))?)?`)
  const frac = (v?: string) => (!v ? 0 : v === 'نیم' ? 30 : v === 'ربع' ? 15 : +v)

  let m = s.match(colon)
  if (m) {
    start = apply(+m[1], +m[2], m[3], +m[1] > 12)
    if (m[4]) end = apply(+m[4], m[5] ? +m[5] : 0, m[6] || m[3], +m[4] > 12)
    cut(colon)
  } else if ((m = s.match(range))) {
    const p = m[5]
    let e = apply(toH(m[3]), frac(m[4]), p)
    let st = apply(toH(m[1]), frac(m[2]), p)
    // «۱۱ تا ۱ ظهر» یا «۱۰ تا ۱۲ شب»: شروع نباید بعد از پایان باشد
    if (st !== undefined && e !== undefined && st > e) st -= 12 * 60
    if (e !== undefined && st !== undefined && e - st > 12 * 60) e -= 12 * 60
    start = st
    end = e
    cut(range)
  } else if ((m = s.match(word))) {
    start = apply(toH(m[1]), frac(m[2]), m[3])
    if (m[4]) end = apply(toH(m[4]), frac(m[5]), m[6] || m[3])
    cut(word)
  } else if ((m = s.match(bare))) {
    start = apply(toH(m[1]), frac(m[2]))
    if (m[3]) end = apply(toH(m[3]), frac(m[4]))
    cut(bare)
  }

  // مدت: «۲ ساعت»، «۴۵ دقیقه»، «یک ساعت و نیم»
  const dur = s.match(new RegExp(`(?:به مدت\\s*)?${NUM}\\s*(ساعت|دقیقه)(?:\\s*و\\s*نیم)?`))
  if (dur && start !== undefined && end === undefined) {
    const n = toH(dur[1])
    const mins = dur[2] === 'ساعت' ? n * 60 + (/و\s*نیم/.test(dur[0]) ? 30 : 0) : n
    if (mins > 0 && mins <= 12 * 60) {
      end = start + mins
      cut(new RegExp(dur[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  }

  if (start !== undefined && (end === undefined || end <= start)) end = Math.min(24 * 60 - 1, start + 60)
  const title = s
    .replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
    .replace(/\s+/g, ' ').replace(/^[\s،,-]+|[\s،,-]+$/g, '').trim()
  return {
    title: title || input.trim(),
    start: start !== undefined ? fromMin(start) : undefined,
    end: end !== undefined ? fromMin(Math.min(end, 24 * 60 - 1)) : undefined,
    priority,
  }
}

export const durLabel = (a?: string, b?: string) => (a && b ? toMin(b) - toMin(a) : 0)
