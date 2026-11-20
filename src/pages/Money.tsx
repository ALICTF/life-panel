import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, Doughnut } from 'react-chartjs-2'
import { ArrowLeftRight, ChevronLeft, ChevronRight, CreditCard, HandCoins, PiggyBank, Plus, Search, Scale, Trash2, Wallet } from 'lucide-react'
import { db, PALETTE } from '../db/db'
import type { Account, Category, Debt, Transaction } from '../db/types'
import { diffDays, jDayMonth, jf, jMonthKey, jMonthLabel, jMonthRange, relDay, shiftMonth, todayKey, nowTime } from '../lib/date'
import { fa, num, pct, shortMoney, toman, uid } from '../lib/format'
import { balances, debtRemaining, rootCat, sumBy } from '../lib/money'
import { baseOptions, css } from '../lib/chart'
import { useCountUp, useStagger } from '../lib/anim'
import { Button, Card, Chip, Empty, Fab, Label, MoneyInput, PageHeader, Progress, Segmented, Stat } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { DateField } from '../ui/DatePicker'
import { toast } from '../ui/Toast'
import { TxSheet, blankTx } from './TxSheet'

type Tab = 'tx' | 'accounts' | 'budget' | 'debts' | 'report'

export function useMoney() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').toArray(), []) || []
  const txs = useLiveQuery(() => db.transactions.toArray(), []) || []
  const cats = useLiveQuery(() => db.categories.toArray(), []) || []
  const bal = useMemo(() => balances(accounts, txs), [accounts, txs])
  const catMap = useMemo(() => new Map(cats.map((c) => [c.id!, c])), [cats])
  return { accounts, txs, cats, bal, catMap }
}

export default function Money() {
  const [tab, setTab] = useState<Tab>('tx')
  const [month, setMonth] = useState(jMonthKey(todayKey()))
  const [tx, setTx] = useState<Transaction | null>(null)
  const m = useMoney()
  const { from, to } = jMonthRange(month)
  const monthTx = m.txs.filter((t) => t.date >= from && t.date <= to)
  const income = sumBy(monthTx, 'income')
  const expense = sumBy(monthTx, 'expense')
  const total = [...m.bal.entries()].filter(([id]) => !m.accounts.find((a) => a.id === id)?.archived).reduce((s, [, v]) => s + v, 0)
  const shownTotal = useCountUp(total)

  return (
    <div>
      <PageHeader title="مالی" sub="دخل و خرج، حساب‌ها و بودجه" />
      <div className="card mb-3 p-4">
        <p className="text-xs text-muted">موجودی کل</p>
        <p className={`tnum mt-0.5 text-3xl font-extrabold ${total < 0 ? 'text-bad' : ''}`}>
          {total < 0 && '−'}
          {num(Math.abs(Math.round(shownTotal)))} <span className="text-base font-semibold text-muted">تومان</span>
        </p>
        <div className="mt-3 flex items-center justify-between">
          <button className="press grid size-8 place-items-center rounded-full bg-surface-2" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="ماه قبل">
            <ChevronRight size={16} />
          </button>
          <span className="text-sm font-semibold">{jMonthLabel(month)}</span>
          <button className="press grid size-8 place-items-center rounded-full bg-surface-2" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="ماه بعد">
            <ChevronLeft size={16} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="درآمد" value={shortMoney(income)} tone="good" />
          <Stat label="خرج" value={shortMoney(expense)} tone="bad" />
          <Stat label="تراز" value={shortMoney(income - expense)} tone={income - expense >= 0 ? 'good' : 'bad'} sub={income ? `پس‌انداز ${pct(Math.max(0, (income - expense) / income))}` : undefined} />
        </div>
      </div>

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ['tx', 'تراکنش‌ها'],
            ['accounts', 'حساب‌ها'],
            ['budget', 'بودجه'],
            ['debts', 'طلب و بدهی'],
            ['report', 'گزارش'],
          ] as [Tab, string][]
        ).map(([v, l]) => (
          <Chip key={v} active={tab === v} onClick={() => setTab(v)}>
            {l}
          </Chip>
        ))}
      </div>

      <LoanFix m={m} />

      {tab === 'tx' && <TxList txs={monthTx} m={m} onOpen={setTx} />}
      {tab === 'accounts' && <Accounts m={m} />}
      {tab === 'budget' && <Budgets month={month} monthTx={monthTx} m={m} />}
      {tab === 'debts' && <Debts m={m} />}
      {tab === 'report' && <Report month={month} m={m} />}

      {(tab === 'tx' || tab === 'report' || tab === 'budget') && <Fab onClick={() => setTx(blankTx())} label="تراکنش جدید" />}
      <TxSheet tx={tx} onClose={() => setTx(null)} />
    </div>
  )
}

