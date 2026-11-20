import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Droplet, Dumbbell, Pill, Plus, Timer, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { db, getSetting, logEvent, setSetting } from '../db/db'
import type { Meal, MealType, Med, Workout } from '../db/types'
import { addDaysKey, nowTime, todayKey, toMin, weekStart, fromMin } from '../lib/date'
import { fa, num } from '../lib/format'
import { haptic, pop } from '../lib/anim'
import { toggleHabit } from '../lib/habits'
import { Button, Chip, Label, Ring, Segmented } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/Toast'
import { saveHealth } from './health-shared'
import { useFocus } from './Focus'

export const MEALS: { type: MealType; label: string; icon: string }[] = [
  { type: 'breakfast', label: 'صبحانه', icon: '🍳' },
  { type: 'lunch', label: 'ناهار', icon: '🍛' },
  { type: 'dinner', label: 'شام', icon: '🥗' },
  { type: 'snack', label: 'میان‌وعده', icon: '🍪' },
]

export const WORKOUTS = ['پیاده‌روی تند', 'دویدن', 'باشگاه', 'دوچرخه', 'شنا', 'سایر']
const INTENSITY = { 1: 'سبک', 2: 'متوسط', 3: 'شدید' } as const

/** ردیف ثبت سریع بالای صفحهٔ امروز */
export function QuickBar() {
  const today = todayKey()
  const [open, setOpen] = useState<'meal' | 'water' | 'med' | 'workout' | null>(null)
  const focus = useFocus()
  const waterBtn = useRef<HTMLButtonElement>(null)
  const meals = useLiveQuery(() => db.meals.where('date').equals(today).count(), [today]) ?? 0
  const water = useLiveQuery(async () => (await db.health.get(today))?.water ?? 0, [today]) ?? 0
  const waterGoal = useLiveQuery(() => getSetting<number>('waterGoal', 8), []) ?? 8
  const medInfo = useLiveQuery(async () => {
    const meds = (await db.meds.toArray()).filter((m) => m.active)
    const total = meds.reduce((s, m) => s + m.times.length, 0)
    const done = await db.medLogs.where('date').equals(today).count()
    return { total, done }
  }, [today])
  const wMin = useLiveQuery(async () => (await db.workouts.where('date').equals(today).toArray()).reduce((s, w) => s + w.minutes, 0), [today]) ?? 0
  const fMin = useLiveQuery(async () => Math.round((await db.focus.where('date').equals(today).toArray()).reduce((s, f) => s + f.actual, 0)), [today]) ?? 0

  const addWater = async (d: number) => {
    const next = Math.max(0, water + d)
    await saveHealth({ water: next })
    if (d > 0) {
      pop(waterBtn.current)
      haptic()
      toast(`${fa(next)} از ${fa(waterGoal)} لیوان آب`, { label: 'برگرداندن', run: () => saveHealth({ water: water }) })
    }
  }

  const items = [
    { key: 'meal' as const, icon: <UtensilsCrossed size={20} />, label: 'وعده', sub: meals ? `${fa(meals)} وعده` : 'ثبت', color: '#ea580c' },
    { key: 'water' as const, icon: <Droplet size={20} />, label: 'آب', sub: `${fa(water)}/${fa(waterGoal)}`, color: '#0284c7', ratio: water / waterGoal },
    { key: 'workout' as const, icon: <Dumbbell size={20} />, label: 'ورزش', sub: wMin ? `${fa(wMin)} دقیقه` : 'ثبت', color: '#16a34a' },
    { key: 'med' as const, icon: <Pill size={20} />, label: 'دارو', sub: medInfo?.total ? `${fa(medInfo.done)}/${fa(medInfo.total)}` : 'افزودن', color: '#c026d3' },
  ]

  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {items.map((it) => (
          <button
            key={it.key}
            ref={it.key === 'water' ? waterBtn : undefined}
            className="press card flex flex-col items-center gap-1 px-1 py-2.5"
            onClick={() => (it.key === 'water' ? addWater(1) : setOpen(it.key))}
            onContextMenu={(e) => {
              if (it.key !== 'water') return
              e.preventDefault()
              setOpen('water')
            }}
          >
            {it.key === 'water' ? (
              <Ring value={it.ratio || 0} size={34} stroke={3} color={it.color}>
                <span style={{ color: it.color }}>{it.icon}</span>
              </Ring>
            ) : (
              <span className="grid size-[34px] place-items-center rounded-full" style={{ background: `${it.color}1f`, color: it.color }}>
                {it.icon}
              </span>
            )}
            <span className="text-xs font-semibold">{it.label}</span>
            <span className="tnum text-[10px] text-muted">{it.sub}</span>
          </button>
        ))}
        <button className="press card flex flex-col items-center gap-1 px-1 py-2.5" onClick={() => focus.openPicker()}>
          <span className="grid size-[34px] place-items-center rounded-full" style={{ background: '#4f46e51f', color: '#4f46e5' }}>
            <Timer size={20} />
          </span>
          <span className="text-xs font-semibold">تمرکز</span>
          <span className="tnum text-[10px] text-muted">{fMin ? `${fa(fMin)} دقیقه` : 'شروع'}</span>
        </button>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted">برای آب یک بار بزن؛ برای کم کردن یا تغییر هدف، نگه دار.</p>

      <MealSheet open={open === 'meal'} onClose={() => setOpen(null)} />
      <WaterSheet open={open === 'water'} onClose={() => setOpen(null)} water={water} goal={waterGoal} add={addWater} />
      <MedSheet open={open === 'med'} onClose={() => setOpen(null)} />
      <WorkoutSheet open={open === 'workout'} onClose={() => setOpen(null)} />
    </>
  )
}

