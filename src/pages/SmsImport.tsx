import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardPaste, MessageSquareText, Plus } from 'lucide-react'
import { db, getSetting, PALETTE, setSetting } from '../db/db'
import type { Transaction } from '../db/types'
import { guessCategory, parseSms, type SmsTx } from '../lib/sms'
import { balances } from '../lib/money'
import { jDayMonth, nowTime, todayKey } from '../lib/date'
import { fa, num, shortMoney, toman } from '../lib/format'
import { haptic } from '../lib/anim'
import { Button, Chip, Label } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { toast } from '../ui/Toast'

interface Row {
  tx: SmsTx
  include: boolean
  dup?: 'exact' | 'similar'
  categoryId?: number
  debtId?: number
  feel?: 'need' | 'impulse'
}

export function SmsImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [accountId, setAccountId] = useState<number | undefined>()
  const [after, setAfter] = useState<{ accountId: number; smsBalance: number; appBalance: number } | null>(null)
  const accounts = useLiveQuery(() => db.accounts.orderBy('order').filter((a) => !a.archived).toArray(), []) || []
  const cats = useLiveQuery(() => db.categories.orderBy('order').toArray(), []) || []
  const debts = useLiveQuery(() => db.debts.where('status').equals('open').toArray(), []) || []

  const reset = () => {
    setText('')
    setRows(null)
    setAfter(null)
  }

  const analyse = async (src: string) => {
    const list = parseSms(src)
    if (!list.length) {
      toast('پیامکی با مبلغ پیدا نشد')
      return
    }
    const txs = await db.transactions.where('date').between(list[0].date, list[list.length - 1].date, true, true).toArray()
    const linked = new Set(txs.filter((t) => t.debtId).map((t) => t.debtId))
    const map = await getSetting<Record<string, number>>('smsBanks', {})
    const bank = list.find((x) => x.bank)?.bank
    const byCard = list.find((x) => x.card) && accounts.find((a) => a.last4 && a.last4 === list.find((x) => x.card)?.card)
    const guess = (bank && map[bank]) || byCard?.id || accounts.find((a) => bank && a.name.includes(bank))?.id || accounts[0]?.id
    setAccountId(guess)
    const usedDebts = new Set<number>()
    setRows(
      list.map((tx) => {
        const exact = txs.some((t) => t.tags?.includes(tx.key))
        const similar = !exact && txs.some((t) => t.date === tx.date && t.amount === tx.amount && (t.type === tx.kind || t.type === 'debt'))
        // واریزی که با یک قرض باز هم‌مبلغ است، پیش‌فرض «قرض» می‌شود
        const debt = tx.kind === 'income' ? debts.find((d) => d.dir === 'borrowed' && d.amount === tx.amount && !linked.has(d.id) && !usedDebts.has(d.id!)) : undefined
        if (debt) usedDebts.add(debt.id!)
        return { tx, include: !exact && !similar, dup: exact ? 'exact' : similar ? 'similar' : undefined, categoryId: guessCategory(tx, cats), debtId: debt?.id }
      }),
    )
  }

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t.trim()) {
        setText(t)
        analyse(t)
        return
      }
    } catch {
      /* دسترسی به کلیپ‌بورد داده نشد؛ کاربر دستی paste می‌کند */
    }
    toast('متن پیامک را در کادر paste کن')
  }

  const chosen = rows?.filter((r) => r.include) || []
  const save = async () => {
    if (!rows || !accountId) return
    const bank = rows.find((r) => r.tx.bank)?.tx.bank
    if (bank) await setSetting('smsBanks', { ...(await getSetting<Record<string, number>>('smsBanks', {})), [bank]: accountId })
    for (const r of chosen) {
      const t = r.tx
      const base: Omit<Transaction, 'type' | 'amount'> = {
        accountId,
        date: t.date,
        time: t.time,
        tags: [t.key],
        note: [t.purpose, t.rounded ? `${num(t.rounded)} تومان رند شد` : ''].filter(Boolean).join(' · ') || undefined,
        createdAt: Date.now(),
      }
      if (r.debtId) {
        const d = debts.find((x) => x.id === r.debtId)
        await db.transactions.add({ ...base, type: 'debt', amount: t.amount, debtId: r.debtId, note: `قرض از ${d?.person || ''}` })
        await db.debts.update(r.debtId, { accountId })
      } else await db.transactions.add({ ...base, type: t.kind, amount: t.amount, categoryId: r.categoryId, feel: r.feel })
    }
    haptic()
    toast(`${fa(chosen.length)} تراکنش ثبت شد`)
    // مقایسهٔ موجودی پیامک با موجودی برنامه
    const last = [...rows].reverse().find((r) => r.tx.balance !== undefined)
    if (last) {
      const accs = await db.accounts.toArray()
      const all = await db.transactions.toArray()
      const app = balances(accs, all).get(accountId) ?? 0
      if (Math.abs(app - last.tx.balance!) >= 1) {
        setAfter({ accountId, smsBalance: last.tx.balance!, appBalance: app })
        setRows(null)
        return
      }
    }
    reset()
    onClose()
  }

  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const expenseCats = useMemo(() => cats.filter((c) => c.kind === 'expense' && c.parentId === undefined), [cats])
  const incomeCats = useMemo(() => cats.filter((c) => c.kind === 'income' && c.parentId === undefined), [cats])
  const bankName = rows?.find((r) => r.tx.bank)?.tx.bank

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      full={!!rows}
      title="ثبت از روی پیامک بانک"
      footer={
        rows ? (
          <Button block disabled={!chosen.length || !accountId} onClick={save}>
            ثبت {fa(chosen.length)} تراکنش
          </Button>
        ) : after ? undefined : (
          <Button block disabled={!text.trim()} onClick={() => analyse(text)}>
            خواندن پیامک‌ها
          </Button>
        )
      }
    >
      {after ? (
        <div className="py-2 text-sm leading-7">
          <p>
            طبق آخرین پیامک، موجودی <b className="tnum">{toman(after.smsBalance)}</b> است، ولی در برنامه <b className="tnum">{after.appBalance < 0 ? 'منفی ' : ''}{toman(after.appBalance)}</b> ثبت شده. احتمالاً چند تراکنش قدیمی‌تر ثبت نشده‌اند.
          </p>
          <Button
            block
            className="mt-4"
            onClick={async () => {
              await db.transactions.add({ type: 'adjust', amount: after.smsBalance - after.appBalance, accountId: after.accountId, date: todayKey(), time: nowTime(), tags: [], note: 'تطبیق با پیامک بانک', createdAt: Date.now() })
              toast('موجودی با پیامک یکی شد')
              reset()
              onClose()
            }}
          >
            موجودی را با پیامک یکی کن
          </Button>
          <Button variant="ghost" block className="mt-1" onClick={() => { reset(); onClose() }}>
            فعلاً نه
          </Button>
        </div>
      ) : !rows ? (
        <div>
          <p className="text-sm leading-7 text-muted">پیامک‌های بانک را کپی کن (یکی یا چندتا با هم). مبلغ، نوع، ساعت، تاریخ و موجودی خودکار خوانده می‌شود.</p>
          <Button variant="soft" block className="mt-3" onClick={paste}>
            <ClipboardPaste size={18} /> چسباندن از کلیپ‌بورد
          </Button>
          <textarea className="field mt-3 min-h-40 text-sm leading-7" dir="rtl" placeholder="یا اینجا paste کن…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : (
        <div>
          <Label hint={bankName ? `از این به بعد پیامک‌های «${bankName}» خودکار به همین حساب می‌روند` : undefined}>حساب</Label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {accounts.map((a) => (
              <Chip key={a.id} active={accountId === a.id} color={a.color} onClick={() => setAccountId(a.id)}>
                {a.name}
              </Chip>
            ))}
            {bankName && !accounts.some((a) => a.name.includes(bankName)) && (
              <Chip
                onClick={async () => {
                  // موجودی اولیه از پیامک اول حساب می‌شود تا بعد از ثبت، موجودی دقیقاً با بانک یکی باشد
                  const first = rows.find((r) => r.tx.balance !== undefined)?.tx
                  const before = first ? first.balance! + (first.kind === 'expense' ? first.amount : -first.amount) : 0
                  const skipped = first ? rows.slice(0, rows.findIndex((r) => r.tx === first)) : []
                  const initial = skipped.reduce((s, r) => s + (r.tx.kind === 'expense' ? r.tx.amount : -r.tx.amount), before)
                  const id = await db.accounts.add({ name: bankName, kind: 'card', bank: bankName, color: PALETTE[2], initial, archived: false, order: accounts.length })
                  setAccountId(id)
                }}
              >
                <Plus size={14} /> حساب «{bankName}»
              </Chip>
            )}
          </div>

          <div className="mt-4 space-y-2.5">
            {rows.map((r, i) => {
              const t = r.tx
              const list = t.kind === 'expense' ? expenseCats : incomeCats
              const cands = t.kind === 'income' ? debts.filter((d) => d.dir === 'borrowed') : []
              return (
                <div key={t.key} className={`rounded-2xl p-3 transition-opacity ${r.include ? 'bg-surface-2' : 'bg-surface-2/50 opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={r.include} onChange={(e) => set(i, { include: e.target.checked })} aria-label="ثبت این مورد" />
                    <div className="min-w-0 flex-1">
                      <p className={`tnum font-bold ${t.kind === 'income' ? 'text-good' : ''}`}>
                        {t.kind === 'income' ? '+' : '−'}
                        {num(t.amount)} <span className="text-xs font-normal text-muted">تومان</span>
                      </p>
                      <p className="truncate text-xs text-muted">
                        {jDayMonth(t.date)} · {fa(t.time)}
                        {t.title && ` · ${t.title}`}
                        {t.balance !== undefined && ` · موجودی ${shortMoney(t.balance)}`}
                      </p>
                    </div>
                  </div>
                  {r.dup && <p className="mt-1.5 text-xs text-warn">{r.dup === 'exact' ? 'قبلاً از پیامک ثبت شده' : 'احتمالاً قبلاً دستی ثبت کرده‌ای (همان روز و همان مبلغ)'}</p>}
                  {r.include && (
                    <div className="no-scrollbar -mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3">
                      {cands.map((d) => (
                        <Chip key={d.id} active={r.debtId === d.id} onClick={() => set(i, { debtId: r.debtId === d.id ? undefined : d.id, categoryId: undefined })}>
                          🤝 قرض از {d.person}
                        </Chip>
                      ))}
                      {list.map((c) => (
                        <Chip key={c.id} active={!r.debtId && r.categoryId === c.id} color={c.color} onClick={() => set(i, { categoryId: c.id, debtId: undefined })}>
                          {c.icon} {c.name}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {r.include && t.kind === 'expense' && (
                    <div className="mt-1.5 flex gap-1.5">
                      {(['need', 'impulse'] as const).map((f) => (
                        <button key={f} className={`press rounded-full px-2.5 py-1 text-xs ${r.feel === f ? 'bg-ink text-bg' : 'text-muted'}`} onClick={() => set(i, { feel: r.feel === f ? undefined : f })}>
                          {f === 'need' ? 'ضروری' : 'هیجانی'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Sheet>
  )
}

export function SmsButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="press grid size-10 place-items-center rounded-full bg-surface-2" onClick={onClick} aria-label="ثبت از روی پیامک بانک">
      <MessageSquareText size={19} />
    </button>
  )
}