type M = ReturnType<typeof useMoney>

/** پیدا کردن درآمد/خرج‌هایی که در واقع همان قرض ثبت‌شده‌اند (دوبار شمرده شده‌اند) */
function LoanFix({ m }: { m: M }) {
  const debts = useLiveQuery(() => db.debts.toArray(), []) || []
  const linked = new Set(m.txs.filter((t) => t.debtId).map((t) => t.debtId))
  const used = new Set<number>()
  const pairs: { d: Debt; t: Transaction }[] = []
  for (const d of debts) {
    if (linked.has(d.id)) continue
    const type = d.dir === 'borrowed' ? 'income' : 'expense'
    const t = m.txs.find((x) => x.type === type && !used.has(x.id!) && x.amount === d.amount && Math.abs(diffDays(x.date, d.date)) <= 3)
    if (t) {
      used.add(t.id!)
      pairs.push({ d, t })
    }
  }
  if (!pairs.length) return null
  const fix = async (p: { d: Debt; t: Transaction }) => {
    await db.transactions.update(p.t.id!, {
      type: 'debt',
      amount: p.d.dir === 'borrowed' ? p.t.amount : -p.t.amount,
      debtId: p.d.id,
      categoryId: undefined,
      feel: undefined,
      note: `${p.d.dir === 'borrowed' ? 'قرض از' : 'قرض به'} ${p.d.person}`,
    })
    await db.debts.update(p.d.id!, { accountId: p.t.accountId })
  }
  return (
    <div className="mb-3 rounded-2xl bg-warn-soft p-4">
      <p className="text-sm leading-7">
        <b>{fa(pairs.length)} قرض</b> هم به‌صورت {pairs[0].d.dir === 'borrowed' ? 'درآمد' : 'خرج'} ثبت شده و دوبار حساب می‌شود. با اصلاح، موجودی تغییر نمی‌کند؛ فقط از گزارش درآمد و خرج بیرون می‌رود.
      </p>
      <div className="mt-2 divide-y divide-warn/20 text-sm">
        {pairs.map((p) => (
          <div key={p.d.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0 truncate">
              {p.d.person} · <span className="tnum">{shortMoney(p.d.amount)}</span> · {jDayMonth(p.t.date)}
            </span>
            <button className="press shrink-0 rounded-xl bg-surface px-3 py-1.5 text-xs font-bold" onClick={() => fix(p)}>
              اصلاح
            </button>
          </div>
        ))}
      </div>
      {pairs.length > 1 && (
        <Button
          variant="soft"
          block
          className="mt-2 h-10 bg-surface text-sm"
          onClick={async () => {
            for (const p of pairs) await fix(p)
            toast('همه اصلاح شدند')
          }}
        >
          اصلاح همه
        </Button>
      )}
    </div>
  )
}

export function TxRow({ t, m, onOpen }: { t: Transaction; m: M; onOpen: (t: Transaction) => void }) {
  const c = t.categoryId ? m.catMap.get(t.categoryId) : undefined
  const acc = m.accounts.find((a) => a.id === t.accountId)
  const to = m.accounts.find((a) => a.id === t.toAccountId)
  const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : t.type === 'transfer' ? 0 : Math.sign(t.amount)
  const icon = t.type === 'transfer' ? '↔️' : t.type === 'adjust' ? '⚖️' : t.type === 'debt' ? '🤝' : c?.icon || '•'
  const title = t.type === 'transfer' ? `${acc?.name} ← ${to?.name}` : t.type === 'adjust' ? 'اصلاح موجودی' : t.type === 'debt' ? t.note || 'طلب و بدهی' : c?.name || 'بدون دسته'
  return (
    <button className="press flex w-full items-center gap-3 py-2.5 text-start" onClick={() => onOpen(t)}>
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: c ? `${c.color}22` : 'var(--surface-2)' }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">
          {t.type !== 'transfer' && acc?.name}
          {t.note && t.type !== 'debt' ? ` · ${t.note}` : ''}
          {t.feel === 'impulse' && ' · هیجانی'}
        </span>
      </span>
      <span className={`tnum shrink-0 font-bold ${sign > 0 ? 'text-good' : sign < 0 ? '' : 'text-muted'}`}>
        {sign > 0 ? '+' : sign < 0 ? '−' : ''}
        {num(Math.abs(t.amount))}
      </span>
    </button>
  )
}

