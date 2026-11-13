import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Flame, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { db, PALETTE } from '../db/db'
import type { Habit, HabitLog } from '../db/types'
import { archiveHabit, habitEnd, habitStats, toggleHabit, TRIGGERS } from '../lib/habits'
import { jDayMonth, jMonthLabel, todayKey } from '../lib/date'
import { fa, pct } from '../lib/format'
import { Button, Card, CheckButton, Chip, Empty, Fab, Label, PageHeader, Ring, Segmented } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/Toast'
import { useStagger } from '../lib/anim'

const PRESETS = [7, 21, 30, 66, 90]

export default function Habits() {
  const [tab, setTab] = useState<'good' | 'bad' | 'archive'>('good')
  const [editing, setEditing] = useState<Habit | null>(null)
  const [detail, setDetail] = useState<Habit | null>(null)
  const habits = useLiveQuery(() => db.habits.toArray(), []) || []
  const logs = useLiveQuery(() => db.habitLogs.toArray(), []) || []
  const list = habits.filter((h) => h.status === 'active' && h.type === tab).sort((a, b) => a.order - b.order)
  const ref = useStagger<HTMLDivElement>([tab])

  return (
    <div>
      <PageHeader title="عادت‌ها" sub="فقط برای امروز تیک بزن" />
      <Segmented
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'good', label: 'عادت‌های خوب' },
          { value: 'bad', label: 'عادت‌های بد' },
          { value: 'archive', label: 'بایگانی' },
        ]}
      />
      {tab === 'bad' && list.length > 0 && (
        <p className="mb-3 rounded-2xl bg-bad-soft px-4 py-2.5 text-xs leading-6 text-bad">
          تیک یعنی «امروز انجامش دادم». روزی که تیک نخورد، یک روز موفق حساب می‌شود.
        </p>
      )}
      {tab === 'archive' ? (
        <ArchiveList habits={habits.filter((h) => h.status === 'archived')} />
      ) : (
        <div ref={ref} className="space-y-2.5">
          {list.length === 0 && (
            <Card>
              <Empty
                icon={tab === 'good' ? <Sparkles /> : <Flame />}
                title={tab === 'good' ? 'هنوز عادت خوبی اضافه نکرده‌ای' : 'هنوز عادت بدی اضافه نکرده‌ای'}
                text={tab === 'good' ? 'یک عادت کوچک و مشخص انتخاب کن؛ مثلاً «۱۰ دقیقه پیاده‌روی بعد از ناهار».' : 'عادتی که می‌خواهی کنار بگذاری را بنویس. هر روزی که انجامش ندهی، یک قدم جلو رفته‌ای.'}
                action={<Button onClick={() => setEditing(blank(tab))}>افزودن عادت</Button>}
              />
            </Card>
          )}
          {list.map((h) => (
            <HabitRow key={h.id} h={h} logs={logs} onOpen={() => setDetail(h)} />
          ))}
        </div>
      )}
      {tab !== 'archive' && <Fab onClick={() => setEditing(blank(tab))} label="افزودن عادت" />}
      <HabitForm habit={editing} onClose={() => setEditing(null)} count={habits.length} />
      <HabitDetail habit={detail} logs={logs} onClose={() => setDetail(null)} onEdit={(h) => { setDetail(null); setEditing(h) }} />
    </div>
  )
}

const blank = (type: 'good' | 'bad'): Habit => ({
  name: '',
  type,
  days: 30,
  start: todayKey(),
  status: 'active',
  color: type === 'good' ? PALETTE[0] : PALETTE[5],
  order: Date.now(),
  createdAt: Date.now(),
})

export function useHabitToggle() {
  const [trigFor, setTrigFor] = useState<Habit | null>(null)
  const run = async (h: Habit, done: boolean) => {
    if (h.type === 'bad' && !done) {
      setTrigFor(h)
      return
    }
    await toggleHabit(h)
  }
  const sheet = (
    <Sheet open={!!trigFor} onClose={() => setTrigFor(null)} title="چه چیزی باعثش شد؟">
      <p className="mb-3 text-sm leading-7 text-muted">اختیاری است. ثبت علت کمک می‌کند بعداً الگوها را پیدا کنیم.</p>
      <div className="flex flex-wrap gap-2">
        {TRIGGERS.map((t) => (
          <Chip
            key={t}
            onClick={async () => {
              await toggleHabit(trigFor!, t)
              setTrigFor(null)
            }}
          >
            {t}
          </Chip>
        ))}
      </div>
      <Button
        variant="soft"
        block
        className="mt-4"
        onClick={async () => {
          await toggleHabit(trigFor!)
          setTrigFor(null)
        }}
      >
        فقط ثبت کن
      </Button>
    </Sheet>
  )
  return { run, sheet }
}

