import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BrainCircuit, ChevronLeft, Download, HardDrive, Moon, Plus, Sun, SunMoon, Trash2, Upload, X } from 'lucide-react'
import { db, getSetting, PALETTE, setSetting } from '../db/db'
import type { Category } from '../db/types'
import { exportBackup, exportForAnalysis, readBackup, restoreBackup, wipeAll, type BackupFile } from '../lib/backup'
import { jLong, dkey } from '../lib/date'
import { fa, num } from '../lib/format'
import { useTheme } from '../lib/theme'
import { Button, Card, Label, PageHeader, Segmented } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/Toast'

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [catKind, setCatKind] = useState<Category['kind'] | null>(null)
  const [areasOpen, setAreasOpen] = useState(false)
  const [restore, setRestore] = useState<BackupFile | null>(null)
  const [wipe, setWipe] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const lastBackup = useLiveQuery(() => getSetting<number>('lastBackup', 0), [])
  const persisted = useLiveQuery(async () => {
    try {
      const p = await navigator.storage?.persisted?.()
      const est = await navigator.storage?.estimate?.()
      return { p: !!p, used: est?.usage || 0 }
    } catch {
      return { p: false, used: 0 }
    }
  }, [])

  return (
    <div>
      <PageHeader title="تنظیمات" back />
      <div className="space-y-3">
        <Card title="ظاهر">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <span className="flex items-center justify-center gap-1.5"><Sun size={15} /> روشن</span> },
              { value: 'dark', label: <span className="flex items-center justify-center gap-1.5"><Moon size={15} /> تاریک</span> },
              { value: 'system', label: <span className="flex items-center justify-center gap-1.5"><SunMoon size={15} /> خودکار</span> },
            ]}
          />
        </Card>

        <Card title="دسته‌ها">
          <div className="divide-y divide-line">
            {(
              [
                ['expense', 'دسته‌های خرج'],
                ['income', 'دسته‌های درآمد'],
                ['task', 'دسته‌های تسک'],
              ] as [Category['kind'], string][]
            ).map(([k, l]) => (
              <Row key={k} onClick={() => setCatKind(k)}>{l}</Row>
            ))}
            <Row onClick={() => setAreasOpen(true)}>حوزه‌های زندگی (برای اهداف)</Row>
          </div>
        </Card>

        <Card title="پشتیبان‌گیری">
          <p className="text-sm leading-7 text-muted">
            همهٔ داده‌ها فقط روی همین گوشی ذخیره می‌شوند. اگر حافظهٔ مرورگر پاک شود یا گوشی را عوض کنی، فقط با فایل پشتیبان برمی‌گردند.
          </p>
          <p className="mt-2 text-sm">
            آخرین پشتیبان: <b>{lastBackup ? jLong(dkey(new Date(lastBackup))) : 'هنوز گرفته نشده'}</b>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              onClick={async () => {
                await exportBackup()
                toast('فایل پشتیبان دانلود شد')
              }}
            >
              <Download size={18} /> گرفتن پشتیبان
            </Button>
            <Button variant="soft" onClick={() => file.current?.click()}>
              <Upload size={18} /> بازگردانی
            </Button>
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                setRestore(await readBackup(f))
              } catch (err) {
                toast(err instanceof Error ? err.message : 'فایل خوانده نشد')
              }
            }}
          />
          {persisted && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted">
              <HardDrive size={14} />
              {persisted.p ? 'ذخیره‌سازی دائمی فعال است' : 'ذخیره‌سازی دائمی فعال نیست؛ برنامه را روی صفحهٔ اصلی نصب کن'}
              {persisted.used > 0 && ` · ${num(persisted.used / 1024 / 1024, 1)} مگابایت`}
            </p>
          )}
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <BrainCircuit size={18} className="text-accent" /> خروجی برای تحلیل الگوها
            </span>
          }
        >
          <p className="text-sm leading-7 text-muted">
            فایلی با همهٔ داده‌ها، توضیح هر فیلد و خلاصهٔ آماری (هفتگی، روزهای هفته، ساعت لغزش‌ها و علت‌ها) ساخته می‌شود. این فایل را خودت برای تحلیل به Claude می‌دهی؛ برنامه هیچ داده‌ای را جایی نمی‌فرستد.
          </p>
          <Button
            variant="soft"
            block
            className="mt-3"
            onClick={async () => {
              await exportForAnalysis()
              toast('فایل تحلیل دانلود شد')
            }}
          >
            <Download size={18} /> ساخت فایل تحلیل
          </Button>
        </Card>

        <Card title="منطقهٔ خطر">
          <Button variant="danger" block onClick={() => setWipe(1)}>
            <Trash2 size={18} /> پاک کردن همهٔ داده‌ها
          </Button>
        </Card>

        <p className="py-4 text-center text-xs text-muted">پنل من · نسخهٔ {fa('1.0.0')} · تعطیلات قمری با تقویم ام‌القری حساب می‌شوند و ممکن است یک روز جابه‌جا باشند.</p>
      </div>

      <CategorySheet kind={catKind} onClose={() => setCatKind(null)} />
      <AreasSheet open={areasOpen} onClose={() => setAreasOpen(false)} />

      <Sheet
        open={!!restore}
        onClose={() => setRestore(null)}
        title="بازگردانی پشتیبان"
        footer={
          <Button
            block
            variant="danger"
            onClick={async () => {
              if (!restore) return
              await restoreBackup(restore)
              toast('داده‌ها بازگردانی شدند')
              setRestore(null)
              setTimeout(() => location.reload(), 600)
            }}
          >
            جایگزینی داده‌های فعلی
          </Button>
        }
      >
        {restore && (
          <div className="text-sm leading-7">
            <p>
              فایل پشتیبان تاریخ <b>{jLong(dkey(new Date(restore.exportedAt)))}</b>. با بازگردانی، <b className="text-bad">همهٔ داده‌های فعلی پاک</b> و با محتوای این فایل جایگزین می‌شوند.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-surface-2 p-3 text-xs">
              {(
                [
                  ['tasks', 'تسک'],
                  ['habits', 'عادت'],
                  ['health', 'ثبت سلامت'],
                  ['transactions', 'تراکنش'],
                  ['goals', 'هدف'],
                  ['notes', 'یادداشت'],
                ] as [string, string][]
              ).map(([k, l]) => (
                <span key={k} className="flex justify-between">
                  <span className="text-muted">{l}</span>
                  <b className="tnum">{fa(restore.tables[k]?.length || 0)}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={wipe > 0}
        onClose={() => setWipe(0)}
        title="پاک کردن همه‌چیز"
        footer={
          <Button
            block
            variant="danger"
            onClick={async () => {
              if (wipe === 1) return setWipe(2)
              await wipeAll()
              location.reload()
            }}
          >
            {wipe === 1 ? 'متوجهم، ادامه بده' : 'بله، همه را برای همیشه پاک کن'}
          </Button>
        }
      >
        <p className="text-sm leading-7">
          همهٔ تسک‌ها، عادت‌ها، تراکنش‌ها، اهداف، یادداشت‌ها و ثبت‌های سلامت پاک می‌شوند و <b className="text-bad">قابل برگشت نیستند</b>. اگر لازمشان داری، اول پشتیبان بگیر.
        </p>
      </Sheet>
    </div>
  )
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="press flex w-full items-center justify-between py-3 text-start" onClick={onClick}>
      <span>{children}</span>
      <ChevronLeft size={18} className="text-muted" />
    </button>
  )
}

function CategorySheet({ kind, onClose }: { kind: Category['kind'] | null; onClose: () => void }) {
  const cats = useLiveQuery(() => (kind ? db.categories.where('kind').equals(kind).sortBy('order') : []), [kind]) || []
  const [edit, setEdit] = useState<Category | null>(null)
  const parents = cats.filter((c) => c.parentId === undefined)
  const title = kind === 'expense' ? 'دسته‌های خرج' : kind === 'income' ? 'دسته‌های درآمد' : 'دسته‌های تسک'
  const move = async (c: Category, dir: number) => {
    const sib = parents
    const i = sib.findIndex((x) => x.id === c.id)
    const j = i + dir
    if (j < 0 || j >= sib.length) return
    await db.categories.update(c.id!, { order: sib[j].order })
    await db.categories.update(sib[j].id!, { order: c.order })
  }
  return (
    <>
      <Sheet open={!!kind} onClose={onClose} title={title}>
        <div className="divide-y divide-line">
          {parents.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-2 py-2.5">
                <button className="press flex flex-1 items-center gap-3 text-start" onClick={() => setEdit(c)}>
                  <span className="grid size-9 place-items-center rounded-xl text-lg" style={{ background: `${c.color}22` }}>{c.icon}</span>
                  <span className="font-medium">{c.name}</span>
                </button>
                <button className="press p-1.5 text-muted" onClick={() => move(c, -1)} aria-label="بالا">▲</button>
                <button className="press p-1.5 text-muted" onClick={() => move(c, 1)} aria-label="پایین">▼</button>
              </div>
              {cats.filter((s) => s.parentId === c.id).map((s) => (
                <button key={s.id} className="press flex w-full items-center gap-2 py-2 ps-12 text-start text-sm" onClick={() => setEdit(s)}>
                  <span>{s.icon}</span>
                  {s.name}
                </button>
              ))}
              {kind !== 'task' && (
                <button className="press mb-2 ms-12 text-xs font-semibold text-accent" onClick={() => setEdit({ kind: kind!, name: '', icon: c.icon, color: c.color, parentId: c.id, order: Date.now() })}>
                  + زیردسته
                </button>
              )}
            </div>
          ))}
        </div>
        <Button variant="soft" block className="mt-3" onClick={() => setEdit({ kind: kind!, name: '', icon: '📌', color: PALETTE[cats.length % PALETTE.length], order: (parents.at(-1)?.order ?? 0) + 1 })}>
          <Plus size={18} /> دستهٔ جدید
        </Button>
      </Sheet>
      <CatEdit c={edit} onClose={() => setEdit(null)} />
    </>
  )
}

