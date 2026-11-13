const FA = '۰۱۲۳۴۵۶۷۸۹'

/** تبدیل ارقام لاتین به فارسی */
export const fa = (v: string | number | undefined | null) =>
  v === undefined || v === null ? '' : String(v).replace(/\d/g, (d) => FA[+d]).replace(/\./g, '٫')

/** تبدیل ارقام فارسی و عربی به لاتین */
export const toEn = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g, '.')

export const parseNum = (s: string) => {
  const n = parseFloat(toEn(s).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export const parseInt0 = (s: string) => {
  const n = parseInt(toEn(s).replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

/** ۱۲٬۳۴۵ */
export const num = (n: number, digits = 0) =>
  fa(
    n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }),
  ).replace(/,/g, '٬')

export const toman = (n: number) => `${num(Math.abs(n))} تومان`
export const signedToman = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${num(Math.abs(n))}`

/** مبلغ کوتاه: ۱٫۲ میلیون */
export function shortMoney(n: number) {
  const a = Math.abs(n)
  const s = n < 0 ? '−' : ''
  if (a >= 1e9) return `${s}${num(a / 1e9, 1)} میلیارد`
  if (a >= 1e6) return `${s}${num(a / 1e6, 1)} میلیون`
  if (a >= 1e3) return `${s}${num(a / 1e3, 0)} هزار`
  return `${s}${num(a)}`
}

export const pct = (r: number) => `${num(Math.round(r * 100))}٪`

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد']

function three(n: number) {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(HUNDREDS[h])
  if (r >= 10 && r < 20) parts.push(TEENS[r - 10])
  else {
    const t = Math.floor(r / 10)
    const o = r % 10
    if (t) parts.push(TENS[t])
    if (o) parts.push(ONES[o])
  }
  return parts.join(' و ')
}

/** عدد به حروف فارسی */
export function numToWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'صفر'
  const groups: string[] = []
  let i = 0
  while (n > 0 && i < SCALES.length) {
    const g = n % 1000
    if (g) groups.unshift(`${three(g)}${SCALES[i] ? ' ' + SCALES[i] : ''}`)
    n = Math.floor(n / 1000)
    i++
  }
  return groups.join(' و ')
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
