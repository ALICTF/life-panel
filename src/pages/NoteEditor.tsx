import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bold, CheckSquare, ChevronRight, Eye, Heading, List, Pencil, Pin, Tag, Trash2, X } from 'lucide-react'
import { db } from '../db/db'
import type { Note } from '../db/types'
import { renderMd, toggleCheckLine } from '../lib/markdown'
import { toast } from '../ui/Toast'

export default function NoteEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const [note, setNote] = useState<Note | null>(null)
  const [mode, setMode] = useState<'edit' | 'view'>('edit')
  const [tagText, setTagText] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const area = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef<Note | null>(null)

  useEffect(() => {
    db.notes.get(Number(id)).then((n) => {
      if (!n) return nav('/notes', { replace: true })
      setNote(n)
      latest.current = n
      if (n.body) setMode('view')
    })
    db.notes.toArray().then((ns) => setAllTags([...new Set(ns.flatMap((n) => n.tags))]))
  }, [id, nav])

  // ذخیرهٔ خودکار؛ هنگام خروج هم ذخیره می‌شود و یادداشت خالی حذف می‌شود
  const flush = async () => {
    clearTimeout(timer.current)
    const n = latest.current
    if (!n?.id) return
    if (!n.title.trim() && !n.body.trim() && !n.tags.length) await db.notes.delete(n.id)
    else await db.notes.put(n)
  }
  useEffect(() => {
    const onHide = () => document.hidden && flush()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!note) return null
  const update = (p: Partial<Note>) => {
    const n = { ...note, ...p, updatedAt: Date.now() }
    // برچسب‌های #دار داخل متن خودکار به برچسب‌های یادداشت اضافه می‌شوند
    if (p.body !== undefined) {
      const found = [...p.body.matchAll(/(?:^|\s)#([\p{L}\p{N}_‌]{2,})(?=\s|$)/gu)].map((m) => m[1])
      const extra = found.filter((t) => !n.tags.includes(t))
      if (extra.length) n.tags = [...n.tags, ...extra]
    }
    setNote(n)
    latest.current = n
    clearTimeout(timer.current)
    timer.current = setTimeout(() => db.notes.put(n), 500)
  }

  const insert = (prefix: string, wrap?: string) => {
    const el = area.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    let next: string
    let caret: number
    if (wrap) {
      next = value.slice(0, s) + wrap + value.slice(s, e) + wrap + value.slice(e)
      caret = e + wrap.length * 2
    } else {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1
      next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
      caret = s + prefix.length
    }
    update({ body: next })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  // ادامهٔ خودکار فهرست و چک‌لیست با Enter
  const onKey = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key !== 'Enter') return
    const el = ev.currentTarget
    const { selectionStart: s, value } = el
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const line = value.slice(lineStart, s)
    const m = line.match(/^(\s*)([-*] \[[ xX]\] |[-*] )(.*)$/)
    if (!m) return
    ev.preventDefault()
    if (!m[3].trim()) {
      const next = value.slice(0, lineStart) + value.slice(s)
      update({ body: next })
      requestAnimationFrame(() => el.setSelectionRange(lineStart, lineStart))
      return
    }
    const bullet = m[2].startsWith('- [') || m[2].startsWith('* [') ? '- [ ] ' : m[2]
    const ins = '\n' + m[1] + bullet
    update({ body: value.slice(0, s) + ins + value.slice(s) })
    requestAnimationFrame(() => el.setSelectionRange(s + ins.length, s + ins.length))
  }

  const addTag = (t: string) => {
    const v = t.trim().replace(/^#/, '').replace(/\s+/g, '_')
    if (v && !note.tags.includes(v)) update({ tags: [...note.tags, v] })
    setTagText('')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-1 bg-bg/90 px-2 pt-[calc(env(safe-area-inset-top)+8px)] pb-2 backdrop-blur-md">
        <button
          className="press grid size-11 place-items-center rounded-full"
          onClick={async () => {
            await flush()
            nav('/notes')
          }}
          aria-label="بازگشت"
        >
          <ChevronRight size={24} />
        </button>
        <div className="flex-1" />
        <button className={`press grid size-11 place-items-center rounded-full ${note.pinned ? 'text-accent' : ''}`} onClick={() => update({ pinned: note.pinned ? 0 : 1 })} aria-label="سنجاق">
          <Pin size={20} className={note.pinned ? 'fill-current' : ''} />
        </button>
        <button className="press grid size-11 place-items-center rounded-full" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')} aria-label={mode === 'edit' ? 'پیش‌نمایش' : 'ویرایش'}>
          {mode === 'edit' ? <Eye size={20} /> : <Pencil size={20} />}
        </button>
        <button
          className="press grid size-11 place-items-center rounded-full text-bad"
          onClick={async () => {
            clearTimeout(timer.current)
            await db.notes.update(note.id!, { deleted: Date.now() })
            latest.current = null
            toast('به سطل بازیافت رفت', { label: 'بازگردانی', run: () => db.notes.update(note.id!, { deleted: 0 }).then(() => undefined) })
            nav('/notes')
          }}
          aria-label="حذف"
        >
          <Trash2 size={20} />
        </button>
      </header>

      <input className="bg-transparent text-2xl font-extrabold outline-none" placeholder="عنوان" value={note.title} onChange={(e) => update({ title: e.target.value })} />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 ps-2.5 pe-1 text-sm">
            #{t}
            <button className="press grid size-5 place-items-center rounded-full text-muted" onClick={() => update({ tags: note.tags.filter((x) => x !== t) })} aria-label="حذف برچسب">
              <X size={12} />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-muted">
          <Tag size={14} />
          <input
            list="tag-list"
            className="w-28 bg-transparent py-1 text-sm outline-none"
            placeholder="برچسب"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === ',' || e.key === '،') && (e.preventDefault(), addTag(tagText))}
            onBlur={() => tagText && addTag(tagText)}
          />
          <datalist id="tag-list">
            {allTags.filter((t) => !note.tags.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </span>
      </div>

      {mode === 'edit' ? (
        <>
          <textarea
            ref={area}
            autoFocus={!note.body}
            className="mt-3 min-h-[55dvh] w-full flex-1 resize-none bg-transparent text-[16px] leading-8 outline-none"
            placeholder={'بنویس…\n\n- [ ] برای چک‌لیست\n# برای تیتر\n- برای فهرست'}
            value={note.body}
            onChange={(e) => update({ body: e.target.value })}
            onKeyDown={onKey}
          />
          <div className="sticky bottom-[calc(12px+env(safe-area-inset-bottom))] mt-2 flex gap-1 self-start rounded-2xl bg-surface p-1 shadow-md ring-1 ring-line">
            {[
              { icon: <CheckSquare size={19} />, label: 'چک‌لیست', run: () => insert('- [ ] ') },
              { icon: <List size={19} />, label: 'فهرست', run: () => insert('- ') },
              { icon: <Heading size={19} />, label: 'تیتر', run: () => insert('## ') },
              { icon: <Bold size={19} />, label: 'پررنگ', run: () => insert('', '**') },
            ].map((b) => (
              <button key={b.label} className="press grid size-10 place-items-center rounded-xl" onMouseDown={(e) => e.preventDefault()} onClick={b.run} aria-label={b.label}>
                {b.icon}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div
          className="md mt-3 min-h-[50dvh] text-[16px]"
          onClick={(e) => {
            const label = (e.target as HTMLElement).closest('[data-line]')
            if (label) {
              e.preventDefault()
              update({ body: toggleCheckLine(note.body, Number(label.getAttribute('data-line'))) })
            } else if (!(e.target as HTMLElement).closest('a')) setMode('edit')
          }}
          dangerouslySetInnerHTML={{ __html: renderMd(note.body) || '<p class="text-muted">برای نوشتن بزن…</p>' }}
        />
      )}
    </div>
  )
}