const EMOJIS = ['🍽️', '☕', '🛒', '🚕', '⛽', '💡', '📱', '🏠', '🛍️', '👕', '🎬', '🎮', '✈️', '💊', '🏋️', '📚', '🎁', '🐾', '👶', '💼', '💻', '📈', '🏦', '💳', '🧾', '🔧', '🙂', '🏃', '📖', '📌', '📦', '➕']

function CatEdit({ c, onClose }: { c: Category | null; onClose: () => void }) {
  const [cur, setCur] = useState<Category | null>(null)
  const [src, setSrc] = useState<Category | null>(null)
  if (c && c !== src) {
    setSrc(c)
    setCur(c)
  }
  if (!cur) return null
  const set = (p: Partial<Category>) => setCur({ ...cur, ...p })
  return (
    <Sheet
      open={!!c}
      onClose={onClose}
      title={cur.id ? 'ویرایش دسته' : cur.parentId ? 'زیردستهٔ جدید' : 'دستهٔ جدید'}
      footer={
        <div className="flex gap-2">
          {cur.id && (
            <Button
              variant="danger"
              onClick={async () => {
                const used = (await db.transactions.where('categoryId').equals(cur.id!).count()) + (await db.tasks.filter((t) => t.categoryId === cur.id).count())
                const kids = await db.categories.where('parentId').equals(cur.id!).count()
                if (used || kids) return toast(kids ? 'اول زیردسته‌ها را حذف کن' : `این دسته در ${fa(used)} مورد استفاده شده و حذف نمی‌شود`)
                await db.categories.delete(cur.id!)
                onClose()
              }}
            >
              <Trash2 size={18} />
            </Button>
          )}
          <Button
            className="flex-1"
            disabled={!cur.name.trim()}
            onClick={async () => {
              await db.categories.put({ ...cur, name: cur.name.trim() })
              onClose()
            }}
          >
            ذخیره
          </Button>
        </div>
      }
    >
      <Label>نام</Label>
      <input className="field" autoFocus={!cur.id} value={cur.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً کافه" />
      <Label>آیکون</Label>
      <div className="grid grid-cols-8 gap-1.5">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => set({ icon: e })} className={`press grid aspect-square place-items-center rounded-xl text-xl ${cur.icon === e ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2'}`}>
            {e}
          </button>
        ))}
      </div>
      <Label>رنگ</Label>
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((col) => (
          <button key={col} onClick={() => set({ color: col })} className="press size-9 rounded-full" style={{ background: col, outline: cur.color === col ? `3px solid ${col}` : 'none', outlineOffset: 2 }} aria-label="رنگ" />
        ))}
      </div>
    </Sheet>
  )
}

function AreasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const areas = useLiveQuery(() => getSetting<string[]>('areas', []), []) || []
  const [t, setT] = useState('')
  const save = (a: string[]) => setSetting('areas', a)
  return (
    <Sheet open={open} onClose={onClose} title="حوزه‌های زندگی">
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1.5 ps-3 pe-1.5 text-sm">
            {a}
            <button className="press grid size-6 place-items-center rounded-full text-muted" onClick={() => save(areas.filter((x) => x !== a))} aria-label="حذف">
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="field flex-1"
          placeholder="حوزهٔ جدید"
          value={t}
          onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && t.trim() && !areas.includes(t.trim())) {
              save([...areas, t.trim()])
              setT('')
            }
          }}
        />
        <Button
          variant="soft"
          onClick={() => {
            if (t.trim() && !areas.includes(t.trim())) save([...areas, t.trim()])
            setT('')
          }}
        >
          افزودن
        </Button>
      </div>
    </Sheet>
  )
}
