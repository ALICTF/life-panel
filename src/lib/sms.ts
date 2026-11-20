import * as j from 'date-fns-jalali'
import { dkey, nowTime, todayKey } from './date'

export interface SmsTx {
  key: string // برای جلوگیری از ثبت تکراری
  bank?: string
  title?: string
  kind: 'expense' | 'income'
  amount: number // تومان
  balance?: number // تومان
  date: string
  time: string
  purpose?: string
  card?: string
  rounded?: number // تومان، مبلغ رند شده (بانک بلو)
  raw: string
}

/** ارقام فارسی و عربی به لاتین؛ ویرگول‌ها حفظ می‌شوند */
const digits = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٬،]/g, ',')
    .replace(/‏|‎/g, '')

const toInt = (s: string) => parseInt(s.replace(/[^\d]/g, ''), 10) || 0

function jDateKey(y: number, m: number, d: number) {
  if (y < 100) y += 1400
  if (y < 1300 || m < 1 || m > 12 || d < 1 || d > 31) return undefined
  try {
    return dkey(j.newDate(y, m - 1, d))
  } catch {
    return undefined
  }
}

/** پیدا کردن تاریخ شمسی: 1405.08.29 یا 1405/08/29 یا 05/08/29 */
function findDate(s: string) {
  const m = s.match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/)
  return m ? jDateKey(+m[1], +m[2], +m[3]) : undefined
}

function findTime(s: string) {
  const m = s.match(/(?:^|[^\d:])(\d{1,2}):(\d{2})(?![\d:]?\d)/m)
  if (!m || +m[1] > 23 || +m[2] > 59) return undefined
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/** تقسیم متن به پیامک‌های جدا. بلو هر پیامک را با خط تاریخ تمام می‌کند. */
function splitMessages(text: string) {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let cur: string[] = []
  const dateLine = /^\s*\d{2,4}[./-]\d{1,2}[./-]\d{1,2}\s*$/
  for (const l of lines) {
    cur.push(l)
    if (dateLine.test(l)) {
      out.push(cur.join('\n'))
      cur = []
    }
  }
  if (cur.join('').trim()) out.push(cur.join('\n'))
  // اگر خط تاریخ جدا نبود (بانک‌های دیگر)، با خط خالی جدا می‌کنیم
  if (out.length <= 1) {
    const blocks = text.split(/\n\s*\n/).filter((b) => b.trim())
    if (blocks.length > 1) return blocks
  }
  return out
}

function parseOne(rawIn: string): SmsTx | null {
  const raw = rawIn.trim()
  if (!raw) return null
  const s = digits(raw)
  const unit = /تومان/.test(s) && !/ریال/.test(s) ? 1 : 10 // پیش‌فرض بانک‌ها ریال است
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean)

  let kind: SmsTx['kind'] | undefined
  let amount = 0
  let purpose: string | undefined

  // قالب بلو: «… 1,650,000 ریال (بابت …) از حساب شما پرید / به حساب شما نشست»
  const blu = s.match(/([\d,]+)\s*ریال\s*(?:بابت\s+(.+?)\s+)?(?:از حساب شما (پرید)|به حساب شما (نشست))/)
  if (blu) {
    amount = toInt(blu[1])
    purpose = blu[2]
    kind = blu[3] ? 'expense' : 'income'
  } else {
    // قالب‌های رایج دیگر: «برداشت: 1,000,000» یا «واریز 500,000» یا «-1,000,000»
    const w = s.match(/(برداشت|خرید|انتقال از|پرداخت|کسر)[^\d\n]{0,20}([\d,]{3,})/)
    const d = s.match(/(واریز|انتقال به|دریافت|افزایش)[^\d\n]{0,20}([\d,]{3,})/)
    const sign = s.match(/(^|\s)([+-])\s*([\d,]{3,})/m)
    if (w) {
      kind = 'expense'
      amount = toInt(w[2])
    } else if (d) {
      kind = 'income'
      amount = toInt(d[2])
    } else if (sign) {
      kind = sign[2] === '-' ? 'expense' : 'income'
      amount = toInt(sign[3])
    }
  }
  if (!kind || !amount) return null

  const bal = s.match(/(?:موجودی|مانده)\s*[:：]?\s*([\d,]+)/)
  const round = s.match(/و\s*([\d,]+)\s*ریال\s*هم\s*رند\s*شد/)
  const card = s.match(/(?:\*|\.{2,}|x)(\d{4})\b|\b(\d{4})(?:\*|x)/i)
  const date = findDate(s) || todayKey()
  const time = findTime(s) || nowTime()
  const balance = bal ? Math.round(toInt(bal[1]) / unit) : undefined
  const bank = lines[0] && !/\d/.test(lines[0]) && lines[0].length < 20 ? lines[0] : undefined
  const title = lines[1] && !/\d/.test(lines[1]) && lines[1].length < 30 ? lines[1] : undefined

  return {
    key: `sms:${date}:${time}:${amount}:${bal ? toInt(bal[1]) : ''}`,
    bank,
    title,
    kind,
    amount: Math.round(amount / unit),
    balance,
    date,
    time,
    purpose,
    card: card ? card[1] || card[2] : undefined,
    rounded: round ? Math.round(toInt(round[1]) / unit) : undefined,
    raw,
  }
}

/** همهٔ تراکنش‌های یک یا چند پیامک، از قدیم به جدید */
export function parseSms(text: string): SmsTx[] {
  const list = splitMessages(digits(text))
    .map(parseOne)
    .filter((x): x is SmsTx => !!x)
  const seen = new Set<string>()
  return list
    .filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** دسته‌ٔ پیشنهادی از روی متن */
export function guessCategory(t: SmsTx, cats: { id?: number; name: string; kind: string }[]) {
  const find = (n: string) => cats.find((c) => c.kind === t.kind && c.name === n)?.id
  const txt = `${t.title || ''} ${t.purpose || ''}`
  if (t.kind === 'expense') {
    if (/شارژ|اینترنت|قبض|بسته/.test(txt)) return find('قبوض')
    if (/بنزین|سوخت|اسنپ|تپسی/.test(txt)) return find('رفت‌وآمد')
  }
  return undefined
}
