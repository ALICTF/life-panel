import { useLiveQuery } from 'dexie-react-hooks'
import { Clock, Repeat, Star, Undo2 } from 'lucide-react'
import { db } from '../db/db'
import type { Category, Task } from '../db/types'
import { faTime } from '../lib/date'
import { fa } from '../lib/format'
import { setTaskDone } from '../lib/tasks'
import { CheckButton } from '../ui/kit'

export function useTaskCats() {
  const cats = useLiveQuery(() => db.categories.where('kind').equals('task').toArray(), []) || []
  return new Map<number, Category>(cats.map((c) => [c.id!, c]))
}

export const taskColor = (t: Task, cats: Map<number, Category>) => (t.categoryId && cats.get(t.categoryId)?.color) || 'var(--accent)'

export const sortTasks = (a: Task, b: Task) => {
  const sa = a.status === 'done' ? 1 : 0
  const sb = b.status === 'done' ? 1 : 0
  if (sa !== sb) return sa - sb
  if (!!a.star !== !!b.star) return a.star ? -1 : 1
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return (a.start || '').localeCompare(b.start || '') || a.priority - b.priority
}

export function TaskRow({ t, cats, onOpen, showDate, onStar }: { t: Task; cats: Map<number, Category>; onOpen: (t: Task) => void; showDate?: string; onStar?: (t: Task) => void }) {
  const color = taskColor(t, cats)
  const done = t.status === 'done'
  const dropped = t.status === 'dropped'
  const subs = t.subtasks.length
  const subsDone = t.subtasks.filter((s) => s.done).length
  return (
    <div className="press flex cursor-pointer items-center gap-3 py-2.5" onClick={() => onOpen(t)}>
      <CheckButton checked={done} onChange={() => setTaskDone(t, !done)} color={color} size={26} label={t.title} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${done || dropped ? 'text-muted line-through decoration-1' : ''}`}>
          {t.star && !onStar && <Star size={13} className="me-1 inline -mt-0.5 text-warn" fill="currentColor" strokeWidth={0} />}
          {t.priority === 1 && !done && <span className="me-1 font-bold text-bad">!</span>}
          {t.title}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {showDate && <span>{showDate}</span>}
          {!t.allDay && t.start && (
            <span className="tnum inline-flex items-center gap-1">
              <Clock size={11} />
              {faTime(t.start)}–{faTime(t.end)}
            </span>
          )}
          {subs > 0 && <span className="tnum">{fa(subsDone)}/{fa(subs)}</span>}
          {t.recurId && <Repeat size={11} />}
          {t.postponed > 0 && (
            <span className="inline-flex items-center gap-0.5 text-warn">
              <Undo2 size={11} />
              {fa(t.postponed)} بار عقب افتاده
            </span>
          )}
        </p>
      </div>
      {onStar ? (
        <button
          className={`press grid size-9 shrink-0 place-items-center rounded-full ${t.star ? 'text-warn' : 'text-muted/40'}`}
          onClick={(e) => {
            e.stopPropagation()
            onStar(t)
          }}
          aria-label={t.star ? 'برداشتن از بایدها' : 'افزودن به بایدها'}
        >
          <Star size={20} fill={t.star ? 'currentColor' : 'none'} strokeWidth={t.star ? 0 : 2} />
        </button>
      ) : (
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: color, opacity: done ? 0.35 : 1 }} />
      )}
    </div>
  )
}