/* ───────────── وعده‌ها ───────────── */

function MealSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = todayKey()
  const [note, setNote] = useState('')
  const [carbs, setCarbs] = useState(false)
  const meals = useLiveQuery(() => db.meals.where('date').equals(today).sortBy('time'), [today]) || []
  const last = meals.at(-1)
  const since = last ? toMin(nowTime()) - toMin(last.time) : undefined

  const log = async (type: MealType) => {
    await db.meals.add({ date: today, type, time: nowTime(), at: Date.now(), note: note.trim() || undefined, carbs: carbs || undefined })
    haptic()
    setNote('')
    setCarbs(false)
    // میان‌وعده یعنی عادت «ریزه‌خواری» امروز انجام شده
    if (type === 'snack') {
      const h = (await db.habits.where('status').equals('active').toArray()).find((x) => x.type === 'bad' && /ریزه|میان/.test(x.name))
      if (h && !(await db.habitLogs.get([h.id!, today]))) {
        await toggleHabit(h)
        toast(`میان‌وعده ثبت شد و «${h.name.slice(0, 20)}» هم تیک خورد`)
        return
      }
    }
    toast(`${MEALS.find((m) => m.type === type)!.label} ثبت شد`)
  }

  return (
    <Sheet open={open} onClose={onClose} title="وعده‌ها">
      <div className="grid grid-cols-2 gap-2">
        {MEALS.map((m) => {
          const had = meals.some((x) => x.type === m.type)
          return (
            <button key={m.type} className={`press flex items-center gap-3 rounded-2xl p-4 text-start ${had && m.type !== 'snack' ? 'bg-good-soft' : 'bg-surface-2'}`} onClick={() => log(m.type)}>
              <span className="text-3xl">{m.icon}</span>
              <span>
                <span className="block font-bold">{m.label}</span>
                <span className="block text-xs text-muted">{had && m.type !== 'snack' ? 'ثبت شده' : 'الان خوردم'}</span>
              </span>
            </button>
          )
        })}
      </div>
      <input className="field mt-3 text-sm" placeholder="اختیاری: چی خوردی؟ (قبل از زدن دکمه بنویس)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={`press mt-2 rounded-full px-3 py-1.5 text-sm ${carbs ? 'bg-warn text-white' : 'bg-surface-2 text-muted'}`} onClick={() => setCarbs(!carbs)}>
        🍞 کربوهیدرات داشت
      </button>

      {meals.length > 0 && (
        <>
          <Label hint={since !== undefined && since >= 0 ? `${fa(Math.floor(since / 60))} ساعت و ${fa(since % 60)} دقیقه از آخرین وعده` : undefined}>امروز</Label>
          <div className="divide-y divide-line">
            {meals.map((m) => (
              <MealRow key={m.id} m={m} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}

function MealRow({ m }: { m: Meal }) {
  const meta = MEALS.find((x) => x.type === m.type)!
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm">
      <span className="tnum w-12 text-muted">{fa(m.time)}</span>
      <span className="text-lg">{meta.icon}</span>
      <span className="min-w-0 flex-1 truncate">
        {meta.label}
        {m.note && <span className="text-muted"> · {m.note}</span>}
        {m.carbs && <span className="text-warn"> · کربو</span>}
      </span>
      <button className="press p-1 text-muted" onClick={() => db.meals.delete(m.id!)} aria-label="حذف">
        <X size={16} />
      </button>
    </div>
  )
}

/* ───────────── آب ───────────── */

function WaterSheet({ open, onClose, water, goal, add }: { open: boolean; onClose: () => void; water: number; goal: number; add: (d: number) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="آب">
      <div className="flex flex-col items-center py-2">
        <Ring value={water / goal} size={120} stroke={10} color="#0284c7">
          <span className="tnum text-2xl font-extrabold">{fa(water)}</span>
        </Ring>
        <p className="mt-2 text-sm text-muted">از {fa(goal)} لیوان</p>
        <div className="mt-4 flex gap-3">
          <Button variant="soft" onClick={() => add(-1)} disabled={!water}>
            − یک لیوان
          </Button>
          <Button onClick={() => add(1)}>+ یک لیوان</Button>
        </div>
      </div>
      <Label>هدف روزانه</Label>
      <div className="flex gap-2">
        {[6, 8, 10, 12].map((g) => (
          <Chip key={g} active={goal === g} onClick={() => setSetting('waterGoal', g)}>
            {fa(g)} لیوان
          </Chip>
        ))}
      </div>
    </Sheet>
  )
}

/* ───────────── دارو ───────────── */

function MedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = todayKey()
  const meds = useLiveQuery(() => db.meds.orderBy('order').filter((m) => m.active).toArray(), []) || []
  const logs = useLiveQuery(() => db.medLogs.where('date').equals(today).toArray(), [today]) || []
  const [edit, setEdit] = useState<Med | null>(null)
  const now = toMin(nowTime())

  const toggle = async (m: Med, dose: number) => {
    const ex = logs.find((l) => l.medId === m.id && l.dose === dose)
    if (ex) await db.medLogs.delete(ex.id!)
    else {
      await db.medLogs.add({ medId: m.id!, date: today, dose, at: Date.now() })
      await logEvent('med_taken', m.id, { planned: m.times[dose], hour: new Date().getHours() })
      haptic()
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="داروها">
      {!meds.length && <p className="py-4 text-center text-sm text-muted">هنوز دارویی اضافه نکرده‌ای.</p>}
      <div className="space-y-2.5">
        {meds.map((m) => (
          <div key={m.id} className="rounded-2xl bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold">💊 {m.name}</span>
              <button className="press text-xs text-muted" onClick={() => setEdit(m)}>ویرایش</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.times.map((t, i) => {
                const log = logs.find((l) => l.medId === m.id && l.dose === i)
                const late = !log && now > toMin(t) + 60
                return (
                  <button
                    key={i}
                    onClick={() => toggle(m, i)}
                    className={`press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${log ? 'bg-good text-white' : late ? 'bg-bad-soft text-bad' : 'bg-surface'}`}
                  >
                    <span className="tnum">{fa(t)}</span>
                    <span className="text-xs font-normal opacity-80">
                      {log ? `خوردم ${fa(new Date(log.at).toTimeString().slice(0, 5))}` : late ? 'دیر شده' : 'نخورده'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <Button variant="soft" block className="mt-3" onClick={() => setEdit({ name: '', times: ['08:00'], active: true, order: meds.length })}>
        <Plus size={18} /> افزودن دارو
      </Button>
      <MedEdit m={edit} onClose={() => setEdit(null)} />
    </Sheet>
  )
}

function MedEdit({ m, onClose }: { m: Med | null; onClose: () => void }) {
  const [cur, setCur] = useState<Med | null>(null)
  const [src, setSrc] = useState<Med | null>(null)
  if (m && m !== src) {
    setSrc(m)
    setCur(m)
  }
  if (!cur) return null
  const set = (p: Partial<Med>) => setCur({ ...cur, ...p })
  return (
    <Sheet
      open={!!m}
      onClose={onClose}
      title={cur.id ? 'ویرایش دارو' : 'داروی جدید'}
      footer={
        <div className="flex gap-2">
          {cur.id && (
            <Button
              variant="danger"
              onClick={async () => {
                await db.meds.update(cur.id!, { active: false })
                toast('دارو حذف شد')
                onClose()
              }}
            >
              <Trash2 size={18} />
            </Button>
          )}
          <Button
            className="flex-1"
            disabled={!cur.name.trim() || !cur.times.length}
            onClick={async () => {
              await db.meds.put({ ...cur, name: cur.name.trim(), times: [...cur.times].sort() })
              onClose()
            }}
          >
            ذخیره
          </Button>
        </div>
      }
    >
      <Label>نام دارو</Label>
      <input className="field" autoFocus={!cur.id} placeholder="مثلاً پروپرانولول" value={cur.name} onChange={(e) => set({ name: e.target.value })} />
      <Label hint="هر نوبت یک ساعت">ساعت‌های مصرف</Label>
      <div className="space-y-2">
        {cur.times.map((t, i) => (
          <div key={i} className="flex gap-2">
            <input type="time" className="field tnum flex-1" value={t} onChange={(e) => set({ times: cur.times.map((x, k) => (k === i ? e.target.value : x)) })} />
            {cur.times.length > 1 && (
              <button className="press grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted" onClick={() => set({ times: cur.times.filter((_, k) => k !== i) })} aria-label="حذف نوبت">
                <X size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button variant="soft" block className="mt-2" onClick={() => set({ times: [...cur.times, fromMin(Math.min(23 * 60, toMin(cur.times.at(-1) || '08:00') + 12 * 60))] })}>
        <Plus size={18} /> نوبت دیگر
      </Button>
    </Sheet>
  )
}

/* ───────────── ورزش ───────────── */

function WorkoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = todayKey()
  const [w, setW] = useState<Omit<Workout, 'at' | 'date'>>({ type: WORKOUTS[0], minutes: 30, intensity: 2 })
  const list = useLiveQuery(() => db.workouts.where('date').equals(today).toArray(), [today]) || []
  const week = useLiveQuery(async () => {
    const s = weekStart(today)
    const ws = await db.workouts.where('date').between(s, addDaysKey(s, 6), true, true).toArray()
    const hs = await db.health.where('date').between(addDaysKey(today, -6), today, true, true).toArray()
    return { min: ws.reduce((a, x) => a + x.minutes, 0), pai: hs.reduce((a, h) => a + (h.pai || 0), 0) }
  }, [today])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ورزش"
      footer={
        <Button
          block
          onClick={async () => {
            await db.workouts.add({ ...w, date: today, at: Date.now() })
            await logEvent('workout', undefined, { minutes: w.minutes, intensity: w.intensity, hour: new Date().getHours() })
            haptic()
            toast(`${fa(w.minutes)} دقیقه ${w.type} ثبت شد`)
            onClose()
          }}
        >
          ثبت
        </Button>
      }
    >
      <div className="flex items-center justify-around rounded-2xl bg-surface-2 p-3">
        <div className="flex flex-col items-center">
          <Ring value={(week?.min || 0) / 150} size={58} stroke={5} color="#16a34a">
            <span className="tnum">{fa(week?.min || 0)}</span>
          </Ring>
          <span className="mt-1 text-[11px] text-muted">دقیقهٔ این هفته (هدف ۱۵۰)</span>
        </div>
        <div className="flex flex-col items-center">
          <Ring value={(week?.pai || 0) / 100} size={58} stroke={5} color="var(--accent)">
            <span className="tnum">{fa(week?.pai || 0)}</span>
          </Ring>
          <span className="mt-1 text-[11px] text-muted">PAI هفت روز (هدف ۱۰۰)</span>
        </div>
      </div>
      <Label>نوع</Label>
      <div className="flex flex-wrap gap-2">
        {WORKOUTS.map((t) => (
          <Chip key={t} active={w.type === t} onClick={() => setW({ ...w, type: t })}>
            {t}
          </Chip>
        ))}
      </div>
      <Label>مدت</Label>
      <div className="flex flex-wrap gap-2">
        {[10, 20, 30, 45, 60, 90].map((m) => (
          <Chip key={m} active={w.minutes === m} onClick={() => setW({ ...w, minutes: m })}>
            {fa(m)} دقیقه
          </Chip>
        ))}
      </div>
      <Label hint="شدید یعنی نفس‌نفس می‌زنی و حرف زدن سخت است">شدت</Label>
      <Segmented
        value={String(w.intensity) as '1' | '2' | '3'}
        onChange={(v) => setW({ ...w, intensity: Number(v) as 1 | 2 | 3 })}
        options={([1, 2, 3] as const).map((i) => ({ value: String(i) as '1' | '2' | '3', label: INTENSITY[i] }))}
      />
      {list.length > 0 && (
        <>
          <Label>امروز</Label>
          <div className="divide-y divide-line text-sm">
            {list.map((x) => (
              <div key={x.id} className="flex items-center justify-between py-2">
                <span>
                  {x.type} · <span className="tnum">{fa(x.minutes)}</span> دقیقه · {INTENSITY[x.intensity]}
                </span>
                <button className="press p-1 text-muted" onClick={() => db.workouts.delete(x.id!)} aria-label="حذف">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-muted">مجموع: {num(list.reduce((s, x) => s + x.minutes, 0))} دقیقه امروز</p>
    </Sheet>
  )
}