export function HabitRow({ h, logs, onOpen, compact }: { h: Habit; logs: HabitLog[]; onOpen?: () => void; compact?: boolean }) {
  const s = useMemo(() => habitStats(h, logs), [h, logs])
  const { run, sheet } = useHabitToggle()
  const bad = h.type === 'bad'
  const color = bad ? 'var(--bad)' : h.color
  return (
    <div className={`${compact ? '' : 'card p-3.5'} flex items-center gap-3`} onClick={onOpen}>
      <CheckButton checked={s.todayDone} onChange={() => run(h, s.todayDone)} color={color} size={compact ? 28 : 34} label={h.name} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${s.todayDone && !bad ? 'text-muted line-through decoration-1' : ''}`}>
          {h.emoji && <span className="me-1">{h.emoji}</span>}
          {h.name}
        </p>
        <p className="text-xs text-muted">
          روز {fa(s.dayNo)} از {fa(h.days)}
          {s.streak > 1 && (
            <span className="ms-2 text-warn">
              <Flame size={12} className="-mt-0.5 inline" /> {fa(s.streak)} روز پشت‌سرهم
            </span>
          )}
        </p>
        {!compact && (
          <div className="mt-2 flex gap-[3px]">
            {s.days.slice(-Math.min(h.days, 30)).map((d) => (
              <span
                key={d.k}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  background: d.state === 'ok' ? (bad ? 'var(--good)' : h.color) : d.state === 'fail' ? 'var(--bad)' : d.state === 'pending' ? 'var(--line)' : 'var(--surface-2)',
                  opacity: d.state === 'future' ? 0.6 : 1,
                }}
              />
            ))}
          </div>
        )}
      </div>
      {!compact && (
        <Ring value={s.rate} size={44} stroke={4} color={bad ? 'var(--good)' : h.color}>
          <span className="tnum text-[10px]">{pct(s.rate)}</span>
        </Ring>
      )}
      <div className="contents" onClick={(e) => e.stopPropagation()}>
        {sheet}
      </div>
    </div>
  )
}

function HabitForm({ habit, onClose, count }: { habit: Habit | null; onClose: () => void; count: number }) {
  const [cur, setH] = useState<Habit | null>(null)
  useEffect(() => {
    if (habit) setH(habit)
  }, [habit])
  const set = (p: Partial<Habit>) => setH({ ...(cur as Habit), ...p })
  const isNew = !habit?.id
  return (
    <Sheet
      open={!!habit}
      onClose={onClose}
      title={isNew ? 'عادت جدید' : 'ویرایش عادت'}
      footer={
        <Button
          block
          disabled={!cur?.name.trim() || !cur?.days}
          onClick={async () => {
            if (!cur) return
            if (isNew) await db.habits.add({ ...cur, name: cur.name.trim(), order: count })
            else await db.habits.put({ ...cur, name: cur.name.trim() })
            toast(isNew ? 'عادت اضافه شد' : 'ذخیره شد')
            onClose()
          }}
        >
          {isNew ? 'شروع دوره' : 'ذخیره'}
        </Button>
      }
    >
      {cur && (
        <div>
          <Label>نوع</Label>
          <Segmented
            value={cur.type}
            onChange={(type) => set({ type, color: type === 'good' ? PALETTE[0] : PALETTE[5] })}
            options={[
              { value: 'good', label: 'عادت خوب' },
              { value: 'bad', label: 'عادت بد' },
            ]}
          />
          <Label>نام عادت</Label>
          <div className="flex gap-2">
            <input className="field w-16 text-center text-xl" maxLength={2} placeholder="🙂" value={cur.emoji || ''} onChange={(e) => set({ emoji: e.target.value })} aria-label="ایموجی" />
            <input className="field flex-1" autoFocus={isNew} placeholder={cur.type === 'good' ? 'مثلاً ۲۰ دقیقه مطالعه' : 'مثلاً شبکه‌های اجتماعی بعد از ۱۱ شب'} value={cur.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <Label hint="تحقیقات نشان می‌دهد تثبیت عادت به‌طور میانگین حدود ۶۶ روز طول می‌کشد">طول دوره</Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((d) => (
              <Chip key={d} active={cur.days === d} onClick={() => set({ days: d })}>
                {fa(d)} روز
              </Chip>
            ))}
            <input
              inputMode="numeric"
              className="field h-9 w-24 py-0 text-center text-sm"
              placeholder="دلخواه"
              value={PRESETS.includes(cur.days) ? '' : fa(cur.days)}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 10)
                set({ days: Number.isFinite(n) ? Math.min(365, n) : 0 })
              }}
            />
          </div>
          {cur.type === 'good' && (
            <>
              <Label>رنگ</Label>
              <div className="flex gap-2">
                {PALETTE.slice(0, 8).map((c) => (
                  <button key={c} onClick={() => set({ color: c })} className="press size-9 rounded-full" style={{ background: c, outline: cur.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} aria-label="رنگ" />
                ))}
              </div>
            </>
          )}
          <p className="mt-4 text-xs leading-6 text-muted">
            دوره از {isNew ? 'امروز' : jDayMonth(cur.start)} شروع می‌شود و {jDayMonth(habitEnd(cur))} تمام می‌شود. بعد از آن نتیجه خودکار به بایگانی می‌رود.
          </p>
        </div>
      )}
    </Sheet>
  )
}

function HabitDetail({ habit, logs, onClose, onEdit }: { habit: Habit | null; logs: HabitLog[]; onClose: () => void; onEdit: (h: Habit) => void }) {
  const live = useLiveQuery(() => (habit?.id ? db.habits.get(habit.id) : undefined), [habit?.id])
  const h = live || habit
  const s = h ? habitStats(h, logs) : null
  const myLogs = h ? logs.filter((l) => l.habitId === h.id && l.trigger) : []
  const trig = myLogs.reduce<Record<string, number>>((m, l) => ((m[l.trigger!] = (m[l.trigger!] || 0) + 1), m), {})
  return (
    <Sheet open={!!habit} onClose={onClose} title={h ? `${h.emoji || ''} ${h.name}` : ''}>
      {h && s && (
        <div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-xs text-muted">موفقیت</p><p className="tnum text-xl font-extrabold">{pct(s.rate)}</p></div>
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-xs text-muted">رشتهٔ فعلی</p><p className="tnum text-xl font-extrabold">{fa(s.streak)}</p></div>
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-xs text-muted">بهترین رشته</p><p className="tnum text-xl font-extrabold">{fa(s.best)}</p></div>
          </div>
          <Label hint={`${jDayMonth(h.start)} تا ${jDayMonth(habitEnd(h))}`}>روزهای دوره</Label>
          <div className="grid grid-cols-10 gap-1.5">
            {s.days.map((d, i) => (
              <div
                key={d.k}
                title={jDayMonth(d.k)}
                className="tnum grid aspect-square place-items-center rounded-lg text-[10px] font-bold"
                style={{
                  background: d.state === 'ok' ? 'var(--good)' : d.state === 'fail' ? 'var(--bad)' : 'var(--surface-2)',
                  color: d.state === 'ok' || d.state === 'fail' ? '#fff' : 'var(--muted)',
                  outline: d.state === 'pending' ? '2px solid var(--accent)' : 'none',
                }}
              >
                {fa(i + 1)}
              </div>
            ))}
          </div>
          {Object.keys(trig).length > 0 && (
            <>
              <Label>علت لغزش‌ها</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(trig).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                  <span key={t} className="rounded-full bg-bad-soft px-3 py-1 text-sm text-bad">{t} · {fa(n)}</span>
                ))}
              </div>
            </>
          )}
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="soft" onClick={() => onEdit(h)}>ویرایش</Button>
            <Button
              variant="soft"
              onClick={async () => {
                await archiveHabit(h, true)
                toast('دوره تمام شد و به بایگانی رفت')
                onClose()
              }}
            >
              <Archive size={18} /> پایان دوره
            </Button>
          </div>
          <Button
            variant="danger"
            block
            className="mt-2"
            onClick={async () => {
              const hl = await db.habitLogs.where('habitId').equals(h.id!).toArray()
              await db.habitLogs.bulkDelete(hl.map((l) => [l.habitId, l.date] as [number, string]))
              await db.habits.delete(h.id!)
              onClose()
              toast('عادت حذف شد', {
                label: 'بازگردانی',
                run: async () => {
                  await db.habits.add(h)
                  await db.habitLogs.bulkAdd(hl)
                },
              })
            }}
          >
            <Trash2 size={18} /> حذف عادت
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function ArchiveList({ habits }: { habits: Habit[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, Habit[]>()
    for (const h of [...habits].sort((a, b) => (b.result?.endDate || '').localeCompare(a.result?.endDate || ''))) {
      const k = h.result?.monthKey || ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(h)
    }
    return [...m.entries()]
  }, [habits])
  if (!habits.length)
    return (
      <Card>
        <Empty icon={<Archive />} title="بایگانی خالی است" text="وقتی دورهٔ یک عادت تمام شود، نتیجه‌اش اینجا ذخیره می‌شود." />
      </Card>
    )
  return (
    <div className="space-y-4">
      {groups.map(([mk, hs]) => (
        <div key={mk}>
          <h3 className="mb-2 px-1 text-sm font-bold text-muted">{mk ? jMonthLabel(mk) : ''}</h3>
          <div className="space-y-2">
            {hs.map((h) => (
              <div key={h.id} className="card flex items-center gap-3 p-3.5">
                <Ring value={h.result?.rate || 0} size={46} stroke={4} color={h.type === 'bad' ? 'var(--good)' : h.color}>
                  <span className="tnum text-[10px]">{pct(h.result?.rate || 0)}</span>
                </Ring>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{h.emoji} {h.name}</p>
                  <p className="text-xs text-muted">
                    {h.type === 'good' ? 'خوب' : 'بد'} · {fa(h.result?.successDays || 0)} از {fa(h.result?.totalDays || 0)} روز موفق · بهترین رشته {fa(h.result?.bestStreak || 0)}
                    {h.result?.endedEarly && ' · زودتر تمام شد'}
                  </p>
                </div>
                <button
                  className="press grid size-10 place-items-center rounded-full bg-surface-2"
                  aria-label="تکرار دوره"
                  onClick={async () => {
                    await db.habits.add({ ...h, id: undefined, start: todayKey(), status: 'active', result: undefined, archivedAt: undefined, createdAt: Date.now() })
                    toast('دورهٔ جدید از امروز شروع شد')
                  }}
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
