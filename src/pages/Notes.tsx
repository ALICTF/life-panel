import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { CheckSquare, NotebookText, Pin, Search, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { jDayMonth, dkey } from '../lib/date'
import { fa } from '../lib/format'
import { checkStats, plain } from '../lib/markdown'
import { Card, Chip, Empty, Fab, PageHeader, Segmented } from '../ui/kit'
import { useStagger } from '../lib/anim'
import { toast } from '../ui/Toast'

export default function Notes() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated')
  const [trash, setTrash] = useState(false)
  const notes = useLiveQuery(() => db.notes.toArray(), []) || []
  const ref = useStagger<HTMLDivElement>([trash, tag])
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) if (!n.deleted) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [notes])
  const query = q.trim()
  const list = notes
    .filter((n) => (trash ? n.deleted > 0 : !n.deleted))
    .filter((n) => (tag ? n.tags.includes(tag) : true))
    .filter((n) => (query ? `${n.title}\n${n.body}\n${n.tags.join(' ')}`.includes(query) : true))
    .sort((a, b) => b.pinned - a.pinned || (sort === 'title' ? a.title.localeCompare(b.title, 'fa') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt))

  const create = async () => {
    const now = Date.now()
    const id = await db.notes.add({ title: '', body: '', tags: tag ? [tag] : [], pinned: 0, deleted: 0, createdAt: now, updatedAt: now })
    nav(`/notes/${id}`)
  }

  return (
    <div>
      <PageHeader
        title={trash ? 'سطل بازیافت' : 'یادداشت‌ها'}
        sub={trash ? 'بعد از ۳۰ روز خودکار پاک می‌شوند' : undefined}
        back
        action={
          <button className={`press grid size-10 place-items-center rounded-full ${trash ? 'bg-ink text-bg' : 'bg-surface-2'}`} onClick={() => setTrash(!trash)} aria-label="سطل بازیافت">
            <Trash2 size={18} />
          </button>
        }
      />
      {!trash && (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-surface-2 px-3">
            <Search size={18} className="text-muted" />
            <input className="h-11 flex-1 bg-transparent outline-none" placeholder="جست‌وجو در یادداشت‌ها" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {tags.length > 0 && (
            <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
              <Chip active={!tag} onClick={() => setTag(null)}>همه</Chip>
              {tags.map((t) => (
                <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  #{t}
                </Chip>
              ))}
            </div>
          )}
          <Segmented
            className="mb-3"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'updated', label: 'آخرین ویرایش' },
              { value: 'created', label: 'تاریخ ساخت' },
              { value: 'title', label: 'عنوان' },
            ]}
          />
        </>
      )}
      {!list.length ? (
        <Card>
          <Empty
            icon={<NotebookText />}
            title={trash ? 'سطل خالی است' : query || tag ? 'یادداشتی پیدا نشد' : 'هنوز یادداشتی ننوشته‌ای'}
            text={trash || query || tag ? undefined : 'هر فکری، ایده‌ای یا فهرستی را اینجا بنویس. با «- [ ]» چک‌لیست بساز و با برچسب دسته‌بندی کن.'}
          />
        </Card>
      ) : (
        <div ref={ref} className="space-y-2.5">
          {list.map((n) => {
            const cs = checkStats(n.body)
            return (
              <div key={n.id} className="card press cursor-pointer p-4" onClick={() => !trash && nav(`/notes/${n.id}`)}>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 truncate font-bold">{n.title || <span className="text-muted">بدون عنوان</span>}</p>
                  {n.pinned > 0 && <Pin size={15} className="mt-1 shrink-0 fill-current text-accent" />}
                </div>
                {n.body && <p className="mt-1 line-clamp-2 text-sm leading-7 whitespace-pre-line text-muted">{plain(n.body).slice(0, 200)}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{jDayMonth(dkey(new Date(n.updatedAt)))}</span>
                  {cs.total > 0 && (
                    <span className="tnum inline-flex items-center gap-1">
                      <CheckSquare size={12} />
                      {fa(cs.done)}/{fa(cs.total)}
                    </span>
                  )}
                  {n.tags.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5">#{t}</span>
                  ))}
                </div>
                {trash && (
                  <div className="mt-3 flex gap-2">
                    <button
                      className="press flex-1 rounded-xl bg-surface-2 py-2 text-sm font-semibold"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await db.notes.update(n.id!, { deleted: 0 })
                        toast('یادداشت برگشت')
                      }}
                    >
                      بازگردانی
                    </button>
                    <button
                      className="press flex-1 rounded-xl bg-bad-soft py-2 text-sm font-semibold text-bad"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await db.notes.delete(n.id!)
                        toast('برای همیشه حذف شد')
                      }}
                    >
                      حذف همیشگی
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!trash && <Fab onClick={create} label="یادداشت جدید" />}
    </div>
  )
}
