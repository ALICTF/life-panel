import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ExternalLink, Flame, GraduationCap, Languages, NotebookPen, Pause, Play, Plus, Timer, Trash2, X } from 'lucide-react'
import { db } from '../db/db'
import type { LearnItem, LearnKind, LearnLog, Word } from '../db/types'
import { addLearnLog, blankItem, KINDS, kindMeta, LANG_SKILLS, learnStats, LEVELS, scheduledOn, sourceMeta, SOURCES, syncSchedule } from '../lib/learn'
import { addDaysKey, jDayMonth, jLong, todayKey, relDay, weekIndex, weekStart } from '../lib/date'
import { fa, pct, uid } from '../lib/format'
import { haptic, useStagger } from '../lib/anim'
import { Button, Card, CheckButton, Chip, Empty, Fab, Label, NumberField, PageHeader, Progress, Segmented } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { DateField, WEEK } from '../ui/DatePicker'
import { toast } from '../ui/Toast'
import { useFocus } from './Focus'

export default function Learn() {
  const [kind, setKind] = useState<LearnKind>(() => {
    try {
      return (localStorage.getItem('learnTab') as LearnKind) || 'language'
    } catch {
      return 'language'
    }
  })
  const [form, setForm] = useState<LearnItem | null>(null)
  const [detail, setDetail] = useState<number | null>(null)
  const [logFor, setLogFor] = useState<LearnItem | null>(null)
  const [showDone, setShowDone] = useState(false)
  const items = useLiveQuery(() => db.learn.toArray(), []) || []
  const logs = useLiveQuery(() => db.learnLogs.toArray(), []) || []
  const ref = useStagger<HTMLDivElement>([kind])
  const list = items.filter((i) => i.kind === kind).sort((a, b) => a.order - b.order)
  const active = list.filter((i) => i.status === 'active')
  const other = list.filter((i) => i.status !== 'active')
  const pick = (k: LearnKind) => {
    setKind(k)
    try {
      localStorage.setItem('learnTab', k)
    } catch {
      /* اختیاری */
    }
  }
  const icons = { language: <Languages />, skill: <GraduationCap />, book: <BookOpen /> }
  const empty = {
    language: ['هنوز زبانی اضافه نکرده‌ای', 'زبانی که یاد می‌گیری، سطح فعلی و هدفت، منبع (اپ، کلاس، یوتیوب) و ساعت تمرین روزانه را بنویس.'],
    skill: ['هنوز مهارتی اضافه نکرده‌ای', 'مثلاً «سئو» از یوتیوب یا «طراحی UI» از یک دورهٔ آنلاین. برای چه هدفی یاد می‌گیری و کی تمرین می‌کنی؟'],
    book: ['قفسه خالی است', 'کتابی که می‌خوانی، تعداد صفحه‌ها و مهلت را بنویس. هر روز فقط بگو تا صفحهٔ چند رسیدی.'],
  }[kind]

  return (
    <div>
      <PageHeader title="یادگیری" sub="زبان، مهارت و کتاب‌خوانی" back />
      <Segmented
        className="mb-3"
        value={kind}
        onChange={pick}
        options={KINDS.map((k) => ({
          value: k.v,
          label: (
            <span>
              {k.icon} {k.label}
              {items.filter((i) => i.kind === k.v && i.status === 'active').length > 0 && <span className="tnum ms-1 text-xs text-muted">{fa(items.filter((i) => i.kind === k.v && i.status === 'active').length)}</span>}
            </span>
          ),
        }))}
      />
      {!active.length && (
        <Card>
          <Empty icon={icons[kind]} title={empty[0]} text={empty[1]} action={<Button onClick={() => setForm(blankItem(kind))}>افزودن {kindMeta(kind).label}</Button>} />
        </Card>
      )}
      <div ref={ref} className="space-y-3">
        {active.map((it) => (
          <LearnCard key={it.id} it={it} logs={logs} onOpen={() => setDetail(it.id!)} onLog={() => setLogFor(it)} />
        ))}
      </div>
      {other.length > 0 && (
        <>
          <button className="press mt-4 w-full py-2 text-sm text-muted" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'پنهان کردن' : `تمام‌شده و متوقف (${fa(other.length)})`}
          </button>
          {showDone && (
            <div className="space-y-2.5 opacity-75">
              {other.map((it) => (
                <LearnCard key={it.id} it={it} logs={logs} onOpen={() => setDetail(it.id!)} onLog={() => setLogFor(it)} />
              ))}
            </div>
          )}
        </>
      )}
      <Fab onClick={() => setForm(blankItem(kind))} label="افزودن" />
      <LearnForm item={form} onClose={() => setForm(null)} />
      <LogSheet item={logFor} onClose={() => setLogFor(null)} />
      <LearnDetail id={detail} logs={logs} onClose={() => setDetail(null)} onEdit={(it) => { setDetail(null); setForm(it) }} onLog={(it) => setLogFor(it)} />
    </div>
  )
}

