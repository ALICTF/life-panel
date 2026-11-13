import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import type { Transaction, TxType } from '../db/types'
import { jDay, nowTime, todayKey } from '../lib/date'
import { fa } from '../lib/format'
import { Button, Chip, Label, MoneyInput, Segmented, Toggle } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { DateField } from '../ui/DatePicker'
import { toast } from '../ui/Toast'
import { haptic } from '../lib/anim'

export const blankTx = (type: TxType = 'expense', accountId?: number): Transaction => ({
  type,
  amount: 0,
  accountId: accountId ?? 0,
  date: todayKey(),
  time: nowTime(),
  tags: [],
  createdAt: Date.now(),
})

export function TxSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const [t, setT] = useState<Transaction | null>(null)
  const [src, setSrc] = useState<Transaction | null>(null)
  const [repeat, setRepeat] = useState(false)
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter((a) => !a.archived).toArray(), []) || []
  const cats = useLiveQuery(() => db.categories.orderBy('order').toArray(), []) || []
  const usage = useLiveQuery(async () => {
    const recent = await db.transactions.orderBy('date').reverse().limit(200).toArray()
    const m = new Map<number, number>()
    for (const r of recent) if (r.categoryId) m.set(r.categoryId, (m.get(r.categoryId) || 0) + 1)
    return { m, lastAccount: recent[0]?.accountId }
  }, [])

  if (tx && tx !== src) {
    setSrc(tx)
    setT({ ...tx, accountId: tx.accountId || usage?.lastAccount || accounts[0]?.id || 0 })
    setRepeat(false)
  }
  const cur = t
  if (!cur) return null
  const set = (p: Partial<Transaction>) => setT({ ...cur, ...p })
  const isNew = !cur.id
  const accountId = cur.accountId || accounts[0]?.id || 0
  const kind = cur.type === 'income' ? 'income' : 'expense'
  // دسته‌های پرکاربرد اول
  const list = cats
    .filter((c) => c.kind === kind)
    .sort((a, b) => (usage?.m.get(b.id!) || 0) - (usage?.m.get(a.id!) || 0) || a.order - b.order)
  const parents = list.filter((c) => c.parentId === undefined)
  const subs = cur.categoryId ? list.filter((c) => c.parentId === cur.categoryId || (c.parentId !== undefined && c.parentId === cats.find((x) => x.id === cur.categoryId)?.parentId)) : []
  const valid = cur.amount > 0 && accountId && (cur.type !== 'transfer' || (cur.toAccountId && cur.toAccountId !== accountId))

  const save = async () => {
    const data = { ...cur, accountId, categoryId: cur.type === 'transfer' ? undefined : cur.categoryId }
    if (isNew) {
      const id = await db.transactions.add(data)
      if (repeat) {
        const rid = await db.recurring.add({
          kind: 'tx',
          freq: 'monthly',
          monthDay: jDay(data.date),
          start: data.date,
          lastGen: todayKey() >= data.date ? todayKey() : undefined,
          template: { type: data.type, amount: data.amount, accountId, toAccountId: data.toAccountId, categoryId: data.categoryId, note: data.note, tags: [] },
          skip: [],
        })
        await db.transactions.update(id, { recurId: rid })
      }
      haptic()
      toast(cur.type === 'expense' ? 'خرج ثبت شد' : cur.type === 'income' ? 'درآمد ثبت شد' : 'انتقال ثبت شد')
    } else await db.transactions.put(data)
    onClose()
  }

  return (
    <Sheet
      open={!!tx}
      onClose={onClose}
      title={isNew ? 'تراکنش جدید' : 'ویرایش تراکنش'}
      footer={
        <Button block disabled={!valid} onClick={save}>
          ثبت
        </Button>
      }
    >
      {cur.type !== 'adjust' && cur.type !== 'debt' && (
        <Segmented
          value={cur.type as 'expense' | 'income' | 'transfer'}
          onChange={(type) => set({ type, categoryId: undefined })}
          options={[
            { value: 'expense', label: 'خرج' },
            { value: 'income', label: 'درآمد' },
            { value: 'transfer', label: 'انتقال' },
          ]}
        />
      )}
      <div className="mt-3">
        <MoneyInput value={cur.amount} onChange={(amount) => set({ amount })} autoFocus={isNew} />
      </div>

      <Label>{cur.type === 'transfer' ? 'از حساب' : 'حساب'}</Label>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {accounts.map((a) => (
          <Chip key={a.id} active={accountId === a.id} color={a.color} onClick={() => set({ accountId: a.id })}>
            {a.name}
            {a.last4 && <span className="tnum opacity-70">{fa(a.last4)}</span>}
          </Chip>
        ))}
      </div>

      {cur.type === 'transfer' ? (
        <>
          <Label>
            <span className="flex items-center gap-1"><ArrowLeftRight size={14} /> به حساب</span>
          </Label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {accounts.filter((a) => a.id !== accountId).map((a) => (
              <Chip key={a.id} active={cur.toAccountId === a.id} color={a.color} onClick={() => set({ toAccountId: a.id })}>
                {a.name}
              </Chip>
            ))}
          </div>
          {accounts.length < 2 && <p className="mt-2 text-xs text-muted">برای انتقال، اول یک حساب دیگر بساز.</p>}
        </>
      ) : (
        cur.type !== 'adjust' && cur.type !== 'debt' && (
          <>
            <Label>دسته</Label>
            <div className="grid grid-cols-4 gap-2">
              {parents.map((c) => {
                const active = cur.categoryId === c.id || cats.find((x) => x.id === cur.categoryId)?.parentId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => set({ categoryId: c.id })}
                    className={`press flex flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-medium ${active ? 'text-white' : 'bg-surface-2'}`}
                    style={active ? { background: c.color } : undefined}
                  >
                    <span className="text-xl">{c.icon}</span>
                    <span className="max-w-full truncate px-1">{c.name}</span>
                  </button>
                )
              })}
            </div>
            {subs.length > 0 && (
              <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
                {subs.map((c) => (
                  <Chip key={c.id} active={cur.categoryId === c.id} color={c.color} onClick={() => set({ categoryId: c.id })}>
                    {c.icon} {c.name}
                  </Chip>
                ))}
              </div>
            )}
          </>
        )
      )}

      <Label>تاریخ و ساعت</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <DateField value={cur.date} onChange={(date) => set({ date })} />
        </div>
        <input type="time" className="field tnum w-28" value={cur.time} onChange={(e) => set({ time: e.target.value })} />
      </div>

      <Label>توضیح</Label>
      <input className="field" placeholder="اختیاری؛ مثلاً ناهار با بچه‌ها" value={cur.note || ''} onChange={(e) => set({ note: e.target.value })} />

      {cur.type === 'expense' && (
        <>
          <Label hint="اختیاری؛ برای تحلیل خرج‌های هیجانی">این خرج</Label>
          <Segmented
            value={cur.feel || ('none' as const)}
            onChange={(v) => set({ feel: v === 'none' ? undefined : (v as 'need' | 'impulse') })}
            options={[
              { value: 'none', label: 'مشخص نیست' },
              { value: 'need', label: 'ضروری بود' },
              { value: 'impulse', label: 'هیجانی بود' },
            ]}
          />
        </>
      )}

      {isNew && (cur.type === 'expense' || cur.type === 'income') && (
        <div className="mt-3">
          <Toggle checked={repeat} onChange={setRepeat} label={<span>تکرار ماهانه <span className="text-xs text-muted">(هر ماه روز {fa(jDay(cur.date))})</span></span>} />
        </div>
      )}

      {!isNew && (
        <Button
          variant="danger"
          block
          className="mt-5"
          onClick={async () => {
            const snap = cur
            await db.transactions.delete(cur.id!)
            onClose()
            toast('تراکنش حذف شد', { label: 'بازگردانی', run: () => db.transactions.add(snap).then(() => undefined) })
          }}
        >
          <Trash2 size={18} /> حذف تراکنش
        </Button>
      )}
    </Sheet>
  )
}
