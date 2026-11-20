import Dexie, { type Table } from 'dexie'
import type {
  Account, Budget, Category, DayPlan, Debt, Goal, Habit, HabitLog, HealthEntry,
  LogEvent, Note, Recurring, Review, Setting, Task, Transaction,
} from './types'

export class PanelDB extends Dexie {
  health!: Table<HealthEntry, string>
  habits!: Table<Habit, number>
  habitLogs!: Table<HabitLog, [number, string]>
  tasks!: Table<Task, number>
  dayPlans!: Table<DayPlan, string>
  goals!: Table<Goal, number>
  reviews!: Table<Review, number>
  accounts!: Table<Account, number>
  transactions!: Table<Transaction, number>
  recurring!: Table<Recurring, number>
  categories!: Table<Category, number>
  budgets!: Table<Budget, [string, number]>
  debts!: Table<Debt, number>
  notes!: Table<Note, number>
  events!: Table<LogEvent, number>
  settings!: Table<Setting, string>

  constructor() {
    super('panel')
    this.version(1).stores({
      health: 'date',
      habits: '++id, status, type',
      habitLogs: '[habitId+date], habitId, date',
      tasks: '++id, date, status, goalId, recurId, [recurId+date]',
      dayPlans: 'date',
      goals: '++id, level, parentId, status',
      reviews: '++id, kind, start',
      accounts: '++id, order',
      transactions: '++id, date, accountId, toAccountId, categoryId, type, recurId, debtId',
      recurring: '++id, kind',
      categories: '++id, kind, parentId, order',
      budgets: '[month+categoryId], month',
      debts: '++id, status',
      notes: '++id, updatedAt, pinned, deleted',
      events: '++id, at, kind',
      settings: 'key',
    })
    // نسخهٔ ۲: نمونه‌های تسک تکراری تاریخ برنامه‌ریزی قالب را گرفته بودند
    this.version(2).stores({}).upgrade((tx) =>
      tx
        .table('tasks')
        .toCollection()
        .modify((t: Task) => {
          if (t.recurId && !t.postponed) t.originalDate = t.date
        }),
    )
  }
}

export const db = new PanelDB()

export const TABLES = [
  'health', 'habits', 'habitLogs', 'tasks', 'dayPlans', 'goals', 'reviews', 'accounts',
  'transactions', 'recurring', 'categories', 'budgets', 'debts', 'notes', 'events', 'settings',
] as const

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return (row?.value as T) ?? fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

export async function logEvent(kind: string, ref?: number, data?: Record<string, unknown>) {
  await db.events.add({ at: Date.now(), kind, ref, data })
}

export const PALETTE = ['#16a34a', '#0d9488', '#0284c7', '#4f46e5', '#c026d3', '#e11d48', '#ea580c', '#ca8a04', '#57534e']

export async function seedIfEmpty() {
  await db.transaction('rw', db.categories, db.accounts, db.settings, async () => {
    // بررسی داخل تراکنش تا اجرای هم‌زمان دوبار داده نسازد
    if (await db.settings.get('seeded')) return
    const exp: [string, string, string][] = [
      ['خوراک', '🍽️', '#ea580c'], ['رفت‌وآمد', '🚕', '#ca8a04'], ['قبوض', '💡', '#0284c7'],
      ['اجاره', '🏠', '#57534e'], ['خرید', '🛍️', '#c026d3'], ['تفریح', '🎬', '#4f46e5'],
      ['سلامت', '💊', '#e11d48'], ['آموزش', '📚', '#0d9488'], ['سایر', '📦', '#78716c'],
    ]
    const inc: [string, string, string][] = [
      ['حقوق', '💼', '#16a34a'], ['درآمد آزاد', '💻', '#0d9488'], ['سایر', '➕', '#78716c'],
    ]
    const task: [string, string, string][] = [
      ['کار', '💼', '#0284c7'], ['شخصی', '🙂', '#16a34a'], ['ورزش', '🏃', '#ea580c'], ['مطالعه', '📖', '#4f46e5'],
    ]
    await db.categories.bulkAdd([
      ...exp.map(([name, icon, color], i) => ({ kind: 'expense' as const, name, icon, color, order: i })),
      ...inc.map(([name, icon, color], i) => ({ kind: 'income' as const, name, icon, color, order: i })),
      ...task.map(([name, icon, color], i) => ({ kind: 'task' as const, name, icon, color, order: i })),
    ])
    await db.accounts.add({ name: 'کیف پول نقد', kind: 'cash', color: '#16a34a', initial: 0, archived: false, order: 0 })
    await db.settings.bulkPut([
      { key: 'seeded', value: Date.now() },
      { key: 'areas', value: ['سلامت', 'مالی', 'شغل', 'یادگیری', 'روابط', 'معنوی و شخصی', 'تفریح'] },
    ])
  })
}