/* ───────────── کارت ───────────── */

export function LearnCard({ it, logs, onOpen, onLog, compact }: { it: LearnItem; logs: LearnLog[]; onOpen?: () => void; onLog: () => void; compact?: boolean }) {
  const s = useMemo(() => learnStats(it, logs), [it, logs])
  const focus = useFocus()
  const meta = kindMeta(it.kind)
  const src = sourceMeta(it.source?.type)
  return (
    <div className={compact ? '' : 'card p-4'}>
      <button className="press block w-full text-start" onClick={onOpen}>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-xl">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{it.title}</p>
            <p className="truncate text-xs text-muted">
              {[it.kind === 'language' && it.level && `${it.level}${it.targetLevel ? ` ← ${it.targetLevel}` : ''}`, it.author, src && `${src.icon} ${it.source?.name || src.label}`, it.schedule?.time && it.schedule.days.length ? `${fa(it.schedule.time)} · ${fa(it.schedule.days.length)} روز در هفته` : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {s.streak > 0 && (
            <span className="tnum flex items-center gap-0.5 text-sm font-bold text-warn">
              <Flame size={15} />
              {fa(s.streak)}
            </span>
          )}
        </div>
        {s.progress !== undefined && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="tnum text-muted">
                {fa(it.current || 0)} از {fa(it.total!)} {meta.unit}
              </span>
              <span className="tnum font-bold">{pct(s.progress)}</span>
            </div>
            <Progress value={s.progress} />
          </div>
        )}
        {s.behind ? (
          <p className="mt-2 rounded-xl bg-bad-soft px-3 py-1.5 text-xs leading-6 text-bad">
            {fa(s.behind)} {meta.unit} عقبی. برای رسیدن به مهلت، روزی {fa(s.perDay!)} {meta.unit} لازم است.
          </p>
        ) : s.perDay ? (
          <p className="mt-2 text-xs text-muted">
            روزی {fa(s.perDay)} {meta.unit} تا مهلت ({fa(s.daysLeft!)} روز مانده)
          </p>
        ) : s.eta ? (
          <p className="mt-2 text-xs text-muted">با سرعت فعلی حدود {jDayMonth(s.eta)} تمام می‌شود</p>
        ) : null}
        {!compact && (
          <div className="mt-3 flex gap-[3px]">
            {s.days.map((d) => (
              <span
                key={d.k}
                className="h-2 flex-1 rounded-full"
                style={{
                  background: d.state === 'full' ? 'var(--accent)' : d.state === 'min' ? 'color-mix(in oklab, var(--accent) 45%, transparent)' : d.state === 'miss' ? 'var(--bad)' : 'var(--surface-2)',
                  opacity: d.state === 'future' ? 0.4 : d.state === 'miss' ? 0.55 : 1,
                }}
              />
            ))}
          </div>
        )}
      </button>
      {it.status === 'active' && (
        <div className="mt-3 flex gap-2">
          <Button variant={s.todayDone ? 'soft' : 'primary'} className="h-10 flex-1 text-sm" onClick={onLog}>
            {s.todayDone ? `امروز ✓ ${it.kind === 'book' ? `${fa(s.todayAmount)} صفحه` : `${fa(s.todayMinutes)} دقیقه`}` : it.kind === 'book' ? 'تا صفحهٔ چند خواندم؟' : 'ثبت تمرین امروز'}
          </Button>
          <button
            className="press grid size-10 place-items-center rounded-2xl bg-surface-2 text-[#4f46e5]"
            onClick={() => focus.openPicker(undefined, it)}
            aria-label="شروع تایمر"
          >
            <Timer size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ───────────── ثبت پیشرفت ───────────── */

export function LogSheet({ item, onClose }: { item: LearnItem | null; onClose: () => void }) {
  const [src, setSrc] = useState<LearnItem | null>(null)
  const [toPage, setToPage] = useState<number | undefined>()
  const [amount, setAmount] = useState(1)
  const [minutes, setMinutes] = useState<number | undefined>()
  const [skills, setSkills] = useState<string[]>([])
  const [note, setNote] = useState('')
  if (item && item !== src) {
    setSrc(item)
    setToPage((item.current || 0) + Math.max(item.minDaily || 1, 1))
    setAmount(1)
    setMinutes(item.kind === 'language' ? item.schedule?.minutes || 15 : undefined)
    setSkills([])
    setNote('')
  }
  const it = item || src
  if (!it) return null
  const pages = it.kind === 'book' && toPage !== undefined ? toPage - (it.current || 0) : 0
  const valid = it.kind === 'book' ? pages > 0 : it.kind === 'language' ? !!minutes : amount > 0 || !!minutes
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={`${kindMeta(it.kind).icon} ${it.title}`}
      footer={
        <Button
          block
          disabled={!valid}
          onClick={async () => {
            const finished = await addLearnLog(it, {
              minutes,
              amount: it.kind === 'book' ? pages : it.kind === 'skill' ? amount : undefined,
              toValue: it.kind === 'book' ? toPage : undefined,
              skills: skills.length ? skills : undefined,
              note: note.trim() || undefined,
            })
            haptic()
            toast(finished ? `تمام شد! 🎉 «${it.title}»` : 'ثبت شد')
            onClose()
          }}
        >
          ثبت
        </Button>
      }
    >
      {it.kind === 'book' && (
        <>
          <Label hint={`الان صفحهٔ ${fa(it.current || 0)}${it.total ? ` از ${fa(it.total)}` : ''}`}>تا صفحهٔ چند خواندی؟</Label>
          <NumberField value={toPage} onChange={setToPage} suffix="صفحه" />
          {pages > 0 && <p className="tnum mt-2 text-sm text-good">امروز {fa(pages)} صفحه 👏</p>}
          {pages < 0 && <p className="mt-2 text-sm text-bad">کمتر از صفحهٔ فعلی است.</p>}
          <div className="mt-2 flex gap-2">
            {[2, 5, 10, 20].map((n) => (
              <Chip key={n} onClick={() => setToPage((it.current || 0) + n)}>
                +{fa(n)}
              </Chip>
            ))}
          </div>
        </>
      )}
      {it.kind === 'skill' && (
        <>
          <Label>چند درس یا جلسه؟</Label>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((n) => (
              <Chip key={n} active={amount === n} onClick={() => setAmount(n)}>
                {n === 0 ? 'فقط تمرین' : `${fa(n)} درس`}
              </Chip>
            ))}
          </div>
        </>
      )}
      {it.kind === 'language' && (
        <>
          <Label>چه چیزی تمرین کردی؟</Label>
          <div className="flex flex-wrap gap-2">
            {LANG_SKILLS.map((k) => (
              <Chip key={k} active={skills.includes(k)} onClick={() => setSkills(skills.includes(k) ? skills.filter((x) => x !== k) : [...skills, k])}>
                {k}
              </Chip>
            ))}
          </div>
        </>
      )}
      <Label hint={it.kind === 'book' ? 'اختیاری' : undefined}>چند دقیقه؟</Label>
      <div className="flex flex-wrap gap-2">
        {[5, 10, 15, 20, 30, 45, 60].map((m) => (
          <Chip key={m} active={minutes === m} onClick={() => setMinutes(minutes === m ? undefined : m)}>
            {fa(m)}
          </Chip>
        ))}
      </div>
      <Label hint="اختیاری">یادداشت</Label>
      <input className="field text-sm" placeholder={it.kind === 'book' ? 'جملهٔ مهم یا نکتهٔ امروز' : 'چه یاد گرفتی؟'} value={note} onChange={(e) => setNote(e.target.value)} />
    </Sheet>
  )
}

/* ───────────── فرم ───────────── */

function LearnForm({ item, onClose }: { item: LearnItem | null; onClose: () => void }) {
  const [cur, setCur] = useState<LearnItem | null>(null)
  const [src, setSrc] = useState<LearnItem | null>(null)
  const goals = useLiveQuery(() => db.goals.where('status').equals('active').toArray(), []) || []
  if (item && item !== src) {
    setSrc(item)
    setCur(item)
  }
  if (!cur) return null
  const set = (p: Partial<LearnItem>) => setCur({ ...cur, ...p })
  const sch = cur.schedule || { days: [], minutes: 30 }
  const isNew = !cur.id
  const meta = kindMeta(cur.kind)
  const save = async () => {
    const data: LearnItem = { ...cur, title: cur.title.trim(), updatedAt: Date.now() }
    if (isNew) data.startValue = data.current || 0
    const id = isNew ? await db.learn.add(data) : (await db.learn.put(data), data.id!)
    const recurId = await syncSchedule({ ...data, id })
    await db.learn.update(id, { recurId })
    toast(sch.days.length && sch.time ? 'ذخیره شد و جلسه‌ها در تقویم قرار گرفتند' : 'ذخیره شد')
    onClose()
  }
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      full
      title={isNew ? `${meta.icon} ${meta.label} جدید` : 'ویرایش'}
      footer={
        <Button block disabled={!cur.title.trim()} onClick={save}>
          ذخیره
        </Button>
      }
    >
      <Label>{cur.kind === 'language' ? 'کدام زبان؟' : cur.kind === 'skill' ? 'چه مهارتی؟' : 'نام کتاب'}</Label>
      <input className="field" autoFocus={isNew} placeholder={cur.kind === 'language' ? 'مثلاً انگلیسی' : cur.kind === 'skill' ? 'مثلاً سئو، طراحی UI، ادیت ویدیو' : 'مثلاً عادت‌های اتمی'} value={cur.title} onChange={(e) => set({ title: e.target.value })} />
      {cur.kind === 'book' && (
        <>
          <Label hint="اختیاری">نویسنده</Label>
          <input className="field" value={cur.author || ''} onChange={(e) => set({ author: e.target.value })} />
        </>
      )}

      <Label hint="وقتی انگیزه کم شد، این را دوباره می‌خوانی">برای چه هدفی؟</Label>
      <textarea className="field min-h-20 leading-7" placeholder={cur.kind === 'language' ? 'مثلاً برای مهاجرت کاری یا آیلتس ۷' : cur.kind === 'skill' ? 'مثلاً برای اینکه پروژه‌های سئو هم بگیرم و درآمدم بیشتر شود' : 'مثلاً برای بهتر کردن عادت‌هایم'} value={cur.why || ''} onChange={(e) => set({ why: e.target.value })} />
      {goals.length > 0 && (
        <select className="field mt-2" value={cur.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">وصل به یک هدف (اختیاری)</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
      )}

      {cur.kind === 'language' && (
        <>
          <Label>سطح فعلی ← سطح هدف</Label>
          <div className="flex items-center gap-2">
            <select className="field flex-1" value={cur.level || ''} onChange={(e) => set({ level: e.target.value || undefined })}>
              <option value="">نمی‌دانم</option>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <span className="text-muted">←</span>
            <select className="field flex-1" value={cur.targetLevel || ''} onChange={(e) => set({ targetLevel: e.target.value || undefined })}>
              <option value="">—</option>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </>
      )}

      <Label>منبع</Label>
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <Chip key={s.v} active={cur.source?.type === s.v} onClick={() => set({ source: { ...cur.source, type: s.v } })}>
            {s.icon} {s.label}
          </Chip>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input className="field text-sm" placeholder="نام منبع؛ مثلاً کانال X" value={cur.source?.name || ''} onChange={(e) => set({ source: { type: cur.source?.type || 'other', ...cur.source, name: e.target.value } })} />
        <input className="field text-sm" dir="ltr" placeholder="لینک (اختیاری)" value={cur.source?.url || ''} onChange={(e) => set({ source: { type: cur.source?.type || 'other', ...cur.source, url: e.target.value } })} />
      </div>

      {cur.kind !== 'language' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{cur.kind === 'book' ? 'تعداد صفحه‌ها' : 'تعداد درس‌ها'}</Label>
            <NumberField value={cur.total} onChange={(total) => set({ total: total ? Math.round(total) : undefined })} placeholder={cur.kind === 'book' ? '۳۲۰' : '۴۰'} />
          </div>
          <div>
            <Label>{cur.kind === 'book' ? 'صفحهٔ فعلی' : 'درس‌های دیده‌شده'}</Label>
            <NumberField value={cur.current} onChange={(current) => set({ current: Math.round(current || 0) })} placeholder="۰" />
          </div>
        </div>
      )}

      <Label hint="خودکار تسک ساعت‌دار در تقویم ساخته می‌شود">برنامهٔ زمانی</Label>
      <div className="flex justify-between gap-1">
        {WEEK.map((w, i) => (
          <button
            key={w}
            onClick={() => set({ schedule: { ...sch, days: sch.days.includes(i) ? sch.days.filter((x) => x !== i) : [...sch.days, i] } })}
            className={`press size-10 rounded-full text-sm font-bold ${sch.days.includes(i) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}
          >
            {w}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="time" className="field tnum w-32" value={sch.time || ''} onChange={(e) => set({ schedule: { ...sch, time: e.target.value || undefined } })} />
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {[10, 15, 20, 30, 45, 60, 90].map((m) => (
            <Chip key={m} active={sch.minutes === m} onClick={() => set({ schedule: { ...sch, minutes: m } })}>
              {fa(m)}′
            </Chip>
          ))}
        </div>
      </div>

      <Label hint="روزهای سخت هم با همین مقدار رشته نمی‌شکند">حداقل روزانه</Label>
      <div className="flex flex-wrap gap-2">
        {(cur.kind === 'book' ? [1, 2, 5, 10] : [2, 5, 10, 15]).map((n) => (
          <Chip key={n} active={cur.minDaily === n} onClick={() => set({ minDaily: n })}>
            {fa(n)} {cur.kind === 'book' ? 'صفحه' : 'دقیقه'}
          </Chip>
        ))}
      </div>

      <Label hint="اختیاری">مهلت</Label>
      {cur.deadline ? (
        <div className="flex gap-2">
          <div className="flex-1">
            <DateField value={cur.deadline} onChange={(deadline) => set({ deadline })} />
          </div>
          <button className="press grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted" onClick={() => set({ deadline: undefined })} aria-label="بدون مهلت">
            <X size={18} />
          </button>
        </div>
      ) : (
        <Button variant="soft" block onClick={() => set({ deadline: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) })}>
          تعیین مهلت
        </Button>
      )}

      <div className="mt-5 rounded-2xl bg-accent-soft p-3">
        <p className="text-sm font-bold">کمک‌های انگیزشی (اختیاری)</p>
        <Label hint="آخر هفته می‌پرسم رعایت شد یا نه">قرار با خودم</Label>
        <input className="field bg-surface text-sm" placeholder="اگر این هفته کمتر از ۳ جلسه رفتم، تا هفتهٔ بعد قهوهٔ بیرون نمی‌خرم" value={cur.pledge || ''} onChange={(e) => set({ pledge: e.target.value })} />
        <Label>همراه با یک لذت</Label>
        <input className="field bg-surface text-sm" placeholder="پادکست انگلیسی فقط موقع پیاده‌روی" value={cur.bundle || ''} onChange={(e) => set({ bundle: e.target.value })} />
      </div>
    </Sheet>
  )
}

/* ───────────── جزئیات ───────────── */

function LearnDetail({ id, logs, onClose, onEdit, onLog }: { id: number | null; logs: LearnLog[]; onClose: () => void; onEdit: (it: LearnItem) => void; onLog: (it: LearnItem) => void }) {
  const it = useLiveQuery(() => (id ? db.learn.get(id) : undefined), [id])
  const goal = useLiveQuery(() => (it?.goalId ? db.goals.get(it.goalId) : undefined), [it?.goalId])
  const nav = useNavigate()
  const [step, setStep] = useState('')
  const mine = logs.filter((l) => l.itemId === id).sort((a, b) => b.at - a.at)
  const s = it ? learnStats(it, logs) : null
  const src = sourceMeta(it?.source?.type)
  return (
    <Sheet open={!!id && !!it} onClose={onClose} full title={it ? `${kindMeta(it.kind).icon} ${it.title}` : ''}>
      {it && s && (
        <div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-xs text-muted">رشته</p><p className="tnum text-xl font-extrabold">{fa(s.streak)}🔥</p></div>
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-xs text-muted">۷ روز اخیر</p><p className="tnum text-xl font-extrabold">{fa(s.weekMinutes)}′</p></div>
            <div className="rounded-2xl bg-surface-2 p-3"><p className="text-xs text-muted">{it.kind === 'book' ? 'صفحهٔ هفته' : 'جلسهٔ هفته'}</p><p className="tnum text-xl font-extrabold">{fa(it.kind === 'book' ? s.weekAmount : s.weekSessions)}</p></div>
          </div>

          {it.why && (
            <div className="mt-4 rounded-2xl bg-accent-soft p-3 text-[15px] leading-8">
              <p className="text-xs font-bold text-accent">چرا یاد می‌گیرم</p>
              {it.why}
              {goal && <p className="mt-1 text-xs text-muted">هدف: {goal.title}</p>}
            </div>
          )}

          <div className="mt-4 space-y-2 text-sm">
            {src && (
              <p>
                منبع: {src.icon} {it.source?.name || src.label}
                {it.source?.url && (
                  <a href={/^https?:/.test(it.source.url) ? it.source.url : `https://${it.source.url}`} target="_blank" rel="noopener" className="ms-2 inline-flex items-center gap-1 font-semibold text-accent">
                    باز کردن <ExternalLink size={13} />
                  </a>
                )}
              </p>
            )}
            {it.schedule?.days.length ? (
              <p>
                برنامه: {it.schedule.days.sort().map((d) => WEEK[d]).join('، ')}
                {it.schedule.time && ` · ساعت ${fa(it.schedule.time)}`} · {fa(it.schedule.minutes)} دقیقه
              </p>
            ) : null}
            {it.deadline && <p>مهلت: {jLong(it.deadline)}</p>}
            {it.pledge && <p>🤝 قرار: {it.pledge}</p>}
            {it.bundle && <p>🎧 همراه با: {it.bundle}</p>}
          </div>

          {it.kind === 'skill' && (
            <div className="mt-5">
              <h4 className="mb-1 font-bold">پروژهٔ عملی</h4>
              <p className="mb-2 text-xs text-muted">کارهایی که با این مهارت واقعاً می‌سازی؛ یادگیری فقط تماشا نیست.</p>
              <div className="space-y-1.5">
                {(it.project || []).map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <CheckButton size={24} checked={p.done} onChange={() => db.learn.update(it.id!, { project: (it.project || []).map((x) => (x.id === p.id ? { ...x, done: !x.done } : x)) })} />
                    <span className={`flex-1 text-sm ${p.done ? 'text-muted line-through' : ''}`}>{p.text}</span>
                    <button className="press p-1 text-muted" onClick={() => db.learn.update(it.id!, { project: (it.project || []).filter((x) => x.id !== p.id) })} aria-label="حذف"><X size={14} /></button>
                  </div>
                ))}
              </div>
              <input
                className="field mt-2 h-10 py-0 text-sm"
                placeholder="مثلاً سئوی سایت سحر را خودم انجام بدهم"
                value={step}
                onChange={(e) => setStep(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && step.trim()) {
                    db.learn.update(it.id!, { project: [...(it.project || []), { id: uid(), text: step.trim(), done: false }] })
                    setStep('')
                  }
                }}
              />
            </div>
          )}

          {it.kind === 'language' && <Words item={it} />}

          {it.kind === 'book' && (
            <Button
              variant="soft"
              block
              className="mt-5"
              onClick={async () => {
                const tag = it.title.replace(/\s+/g, '_')
                let n = await db.notes.filter((x) => !x.deleted && x.tags.includes(tag)).first()
                const nid = n?.id ?? (await db.notes.add({ title: `یادداشت‌های «${it.title}»`, body: '', tags: [tag, 'کتاب'], pinned: 0, deleted: 0, createdAt: Date.now(), updatedAt: Date.now() }))
                onClose()
                setTimeout(() => nav(`/notes/${nid}`), 350)
              }}
            >
              <NotebookPen size={18} /> یادداشت‌ها و جمله‌های مهم این کتاب
            </Button>
          )}

          {mine.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-1 font-bold">ثبت‌ها</h4>
              <div className="divide-y divide-line text-sm">
                {mine.slice(0, 12).map((l) => (
                  <div key={l.id} className="flex items-start justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="text-muted">{relDay(l.date)}</span>
                      {l.note && <span className="block truncate text-xs text-muted">{l.note}</span>}
                    </span>
                    <span className="tnum shrink-0">
                      {it.kind === 'book' && l.amount ? `${fa(l.amount)} صفحه` : it.kind === 'skill' && l.amount ? `${fa(l.amount)} درس` : ''}
                      {l.minutes ? ` ${fa(l.minutes)}′` : ''}
                      {l.skills?.length ? ` · ${l.skills.join('، ')}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-2">
            <Button variant="soft" onClick={() => onEdit(it)}>ویرایش</Button>
            <Button
              variant="soft"
              onClick={async () => {
                const status = it.status === 'active' ? 'paused' : 'active'
                await db.learn.update(it.id!, { status })
                const recurId = await syncSchedule({ ...it, status })
                await db.learn.update(it.id!, { recurId })
                toast(status === 'paused' ? 'متوقف شد؛ جلسه‌های آینده از تقویم برداشته شد' : 'دوباره فعال شد')
              }}
            >
              {it.status === 'active' ? <><Pause size={16} /> توقف</> : <><Play size={16} /> ادامه</>}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await syncSchedule({ ...it, status: 'paused' })
                await db.learn.delete(it.id!)
                onClose()
                toast('حذف شد')
              }}
            >
              <Trash2 size={16} />
            </Button>
          </div>
          {it.status === 'active' && (
            <Button block className="mt-2" onClick={() => onLog(it)}>
              ثبت پیشرفت امروز
            </Button>
          )}
        </div>
      )}
    </Sheet>
  )
}

/* ───────────── دفترچهٔ لغت ───────────── */

function Words({ item }: { item: LearnItem }) {
  const words = useLiveQuery(() => db.words.where('itemId').equals(item.id!).toArray(), [item.id]) || []
  const [w, setW] = useState('')
  const [m, setM] = useState('')
  const [review, setReview] = useState<Word[] | null>(null)
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)
  const learning = words.filter((x) => !x.known)
  const add = async () => {
    if (!w.trim()) return
    await db.words.add({ itemId: item.id!, word: w.trim(), meaning: m.trim(), reviews: 0, createdAt: Date.now() })
    setW('')
    setM('')
  }
  const startReview = () => {
    // کم‌مرورشده‌ها اول، با کمی تصادف
    const pool = [...learning].sort((a, b) => a.reviews - b.reviews || Math.random() - 0.5).slice(0, 10)
    setReview(pool)
    setI(0)
    setShow(false)
  }
  const cur = review?.[i]
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-bold">دفترچهٔ لغت <span className="tnum text-xs font-normal text-muted">{fa(words.length)} لغت · {fa(words.length - learning.length)} بلدم</span></h4>
        {learning.length > 0 && (
          <button className="press rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink" onClick={startReview}>
            مرور {fa(Math.min(10, learning.length))} لغت
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input className="field h-11 flex-1 py-0 text-sm" dir="auto" placeholder="لغت" value={w} onChange={(e) => setW(e.target.value)} />
        <input className="field h-11 flex-1 py-0 text-sm" placeholder="معنی" value={m} onChange={(e) => setM(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="press grid size-11 place-items-center rounded-2xl bg-surface-2" onClick={add} aria-label="افزودن لغت"><Plus size={18} /></button>
      </div>
      {words.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {words.slice(-20).reverse().map((x) => (
            <span key={x.id} className={`rounded-full px-2.5 py-1 text-xs ${x.known ? 'bg-good-soft text-good' : 'bg-surface-2'}`} dir="auto">{x.word}</span>
          ))}
        </div>
      )}
      <Sheet open={!!review} onClose={() => setReview(null)} title="مرور لغت‌ها">
        {cur ? (
          <div className="flex flex-col items-center py-4 text-center">
            <p className="tnum text-xs text-muted">{fa(i + 1)} از {fa(review!.length)}</p>
            <p className="mt-4 text-3xl font-extrabold" dir="auto">{cur.word}</p>
            <button className="press mt-4 min-h-12 w-full rounded-2xl bg-surface-2 px-4 py-3 text-lg" onClick={() => setShow(true)}>
              {show ? cur.meaning || '—' : 'نمایش معنی'}
            </button>
            <div className="mt-5 grid w-full grid-cols-2 gap-2">
              {[false, true].map((known) => (
                <Button
                  key={String(known)}
                  variant={known ? 'primary' : 'soft'}
                  onClick={async () => {
                    await db.words.update(cur.id!, { reviews: cur.reviews + 1, known: known && cur.reviews >= 1 ? true : undefined })
                    setShow(false)
                    setI(i + 1)
                  }}
                >
                  {known ? 'بلدم' : 'هنوز نه'}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">لغتی که دو بار «بلدم» بزنی، به فهرست بلدها می‌رود.</p>
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-lg font-bold">مرور تمام شد 🎉</p>
            <Button className="mt-4" onClick={() => setReview(null)}>بستن</Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}


/* ───────────── کارت صفحهٔ امروز ───────────── */

export function TodayLearn() {
  const today = todayKey()
  const items = useLiveQuery(() => db.learn.where('status').equals('active').toArray(), []) || []
  const logs = useLiveQuery(() => db.learnLogs.where('date').aboveOrEqual(addDaysKey(today, -35)).toArray(), [today]) || []
  const week = weekStart(today)
  const answered = useLiveQuery(async () => {
    const rows = await db.settings.where('key').startsWith(`pledge:`).toArray()
    return new Set(rows.map((r) => r.key))
  }, []) || new Set<string>()
  const [logFor, setLogFor] = useState<LearnItem | null>(null)
  const focus = useFocus()
  const nav = useNavigate()
  if (!items.length) return null
  // امروزی‌ها: برنامه‌دار امروز اول، بعد بقیه
  const sorted = [...items].sort((a, b) => Number(scheduledOn(b, today)) - Number(scheduledOn(a, today)) || (a.schedule?.time || '99').localeCompare(b.schedule?.time || '99'))
  const pledges = weekIndex(today) === 6 ? items.filter((i) => i.pledge && !answered.has(`pledge:${i.id}:${week}`)) : []
  return (
    <Card title="یادگیری امروز" action={<button className="press text-sm font-semibold text-muted" onClick={() => nav('/learn')}>همه</button>}>
      <div className="divide-y divide-line">
        {sorted.slice(0, 4).map((it) => {
          const s = learnStats(it, logs)
          const sch = scheduledOn(it, today)
          return (
            <div key={it.id} className="flex items-center gap-3 py-2.5">
              <span className="text-xl">{kindMeta(it.kind).icon}</span>
              <button className="press min-w-0 flex-1 text-start" onClick={() => setLogFor(it)}>
                <span className={`block truncate font-medium ${s.todayDone ? 'text-muted line-through decoration-1' : ''}`}>{it.title}</span>
                <span className="block truncate text-xs text-muted">
                  {s.todayDone
                    ? `امروز ✓ ${it.kind === 'book' ? `${fa(s.todayAmount)} صفحه` : `${fa(s.todayMinutes)} دقیقه`}`
                    : sch && it.schedule?.time
                      ? `ساعت ${fa(it.schedule.time)} · ${fa(it.schedule.minutes)} دقیقه`
                      : `حداقل ${fa(it.minDaily || 1)} ${it.kind === 'book' ? 'صفحه' : 'دقیقه'}`}
                  {s.behind ? <span className="text-bad"> · {fa(s.behind)} {kindMeta(it.kind).unit} عقب</span> : null}
                  {s.streak > 1 && !s.behind ? ` · 🔥${fa(s.streak)}` : ''}
                </span>
              </button>
              {!s.todayDone && (
                <button className="press grid size-9 place-items-center rounded-xl bg-surface-2 text-[#4f46e5]" onClick={() => focus.openPicker(undefined, it)} aria-label="شروع تایمر">
                  <Timer size={17} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {pledges.map((it) => (
        <div key={it.id} className="mt-3 rounded-2xl bg-warn-soft p-3 text-sm">
          <p className="leading-7">🤝 قرار این هفته برای «{it.title}»: <b>{it.pledge}</b></p>
          <p className="mt-1 text-xs text-muted">صادقانه: رعایت شد؟</p>
          <div className="mt-2 flex gap-2">
            {[true, false].map((ok) => (
              <button
                key={String(ok)}
                className="press flex-1 rounded-xl bg-surface py-2 font-semibold"
                onClick={async () => {
                  await db.settings.put({ key: `pledge:${it.id}:${week}`, value: ok })
                  await db.events.add({ at: Date.now(), kind: 'pledge', ref: it.id, data: { kept: ok } })
                  toast(ok ? 'آفرین! سر قولت ماندی' : 'اشکالی ندارد؛ هفتهٔ بعد دوباره')
                }}
              >
                {ok ? 'بله' : 'نه'}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="contents" onClick={(e) => e.stopPropagation()}>
        <LogSheet item={logFor} onClose={() => setLogFor(null)} />
      </div>
    </Card>
  )
}