function TxList({ txs, m, onOpen }: { txs: Transaction[]; m: M; onOpen: (t: Transaction) => void }) {
  const [q, setQ] = useState('')
  const [acc, setAcc] = useState<number | null>(null)
  const ref = useStagger<HTMLDivElement>([])
  const filtered = txs
    .filter((t) => (acc === null ? true : t.accountId === acc || t.toAccountId === acc))
    .filter((t) => {
      if (!q.trim()) return true
      const c = t.categoryId ? m.catMap.get(t.categoryId)?.name : ''
      return `${t.note || ''} ${c} ${t.amount}`.includes(q.trim())
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  const days = new Map<string, Transaction[]>()
  for (const t of filtered) {
    if (!days.has(t.date)) days.set(t.date, [])
    days.get(t.date)!.push(t)
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-2xl bg-surface-2 px-3">
        <Search size={18} className="text-muted" />
        <input className="h-11 flex-1 bg-transparent outline-none" placeholder="جست‌وجو در توضیح، دسته یا مبلغ" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {m.accounts.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          <Chip active={acc === null} onClick={() => setAcc(null)}>همهٔ حساب‌ها</Chip>
          {m.accounts.map((a) => (
            <Chip key={a.id} active={acc === a.id} color={a.color} onClick={() => setAcc(a.id!)}>
              {a.name}
            </Chip>
          ))}
        </div>
      )}
      {!filtered.length ? (
        <Card>
          <Empty icon={<Wallet />} title="تراکنشی در این ماه نیست" text="با دکمهٔ + اولین خرج یا درآمد را ثبت کن." />
        </Card>
      ) : (
        <div ref={ref} className="space-y-3">
          {[...days.entries()].map(([d, ts]) => {
            const out = ts.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
            return (
              <Card key={d}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-bold">
                    {relDay(d)} <span className="font-normal text-muted">{jf(d, 'EEEE')}</span>
                  </span>
                  {out > 0 && <span className="tnum text-muted">خرج: {num(out)}</span>}
                </div>
                <div className="divide-y divide-line">
                  {ts.map((t) => (
                    <TxRow key={t.id} t={t} m={m} onOpen={onOpen} />
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ───────────── حساب‌ها ───────────── */

function Accounts({ m }: { m: M }) {
  const [edit, setEdit] = useState<Account | null>(null)
  const [adjust, setAdjust] = useState<Account | null>(null)
  const ref = useStagger<HTMLDivElement>([])
  const kindIcon = (k: Account['kind']) => (k === 'cash' ? <Wallet size={20} /> : k === 'card' ? <CreditCard size={20} /> : <PiggyBank size={20} />)
  return (
    <div>
      <div ref={ref} className="space-y-2.5">
        {m.accounts.filter((a) => !a.archived).map((a) => {
          const b = m.bal.get(a.id!) ?? 0
          return (
            <div key={a.id} className="card overflow-hidden">
              <button className="press flex w-full items-center gap-3 p-4 text-start" onClick={() => setEdit(a)}>
                <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: a.color }}>
                  {kindIcon(a.kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{a.name}</span>
                  <span className="block text-xs text-muted">
                    {a.bank || (a.kind === 'cash' ? 'نقد' : a.kind === 'card' ? 'کارت بانکی' : 'پس‌انداز')}
                    {a.last4 && <span className="tnum"> · {fa(a.last4)}</span>}
                  </span>
                </span>
                <span className={`tnum text-lg font-extrabold ${b < 0 ? 'text-bad' : ''}`}>{b < 0 && '−'}{num(Math.abs(b))}</span>
              </button>
              <button className="press flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-xs font-semibold text-muted" onClick={() => setAdjust(a)}>
                <Scale size={14} /> تطبیق با موجودی واقعی
              </button>
            </div>
          )
        })}
      </div>
      <Button
        variant="soft"
        block
        className="mt-3"
        onClick={() => setEdit({ name: '', kind: 'card', color: PALETTE[2], initial: 0, archived: false, order: m.accounts.length })}
      >
        <Plus size={18} /> حساب جدید
      </Button>
      <AccountSheet a={edit} onClose={() => setEdit(null)} />
      <AdjustSheet a={adjust} current={adjust ? m.bal.get(adjust.id!) ?? 0 : 0} onClose={() => setAdjust(null)} />
    </div>
  )
}

function AccountSheet({ a, onClose }: { a: Account | null; onClose: () => void }) {
  const [cur, setCur] = useState<Account | null>(null)
  const [src, setSrc] = useState<Account | null>(null)
  if (a && a !== src) {
    setSrc(a)
    setCur(a)
  }
  if (!cur) return null
  const set = (p: Partial<Account>) => setCur({ ...cur, ...p })
  const isNew = !cur.id
  return (
    <Sheet
      open={!!a}
      onClose={onClose}
      title={isNew ? 'حساب جدید' : 'ویرایش حساب'}
      footer={
        <Button
          block
          disabled={!cur.name.trim()}
          onClick={async () => {
            await db.accounts.put({ ...cur, name: cur.name.trim() })
            onClose()
          }}
        >
          ذخیره
        </Button>
      }
    >
      <Label>نوع</Label>
      <Segmented
        value={cur.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: 'card', label: 'کارت بانکی' },
          { value: 'cash', label: 'نقد' },
          { value: 'saving', label: 'پس‌انداز' },
        ]}
      />
      <Label>نام</Label>
      <input className="field" autoFocus={isNew} placeholder="مثلاً کارت حقوق" value={cur.name} onChange={(e) => set({ name: e.target.value })} />
      {cur.kind !== 'cash' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>بانک</Label>
            <input className="field" placeholder="مثلاً ملت" value={cur.bank || ''} onChange={(e) => set({ bank: e.target.value })} />
          </div>
          <div>
            <Label hint="فقط برای تشخیص">۴ رقم آخر</Label>
            <input className="field tnum" inputMode="numeric" maxLength={4} placeholder="۱۲۳۴" value={fa(cur.last4 || '')} onChange={(e) => set({ last4: e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '').slice(0, 4) })} />
          </div>
        </div>
      )}
      <Label hint={isNew ? 'موجودی امروز این حساب' : undefined}>موجودی اولیه</Label>
      <MoneyInput value={cur.initial} onChange={(initial) => set({ initial })} />
      <Label>رنگ</Label>
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((c) => (
          <button key={c} onClick={() => set({ color: c })} className="press size-9 rounded-full" style={{ background: c, outline: cur.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} aria-label="رنگ" />
        ))}
      </div>
      {!isNew && (
        <Button
          variant="danger"
          block
          className="mt-5"
          onClick={async () => {
            const used = await db.transactions.where('accountId').equals(cur.id!).count()
            if (used) {
              await db.accounts.update(cur.id!, { archived: true })
              toast('حساب بایگانی شد (تراکنش‌هایش حفظ می‌شود)')
            } else {
              await db.accounts.delete(cur.id!)
              toast('حساب حذف شد')
            }
            onClose()
          }}
        >
          <Trash2 size={18} /> حذف حساب
        </Button>
      )}
    </Sheet>
  )
}

function AdjustSheet({ a, current, onClose }: { a: Account | null; current: number; onClose: () => void }) {
  const [v, setV] = useState(0)
  const [src, setSrc] = useState<Account | null>(null)
  if (a && a !== src) {
    setSrc(a)
    setV(Math.max(0, current))
  }
  return (
    <Sheet
      open={!!a}
      onClose={onClose}
      title="تطبیق موجودی"
      footer={
        <Button
          block
          onClick={async () => {
            const diff = v - current
            if (diff && a) await db.transactions.add({ type: 'adjust', amount: diff, accountId: a.id!, date: todayKey(), time: nowTime(), tags: [], createdAt: Date.now(), note: 'اصلاح موجودی' })
            toast(diff ? 'موجودی اصلاح شد' : 'موجودی درست بود')
            onClose()
          }}
        >
          ثبت موجودی واقعی
        </Button>
      }
    >
      <p className="text-sm leading-7 text-muted">
        موجودی «{a?.name}» در برنامه <b className="tnum text-ink">{toman(current)}</b> است. موجودی واقعی را وارد کن تا اختلاف با یک تراکنش «اصلاح موجودی» ثبت شود.
      </p>
      <div className="mt-3">
        <MoneyInput value={v} onChange={setV} autoFocus />
      </div>
      {v !== current && <p className="tnum mt-2 text-sm">اختلاف: {v - current > 0 ? '+' : '−'}{toman(v - current)}</p>}
    </Sheet>
  )
}

/* ───────────── بودجه ───────────── */

function Budgets({ month, monthTx, m }: { month: string; monthTx: Transaction[]; m: M }) {
  const budgets = useLiveQuery(() => db.budgets.where('month').equals(month).toArray(), [month]) || []
  const [edit, setEdit] = useState<Category | null>(null)
  const [val, setVal] = useState(0)
  const parents = m.cats.filter((c) => c.kind === 'expense' && c.parentId === undefined).sort((a, b) => a.order - b.order)
  const spent = (c: Category) => monthTx.filter((t) => t.type === 'expense' && rootCat(m.catMap, t.categoryId)?.id === c.id).reduce((s, t) => s + t.amount, 0)
  const totalLimit = budgets.reduce((s, b) => s + b.limit, 0)
  const totalSpent = parents.filter((c) => budgets.some((b) => b.categoryId === c.id)).reduce((s, c) => s + spent(c), 0)
  const tone = (r: number) => (r >= 1 ? 'var(--bad)' : r >= 0.8 ? 'var(--warn)' : 'var(--good)')
  return (
    <div className="space-y-3">
      {totalLimit > 0 && (
        <Card>
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-bold">کل بودجه</span>
            <span className="tnum text-muted">{shortMoney(totalSpent)} از {shortMoney(totalLimit)}</span>
          </div>
          <Progress value={totalSpent / totalLimit} color={tone(totalSpent / totalLimit)} />
        </Card>
      )}
      <Card>
        <p className="mb-2 text-xs leading-6 text-muted">برای هر دسته سقف ماهانه بگذار. بودجهٔ هر ماه خودکار از ماه قبل کپی می‌شود.</p>
        <div className="divide-y divide-line">
          {parents.map((c) => {
            const b = budgets.find((x) => x.categoryId === c.id)
            const s = spent(c)
            const r = b ? s / b.limit : 0
            return (
              <button
                key={c.id}
                className="press block w-full py-3 text-start"
                onClick={() => {
                  setVal(b?.limit || 0)
                  setEdit(c)
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{c.icon}</span>
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="tnum text-sm">
                    {shortMoney(s)}
                    {b ? <span className="text-muted"> / {shortMoney(b.limit)}</span> : <span className="text-xs text-muted"> · بدون سقف</span>}
                  </span>
                </div>
                {b && <Progress value={r} color={tone(r)} className="mt-2" />}
              </button>
            )
          })}
        </div>
      </Card>
      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit ? `بودجهٔ ${edit.name}` : ''}
        footer={
          <div className="flex gap-2">
            <Button
              variant="soft"
              onClick={async () => {
                if (edit) await db.budgets.delete([month, edit.id!])
                setEdit(null)
              }}
            >
              بدون سقف
            </Button>
            <Button
              className="flex-1"
              disabled={!val}
              onClick={async () => {
                if (edit) await db.budgets.put({ month, categoryId: edit.id!, limit: val })
                setEdit(null)
              }}
            >
              ذخیره
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-muted">سقف خرج ماهانه در {jMonthLabel(month)}</p>
        <MoneyInput value={val} onChange={setVal} autoFocus />
      </Sheet>
    </div>
  )
}

/* ───────────── طلب و بدهی ───────────── */

function Debts({ m }: { m: M }) {
  const debts = useLiveQuery(() => db.debts.toArray(), []) || []
  const [edit, setEdit] = useState<Debt | null>(null)
  const [pay, setPay] = useState<Debt | null>(null)
  const open = debts.filter((d) => d.status === 'open')
  const lent = open.filter((d) => d.dir === 'lent').reduce((s, d) => s + debtRemaining(d), 0)
  const borrowed = open.filter((d) => d.dir === 'borrowed').reduce((s, d) => s + debtRemaining(d), 0)
  const blank: Debt = { person: '', dir: 'borrowed', amount: 0, date: todayKey(), payments: [], status: 'open', createdAt: Date.now(), accountId: m.accounts.find((a) => !a.archived)?.id }
  return (
    <div className="space-y-3">
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="طلب من از دیگران" value={shortMoney(lent)} tone="good" />
          <Stat label="بدهی من به دیگران" value={shortMoney(borrowed)} tone="bad" />
        </div>
      </Card>
      {!debts.length && (
        <Card>
          <Empty icon={<HandCoins />} title="طلب یا بدهی ثبت نشده" text="پولی که قرض دادی یا گرفتی را ثبت کن تا یادت نرود و مانده‌اش خودکار حساب شود." />
        </Card>
      )}
      {[...open, ...debts.filter((d) => d.status === 'closed')].map((d) => {
        const rem = debtRemaining(d)
        const overdue = d.due && d.due < todayKey() && d.status === 'open'
        return (
          <div key={d.id} className={`card p-4 ${d.status === 'closed' ? 'opacity-55' : ''}`}>
            <button className="press block w-full text-start" onClick={() => setEdit(d)}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${d.dir === 'lent' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>{d.dir === 'lent' ? 'طلب' : 'بدهی'}</span>
                <span className="flex-1 truncate font-bold">{d.person}</span>
                <span className="tnum font-extrabold">{num(rem)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                از {num(d.amount)} تومان · {jDayMonth(d.date)}
                {d.due && <span className={overdue ? 'font-bold text-bad' : ''}> · سررسید {jDayMonth(d.due)}</span>}
                {d.status === 'closed' && ' · تسویه شد'}
              </p>
              {d.payments.length > 0 && <Progress value={1 - rem / d.amount} className="mt-2" />}
            </button>
            {d.status === 'open' && (
              <Button variant="soft" block className="mt-3 h-10 text-sm" onClick={() => setPay(d)}>
                ثبت پرداخت
              </Button>
            )}
          </div>
        )
      })}
      <Button variant="soft" block onClick={() => setEdit(blank)}>
        <Plus size={18} /> طلب یا بدهی جدید
      </Button>
      <DebtSheet d={edit} m={m} onClose={() => setEdit(null)} />
      <PaySheet d={pay} m={m} onClose={() => setPay(null)} />
    </div>
  )
}

function DebtSheet({ d, m, onClose }: { d: Debt | null; m: M; onClose: () => void }) {
  const [cur, setCur] = useState<Debt | null>(null)
  const [src, setSrc] = useState<Debt | null>(null)
  if (d && d !== src) {
    setSrc(d)
    setCur(d)
  }
  if (!cur) return null
  const set = (p: Partial<Debt>) => setCur({ ...cur, ...p })
  const isNew = !cur.id
  return (
    <Sheet
      open={!!d}
      onClose={onClose}
      title={isNew ? 'طلب یا بدهی' : cur.person}
      footer={
        <Button
          block
          disabled={!cur.person.trim() || !cur.amount}
          onClick={async () => {
            if (isNew) {
              const id = await db.debts.add({ ...cur, person: cur.person.trim() })
              if (cur.accountId)
                await db.transactions.add({ type: 'debt', amount: cur.dir === 'lent' ? -cur.amount : cur.amount, accountId: cur.accountId, date: cur.date, time: nowTime(), tags: [], debtId: id, note: `${cur.dir === 'lent' ? 'قرض به' : 'قرض از'} ${cur.person.trim()}`, createdAt: Date.now() })
            } else await db.debts.put(cur)
            onClose()
          }}
        >
          ذخیره
        </Button>
      }
    >
      <Segmented
        value={cur.dir}
        onChange={(dir) => set({ dir })}
        options={[
          { value: 'lent', label: 'من طلب دارم' },
          { value: 'borrowed', label: 'من بدهکارم' },
        ]}
      />
      <Label>طرف حساب</Label>
      <input className="field" placeholder="نام" value={cur.person} onChange={(e) => set({ person: e.target.value })} />
      <Label>مبلغ</Label>
      <MoneyInput value={cur.amount} onChange={(amount) => set({ amount })} />
      <Label>تاریخ</Label>
      <DateField value={cur.date} onChange={(date) => set({ date })} />
      <Label hint="اختیاری">سررسید</Label>
      {cur.due ? <DateField value={cur.due} onChange={(due) => set({ due })} /> : <Button variant="soft" block onClick={() => set({ due: todayKey() })}>تعیین سررسید</Button>}
      {isNew && (
        <>
          <Label hint="موجودی خودکار تغییر می‌کند؛ لازم نیست جدا درآمد یا خرج ثبت کنی">{cur.dir === 'borrowed' ? 'پول به کدام حساب آمد؟' : 'از کدام حساب دادی؟'}</Label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            <Chip active={!cur.accountId} onClick={() => set({ accountId: undefined })}>ثبت نکن</Chip>
            {m.accounts.filter((a) => !a.archived).map((a) => (
              <Chip key={a.id} active={cur.accountId === a.id} color={a.color} onClick={() => set({ accountId: a.id })}>
                {a.name}
              </Chip>
            ))}
          </div>
        </>
      )}
      <Label>توضیح</Label>
      <input className="field" placeholder="اختیاری" value={cur.note || ''} onChange={(e) => set({ note: e.target.value })} />
      {cur.payments.length > 0 && (
        <>
          <Label>پرداخت‌ها</Label>
          <div className="divide-y divide-line text-sm">
            {cur.payments.map((p) => (
              <div key={p.id} className="flex justify-between py-2">
                <span className="text-muted">{jDayMonth(p.date)}</span>
                <span className="tnum font-semibold">{num(p.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!isNew && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            variant="soft"
            onClick={async () => {
              await db.debts.update(cur.id!, { status: cur.status === 'open' ? 'closed' : 'open' })
              onClose()
            }}
          >
            {cur.status === 'open' ? 'تسویه شد' : 'باز کردن دوباره'}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await db.debts.delete(cur.id!)
              onClose()
              toast('حذف شد')
            }}
          >
            حذف
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function PaySheet({ d, m, onClose }: { d: Debt | null; m: M; onClose: () => void }) {
  const [amount, setAmount] = useState(0)
  const [acc, setAcc] = useState<number | undefined>()
  const [src, setSrc] = useState<Debt | null>(null)
  if (d && d !== src) {
    setSrc(d)
    setAmount(debtRemaining(d))
    setAcc(d.accountId)
  }
  return (
    <Sheet
      open={!!d}
      onClose={onClose}
      title={d ? `پرداخت ${d.dir === 'lent' ? 'از طرف' : 'به'} ${d.person}` : ''}
      footer={
        <Button
          block
          disabled={!amount}
          onClick={async () => {
            if (!d) return
            const payments = [...d.payments, { id: uid(), amount, date: todayKey(), accountId: acc }]
            const rem = d.amount - payments.reduce((s, p) => s + p.amount, 0)
            await db.debts.update(d.id!, { payments, status: rem <= 0 ? 'closed' : 'open' })
            if (acc)
              await db.transactions.add({ type: 'debt', amount: d.dir === 'lent' ? amount : -amount, accountId: acc, date: todayKey(), time: nowTime(), tags: [], debtId: d.id, note: `${d.dir === 'lent' ? 'دریافت طلب از' : 'پرداخت بدهی به'} ${d.person}`, createdAt: Date.now() })
            toast(rem <= 0 ? 'تسویه شد' : 'پرداخت ثبت شد')
            onClose()
          }}
        >
          ثبت
        </Button>
      }
    >
      {d && <p className="mb-3 text-sm text-muted">ماندهٔ فعلی: <b className="tnum text-ink">{toman(debtRemaining(d))}</b></p>}
      <MoneyInput value={amount} onChange={setAmount} autoFocus />
      <Label hint="اختیاری">{d?.dir === 'lent' ? 'به کدام حساب واریز شد؟' : 'از کدام حساب پرداخت شد؟'}</Label>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        <Chip active={!acc} onClick={() => setAcc(undefined)}>ثبت نکن</Chip>
        {m.accounts.filter((a) => !a.archived).map((a) => (
          <Chip key={a.id} active={acc === a.id} color={a.color} onClick={() => setAcc(a.id)}>
            {a.name}
          </Chip>
        ))}
      </div>
    </Sheet>
  )
}

/* ───────────── گزارش ───────────── */

function Report({ month, m }: { month: string; m: M }) {
  const { from, to } = jMonthRange(month)
  const monthTx = m.txs.filter((t) => t.date >= from && t.date <= to)
  const prev = jMonthRange(shiftMonth(month, -1))
  const prevExp = sumBy(m.txs.filter((t) => t.date >= prev.from && t.date <= prev.to), 'expense')
  const exp = sumBy(monthTx, 'expense')
  const impulse = monthTx.filter((t) => t.type === 'expense' && t.feel === 'impulse').reduce((s, t) => s + t.amount, 0)
  const byCat = new Map<number, number>()
  for (const t of monthTx) if (t.type === 'expense') {
    const r = rootCat(m.catMap, t.categoryId)
    if (r) byCat.set(r.id!, (byCat.get(r.id!) || 0) + t.amount)
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ c: m.catMap.get(id)!, v }))
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5))
  const series = months.map((mk) => {
    const r = jMonthRange(mk)
    const ts = m.txs.filter((t) => t.date >= r.from && t.date <= r.to)
    return { mk, inc: sumBy(ts, 'income'), exp: sumBy(ts, 'expense') }
  })
  const opt = baseOptions()
  if (!monthTx.length && !series.some((s) => s.exp || s.inc))
    return (
      <Card>
        <Empty icon={<ArrowLeftRight />} title="هنوز داده‌ای برای گزارش نیست" text="بعد از ثبت چند تراکنش، نمودارها اینجا ساخته می‌شوند." />
      </Card>
    )
  return (
    <div className="space-y-3">
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="نسبت به ماه قبل"
            value={prevExp ? `${exp >= prevExp ? '+' : '−'}${pct(Math.abs(exp - prevExp) / prevExp)}` : '—'}
            tone={prevExp ? (exp <= prevExp ? 'good' : 'bad') : undefined}
            sub={prevExp ? `ماه قبل ${shortMoney(prevExp)}` : 'دادهٔ ماه قبل نیست'}
          />
          <Stat label="خرج‌های هیجانی" value={shortMoney(impulse)} sub={exp ? `${pct(impulse / exp)} از کل خرج` : undefined} tone={impulse ? 'bad' : undefined} />
        </div>
      </Card>
      {catRows.length > 0 && (
        <Card title="خرج بر اساس دسته">
          <div className="mx-auto h-48 w-48">
            <Doughnut
              data={{ labels: catRows.map((r) => r.c.name), datasets: [{ data: catRows.map((r) => r.v), backgroundColor: catRows.map((r) => r.c.color), borderWidth: 2, borderColor: css('--surface') }] }}
              options={{ cutout: '68%', plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: { label: (c) => ` ${c.label}: ${num(c.parsed)}` } } } }}
            />
          </div>
          <div className="mt-4 space-y-2.5">
            {catRows.map((r) => (
              <div key={r.c.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{r.c.icon} {r.c.name}</span>
                  <span className="tnum"><b>{shortMoney(r.v)}</b> <span className="text-muted">({pct(r.v / exp)})</span></span>
                </div>
                <Progress value={r.v / catRows[0].v} color={r.c.color} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title="درآمد و خرج ۶ ماه اخیر">
        <div className="h-52">
          <Bar
            data={{
              labels: series.map((s) => jMonthLabel(s.mk).split(' ')[0]),
              datasets: [
                { label: 'درآمد', data: series.map((s) => s.inc), backgroundColor: css('--good'), borderRadius: 6, maxBarThickness: 18 },
                { label: 'خرج', data: series.map((s) => s.exp), backgroundColor: css('--bad'), borderRadius: 6, maxBarThickness: 18 },
              ],
            }}
            options={{ ...opt, scales: { ...opt.scales, y: { ...opt.scales.y, ticks: { maxTicksLimit: 5, callback: (v: string | number) => shortMoney(Number(v)) } } }, plugins: { ...opt.plugins, tooltip: { ...opt.plugins.tooltip, callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => `${c.dataset.label}: ${num(c.parsed.y || 0)}` } } } }}
          />
        </div>
      </Card>
    </div>
  )
}
