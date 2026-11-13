import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Sheet } from './Sheet'
import { addDaysKey, jDay, jLong, jMonthKey, jMonthLabel, monthGrid, relDay, shiftMonth, todayKey } from '../lib/date'
import { fa } from '../lib/format'
import { holidayOf } from '../lib/holidays'

export const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

export function MiniMonth({ value, onPick, month, setMonth, marks }: { value?: string; onPick: (k: string) => void; month: string; setMonth: (m: string) => void; marks?: Set<string> }) {
  const grid = monthGrid(month)
  const today = todayKey()
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button className="press grid size-10 place-items-center rounded-full" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="ماه قبل">
          <ChevronRight size={20} />
        </button>
        <span className="font-bold">{jMonthLabel(month)}</span>
        <button className="press grid size-10 place-items-center rounded-full" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="ماه بعد">
          <ChevronLeft size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted">
        {WEEK.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {grid.map((k, i) => {
          const inMonth = jMonthKey(k) === month
          const sel = k === value
          const off = i % 7 === 6 || !!holidayOf(k)
          return (
            <button
              key={k}
              onClick={() => onPick(k)}
              className={`press relative mx-auto grid size-10 place-items-center rounded-full text-sm tnum ${sel ? 'bg-accent font-bold text-accent-ink' : k === today ? 'font-bold ring-2 ring-accent' : ''} ${!inMonth ? 'opacity-30' : ''} ${off && !sel ? 'text-bad' : ''}`}
            >
              {fa(jDay(k))}
              {marks?.has(k) && !sel && <span className="absolute bottom-1 size-1 rounded-full bg-accent" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** دکمهٔ انتخاب تاریخ شمسی */
export function DateField({ value, onChange, label = 'تاریخ' }: { value: string; onChange: (k: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(jMonthKey(value))
  return (
    <>
      <button
        className="press field flex items-center justify-between text-start"
        onClick={() => {
          setMonth(jMonthKey(value))
          setOpen(true)
        }}
      >
        <span>
          <span className="font-semibold">{relDay(value)}</span>
          <span className="ms-2 text-sm text-muted">{jLong(value)}</span>
        </span>
        <CalendarDays size={18} className="text-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <MiniMonth
          value={value}
          month={month}
          setMonth={setMonth}
          onPick={(k) => {
            onChange(k)
            setOpen(false)
          }}
        />
        <div className="mt-3 flex gap-2">
          {[0, 1].map((d) => (
            <button
              key={d}
              className="press h-10 flex-1 rounded-xl bg-surface-2 text-sm font-semibold"
              onClick={() => {
                onChange(addDaysKey(todayKey(), d))
                setOpen(false)
              }}
            >
              {d === 0 ? 'امروز' : 'فردا'}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
