import { db } from '../db/db'
import type { Account, Category, Debt, Transaction } from '../db/types'
import { jDateInMonth, jMonthKey, rangeKeys, shiftMonth, todayKey, addDaysKey } from './date'
import { matchesRule } from './tasks'

/** اثر یک تراکنش روی موجودی یک حساب */
export function effect(t: Transaction, accountId: number) {
  switch (t.type) {
    case 'income':
      return t.accountId === accountId ? t.amount : 0
    case 'expense':
      return t.accountId === accountId ? -t.amount : 0
    case 'adjust':
    case 'debt':
      return t.accountId === accountId ? t.amount : 0
    case 'transfer':
      return (t.accountId === accountId ? -t.amount : 0) + (t.toAccountId === accountId ? t.amount : 0)
  }
}

export function balances(accounts: Account[], txs: Transaction[]) {
  const map = new Map<number, number>()
  for (const a of accounts) map.set(a.id!, a.initial)
  for (const t of txs) {
    if (map.has(t.accountId)) map.set(t.accountId, map.get(t.accountId)! + effect(t, t.accountId))
    if (t.toAccountId !== undefined && t.toAccountId !== t.accountId && map.has(t.toAccountId))
      map.set(t.toAccountId, map.get(t.toAccountId)! + effect(t, t.toAccountId))
  }
  return map
}

export function debtRemaining(d: Debt) {
  return d.amount - d.payments.reduce((s, p) => s + p.amount, 0)
}

export function sumBy(txs: Transaction[], type: 'income' | 'expense') {
  return txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0)
}

/** دستهٔ والد (برای گزارش) */
export function rootCat(cats: Map<number, Category>, id?: number) {
  let c = id !== undefined ? cats.get(id) : undefined
  while (c?.parentId !== undefined && cats.has(c.parentId)) c = cats.get(c.parentId)
  return c
}

/** تراکنش‌های تکراری را تا امروز می‌سازد */
export async function runRecurringTx() {
  const rules = await db.recurring.where('kind').equals('tx').toArray()
  const today = todayKey()
  let created = 0
  for (const r of rules) {
    const from = r.lastGen ? addDaysKey(r.lastGen, 1) : r.start
    if (from > today) continue
    for (const k of rangeKeys(from, today)) {
      if (!matchesRule(r, k)) continue
      const tpl = r.template as Partial<Transaction>
      await db.transactions.add({
        type: tpl.type || 'expense',
        amount: tpl.amount || 0,
        accountId: tpl.accountId!,
        toAccountId: tpl.toAccountId,
        categoryId: tpl.categoryId,
        note: tpl.note,
        tags: tpl.tags || [],
        date: k,
        time: '09:00',
        recurId: r.id,
        createdAt: Date.now(),
      })
      created++
    }
    await db.recurring.update(r.id!, { lastGen: today })
  }
  return created
}

/** بودجهٔ ماه جاری اگر خالی باشد از ماه قبل کپی می‌شود */
export async function carryBudgets() {
  const mk = jMonthKey(todayKey())
  const count = await db.budgets.where('month').equals(mk).count()
  if (count) return
  const prev = await db.budgets.where('month').equals(shiftMonth(mk, -1)).toArray()
  if (prev.length) await db.budgets.bulkPut(prev.map((b) => ({ ...b, month: mk })))
}

export { jDateInMonth }
