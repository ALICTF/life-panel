import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Moon, Zap } from 'lucide-react'
import { db } from '../db/db'
import type { HealthEntry } from '../db/types'
import { todayKey } from '../lib/date'
import { fa, num } from '../lib/format'
import { NumberField } from '../ui/kit'
import { toast } from '../ui/Toast'
import { haptic } from '../lib/anim'

export async function saveHealth(patch: Partial<HealthEntry>) {
  const date = todayKey()
  const ex = await db.health.get(date)
  await db.health.put({ ...(ex || { date }), ...patch, date, updatedAt: Date.now() })
}

export function useLastWeight() {
  return useLiveQuery(async () => {
    const all = await db.health.orderBy('date').reverse().filter((h) => !!h.weight).first()
    return all?.weight
  })
}

/** ثبت سریع وزن و PAI امروز */
export function HealthQuick() {
  const today = useLiveQuery(() => db.health.get(todayKey()), [])
  const last = useLastWeight()
  const [w, setW] = useState<number | undefined>()
  const [p, setP] = useState<number | undefined>()
  useEffect(() => {
    setW(today?.weight)
    setP(today?.pai)
  }, [today?.weight, today?.pai])
  const saved = today?.weight !== undefined && today?.pai !== undefined
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-xs text-muted">وزن امروز</p>
          <NumberField
            value={w}
            placeholder={last ? fa(last) : 'مثلاً ۷۵٫۴'}
            suffix="کیلو"
            onChange={(v) => {
              setW(v)
              if (v !== undefined && v > 20 && v < 400) saveHealth({ weight: Math.round(v * 10) / 10 }).then(() => haptic())
            }}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">PAI امروز</p>
          <NumberField
            value={p}
            placeholder="۰"
            onChange={(v) => {
              setP(v)
              if (v !== undefined && v >= 0) saveHealth({ pai: Math.round(v) }).then(() => haptic())
            }}
          />
        </div>
      </div>
      {saved && (
        <p className="mt-2 flex items-center gap-1 text-xs text-good">
          <Check size={14} /> امروز ثبت شد
        </p>
      )}
    </div>
  )
}

const MOODS = ['😣', '😕', '😐', '🙂', '😄']

/** چک‌این روزانه: حال، انرژی، خواب */
export function CheckIn() {
  const today = useLiveQuery(() => db.health.get(todayKey()), [])
  const set = (patch: Partial<HealthEntry>) => saveHealth(patch).then(() => haptic())
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs text-muted">حالت امروز چطور است؟</p>
        <div className="flex justify-between gap-1">
          {MOODS.map((m, i) => (
            <button
              key={i}
              onClick={() => set({ mood: i + 1 })}
              className={`press grid h-11 flex-1 place-items-center rounded-xl text-2xl transition-[background-color,opacity] ${today?.mood === i + 1 ? 'bg-accent-soft' : today?.mood ? 'opacity-40' : 'bg-surface-2'}`}
              aria-label={`حال ${fa(i + 1)}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Zap size={16} className="shrink-0 text-warn" />
        <span className="w-12 shrink-0 text-xs text-muted">انرژی</span>
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => set({ energy: n })}
              className={`press h-8 flex-1 rounded-lg text-xs font-bold ${today?.energy && n <= today.energy ? 'bg-warn text-white' : 'bg-surface-2 text-muted'}`}
            >
              {fa(n)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Moon size={16} className="shrink-0 text-muted" />
        <span className="w-12 shrink-0 text-xs text-muted">خواب</span>
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              onClick={() => {
                set({ sleep: n })
                toast(`${num(n)} ساعت خواب ثبت شد`)
              }}
              className={`press h-8 min-w-10 flex-1 rounded-lg text-xs font-bold ${today?.sleep === n ? 'bg-ink text-bg' : 'bg-surface-2 text-muted'}`}
            >
              {fa(n)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
