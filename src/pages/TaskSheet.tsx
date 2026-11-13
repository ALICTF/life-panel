import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, Plus, Repeat, Trash2, X } from 'lucide-react'
import { db } from '../db/db'
import type { Recurring, Task } from '../db/types'
import { addDaysKey, fromMin, jDay, toMin, weekIndex } from '../lib/date'
import { fa, uid } from '../lib/format'
import { deleteTask, ensureRecurringTasks, PRIORITY, setTaskDone } from '../lib/tasks'
import { Button, CheckButton, Chip, Label, Segmented, Toggle } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { DateField, WEEK } from '../ui/DatePicker'
import { toast } from '../ui/Toast'

type Freq = 'none' | 'daily' | 'weekly' | 'monthly'

export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [t, setT] = useState<Task | null>(null)
  const [freq, setFreq] = useState<Freq>('none')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [applyAll, setApplyAll] = useState(false)
  const [sub, setSub] = useState('')
  const cats = useLiveQuery(() => db.categories.where('kind').equals('task').sortBy('order'), []) || []
  const goals = useLiveQuery(() => db.goals.where('status').equals('active').toArray(), []) || []
  const rule = useLiveQuery(() => (task?.recurId ? db.recurring.get(task.recurId) : undefined), [task?.recurId])

  const [src, setSrc] = useState<Task | null>(null)
  // وقتی تسک تازه‌ای باز می‌شود، فرم از نو پر می‌شود (در حین رندر، بدون یک فریم محتوای قدیمی)
  if (task && task !== src) {
    setSrc(task)
    setT(task)
    setFreq('none')
    setWeekdays([weekIndex(task.date)])
    setApplyAll(false)
    setSub('')
  }

  const cur = t || task
  if (!cur) return null
  const set = (p: Partial<Task>) => setT({ ...cur, ...p })
  const isNew = !cur.id

  const save = async () => {
    const data: Task = { ...cur, title: cur.title.trim() }
    if (!data.allDay && data.start && (!data.end || toMin(data.end) <= toMin(data.start))) data.end = fromMin(Math.min(24 * 60, toMin(data.start) + 60))
    if (data.allDay) {
      data.start = undefined
      data.end = undefined
    }
    if (isNew) {
      if (freq !== 'none') {
        const r: Recurring = {
          kind: 'task',
          freq,
          weekdays: freq === 'weekly' ? weekdays : undefined,
          monthDay: freq === 'monthly' ? jDay(data.date) : undefined,
          start: data.date,
          template: { ...data, id: undefined, date: undefined, status: 'todo' },
          skip: [],
        }
        await db.recurring.add(r)
        await ensureRecurringTasks(data.date, addDaysKey(data.date, 60))
      } else {
        await db.tasks.add({ ...data, originalDate: data.date })
      }
      toast('تسک اضافه شد')
    } else {
      await db.tasks.put(data)
      if (applyAll && rule) {
        const tpl = { title: data.title, start: data.start, end: data.end, allDay: data.allDay, categoryId: data.categoryId, priority: data.priority, notes: data.notes, goalId: data.goalId, subtasks: data.subtasks }
        await db.recurring.update(rule.id!, { template: { ...rule.template, ...tpl } })
        const future = await db.tasks.where('recurId').equals(rule.id!).filter((x) => x.date > data.date && x.status === 'todo').toArray()
        await db.tasks.bulkPut(future.map((x) => ({ ...x, ...tpl })))
      }
    }
    onClose()
  }

  return (
    <Sheet
      open={!!task}
      onClose={onClose}
      title={isNew ? 'تسک جدید' : 'ویرایش تسک'}
      footer={
        <Button block disabled={!cur.title.trim() || (freq === 'weekly' && !weekdays.length)} onClick={save}>
          {isNew ? 'افزودن' : 'ذخیره'}
        </Button>
      }
    >
      <div className="flex items-center gap-3 pt-1">
        {!isNew && (
          <CheckButton
            checked={cur.status === 'done'}
            onChange={async () => {
              const done = cur.status !== 'done'
              await setTaskDone(cur, done)
              set({ status: done ? 'done' : 'todo' })
            }}
          />
        )}
        <input
          className="field flex-1 text-lg font-semibold"
          autoFocus={isNew}
          placeholder="عنوان تسک"
          value={cur.title}
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && cur.title.trim() && save()}
        />
      </div>

      <Label>روز</Label>
      <DateField value={cur.date} onChange={(date) => set({ date })} />

      <div className="mt-3">
        <Toggle checked={cur.allDay} onChange={(allDay) => set({ allDay, start: allDay ? undefined : cur.start || '09:00', end: allDay ? undefined : cur.end || '10:00' })} label="تمام روز (بدون ساعت)" />
      </div>
      {!cur.allDay && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">شروع</span>
            <input
              type="time"
              className="field tnum"
              value={cur.start || ''}
              onChange={(e) => {
                const start = e.target.value
                const dur = cur.start && cur.end ? toMin(cur.end) - toMin(cur.start) : 60
                set({ start, end: start ? fromMin(Math.min(1440 - 1, toMin(start) + Math.max(15, dur))) : cur.end })
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">پایان</span>
            <input type="time" className="field tnum" value={cur.end || ''} onChange={(e) => set({ end: e.target.value })} />
          </label>
        </div>
      )}

      <Label>دسته</Label>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        <Chip active={!cur.categoryId} onClick={() => set({ categoryId: undefined })}>بدون دسته</Chip>
        {cats.map((c) => (
          <Chip key={c.id} active={cur.categoryId === c.id} color={c.color} onClick={() => set({ categoryId: c.id })}>
            {c.icon} {c.name}
          </Chip>
        ))}
      </div>

      <Label>اولویت</Label>
      <Segmented
        value={String(cur.priority) as '1' | '2' | '3'}
        onChange={(v) => set({ priority: Number(v) as 1 | 2 | 3 })}
        options={([1, 2, 3] as const).map((p) => ({ value: String(p) as '1' | '2' | '3', label: PRIORITY[p] }))}
      />

      {isNew ? (
        <>
          <Label>تکرار</Label>
          <Segmented
            value={freq}
            onChange={setFreq}
            options={[
              { value: 'none', label: 'ندارد' },
              { value: 'daily', label: 'روزانه' },
              { value: 'weekly', label: 'هفتگی' },
              { value: 'monthly', label: 'ماهانه' },
            ]}
          />
          {freq === 'weekly' && (
            <div className="mt-2 flex justify-between gap-1">
              {WEEK.map((w, i) => (
                <button
                  key={w}
                  onClick={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i])}
                  className={`press size-10 rounded-full text-sm font-bold ${weekdays.includes(i) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}
          {freq === 'monthly' && <p className="mt-2 text-xs text-muted">هر ماه، روز {fa(jDay(cur.date))}</p>}
        </>
      ) : (
        rule && (
          <div className="mt-4 rounded-2xl bg-surface-2 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><Repeat size={16} /> تسک تکراری</p>
            <Toggle checked={applyAll} onChange={setApplyAll} label={<span className="text-sm">تغییرات روی تکرارهای بعدی هم اعمال شود</span>} />
          </div>
        )
      )}

      <Label>زیرکارها</Label>
      <div className="space-y-1.5">
        {cur.subtasks.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <CheckButton size={24} checked={s.done} onChange={() => set({ subtasks: cur.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
            <span className={`flex-1 text-sm ${s.done ? 'text-muted line-through' : ''}`}>{s.text}</span>
            <button className="press p-1 text-muted" onClick={() => set({ subtasks: cur.subtasks.filter((x) => x.id !== s.id) })} aria-label="حذف زیرکار">
              <X size={16} />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            className="field h-10 flex-1 py-0 text-sm"
            placeholder="افزودن زیرکار"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && sub.trim()) {
                set({ subtasks: [...cur.subtasks, { id: uid(), text: sub.trim(), done: false }] })
                setSub('')
              }
            }}
          />
          <button
            className="press grid size-10 place-items-center rounded-xl bg-surface-2"
            aria-label="افزودن زیرکار"
            onClick={() => {
              if (!sub.trim()) return
              set({ subtasks: [...cur.subtasks, { id: uid(), text: sub.trim(), done: false }] })
              setSub('')
            }}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {goals.length > 0 && (
        <>
          <Label hint="پیشرفت هدف از تسک‌ها حساب می‌شود">مربوط به هدف</Label>
          <select className="field" value={cur.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">هیچ‌کدام</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        </>
      )}

      <Label>توضیح</Label>
      <textarea className="field min-h-20 text-sm leading-7" placeholder="اختیاری" value={cur.notes || ''} onChange={(e) => set({ notes: e.target.value })} />

      {!isNew && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            variant="soft"
            onClick={async () => {
              await db.tasks.update(cur.id!, { status: cur.status === 'dropped' ? 'todo' : 'dropped' })
              toast(cur.status === 'dropped' ? 'تسک برگشت' : 'تسک رها شد')
              onClose()
            }}
          >
            <Ban size={18} /> {cur.status === 'dropped' ? 'برگرداندن' : 'رها کن'}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const snapshot = await db.tasks.get(cur.id!)
              await deleteTask(cur)
              onClose()
              toast('تسک حذف شد', snapshot && !cur.recurId ? { label: 'بازگردانی', run: () => db.tasks.add(snapshot).then(() => undefined) } : undefined)
            }}
          >
            <Trash2 size={18} /> حذف
          </Button>
          {cur.recurId && (
            <Button
              variant="ghost"
              className="col-span-2 text-bad"
              onClick={async () => {
                await deleteTask(cur, true)
                toast('این تسک و تکرارهای بعدی حذف شدند')
                onClose()
              }}
            >
              حذف این و همهٔ تکرارهای بعدی
            </Button>
          )}
        </div>
      )}
    </Sheet>
  )
}
