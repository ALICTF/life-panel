// همهٔ تاریخ‌ها به‌صورت کلید میلادی محلی «yyyy-MM-dd» و همهٔ مبالغ به تومان (عدد صحیح) ذخیره می‌شوند.

export interface HealthEntry {
  date: string
  weight?: number
  pai?: number
  mood?: number // 1..5
  energy?: number // 1..5
  sleep?: number // ساعت
  water?: number // لیوان
  updatedAt: number
}

export interface HabitResult {
  successDays: number
  totalDays: number
  rate: number
  bestStreak: number
  endDate: string
  monthKey: string // ماه شمسی پایان دوره، مثل 1405-08
  endedEarly?: boolean
}

export interface Habit {
  id?: number
  name: string
  type: 'good' | 'bad'
  days: number
  start: string
  status: 'active' | 'archived'
  color: string
  emoji?: string
  order: number
  createdAt: number
  archivedAt?: number
  result?: HabitResult
}

export interface HabitLog {
  habitId: number
  date: string
  at: number
  trigger?: string
}

export interface SubTask {
  id: string
  text: string
  done: boolean
}

export interface Task {
  id?: number
  title: string
  date: string
  start?: string // HH:mm
  end?: string
  allDay: boolean
  categoryId?: number
  priority: 1 | 2 | 3 // 1 بالا
  notes?: string
  subtasks: SubTask[]
  goalId?: number
  recurId?: number
  status: 'todo' | 'done' | 'dropped'
  doneAt?: number
  createdAt: number
  originalDate: string
  postponed: number
}

export interface PlanItem {
  id: string
  text: string
  done: boolean
}

export interface DayPlan {
  date: string
  musts: PlanItem[]
  mustNots: PlanItem[]
  plannedAt?: number
  updatedAt: number
}

export type GoalLevel = 'vision' | 'year' | 'quarter' | 'month' | 'week'
export type MetricKind = 'check' | 'number' | 'tasks' | 'children' | 'weight' | 'account'

export interface Goal {
  id?: number
  title: string
  level: GoalLevel
  parentId?: number
  area: string
  why?: string
  smart: { specific?: string; measure?: string; achievable?: string; relevant?: string }
  woop: { wish?: string; outcome?: string; obstacle?: string; plan?: string }
  intention?: string
  metric: {
    kind: MetricKind
    target?: number
    current?: number
    start?: number
    unit?: string
    accountId?: number
    done?: boolean
  }
  deadline?: string
  status: 'active' | 'done' | 'paused' | 'dropped'
  history: { at: number; status: Goal['status']; note?: string }[]
  createdAt: number
  updatedAt: number
}

export interface Review {
  id?: number
  kind: 'week' | 'month' | 'year'
  start: string
  end: string
  stats: Record<string, number | string>
  answers: { good?: string; bad?: string; change?: string }
  createdAt: number
}

export interface Account {
  id?: number
  name: string
  kind: 'cash' | 'card' | 'saving'
  bank?: string
  last4?: string
  color: string
  initial: number
  archived: boolean
  order: number
}

export type TxType = 'expense' | 'income' | 'transfer' | 'adjust' | 'debt'

export interface Transaction {
  id?: number
  type: TxType
  amount: number // برای adjust و debt علامت‌دار است
  accountId: number
  toAccountId?: number
  categoryId?: number
  date: string
  time: string
  note?: string
  tags: string[]
  feel?: 'need' | 'impulse'
  recurId?: number
  debtId?: number
  createdAt: number
}

export interface Recurring {
  id?: number
  kind: 'task' | 'tx'
  freq: 'daily' | 'weekly' | 'monthly'
  weekdays?: number[] // ۰ = شنبه ... ۶ = جمعه
  monthDay?: number // روز ماه شمسی
  start: string
  until?: string
  template: Partial<Task> | Partial<Transaction>
  skip: string[]
  lastGen?: string
}

export interface Category {
  id?: number
  kind: 'expense' | 'income' | 'task'
  name: string
  icon: string
  color: string
  parentId?: number
  order: number
}

export interface Budget {
  month: string // ماه شمسی 1405-08
  categoryId: number
  limit: number
}

export interface DebtPayment {
  id: string
  amount: number
  date: string
  accountId?: number
}

export interface Debt {
  id?: number
  person: string
  dir: 'lent' | 'borrowed' // lent: من طلب دارم
  amount: number
  date: string
  due?: string
  note?: string
  accountId?: number
  payments: DebtPayment[]
  status: 'open' | 'closed'
  createdAt: number
}

export interface Note {
  id?: number
  title: string
  body: string
  tags: string[]
  pinned: number // 0 | 1 برای ایندکس
  deleted: number // 0 یا زمان حذف
  createdAt: number
  updatedAt: number
}

export interface LogEvent {
  id?: number
  at: number
  kind: string
  ref?: number
  data?: Record<string, unknown>
}

export interface Setting {
  key: string
  value: unknown
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Meal {
  id?: number
  date: string
  type: MealType
  time: string
  at: number
  note?: string
  carbs?: boolean
}

export interface Med {
  id?: number
  name: string
  times: string[] // ساعت هر نوبت، مثل ["08:00", "20:00"]
  active: boolean
  order: number
}

export interface MedLog {
  id?: number
  medId: number
  date: string
  dose: number // شمارهٔ نوبت از ۰
  at: number // زمان واقعی مصرف
}

export interface Workout {
  id?: number
  date: string
  type: string
  minutes: number
  intensity: 1 | 2 | 3
  at: number
  note?: string
}

export interface FocusSession {
  id?: number
  date: string
  taskId?: number
  title: string
  startAt: number
  planned: number // دقیقه
  actual: number // دقیقه
  completed: boolean
}
