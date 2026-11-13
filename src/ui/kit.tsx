import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fa, num, numToWords, parseInt0 } from '../lib/format'
import { pop, haptic } from '../lib/anim'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger'; block?: boolean }

export function Button({ variant = 'primary', block, className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-accent text-accent-ink',
    soft: 'bg-surface-2 text-ink',
    ghost: 'text-ink',
    danger: 'bg-bad-soft text-bad',
  }[variant]
  return (
    <button
      {...p}
      className={`press inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 font-semibold disabled:opacity-40 ${v} ${block ? 'w-full' : ''} ${className}`}
    />
  )
}

export function PageHeader({ title, sub, back, action }: { title: ReactNode; sub?: ReactNode; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-2 bg-bg/85 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2 backdrop-blur-md">
      {back && (
        <button className="press -ms-2 grid size-10 place-items-center rounded-full" onClick={() => nav(-1)} aria-label="بازگشت">
          <ChevronRight size={24} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="truncate text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

export function Card({ children, className = '', onClick, title, action }: { children: ReactNode; className?: string; onClick?: () => void; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card p-4 ${onClick ? 'press cursor-pointer' : ''} ${className}`} onClick={onClick}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-bold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Fab({ onClick, label = 'افزودن' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="press fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-4 z-30 grid size-14 place-items-center rounded-[20px] bg-accent text-accent-ink shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)]"
    >
      <Plus size={26} strokeWidth={2.4} />
    </button>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={`flex gap-1 rounded-2xl bg-surface-2 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`press h-9 flex-1 rounded-xl px-3 text-sm font-semibold whitespace-nowrap transition-colors ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({ active, onClick, children, color }: { active?: boolean; onClick?: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap ${active ? 'bg-ink text-bg' : 'bg-surface-2 text-ink'}`}
      style={active && color ? { background: color, color: '#fff' } : undefined}
    >
      {children}
    </button>
  )
}

export function Progress({ value, color, className = '' }: { value: number; color?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${v * 100}%`, background: color || 'var(--accent)', transitionTimingFunction: 'var(--ease-out)' }}
      />
    </div>
  )
}

export function Ring({ value, size = 56, stroke = 6, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color || 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-xs font-bold">{children}</div>
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-surface-2 text-2xl text-muted">{icon}</div>
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm leading-7 text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** دکمهٔ تیک گرد با انیمیشن پاپ */
export function CheckButton({ checked, onChange, color, size = 30, label }: { checked: boolean; onChange: () => void; color?: string; size?: number; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      ref={ref}
      aria-label={label || (checked ? 'برداشتن تیک' : 'تیک زدن')}
      aria-pressed={checked}
      onClick={(e) => {
        e.stopPropagation()
        if (!checked) {
          pop(ref.current)
          haptic()
        }
        onChange()
      }}
      className="press grid shrink-0 place-items-center rounded-full border-2 transition-colors"
      style={{
        width: size,
        height: size,
        borderColor: checked ? color || 'var(--accent)' : 'var(--line)',
        background: checked ? color || 'var(--accent)' : 'transparent',
        color: '#fff',
      }}
    >
      {checked && <Check size={size * 0.6} strokeWidth={3} />}
    </button>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm font-semibold">
      <span className="shrink-0">{children}</span>
      {hint && <span className="text-xs leading-5 font-normal text-muted">{hint}</span>}
    </div>
  )
}

/** ورودی مبلغ با جداکنندهٔ هزارگان و نمایش به حروف */
export function MoneyInput({ value, onChange, autoFocus }: { value: number; onChange: (n: number) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(value ? num(value) : '')
  useEffect(() => {
    if (parseInt0(text) !== value) setText(value ? num(value) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4">
        <input
          inputMode="numeric"
          autoFocus={autoFocus}
          className="tnum h-16 min-w-0 flex-1 bg-transparent text-3xl font-extrabold outline-none"
          placeholder="۰"
          value={text}
          onChange={(e) => {
            const n = parseInt0(e.target.value)
            setText(n ? num(n) : '')
            onChange(n)
          }}
        />
        <span className="text-muted">تومان</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-h-5 flex-1 text-xs text-muted">{value ? `${numToWords(value)} تومان` : ''}</p>
        <div className="flex gap-1.5">
          {[
            ['۰۰۰', 1e3],
            ['۰۰۰٬۰۰۰', 1e6],
          ].map(([l, m]) => (
            <button
              key={l}
              className="press h-8 rounded-lg bg-surface-2 px-2.5 text-xs font-bold"
              onClick={() => onChange((value || 1) * (m as number))}
            >
              {l}+
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** ورودی عدد اعشاری با پذیرش ارقام فارسی */
export function NumberField({ value, onChange, placeholder, suffix, className = '' }: { value?: number; onChange: (n?: number) => void; placeholder?: string; suffix?: string; className?: string }) {
  const [text, setText] = useState(value !== undefined ? fa(value) : '')
  useEffect(() => {
    setText(value !== undefined ? fa(value) : '')
  }, [value])
  return (
    <div className={`flex items-center rounded-2xl bg-surface-2 px-3 ${className}`}>
      <input
        inputMode="decimal"
        className="tnum h-12 min-w-0 flex-1 bg-transparent text-lg font-bold outline-none"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim()
          if (!t) return onChange(undefined)
          const n = parseFloat(t.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,/]/g, '.'))
          onChange(Number.isFinite(n) ? n : undefined)
        }}
      />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'muted' }) {
  const c = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : ''
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tnum mt-0.5 truncate text-lg font-extrabold ${c}`}>{value}</p>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function ConfirmSheet() {
  return null
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button className="press flex w-full items-center justify-between gap-3 py-2 text-start" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span>{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}>
        <span
          className="absolute top-1 size-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-200"
          style={{ insetInlineStart: checked ? 24 : 4 }}
        />
      </span>
    </button>
  )
}
